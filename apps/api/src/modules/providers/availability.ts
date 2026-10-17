import { z } from 'zod';
import {
  AvailabilityInputSchema,
  type AvailabilityDto,
  type Page,
  type PageMeta,
} from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';

// Driver availability/blocking windows. A BLOCKED window acquires a shared
// resource reservation so blocks, bookings and carpools cannot overlap on the
// same driver; the GiST exclusion constraint is the real guard (23P01).

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const MAX_HORIZON_DAYS = 180;

type AvailabilityRow = {
  id: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
};

function toAvailabilityDto(row: AvailabilityRow): AvailabilityDto {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    kind: row.kind as AvailabilityDto['kind'],
  };
}

/** PostgreSQL SQLSTATE anywhere in the error chain (Prisma wraps raw errors). */
export function sqlStateOf(error: unknown): string | undefined {
  const known = /^(23P01|23502|23503|23505|23514|42501)$/;
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== 'object') return undefined;
    const candidate = current as {
      code?: unknown;
      meta?: { code?: unknown; message?: unknown };
      message?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.meta?.code === 'string' && known.test(candidate.meta.code)) {
      return candidate.meta.code;
    }
    if (typeof candidate.code === 'string' && known.test(candidate.code)) {
      return candidate.code;
    }
    for (const text of [candidate.meta?.message, candidate.message]) {
      if (typeof text === 'string') {
        const match = /(23P01|23502|23503|23505|23514|42501)/.exec(text);
        if (match?.[1]) return match[1];
      }
    }
    current = candidate.cause;
  }
  return undefined;
}

export interface AvailabilityService {
  list(account: CurrentAccount, query: Record<string, string>): Promise<Page<AvailabilityDto>>;
  create(account: CurrentAccount, input: unknown): Promise<AvailabilityDto>;
  remove(account: CurrentAccount, id: string): Promise<{ acknowledged: true }>;
}

export function createAvailabilityService({
  prisma,
}: {
  prisma: PrismaClient;
}): AvailabilityService {
  async function requireDriverId(account: CurrentAccount): Promise<string> {
    const existing = await prisma.driverProfile.findUnique({
      where: { userId: account.userId },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.driverProfile.create({
      data: { userId: account.userId },
      select: { id: true },
    });
    return created.id;
  }

  return {
    async list(account, query) {
      const parsed = PageQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const driverId = await requireDriverId(account);
      const where = { driverId, removedAt: null };
      const [total, rows] = await Promise.all([
        prisma.availabilityWindow.count({ where }),
        prisma.availabilityWindow.findMany({
          where,
          orderBy: { startsAt: 'asc' },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
      return { success: true, data: rows.map(toAvailabilityDto), meta };
    },

    async create(account, input) {
      const parsed = AvailabilityInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Request validation failed');
      const startsAt = new Date(parsed.data.startsAt);
      const endsAt = new Date(parsed.data.endsAt);
      if (
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt
      ) {
        throw badRequest('endsAt must be after startsAt');
      }
      if (endsAt.getTime() - startsAt.getTime() > MAX_HORIZON_DAYS * 24 * 3600 * 1000) {
        throw badRequest('Availability horizon exceeds 180 days');
      }
      const driverId = await requireDriverId(account);
      try {
        const window = await prisma.$transaction(async (tx) => {
          const created = await tx.availabilityWindow.create({
            data: { driverId, kind: parsed.data.kind, startsAt, endsAt },
          });
          if (parsed.data.kind === 'BLOCKED') {
            // The reservation is the shared lock; a conflicting live hold
            // raises the exclusion violation handled below.
            await tx.resourceReservation.create({
              data: {
                driverId,
                availabilityBlockId: created.id,
                startsAt,
                endsAt,
              },
            });
          }
          return created;
        });
        return toAvailabilityDto(window);
      } catch (error) {
        if (sqlStateOf(error) === '23P01') {
          throw conflict('Blocked period overlaps an existing commitment');
        }
        if (sqlStateOf(error) === '23514' || sqlStateOf(error) === '23503') {
          throw badRequest('Availability interval is not acceptable');
        }
        throw error;
      }
    },

    async remove(account, id) {
      if (!z.uuid().safeParse(id).success) throw notFound('Availability not found');
      const driverId = await requireDriverId(account);
      const window = await prisma.availabilityWindow.findUnique({ where: { id } });
      if (!window || window.driverId !== driverId || window.removedAt) {
        throw notFound('Availability not found');
      }
      await prisma.$transaction(async (tx) => {
        if (window.kind === 'AVAILABLE') {
          // Removing availability must not uncover an already-hired commitment.
          const hold = await tx.resourceReservation.findFirst({
            where: {
              driverId,
              releasedAt: null,
              OR: [{ bookingId: { not: null } }, { carpoolId: { not: null } }],
              startsAt: { lt: window.endsAt },
              endsAt: { gt: window.startsAt },
            },
            select: { id: true },
          });
          if (hold) throw conflict('Removing availability would uncover a booked commitment');
        } else {
          // Release the exact block reservation once.
          await tx.resourceReservation.updateMany({
            where: { availabilityBlockId: window.id, releasedAt: null },
            data: { releasedAt: new Date() },
          });
        }
        await tx.availabilityWindow.update({
          where: { id: window.id },
          data: { removedAt: new Date(), version: { increment: 1 } },
        });
      });
      return { acknowledged: true };
    },
  };
}
