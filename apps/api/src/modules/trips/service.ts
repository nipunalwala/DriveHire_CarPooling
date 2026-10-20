import { z } from 'zod';
import {
  TransitionInputSchema,
  type HistoryEntryDto,
  type Page,
  type PageMeta,
  type TripDto,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { HttpError, badRequest, forbidden, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { appendAudit } from '../admin/service.js';
import { currentRoles, assertStartEligibility } from '../bookings/commitments.js';
import { withBoundedRetry, withResourceLocks } from '../bookings/locks.js';

const PAGE_MAX = 2_147_483_647;
const START_OPEN_MS = 15 * 60 * 1000;
const START_CLOSE_MS = 30 * 60 * 1000;
const ACTIVE_STATUSES = ['STARTED', 'IN_TRANSIT'] as const;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED']);

const LEGAL_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  ASSIGNED: ['STARTED'],
  STARTED: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['COMPLETED', 'FAILED'],
};

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const TripListQuerySchema = PageQuerySchema.extend({
  status: z.string().min(1).max(30).optional(),
});

type TripScalars = {
  id: string;
  bookingId: string | null;
  carpoolId: string | null;
  driverId: string;
  vehicleId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  version: number;
  incidentFlag: boolean;
};

const TRIP_SELECT = {
  id: true,
  bookingId: true,
  carpoolId: true,
  driverId: true,
  vehicleId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  version: true,
  incidentFlag: true,
} as const;

type TripWithParents = TripScalars & {
  booking: { passengerId: string } | null;
  carpool: { hostId: string; seatRequests: { passengerId: string }[] } | null;
};

function unprocessable(message: string): HttpError {
  return new HttpError(422, 'UNPROCESSABLE_ENTITY', message);
}

function conflict(code: string, message: string): HttpError {
  return new HttpError(409, code, message);
}

function toTripDto(row: TripScalars): TripDto {
  return {
    id: row.id,
    kind: row.bookingId ? 'BOOKING' : 'CARPOOL',
    status: row.status as TripDto['status'],
    driverId: row.driverId,
    vehicleId: row.vehicleId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    version: row.version,
    incidentFlag: row.incidentFlag,
  };
}

function toHistoryDto(row: {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}): HistoryEntryDto {
  const entry: HistoryEntryDto = {
    id: row.id,
    fromStatus: row.fromStatus as string,
    toStatus: row.toStatus,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.reason) entry.reason = row.reason;
  return entry;
}

async function actorDriverId(
  prisma: PrismaClient,
  account: CurrentAccount,
): Promise<string | null> {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId: account.userId },
    select: { id: true },
  });
  return driver?.id ?? null;
}

export interface TripsService {
  listTrips(account: CurrentAccount, query: Record<string, string>): Promise<Page<TripDto>>;
  getTrip(account: CurrentAccount, id: string): Promise<TripDto>;
  tripHistory(
    account: CurrentAccount,
    id: string,
    query: Record<string, string>,
  ): Promise<Page<HistoryEntryDto>>;
  transitionTrip(
    account: CurrentAccount,
    id: string,
    input: unknown,
    requestId: string,
  ): Promise<TripDto>;
}

export function createTripsService({ prisma }: { prisma: PrismaClient }): TripsService {
  async function canAccessTrip(account: CurrentAccount, trip: TripWithParents): Promise<boolean> {
    if (account.roles.includes('ADMIN')) return true;
    if (trip.booking?.passengerId === account.userId) return true;
    if (trip.carpool?.hostId === account.userId) return true;
    if (trip.carpool?.seatRequests.some((seat) => seat.passengerId === account.userId)) return true;
    if ((await actorDriverId(prisma, account)) === trip.driverId) return true;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: trip.vehicleId },
      select: { ownerId: true },
    });
    return vehicle?.ownerId === account.userId;
  }

  async function loadAuthorizedTrip(account: CurrentAccount, id: string): Promise<TripScalars> {
    if (!z.uuid().safeParse(id).success) throw notFound('Trip not found');
    const trip = await prisma.trip.findUnique({
      where: { id },
      select: {
        ...TRIP_SELECT,
        booking: { select: { passengerId: true } },
        carpool: {
          select: {
            hostId: true,
            seatRequests: { where: { status: 'ACCEPTED' }, select: { passengerId: true } },
          },
        },
      },
    });
    if (!trip) throw notFound('Trip not found');
    if (!(await canAccessTrip(account, trip))) throw notFound('Trip not found');
    return trip;
  }

  async function listTrips(
    account: CurrentAccount,
    query: Record<string, string>,
  ): Promise<Page<TripDto>> {
    const parsed = TripListQuerySchema.safeParse(query);
    if (!parsed.success) throw badRequest('Request validation failed');

    const where: Prisma.TripWhereInput = {};
    if (!account.roles.includes('ADMIN')) {
      const [driverId, vehicles] = await Promise.all([
        actorDriverId(prisma, account),
        prisma.vehicle.findMany({ where: { ownerId: account.userId }, select: { id: true } }),
      ]);
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);
      const scope: Prisma.TripWhereInput[] = [
        { booking: { passengerId: account.userId } },
        { carpool: { hostId: account.userId } },
        {
          carpool: { seatRequests: { some: { passengerId: account.userId, status: 'ACCEPTED' } } },
        },
      ];
      if (driverId) scope.push({ driverId });
      if (vehicleIds.length > 0) scope.push({ vehicleId: { in: vehicleIds } });
      where.OR = scope;
    }
    if (parsed.data.status) where.status = parsed.data.status;

    const [total, rows] = await Promise.all([
      prisma.trip.count({ where }),
      prisma.trip.findMany({
        where,
        select: TRIP_SELECT,
        orderBy: { startsAt: 'desc' },
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
    ]);
    const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
    return { success: true, data: rows.map(toTripDto), meta };
  }

  async function getTrip(account: CurrentAccount, id: string): Promise<TripDto> {
    const trip = await loadAuthorizedTrip(account, id);
    return toTripDto(trip);
  }

  async function tripHistory(
    account: CurrentAccount,
    id: string,
    query: Record<string, string>,
  ): Promise<Page<HistoryEntryDto>> {
    const parsed = PageQuerySchema.safeParse(query);
    if (!parsed.success) throw badRequest('Request validation failed');
    await loadAuthorizedTrip(account, id);

    const where: Prisma.TripStatusHistoryWhereInput = { tripId: id, fromStatus: { not: null } };
    const [total, rows] = await Promise.all([
      prisma.tripStatusHistory.count({ where }),
      prisma.tripStatusHistory.findMany({
        where,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          actorId: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { tripVersion: 'asc' },
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
    ]);
    const meta: PageMeta = { page: parsed.data.page, pageSize: parsed.data.pageSize, total };
    return { success: true, data: rows.map(toHistoryDto), meta };
  }

  async function transitionTrip(
    account: CurrentAccount,
    id: string,
    input: unknown,
    requestId: string,
  ): Promise<TripDto> {
    if (!z.uuid().safeParse(id).success) throw notFound('Trip not found');
    const parsed = TransitionInputSchema.safeParse(input);
    if (!parsed.success) throw unprocessable('Request validation failed');
    const toStatus = parsed.data.toStatus;
    const reason = parsed.data.reason;

    const header = await prisma.trip.findUnique({ where: { id }, select: TRIP_SELECT });
    if (!header) throw notFound('Trip not found');

    const [driver, vehicle] = await Promise.all([
      prisma.driverProfile.findUnique({
        where: { id: header.driverId },
        select: { id: true, userId: true },
      }),
      prisma.vehicle.findUnique({ where: { id: header.vehicleId }, select: { ownerId: true } }),
    ]);

    const run = async (): Promise<TripDto> =>
      prisma.$transaction(async (tx) => {
        return withResourceLocks(
          tx,
          {
            userIds: [account.userId, driver?.userId, vehicle?.ownerId].filter(
              (value): value is string => Boolean(value),
            ),
            driverIds: [header.driverId],
            vehicleIds: [header.vehicleId],
          },
          async () => {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM trips WHERE id = ${id}::uuid FOR UPDATE`);
            const trip = await tx.trip.findUnique({ where: { id }, select: TRIP_SELECT });
            if (!trip) throw notFound('Trip not found');

            const roles = await currentRoles(tx, account);
            const isAssignedDriver = driver?.userId === account.userId && roles.includes('DRIVER');
            const isAdmin = roles.includes('ADMIN');
            if (!isAssignedDriver && !isAdmin) {
              throw forbidden('Only the assigned driver or an administrator can change this trip');
            }

            const legal = LEGAL_TRANSITIONS[trip.status];
            if (TERMINAL_STATUSES.has(trip.status)) {
              throw conflict('TRIP_TERMINAL', 'This trip has already reached a terminal state');
            }
            if (!legal) {
              throw conflict(
                'ILLEGAL_TRANSITION',
                `Trip cannot move from ${trip.status} to ${toStatus}`,
              );
            }
            if (trip.version !== parsed.data.version) {
              throw conflict('STALE_VERSION', 'Trip changed since it was loaded; reload and retry');
            }
            if (!legal.includes(toStatus)) {
              throw conflict(
                'ILLEGAL_TRANSITION',
                `Trip cannot move from ${trip.status} to ${toStatus}`,
              );
            }
            if (toStatus === 'FAILED' && !reason) {
              throw unprocessable('A reason is required to fail a trip');
            }
            if (isAdmin && !isAssignedDriver && !reason) {
              throw unprocessable('An administrator reason is required');
            }

            const now = (
              await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`)
            )[0]!.now;
            if (toStatus === 'STARTED') {
              await assertStartEligibility(tx, trip.driverId, trip.vehicleId);
              const opens = trip.startsAt.getTime() - START_OPEN_MS;
              const closes = trip.startsAt.getTime() + START_CLOSE_MS;
              if (now.getTime() < opens || now.getTime() > closes) {
                throw conflict(
                  'START_WINDOW',
                  'The trip can only be started inside its start window',
                );
              }
              const overrunning = await tx.trip.findFirst({
                where: {
                  id: { not: trip.id },
                  OR: [{ driverId: trip.driverId }, { vehicleId: trip.vehicleId }],
                  status: { in: [...ACTIVE_STATUSES] },
                },
                select: { id: true },
              });
              if (overrunning) {
                throw conflict(
                  'RESOURCE_CONFLICT',
                  'The assigned driver or vehicle is still on an active trip',
                );
              }
            }

            const overrun = now.getTime() > trip.endsAt.getTime();
            const data: Prisma.TripUpdateManyMutationInput = {
              status: toStatus,
              version: { increment: 1 },
            };
            if (overrun) data.incidentFlag = true;
            if (toStatus === 'STARTED') data.startedAt = now;
            if (toStatus === 'COMPLETED' || toStatus === 'FAILED') data.completedAt = now;

            const updated = await tx.trip.updateMany({
              where: { id: trip.id, version: parsed.data.version },
              data,
            });
            if (updated.count === 0) {
              throw conflict('STALE_VERSION', 'Trip changed since it was loaded; reload and retry');
            }

            await tx.tripStatusHistory.create({
              data: {
                tripId: trip.id,
                fromStatus: trip.status,
                toStatus,
                actorId: account.userId,
                actorType: 'USER',
                reason: reason ?? null,
                tripVersion: trip.version + 1,
                requestId,
              },
            });

            if (toStatus === 'COMPLETED' || toStatus === 'FAILED') {
              const parentStatus = toStatus;
              if (trip.bookingId) {
                await tx.booking.updateMany({
                  where: { id: trip.bookingId },
                  data: { status: parentStatus, version: { increment: 1 } },
                });
                await tx.resourceReservation.updateMany({
                  where: { bookingId: trip.bookingId, releasedAt: null },
                  data: { releasedAt: now },
                });
              }
              if (trip.carpoolId) {
                await tx.resourceReservation.updateMany({
                  where: { carpoolId: trip.carpoolId, releasedAt: null },
                  data: { releasedAt: now },
                });
                await tx.carpool.updateMany({
                  where: { id: trip.carpoolId },
                  data: { status: parentStatus, version: { increment: 1 } },
                });
              }
            }

            await appendAudit(tx, {
              actorId: account.userId,
              action: `TRIP_${toStatus}`,
              subjectType: 'trip',
              subjectId: trip.id,
              requestId,
              ...(reason ? { reason } : {}),
            });

            const finalized = await tx.trip.findUniqueOrThrow({
              where: { id: trip.id },
              select: TRIP_SELECT,
            });
            return toTripDto(finalized);
          },
        );
      });

    return withBoundedRetry(run, () =>
      conflict('RESOURCE_CONFLICT', 'Trip could not be updated; reload and retry'),
    );
  }

  return { listTrips, getTrip, tripHistory, transitionTrip };
}
