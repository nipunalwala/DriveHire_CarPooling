import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  SeatInputSchema,
  VersionReasonInputSchema,
  type SeatRequestDto,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { assertStartEligibility, currentRoles } from '../bookings/commitments.js';
import { withBoundedRetry, withResourceLocks, sqlStateOf } from '../bookings/locks.js';
import { databaseNow } from './service.js';
type Tx = Prisma.TransactionClient;
export type LockedRide = Prisma.CarpoolGetPayload<{ include: { trips: true; seatRequests: true } }>;
export async function withLockedCarpool<T>(
  prisma: PrismaClient,
  id: string,
  actorId: string,
  run: (tx: Tx, ride: LockedRide) => Promise<T>,
): Promise<T> {
  return withBoundedRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const snapshot = await tx.carpool.findUnique({
          where: { id },
          include: { seatRequests: { where: { status: 'ACCEPTED' } } },
        });
        if (!snapshot) throw notFound();
        const users = new Set([
          actorId,
          snapshot.hostId,
          ...snapshot.seatRequests.map((s) => s.passengerId),
        ]);
        return withResourceLocks(
          tx,
          { userIds: [...users], driverIds: [snapshot.driverId], vehicleIds: [snapshot.vehicleId] },
          async () => {
            await tx.$queryRaw`SELECT id FROM carpools WHERE id=${id}::uuid FOR UPDATE`;
            const ride = await tx.carpool.findUniqueOrThrow({
              where: { id },
              include: { trips: true, seatRequests: true },
            });
            if (
              ride.vehicleId !== snapshot.vehicleId ||
              ride.seatRequests.some((s) => s.status === 'ACCEPTED' && !users.has(s.passengerId))
            )
              throw Object.assign(new Error('Carpool graph expanded'), { code: 'P2034' });
            return run(tx, ride);
          },
        );
      }),
    () => new HttpError(503, 'RETRYABLE_TRANSACTION', 'Retry after refreshing the ride'),
  );
}
export function seatDto(seat: {
  id: string;
  carpoolId: string;
  passengerId: string;
  seats: number;
  status: string;
  version: number;
  pricePerSeatMinor: number;
}): SeatRequestDto {
  return {
    id: seat.id,
    carpoolId: seat.carpoolId,
    passengerId: seat.passengerId,
    seats: seat.seats,
    status: seat.status as SeatRequestDto['status'],
    version: seat.version,
    pricePerSeatMinor: seat.pricePerSeatMinor,
  };
}
const invalid = (message: string) => new HttpError(422, 'UNPROCESSABLE_ENTITY', message);
const pagination = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export function createSeatsService({ prisma }: { prisma: PrismaClient }) {
  return {
    async requestSeat(
      account: CurrentAccount,
      id: string,
      input: unknown,
      key: string,
      requestId: string,
    ) {
      const parsed = SeatInputSchema.safeParse(input);
      if (!parsed.success) throw invalid('Seat request is invalid');
      if (key.length < 16 || key.length > 128)
        throw badRequest('Idempotency-Key must contain 16 to 128 characters');
      const body = parsed.data,
        operation = 'requestSeat',
        requestHash = createHash('sha256')
          .update(
            JSON.stringify({ carpoolId: id, seats: body.seats, message: body.message ?? null }),
          )
          .digest('hex');
      try {
        return await withLockedCarpool(prisma, id, account.userId, async (tx, ride) => {
          await currentRoles(tx, account, 'PASSENGER');
          const passenger = await tx.user.findUniqueOrThrow({
            where: { id: account.userId },
            select: { emailVerifiedAt: true },
          });
          if (!passenger.emailVerifiedAt) throw forbidden('Verify your email before joining');
          if (ride.hostId === account.userId) throw forbidden('Hosts cannot join their own ride');
          const now = await databaseNow(tx);
          const replay = await tx.idempotencyKey.findUnique({
            where: { userId_operation_key: { userId: account.userId, operation, key } },
          });
          if (replay && replay.expiresAt > now) {
            if (replay.requestHash !== requestHash)
              throw conflict('Idempotency key was used for another request');
            return { status: replay.responseStatus, body: replay.responseBody };
          }
          if (replay) await tx.idempotencyKey.delete({ where: { id: replay.id } });
          if (
            ride.status !== 'PUBLISHED' ||
            ride.trips[0]?.status !== 'ASSIGNED' ||
            now.getTime() > ride.startsAt.getTime() - 15 * 60000
          )
            throw conflict('This ride is no longer accepting seats');
          await assertStartEligibility(tx, ride.driverId, ride.vehicleId);
          if (
            ride.seatRequests.some(
              (s) => s.passengerId === account.userId && s.status === 'ACCEPTED',
            )
          )
            throw conflict('You already joined this ride');
          const incremented =
            await tx.$executeRaw`UPDATE carpools SET confirmed_seats=confirmed_seats+${body.seats},version=version+1 WHERE id=${id}::uuid AND confirmed_seats+${body.seats}<=seats_offered AND status='PUBLISHED'`;
          if (incremented !== 1) throw conflict('Not enough seats remain; refresh the ride');
          const seat = await tx.seatRequest.create({
            data: {
              carpoolId: id,
              passengerId: account.userId,
              seats: body.seats,
              status: 'ACCEPTED',
              pricePerSeatMinor: ride.pricePerSeatMinor,
              ...(body.message ? { message: body.message } : {}),
            },
          });
          const response = { success: true, data: seatDto(seat) };
          await tx.idempotencyKey.create({
            data: {
              userId: account.userId,
              operation,
              key,
              requestHash,
              responseStatus: 201,
              responseBody: response,
              expiresAt: new Date(now.getTime() + 24 * 3600000),
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: account.userId,
              actorType: 'USER',
              action: 'SEAT_ACCEPTED',
              subjectType: 'SEAT_REQUEST',
              subjectId: seat.id,
              requestId,
            },
          });
          return { status: 201, body: response };
        });
      } catch (error) {
        if (sqlStateOf(error) === '23505') throw conflict('You already joined this ride');
        throw error;
      }
    },
    async cancelSeat(account: CurrentAccount, id: string, input: unknown, requestId: string) {
      const parsed = VersionReasonInputSchema.safeParse(input);
      if (!parsed.success) throw invalid('Current version and valid reason required');
      const snapshot = await prisma.seatRequest.findUnique({ where: { id } });
      if (!snapshot) throw notFound();
      return withLockedCarpool(prisma, snapshot.carpoolId, account.userId, async (tx, ride) => {
        const roles = await currentRoles(tx, account);
        const seat = await tx.seatRequest.findUniqueOrThrow({ where: { id } });
        const admin = roles.includes('ADMIN');
        if (seat.passengerId !== account.userId && !admin) throw notFound();
        if (!admin && !roles.includes('PASSENGER')) throw forbidden();
        if (seat.status !== 'ACCEPTED') return seatDto(seat);
        if (seat.version !== parsed.data.version) throw conflict('Participation changed; refresh');
        const now = await databaseNow(tx);
        if (ride.trips[0]?.status !== 'ASSIGNED')
          throw conflict('Seats cannot change after start or terminal state');
        if (admin) {
          if (!parsed.data.reason?.trim())
            throw invalid('Administrator cancellation requires a reason');
        } else if (now.getTime() > ride.startsAt.getTime() - 15 * 60000)
          throw conflict('The cancellation cutoff has passed');
        const updated = await tx.seatRequest.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            reason: parsed.data.reason ?? null,
          },
        });
        await tx.carpool.update({
          where: { id: ride.id },
          data: { confirmedSeats: { decrement: seat.seats }, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId: account.userId,
            actorType: 'USER',
            action: 'SEAT_CANCELLED',
            subjectType: 'SEAT_REQUEST',
            subjectId: id,
            requestId,
            reason: parsed.data.reason ?? null,
          },
        });
        return seatDto(updated);
      });
    },
    async listSeatRequests(account: CurrentAccount, id: string, query: unknown) {
      const parsed = pagination.safeParse(query);
      if (!parsed.success) throw badRequest('Invalid pagination');
      const ride = await prisma.carpool.findUnique({ where: { id } });
      if (!ride || (ride.hostId !== account.userId && !account.roles.includes('ADMIN')))
        throw notFound();
      const { page, pageSize } = parsed.data,
        where = { carpoolId: id };
      const [total, rows] = await Promise.all([
        prisma.seatRequest.count({ where }),
        prisma.seatRequest.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const passengers = await prisma.user.findMany({
        where: { id: { in: rows.map((row) => row.passengerId) } },
        select: { id: true, displayName: true },
      });
      const names = new Map(passengers.map((user) => [user.id, user.displayName]));
      return {
        success: true,
        data: rows.map((row) => ({
          ...seatDto(row),
          passengerDisplayName: names.get(row.passengerId)!,
        })),
        meta: { page, pageSize, total },
      };
    },
    async listMySeats(account: CurrentAccount, query: unknown) {
      const parsed = pagination.safeParse(query);
      if (!parsed.success) throw badRequest('Invalid pagination');
      const { page, pageSize } = parsed.data,
        where = { passengerId: account.userId };
      const [total, rows] = await Promise.all([
        prisma.seatRequest.count({ where }),
        prisma.seatRequest.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { success: true, data: rows.map(seatDto), meta: { page, pageSize, total } };
    },
  };
}
