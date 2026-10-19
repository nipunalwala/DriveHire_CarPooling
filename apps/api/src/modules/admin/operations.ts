import { z } from 'zod';
import {
  TripStatusSchema,
  type BookingDto,
  type Page,
  type PageMeta,
  type TripDto,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { badRequest, forbidden } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { toBookingDto, toTripDto, type BookingWithRelations } from '../bookings/mappers.js';

// Administrator operations reads only. Booking and trip lifecycle mutations live
// in the participant services (`/bookings/:id/cancel`, `/trips/:id/transitions`);
// this module never duplicates them. Every method re-checks the current server
// ADMIN role in addition to the route guard, returns safe hand-mapped DTOs and
// never writes state.

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());

const BookingQuerySchema = PageQuerySchema.extend({
  status: z.string().min(1).max(30).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

const TripQuerySchema = PageQuerySchema.extend({
  status: TripStatusSchema.optional(),
  overdue: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

function assertAdmin(account: CurrentAccount): void {
  if (!account.roles.includes('ADMIN')) {
    throw forbidden('Administrator role is required');
  }
}

function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total };
}

function parseDateTime(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${field} is not a valid instant`);
  return parsed;
}

export interface AdminOperations {
  listBookings(account: CurrentAccount, query: Record<string, unknown>): Promise<Page<BookingDto>>;
  listTrips(account: CurrentAccount, query: Record<string, unknown>): Promise<Page<TripDto>>;
}

export function createAdminOperations({ prisma }: { prisma: PrismaClient }): AdminOperations {
  return {
    async listBookings(account, query) {
      assertAdmin(account);
      const parsed = BookingQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const { page, pageSize, status, from, to } = parsed.data;

      // Date filters narrow the scheduled journey window and remain inclusive.
      const startsAt: Prisma.DateTimeFilter = {};
      if (from !== undefined) startsAt.gte = parseDateTime(from, 'from');
      if (to !== undefined) startsAt.lte = parseDateTime(to, 'to');
      if (startsAt.gte && startsAt.lte && startsAt.gte > startsAt.lte) {
        throw badRequest('from must be earlier than or equal to to');
      }

      const where: Prisma.BookingWhereInput = {};
      if (status !== undefined) where.status = status;
      if (startsAt.gte !== undefined || startsAt.lte !== undefined) where.startsAt = startsAt;

      const [total, rows] = await Promise.all([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
          where,
          include: { decisions: true, trips: true },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return {
        success: true,
        data: rows.map((row) => toBookingDto(row as BookingWithRelations)),
        meta: pageMeta(page, pageSize, total),
      };
    },

    async listTrips(account, query) {
      assertAdmin(account);
      const parsed = TripQuerySchema.safeParse(query);
      if (!parsed.success) throw badRequest('Request validation failed');
      const { page, pageSize, status, overdue } = parsed.data;

      const where: Prisma.TripWhereInput = {};
      if (status !== undefined) where.status = status;
      // Overdue means physical use still active after the scheduled end. An
      // explicit false is treated as "no overdue restriction".
      if (overdue === true) {
        where.endsAt = { lt: new Date() };
        where.status = status !== undefined ? status : { in: ['STARTED', 'IN_TRANSIT'] };
        if (status !== undefined && status !== 'STARTED' && status !== 'IN_TRANSIT') {
          where.status = { in: [] };
        }
      }

      const [total, rows] = await Promise.all([
        prisma.trip.count({ where }),
        prisma.trip.findMany({
          where,
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return {
        success: true,
        data: rows.map(toTripDto),
        meta: pageMeta(page, pageSize, total),
      };
    },
  };
}
