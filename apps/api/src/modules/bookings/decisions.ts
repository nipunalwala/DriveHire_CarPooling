import { z } from 'zod';
import {
  BookingDecisionInputSchema,
  VersionReasonInputSchema,
  type BookingDto,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { HttpError, forbidden, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { appendAudit } from '../admin/service.js';
import { withResourceLocks } from './locks.js';
import { toBookingDto, type BookingWithRelations } from './mappers.js';

// Driver consent and participant cancellation for DRIVER_HIRE bookings.
// Every mutation locks the canonical resource set (account/driver/vehicle rows)
// before the booking aggregate, re-reads current account/qualification state and
// applies an integer-version CAS. Booking, single DRIVER decision, trip status,
// immutable history, reservations and audit change in one transaction.

const CANCELLATION_CUTOFF_MS = 15 * 60 * 1000;
const MAX_REQUEST_ID_LENGTH = 80;

interface DriverQualification {
  userId: string;
  verificationStatus: string;
  acceptingBookings: boolean;
  licenseValid: boolean;
  driverRole: boolean;
  userStatus: string;
}

function unprocessable(message: string): HttpError {
  return new HttpError(422, 'UNPROCESSABLE_ENTITY', message);
}

function staleVersion(message = 'Booking changed; reload and retry'): HttpError {
  return new HttpError(409, 'STALE_VERSION', message);
}

function stateConflict(code: string, message: string): HttpError {
  return new HttpError(409, code, message);
}

function requestIdOf(value: string | undefined): string {
  return (value ?? '').slice(0, MAX_REQUEST_ID_LENGTH);
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT now() AS now`);
  return rows[0]?.now ?? new Date();
}

async function reReadAccount(
  tx: Prisma.TransactionClient,
  account: CurrentAccount,
): Promise<string[]> {
  const user = await tx.user.findUnique({
    where: { id: account.userId },
    select: { status: true },
  });
  if (!user || user.status !== 'ACTIVE') throw forbidden('Account is not active');
  const roles = await tx.userRole.findMany({
    where: { userId: account.userId },
    select: { role: true },
  });
  return [...new Set(roles.map((row) => row.role))];
}

async function loadDriverQualification(
  tx: Prisma.TransactionClient,
  driverId: string,
): Promise<DriverQualification | null> {
  const rows = await tx.$queryRaw<DriverQualification[]>(Prisma.sql`
    SELECT d.user_id AS "userId",
           d.verification_status AS "verificationStatus",
           d.accepting_bookings AS "acceptingBookings",
           (d.license_expires_on IS NOT NULL
             AND d.license_expires_on >= (now() AT TIME ZONE c.timezone)::date
             AND d.current_verification_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM verification_requests vr
               WHERE vr.id = d.current_verification_id AND vr.status = 'APPROVED'
             )
             AND EXISTS (
               SELECT 1 FROM verification_documents vd
               JOIN documents doc ON doc.id = vd.document_id
               WHERE vd.verification_id = d.current_verification_id
                 AND doc.driver_id = d.id AND doc.kind = 'LICENSE'
                 AND doc.scan_status = 'CLEAN' AND doc.retired_at IS NULL
                 AND (doc.expires_on IS NULL
                   OR doc.expires_on >= (now() AT TIME ZONE c.timezone)::date)
             )) AS "licenseValid",
           EXISTS (
             SELECT 1 FROM user_roles ur
             WHERE ur.user_id = d.user_id AND ur.role = 'DRIVER'
           ) AS "driverRole",
           u.status AS "userStatus"
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id
    JOIN cities c ON c.id = d.city_id
    WHERE d.id = ${driverId}::uuid`);
  return rows[0] ?? null;
}

async function withLockedBooking<T>(
  prisma: PrismaClient,
  bookingId: string,
  account: CurrentAccount,
  run: (tx: Prisma.TransactionClient, booking: BookingWithRelations) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Discover the lock set from the unprotected row, then lock canonical
    // order: users, driver profiles, vehicles, finally the booking aggregate.
    const discovered = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { passengerId: true, driverId: true, vehicleId: true },
    });
    if (!discovered) throw notFound('Booking not found');
    const driver = await tx.driverProfile.findUnique({
      where: { id: discovered.driverId },
      select: { userId: true },
    });
    const vehicle = await tx.vehicle.findUnique({
      where: { id: discovered.vehicleId },
      select: { ownerId: true },
    });
    const userIds = [
      account.userId,
      discovered.passengerId,
      driver?.userId,
      vehicle?.ownerId,
    ].filter((value): value is string => Boolean(value));

    return withResourceLocks(
      tx,
      {
        userIds,
        driverIds: [discovered.driverId],
        vehicleIds: [discovered.vehicleId],
      },
      async () => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`,
        );
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { decisions: true, trips: true },
        });
        if (!booking) throw notFound('Booking not found');
        return run(tx, booking);
      },
    );
  });
}

async function updateBookingCas(
  tx: Prisma.TransactionClient,
  booking: BookingWithRelations,
  version: number,
  data: Prisma.BookingUpdateManyMutationInput,
): Promise<number> {
  const result = await tx.booking.updateMany({
    where: { id: booking.id, version, status: booking.status },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count !== 1) throw staleVersion();
  return booking.version + 1;
}

async function transitionTrip(
  tx: Prisma.TransactionClient,
  trip: BookingWithRelations['trips'][number],
  toStatus: string,
  input: { actorId: string; reason: string | null; requestId: string; incident?: boolean },
): Promise<void> {
  const result = await tx.trip.updateMany({
    where: { id: trip.id, version: trip.version },
    data: {
      status: toStatus,
      version: { increment: 1 },
      ...(input.incident ? { incidentFlag: true } : {}),
    },
  });
  if (result.count !== 1) throw staleVersion('Trip changed; reload and retry');
  await tx.tripStatusHistory.create({
    data: {
      tripId: trip.id,
      fromStatus: trip.status,
      toStatus,
      actorId: input.actorId,
      actorType: 'USER',
      reason: input.reason,
      tripVersion: trip.version + 1,
      requestId: input.requestId,
    },
  });
}

async function releaseReservations(
  tx: Prisma.TransactionClient,
  bookingId: string,
  now: Date,
): Promise<void> {
  await tx.resourceReservation.updateMany({
    where: { bookingId, releasedAt: null },
    data: { releasedAt: now },
  });
}

async function finalBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<BookingDto> {
  const row = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { decisions: true, trips: true },
  });
  if (!row) throw notFound('Booking not found');
  return toBookingDto(row);
}

export function createDecisionsService({ prisma }: { prisma: PrismaClient }) {
  async function decideBooking(
    account: CurrentAccount,
    bookingId: string,
    input: unknown,
    requestId?: string,
  ): Promise<BookingDto> {
    const parsed = BookingDecisionInputSchema.safeParse(input);
    if (!parsed.success) throw unprocessable('Request validation failed');
    if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found');
    const decisionInput = parsed.data;
    if (decisionInput.decision === 'REJECT' && (decisionInput.reason?.trim().length ?? 0) < 10) {
      throw unprocessable('A rejection reason of at least 10 characters is required');
    }
    const auditRequestId = requestIdOf(requestId);

    return withLockedBooking(prisma, bookingId, account, async (tx, booking) => {
      await reReadAccount(tx, account);
      const provider = await tx.driverProfile.findUnique({
        where: { id: booking.driverId },
        select: { userId: true },
      });
      if (!provider) throw notFound('Driver not found');
      if (provider.userId !== account.userId) {
        throw forbidden('Only the assigned driver can decide this booking');
      }

      const now = await databaseNow(tx);
      if (booking.status !== 'PENDING') {
        throw stateConflict('BOOKING_NOT_PENDING', 'Booking is not pending');
      }
      if (booking.expiresAt <= now) {
        throw stateConflict('BOOKING_EXPIRED', 'Booking request has expired; ask for a new quote');
      }
      if (booking.version !== decisionInput.version) throw staleVersion();

      const decision = booking.decisions[0];
      if (!decision || decision.kind !== 'DRIVER' || decision.status !== 'PENDING') {
        throw stateConflict('BOOKING_ALREADY_DECIDED', 'A driver decision is already recorded');
      }
      const trip = booking.trips[0];
      if (!trip) throw stateConflict('BOOKING_TRIP_MISSING', 'Booking has no trip');
      if (trip.status !== 'SCHEDULED') {
        throw stateConflict('BOOKING_TRIP_STATE', 'Trip is not awaiting driver consent');
      }

      const accepted = decisionInput.decision === 'ACCEPT';
      if (accepted) {
        const qualification = await loadDriverQualification(tx, booking.driverId);
        if (
          !qualification ||
          qualification.userStatus !== 'ACTIVE' ||
          qualification.verificationStatus !== 'APPROVED' ||
          !qualification.acceptingBookings ||
          !qualification.licenseValid ||
          !qualification.driverRole
        ) {
          throw stateConflict(
            'DRIVER_INELIGIBLE',
            'Driver qualification is no longer valid for this booking',
          );
        }
      }

      const updatedDecision = await tx.bookingDecision.updateMany({
        where: { id: decision.id, status: 'PENDING' },
        data: {
          status: accepted ? 'ACCEPTED' : 'REJECTED',
          decidedAt: now,
          reason: decisionInput.reason ?? null,
        },
      });
      if (updatedDecision.count !== 1) {
        throw stateConflict('BOOKING_ALREADY_DECIDED', 'A driver decision is already recorded');
      }

      const nextVersion = await updateBookingCas(
        tx,
        booking,
        decisionInput.version,
        accepted ? { status: 'CONFIRMED' } : { status: 'REJECTED' },
      );

      if (accepted) {
        await transitionTrip(tx, trip, 'ASSIGNED', {
          actorId: account.userId,
          reason: null,
          requestId: auditRequestId,
        });
      } else {
        await transitionTrip(tx, trip, 'REJECTED', {
          actorId: account.userId,
          reason: decisionInput.reason ?? null,
          requestId: auditRequestId,
        });
        await releaseReservations(tx, booking.id, now);
      }

      await appendAudit(tx, {
        actorId: account.userId,
        action: accepted ? 'BOOKING_DRIVER_ACCEPT' : 'BOOKING_DRIVER_REJECT',
        subjectType: 'booking',
        subjectId: booking.id,
        requestId: auditRequestId,
        ...(decisionInput.reason !== undefined ? { reason: decisionInput.reason } : {}),
        beforeSafe: { status: booking.status, version: booking.version },
        afterSafe: {
          status: accepted ? 'CONFIRMED' : 'REJECTED',
          version: nextVersion,
          decision: accepted ? 'ACCEPTED' : 'REJECTED',
        },
      });

      return finalBooking(tx, booking.id);
    });
  }

  async function cancelBooking(
    account: CurrentAccount,
    bookingId: string,
    input: unknown,
    requestId?: string,
  ): Promise<BookingDto> {
    const parsed = VersionReasonInputSchema.safeParse(input);
    if (!parsed.success) throw unprocessable('Request validation failed');
    if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found');
    const cancelInput = parsed.data;
    const auditRequestId = requestIdOf(requestId);

    return withLockedBooking(prisma, bookingId, account, async (tx, booking) => {
      const roles = await reReadAccount(tx, account);
      const provider = await tx.driverProfile.findUnique({
        where: { id: booking.driverId },
        select: { userId: true },
      });
      const isAdmin = roles.includes('ADMIN');
      const isPassenger = booking.passengerId === account.userId;
      const isProvider = provider?.userId === account.userId;
      if (!isAdmin && !isPassenger && !isProvider) {
        throw forbidden('Only the booking passenger, assigned driver or an administrator may act');
      }
      if (booking.version !== cancelInput.version) throw staleVersion();
      if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
        throw stateConflict('BOOKING_TERMINAL', 'Booking can no longer be cancelled');
      }

      const trip = booking.trips[0];
      if (!trip) throw stateConflict('BOOKING_TRIP_MISSING', 'Booking has no trip');
      const now = await databaseNow(tx);
      const started =
        trip.startedAt !== null || trip.status === 'STARTED' || trip.status === 'IN_TRANSIT';

      if (started) {
        if (!isAdmin) {
          throw stateConflict(
            'BOOKING_TRIP_STARTED',
            'Started or in-transit trips cannot use pre-start cancellation',
          );
        }
        const nextVersion = await updateBookingCas(tx, booking, cancelInput.version, {
          status: 'FAILED',
          cancelReason: cancelInput.reason,
        });
        await transitionTrip(tx, trip, 'FAILED', {
          actorId: account.userId,
          reason: cancelInput.reason,
          requestId: auditRequestId,
          incident: true,
        });
        await releaseReservations(tx, booking.id, now);
        await appendAudit(tx, {
          actorId: account.userId,
          action: 'BOOKING_CANCEL',
          subjectType: 'booking',
          subjectId: booking.id,
          requestId: auditRequestId,
          reason: cancelInput.reason,
          beforeSafe: { status: booking.status, version: booking.version },
          afterSafe: { status: 'FAILED', version: nextVersion, incident: true },
        });
        return finalBooking(tx, booking.id);
      }

      if (booking.status === 'PENDING' && !isAdmin && booking.expiresAt <= now) {
        throw stateConflict('BOOKING_EXPIRED', 'Booking request has expired');
      }
      if (booking.status === 'CONFIRMED' && isPassenger && !isAdmin) {
        const cutoff = booking.startsAt.getTime() - CANCELLATION_CUTOFF_MS;
        if (now.getTime() > cutoff) {
          throw stateConflict(
            'CANCELLATION_CUTOFF',
            'Confirmed bookings can only be cancelled at least 15 minutes before start',
          );
        }
      }
      if (trip.status !== 'SCHEDULED' && trip.status !== 'ASSIGNED') {
        throw stateConflict('BOOKING_TRIP_STATE', 'Trip is not awaiting start');
      }

      const nextVersion = await updateBookingCas(tx, booking, cancelInput.version, {
        status: 'CANCELLED',
        cancelReason: cancelInput.reason,
      });
      await transitionTrip(tx, trip, 'CANCELLED', {
        actorId: account.userId,
        reason: cancelInput.reason,
        requestId: auditRequestId,
      });
      await releaseReservations(tx, booking.id, now);
      await appendAudit(tx, {
        actorId: account.userId,
        action: 'BOOKING_CANCEL',
        subjectType: 'booking',
        subjectId: booking.id,
        requestId: auditRequestId,
        reason: cancelInput.reason,
        beforeSafe: { status: booking.status, version: booking.version },
        afterSafe: { status: 'CANCELLED', version: nextVersion },
      });
      return finalBooking(tx, booking.id);
    });
  }

  return { decideBooking, cancelBooking };
}
