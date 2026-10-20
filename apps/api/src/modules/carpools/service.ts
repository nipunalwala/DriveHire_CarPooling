import { z } from 'zod';
import {
  CarpoolInputSchema,
  type CarpoolInput,
  type CarpoolDto,
  type Page,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { HttpError, badRequest, conflict, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import {
  assertStartEligibility,
  currentRoles,
  qualificationPredicate,
} from '../bookings/commitments.js';
import { withResourceLocks, withBoundedRetry, isExclusionViolation } from '../bookings/locks.js';

type Tx = Prisma.TransactionClient;
type Ride = Prisma.CarpoolGetPayload<{ include: { trips: true } }>;
const versionSchema = z.strictObject({ version: z.number().int().min(1).max(2147483647) });
const pageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const searchSchema = pageSchema.extend({
  originCityId: z.uuid().optional(),
  destinationCityId: z.uuid().optional(),
  date: z.iso.date().optional(),
  seats: z.coerce.number().int().min(1).max(11).optional(),
});
const invalid = (message: string) => new HttpError(422, 'UNPROCESSABLE_ENTITY', message);
const retryFailed = () => new HttpError(503, 'RETRYABLE_TRANSACTION', 'Please retry the operation');
export async function databaseNow(tx: Tx): Promise<Date> {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0]!.now;
}
export async function carpoolDto(tx: Tx, ride: Ride): Promise<CarpoolDto> {
  const [host, vehicle] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: ride.hostId }, select: { displayName: true } }),
    tx.vehicle.findUniqueOrThrow({
      where: { id: ride.vehicleId },
      select: { make: true, model: true, seats: true },
    }),
  ]);
  if (!ride.trips[0]) throw new Error('Carpool trip missing');
  return {
    id: ride.id,
    hostId: ride.hostId,
    vehicleId: ride.vehicleId,
    tripId: ride.trips[0].id,
    originCityId: ride.originCityId,
    destinationCityId: ride.destinationCityId,
    pickupNote: ride.pickupNote,
    dropoffNote: ride.dropoffNote,
    startsAt: ride.startsAt.toISOString(),
    endsAt: ride.endsAt.toISOString(),
    seatsOffered: ride.seatsOffered,
    confirmedSeats: ride.confirmedSeats,
    availableSeats: ride.seatsOffered - ride.confirmedSeats,
    pricePerSeatMinor: ride.pricePerSeatMinor,
    currency: 'INR',
    joinMode: 'INSTANT',
    status: ride.status as CarpoolDto['status'],
    version: ride.version,
    hostDisplayName: host.displayName,
    vehicleSummary: vehicle,
  };
}
function parseInput(raw: unknown): CarpoolInput {
  const parsed = CarpoolInputSchema.safeParse(raw);
  if (!parsed.success) throw invalid('Carpool input is invalid');
  return parsed.data;
}
async function validate(tx: Tx, input: CarpoolInput, driverId: string, hostId: string) {
  const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle || vehicle.ownerId !== hostId) throw notFound();
  if (input.originCityId === input.destinationCityId) throw invalid('Choose distinct cities');
  if (
    (await tx.city.count({
      where: { id: { in: [input.originCityId, input.destinationCityId] }, active: true },
    })) !== 2
  )
    throw invalid('Choose active catalogue cities');
  if (input.seatsOffered > vehicle.seats - 1) throw invalid('Leave one seat for the driver');
  const startsAt = new Date(input.startsAt),
    endsAt = new Date(input.endsAt),
    now = await databaseNow(tx);
  const duration = endsAt.getTime() - startsAt.getTime();
  if (
    duration < 15 * 60000 ||
    duration > 24 * 3600000 ||
    startsAt.getTime() < now.getTime() + 3600000 ||
    startsAt.getTime() > now.getTime() + 180 * 86400000
  )
    throw invalid(
      'Allow one hour before departure; duration 15 minutes to 24 hours, within 180 days',
    );
  await assertStartEligibility(tx, driverId, input.vehicleId);
  return { startsAt, endsAt };
}
async function audit(
  tx: Tx,
  account: CurrentAccount,
  id: string,
  action: string,
  requestId: string,
) {
  await tx.auditLog.create({
    data: {
      actorId: account.userId,
      actorType: 'USER',
      subjectType: 'CARPOOL',
      subjectId: id,
      action,
      requestId,
    },
  });
}
export function createCarpoolsService({ prisma }: { prisma: PrismaClient }) {
  async function mutate(
    account: CurrentAccount,
    raw: unknown,
    id: string | undefined,
    requestId: string,
  ) {
    const input = parseInput(raw);
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: account.userId },
      select: { id: true },
    });
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { ownerId: true },
    });
    if (!vehicle || vehicle.ownerId !== account.userId) throw notFound();
    if (!driver) throw invalid('Approved driver qualification is required');
    const old = id
      ? await prisma.carpool.findUnique({
          where: { id },
          select: { vehicleId: true, hostId: true },
        })
      : null;
    if (id && (!old || old.hostId !== account.userId)) throw notFound();
    return withBoundedRetry(
      () =>
        prisma.$transaction((tx) =>
          withResourceLocks(
            tx,
            {
              userIds: [account.userId],
              driverIds: [driver.id],
              vehicleIds: [input.vehicleId, ...(old ? [old.vehicleId] : [])],
            },
            async () => {
              await currentRoles(tx, account, 'DRIVER');
              let previous: Ride | null = null;
              if (id) {
                await tx.$queryRaw`SELECT id FROM carpools WHERE id=${id}::uuid FOR UPDATE`;
                previous = await tx.carpool.findUnique({ where: { id }, include: { trips: true } });
                if (!previous || previous.hostId !== account.userId) throw notFound();
                if (previous.status !== 'DRAFT' || previous.version !== input.version)
                  throw conflict('Only a current draft can be changed');
              }
              const times = await validate(tx, input, driver.id, account.userId);
              const data = {
                vehicleId: input.vehicleId,
                originCityId: input.originCityId,
                destinationCityId: input.destinationCityId,
                pickupNote: input.pickupNote,
                dropoffNote: input.dropoffNote,
                ...times,
                seatsOffered: input.seatsOffered,
                pricePerSeatMinor: input.pricePerSeatMinor,
                joinMode: 'INSTANT',
              };
              let ride: Ride;
              if (previous) {
                ride = await tx.carpool.update({
                  where: { id: previous.id },
                  data: { ...data, version: { increment: 1 } },
                  include: { trips: true },
                });
                await tx.trip.update({
                  where: { id: ride.trips[0]!.id },
                  data: { vehicleId: input.vehicleId, ...times, version: { increment: 1 } },
                });
              } else {
                const created = await tx.carpool.create({
                  data: { ...data, hostId: account.userId, driverId: driver.id },
                });
                const trip = await tx.trip.create({
                  data: {
                    carpoolId: created.id,
                    driverId: driver.id,
                    vehicleId: input.vehicleId,
                    ...times,
                    status: 'SCHEDULED',
                  },
                });
                await tx.tripStatusHistory.create({
                  data: {
                    tripId: trip.id,
                    fromStatus: null,
                    toStatus: 'SCHEDULED',
                    actorId: account.userId,
                    actorType: 'USER',
                    tripVersion: 1,
                    requestId,
                  },
                });
                ride = { ...created, trips: [trip] };
              }
              await audit(
                tx,
                account,
                ride.id,
                previous ? 'CARPOOL_UPDATED' : 'CARPOOL_CREATED',
                requestId,
              );
              return carpoolDto(tx, ride);
            },
          ),
        ),
      retryFailed,
    );
  }
  return {
    createCarpool: (account: CurrentAccount, raw: unknown, requestId: string) =>
      mutate(account, raw, undefined, requestId),
    updateCarpool: (account: CurrentAccount, id: string, raw: unknown, requestId: string) =>
      mutate(account, raw, id, requestId),
    async publishCarpool(account: CurrentAccount, id: string, raw: unknown, requestId: string) {
      const parsed = versionSchema.safeParse(raw);
      if (!parsed.success) throw invalid('Current version required');
      const snapshot = await prisma.carpool.findUnique({ where: { id } });
      if (!snapshot || snapshot.hostId !== account.userId) throw notFound();
      try {
        return await withBoundedRetry(
          () =>
            prisma.$transaction((tx) =>
              withResourceLocks(
                tx,
                {
                  userIds: [snapshot.hostId],
                  driverIds: [snapshot.driverId],
                  vehicleIds: [snapshot.vehicleId],
                },
                async () => {
                  await currentRoles(tx, account, 'DRIVER');
                  await tx.$queryRaw`SELECT id FROM carpools WHERE id=${id}::uuid FOR UPDATE`;
                  const ride = await tx.carpool.findUniqueOrThrow({
                    where: { id },
                    include: { trips: true },
                  });
                  if (ride.status !== 'DRAFT' || ride.version !== parsed.data.version)
                    throw conflict('Ride changed; reload before publishing');
                  if (ride.vehicleId !== snapshot.vehicleId)
                    throw conflict('Ride changed; reload before publishing');
                  await validate(
                    tx,
                    {
                      ...ride,
                      startsAt: ride.startsAt.toISOString(),
                      endsAt: ride.endsAt.toISOString(),
                      joinMode: 'INSTANT',
                    },
                    ride.driverId,
                    account.userId,
                  );
                  if (
                    await tx.trip.count({
                      where: {
                        status: { in: ['STARTED', 'IN_TRANSIT'] },
                        OR: [{ driverId: ride.driverId }, { vehicleId: ride.vehicleId }],
                      },
                    })
                  )
                    throw conflict('A resource is still in physical use');
                  await tx.resourceReservation.createMany({
                    data: [
                      {
                        driverId: ride.driverId,
                        carpoolId: id,
                        startsAt: ride.startsAt,
                        endsAt: ride.endsAt,
                      },
                      {
                        vehicleId: ride.vehicleId,
                        carpoolId: id,
                        startsAt: ride.startsAt,
                        endsAt: ride.endsAt,
                      },
                    ],
                  });
                  const trip = ride.trips[0]!;
                  await tx.trip.update({
                    where: { id: trip.id },
                    data: { status: 'ASSIGNED', version: { increment: 1 } },
                  });
                  await tx.tripStatusHistory.create({
                    data: {
                      tripId: trip.id,
                      fromStatus: 'SCHEDULED',
                      toStatus: 'ASSIGNED',
                      actorId: account.userId,
                      actorType: 'USER',
                      tripVersion: trip.version + 1,
                      requestId,
                    },
                  });
                  const updated = await tx.carpool.update({
                    where: { id },
                    data: {
                      status: 'PUBLISHED',
                      publishedAt: await databaseNow(tx),
                      version: { increment: 1 },
                    },
                    include: { trips: true },
                  });
                  await audit(tx, account, id, 'CARPOOL_PUBLISHED', requestId);
                  return carpoolDto(tx, updated);
                },
              ),
            ),
          retryFailed,
        );
      } catch (error) {
        if (isExclusionViolation(error)) throw conflict('Driver or vehicle is already reserved');
        throw error;
      }
    },
    async getCarpool(id: string, account?: CurrentAccount) {
      if (!z.uuid().safeParse(id).success) throw notFound();
      const ride = await prisma.carpool.findUnique({ where: { id }, include: { trips: true } });
      if (
        !ride ||
        (!ride.publishedAt && ride.hostId !== account?.userId && !account?.roles.includes('ADMIN'))
      )
        throw notFound();
      return carpoolDto(prisma, ride);
    },
    async listMyCarpools(account: CurrentAccount, raw: unknown) {
      const parsed = pageSchema.safeParse(raw);
      if (!parsed.success) throw badRequest('Invalid pagination');
      const { page, pageSize } = parsed.data;
      const where = { hostId: account.userId };
      const [total, rides] = await Promise.all([
        prisma.carpool.count({ where }),
        prisma.carpool.findMany({
          where,
          include: { trips: true },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return {
        success: true as const,
        data: await Promise.all(rides.map((ride) => carpoolDto(prisma, ride))),
        meta: { page, pageSize, total },
      };
    },
    async searchCarpools(raw: unknown): Promise<Page<CarpoolDto>> {
      const parsed = searchSchema.safeParse(raw);
      if (!parsed.success) throw badRequest('Invalid search filters');
      const { page, pageSize, originCityId, destinationCityId, date, seats } = parsed.data;
      const source = Prisma.sql`FROM carpools c JOIN cities city ON city.id=c.origin_city_id JOIN trips t ON t.carpool_id=c.id
        JOIN driver_profiles d ON d.id=c.driver_id JOIN users du ON du.id=d.user_id JOIN cities dc ON dc.id=d.city_id
        JOIN vehicles v ON v.id=c.vehicle_id JOIN users vu ON vu.id=v.owner_id JOIN cities vc ON vc.id=v.city_id
        WHERE c.status='PUBLISHED' AND t.status='ASSIGNED' AND city.active AND clock_timestamp()<=c.starts_at-interval '15 minutes'
        AND c.seats_offered-c.confirmed_seats>=${seats ?? 1} AND ${qualificationPredicate()}
        ${originCityId ? Prisma.sql`AND c.origin_city_id=${originCityId}::uuid` : Prisma.empty}
        ${destinationCityId ? Prisma.sql`AND c.destination_city_id=${destinationCityId}::uuid` : Prisma.empty}
        ${date ? Prisma.sql`AND (c.starts_at AT TIME ZONE city.timezone)::date=${date}::date` : Prisma.empty}`;
      const [counts, ids] = await Promise.all([
        prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total ${source}`),
        prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT c.id ${source} ORDER BY c.starts_at,c.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        ),
      ]);
      const rides = await prisma.carpool.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        include: { trips: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      return {
        success: true,
        data: await Promise.all(rides.map((ride) => carpoolDto(prisma, ride))),
        meta: { page, pageSize, total: counts[0]!.total },
      };
    },
  };
}
