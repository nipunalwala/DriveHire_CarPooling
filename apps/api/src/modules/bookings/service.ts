import { createHash } from 'node:crypto';
import {
  BookingInputSchema,
  QuoteInputSchema,
  type BookingDto,
  type QuoteDto,
} from '@drivehire/contracts';
import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { HttpError, forbidden, notFound } from '../../errors.js';
import type { CurrentAccount } from '../accounts/service.js';
import { currentRoles } from './commitments.js';
import { isExclusionViolation, sqlStateOf, withBoundedRetry, withResourceLocks } from './locks.js';

// DRIVER_HIRE quotes and booking creation. Quotes are immutable ten-minute
// snapshots of resource versions and the current driver rate; creation
// revalidates every precondition under the canonical lock order, reserves the
// driver and the requester-owned vehicle, and writes the booking, single DRIVER
// decision, SCHEDULED trip, history and idempotency result atomically.

const QUOTE_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const LEAD_MS = 60 * 60 * 1000;
const HORIZON_MS = 180 * 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 60 * 60 * 1000;
const MAX_DURATION_MS = 720 * 60 * 60 * 1000;
const MAX_TOTAL_MINOR = 100_000_000;
const OPERATION = 'createBooking';

function unprocessable(message: string): HttpError {
  return new HttpError(422, 'UNPROCESSABLE_ENTITY', message);
}

function quoteStale(message: string): HttpError {
  return new HttpError(409, 'QUOTE_STALE', message);
}

function quoteExpired(message: string): HttpError {
  return new HttpError(409, 'QUOTE_EXPIRED', message);
}

function resourceConflict(message: string): HttpError {
  return new HttpError(409, 'RESOURCE_CONFLICT', message);
}

function idempotencyMismatch(message: string): HttpError {
  return new HttpError(409, 'IDEMPOTENCY_MISMATCH', message);
}

function retryableExhausted(): HttpError {
  return new HttpError(503, 'RETRYABLE_TRANSACTION', 'Transaction could not be completed');
}

interface DriverEligibilityRow {
  id: string;
  userId: string;
  hourlyRateMinor: number | null;
  version: number;
  verificationStatus: string;
  acceptingBookings: boolean;
  licenseExpiresOn: Date | null;
  licenseValid: boolean;
  userStatus: string;
  available: boolean;
  blocked: boolean;
}

interface VehicleEligibilityRow {
  id: string;
  ownerId: string;
  seats: number;
  version: number;
  verificationStatus: string;
  archivedAt: Date | null;
  verificationLinked: boolean;
  registrationClean: boolean;
  insuranceValid: boolean;
  blocked: boolean;
}

function parseInstant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw unprocessable(`${field} is not a valid instant`);
  return parsed;
}

function validateWindow(startsAt: Date, endsAt: Date, now: Date): number {
  if (endsAt <= startsAt) throw unprocessable('endsAt must be after startsAt');
  const duration = endsAt.getTime() - startsAt.getTime();
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    throw unprocessable('Booking duration must be between 1 and 720 hours');
  }
  if (startsAt.getTime() < now.getTime() + LEAD_MS) {
    throw unprocessable('startsAt must be at least 60 minutes in the future');
  }
  if (startsAt.getTime() > now.getTime() + HORIZON_MS) {
    throw unprocessable('startsAt exceeds the 180 day horizon');
  }
  return Math.ceil(duration / (60 * 60 * 1000));
}

async function loadDriverEligibility(
  db: Prisma.TransactionClient,
  driverId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<DriverEligibilityRow | null> {
  const rows = await db.$queryRaw<DriverEligibilityRow[]>(Prisma.sql`
    SELECT d.id,
           d.user_id AS "userId",
           d.hourly_rate_minor AS "hourlyRateMinor",
           d.version,
           d.verification_status AS "verificationStatus",
           d.accepting_bookings AS "acceptingBookings",
           d.license_expires_on AS "licenseExpiresOn",
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
           u.status AS "userStatus",
           EXISTS (
             SELECT 1 FROM availability_windows aw
             WHERE aw.driver_id = d.id AND aw.kind = 'AVAILABLE' AND aw.removed_at IS NULL
               AND aw.starts_at <= ${startsAt} AND aw.ends_at >= ${endsAt}
           ) AS "available",
           EXISTS (
             SELECT 1 FROM resource_reservations rr
             WHERE rr.driver_id = d.id AND rr.released_at IS NULL
               AND rr.starts_at < ${endsAt} AND rr.ends_at > ${startsAt}
           ) AS "blocked"
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id
    JOIN cities c ON c.id = d.city_id
    WHERE d.id = ${driverId}::uuid`);
  return rows[0] ?? null;
}

async function loadVehicleEligibility(
  db: Prisma.TransactionClient,
  vehicleId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<VehicleEligibilityRow | null> {
  const rows = await db.$queryRaw<VehicleEligibilityRow[]>(Prisma.sql`
    SELECT v.id,
           v.owner_id AS "ownerId",
           v.seats,
           v.version,
           v.verification_status AS "verificationStatus",
           v.archived_at AS "archivedAt",
           (v.current_verification_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM verification_requests vr
               WHERE vr.id = v.current_verification_id AND vr.status = 'APPROVED'
             )) AS "verificationLinked",
           EXISTS (
             SELECT 1 FROM verification_documents vd
             JOIN documents doc ON doc.id = vd.document_id
             WHERE vd.verification_id = v.current_verification_id
               AND doc.vehicle_id = v.id AND doc.kind = 'REGISTRATION'
               AND doc.scan_status = 'CLEAN' AND doc.retired_at IS NULL
           ) AS "registrationClean",
           EXISTS (
             SELECT 1 FROM verification_documents vd
             JOIN documents doc ON doc.id = vd.document_id
             WHERE vd.verification_id = v.current_verification_id
               AND doc.vehicle_id = v.id AND doc.kind = 'INSURANCE'
               AND doc.scan_status = 'CLEAN' AND doc.retired_at IS NULL
               AND (doc.expires_on IS NULL
                 OR doc.expires_on >= (now() AT TIME ZONE c.timezone)::date)
           ) AS "insuranceValid",
           EXISTS (
             SELECT 1 FROM resource_reservations rr
             WHERE rr.vehicle_id = v.id AND rr.released_at IS NULL
               AND rr.starts_at < ${endsAt} AND rr.ends_at > ${startsAt}
           ) AS "blocked"
    FROM vehicles v
    JOIN cities c ON c.id = v.city_id
    WHERE v.id = ${vehicleId}::uuid`);
  return rows[0] ?? null;
}

function assertDriverEligible(
  driver: DriverEligibilityRow | null,
  account: CurrentAccount,
): DriverEligibilityRow {
  if (!driver) throw notFound('Driver not found');
  if (driver.userId === account.userId) throw forbidden('You cannot hire yourself');
  if (
    driver.userStatus !== 'ACTIVE' ||
    driver.verificationStatus !== 'APPROVED' ||
    !driver.acceptingBookings ||
    !driver.licenseValid ||
    driver.hourlyRateMinor === null
  ) {
    throw resourceConflict('Driver is not currently eligible for hire');
  }
  if (!driver.available) throw resourceConflict('Driver is not available for that interval');
  if (driver.blocked) throw resourceConflict('Driver already has a commitment in that interval');
  return driver;
}

function assertVehicleEligible(
  vehicle: VehicleEligibilityRow | null,
  account: CurrentAccount,
  passengers: number,
): VehicleEligibilityRow {
  // Foreign or unknown vehicles are indistinguishable (object authorization).
  if (!vehicle || vehicle.ownerId !== account.userId) throw notFound('Vehicle not found');
  if (
    vehicle.archivedAt !== null ||
    vehicle.verificationStatus !== 'APPROVED' ||
    !vehicle.verificationLinked ||
    !vehicle.registrationClean ||
    !vehicle.insuranceValid
  ) {
    throw resourceConflict('Vehicle is not currently eligible for hire');
  }
  if (passengers > vehicle.seats - 1) {
    throw unprocessable('Passengers exceed the vehicle capacity');
  }
  if (vehicle.blocked) throw resourceConflict('Vehicle already has a commitment in that interval');
  return vehicle;
}

function quoteDto(row: {
  id: string;
  vehicleId: string;
  driverId: string;
  startsAt: Date;
  endsAt: Date;
  billableHours: number;
  driverSubtotalMinor: bigint;
  totalMinor: bigint;
  expiresAt: Date;
}): QuoteDto {
  return {
    id: row.id,
    service: 'DRIVER_HIRE',
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    billableHours: row.billableHours,
    driverSubtotalMinor: Number(row.driverSubtotalMinor),
    totalMinor: Number(row.totalMinor),
    currency: 'INR',
    expiresAt: row.expiresAt.toISOString(),
    paymentStatus: 'NOT_COLLECTED',
  };
}

export interface CreateBookingResult {
  status: number;
  body: unknown;
}

export interface BookingsService {
  quoteBooking(account: CurrentAccount, input: unknown): Promise<QuoteDto>;
  createBooking(
    account: CurrentAccount,
    input: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CreateBookingResult>;
}

function requirePassenger(account: CurrentAccount): void {
  if (!account.roles.includes('PASSENGER')) {
    throw forbidden('Passenger role is required');
  }
}

export function createBookingsService({ prisma }: { prisma: PrismaClient }): BookingsService {
  async function quoteBooking(account: CurrentAccount, input: unknown): Promise<QuoteDto> {
    requirePassenger(account);
    if (
      typeof input !== 'object' ||
      input === null ||
      (input as { service?: unknown }).service !== 'DRIVER_HIRE'
    ) {
      throw unprocessable('Only DRIVER_HIRE is supported');
    }
    const parsed = QuoteInputSchema.safeParse(input);
    if (!parsed.success) throw unprocessable('Request validation failed');
    const data = parsed.data;
    if (data.originCityId === data.destinationCityId) {
      throw unprocessable('Origin and destination must differ');
    }
    const now = new Date();
    const startsAt = parseInstant(data.startsAt, 'startsAt');
    const endsAt = parseInstant(data.endsAt, 'endsAt');
    const billableHours = validateWindow(startsAt, endsAt, now);

    const cities = await prisma.city.count({
      where: { id: { in: [data.originCityId, data.destinationCityId] } },
    });
    if (cities !== 2) throw unprocessable('Unknown origin or destination city');

    const quote = await prisma.$transaction(async (tx) => {
      // Lock the resource set in canonical order, then re-read it so a
      // concurrent material edit or commitment cannot slip between checks.
      const driverUser = await tx.driverProfile.findUnique({
        where: { id: data.driverId },
        select: { userId: true },
      });
      const vehicleOwner = await tx.vehicle.findUnique({
        where: { id: data.vehicleId },
        select: { ownerId: true },
      });
      return withResourceLocks(
        tx,
        {
          userIds: [account.userId, driverUser?.userId, vehicleOwner?.ownerId].filter(
            (value): value is string => Boolean(value),
          ),
          driverIds: [data.driverId],
          vehicleIds: [data.vehicleId],
        },
        async () => {
          await currentRoles(tx, account, 'PASSENGER');
          const driver = assertDriverEligible(
            await loadDriverEligibility(tx, data.driverId, startsAt, endsAt),
            account,
          );
          const vehicle = assertVehicleEligible(
            await loadVehicleEligibility(tx, data.vehicleId, startsAt, endsAt),
            account,
            data.passengers,
          );
          const driverSubtotalMinor = billableHours * (driver.hourlyRateMinor as number);
          if (driverSubtotalMinor > MAX_TOTAL_MINOR) {
            throw unprocessable('Quote total exceeds the allowed maximum');
          }
          return tx.bookingQuote.create({
            data: {
              requesterId: account.userId,
              service: 'DRIVER_HIRE',
              vehicleId: vehicle.id,
              driverId: driver.id,
              vehicleVersion: vehicle.version,
              driverVersion: driver.version,
              startsAt,
              endsAt,
              originCityId: data.originCityId,
              destinationCityId: data.destinationCityId,
              passengers: data.passengers,
              billableHours,
              driverRateMinor: driver.hourlyRateMinor as number,
              driverSubtotalMinor: BigInt(driverSubtotalMinor),
              totalMinor: BigInt(driverSubtotalMinor),
              currency: 'INR',
              expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
            },
          });
        },
      );
    });
    return quoteDto(quote);
  }

  function canonicalHash(quoteId: string): string {
    return createHash('sha256').update(JSON.stringify({ quoteId })).digest('hex');
  }

  async function replay(
    row: { requestHash: string; responseStatus: number; responseBody: unknown } | null,
    hash: string,
  ): Promise<CreateBookingResult | null> {
    if (!row) return null;
    if (row.requestHash !== hash) {
      throw idempotencyMismatch('Idempotency key was already used with a different request');
    }
    return { status: row.responseStatus, body: row.responseBody };
  }

  async function createBooking(
    account: CurrentAccount,
    input: unknown,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CreateBookingResult> {
    requirePassenger(account);
    const parsed = BookingInputSchema.safeParse(input);
    if (!parsed.success) throw unprocessable('Request validation failed');
    if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      throw unprocessable('Idempotency-Key must be between 16 and 128 characters');
    }
    const quoteId = parsed.data.quoteId;
    const hash = canonicalHash(quoteId);

    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        userId_operation_key: { userId: account.userId, operation: OPERATION, key: idempotencyKey },
      },
    });
    if (existing && existing.expiresAt > new Date()) {
      const result = await replay(existing, hash);
      if (result) return result;
    }

    const attempt = async (): Promise<CreateBookingResult> => {
      try {
        return await prisma.$transaction(async (tx) => {
          const now = new Date();
          // Serialize the idempotency key in the same transaction: the unique
          // row is reserved before resource locks, so a concurrent duplicate
          // waits and then replays the committed result.
          await tx.idempotencyKey.deleteMany({
            where: {
              userId: account.userId,
              operation: OPERATION,
              key: idempotencyKey,
              expiresAt: { lte: now },
            },
          });
          const reservation = await tx.idempotencyKey.create({
            data: {
              userId: account.userId,
              operation: OPERATION,
              key: idempotencyKey,
              requestHash: hash,
              responseStatus: 201,
              responseBody: {},
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            },
            select: { id: true },
          });

          const quote = await tx.bookingQuote.findUnique({ where: { id: quoteId } });
          if (!quote || quote.requesterId !== account.userId) throw notFound('Quote not found');

          const driverUser = await tx.driverProfile.findUnique({
            where: { id: quote.driverId },
            select: { userId: true },
          });
          const vehicleOwner = await tx.vehicle.findUnique({
            where: { id: quote.vehicleId },
            select: { ownerId: true },
          });

          return withResourceLocks(
            tx,
            {
              userIds: [account.userId, driverUser?.userId, vehicleOwner?.ownerId].filter(
                (value): value is string => Boolean(value),
              ),
              driverIds: [quote.driverId],
              vehicleIds: [quote.vehicleId],
            },
            async () => {
              await currentRoles(tx, account, 'PASSENGER');
              // Re-read the quote and resources after acquiring the locks.
              const lockedNow = new Date();
              const lockedQuote = await tx.bookingQuote.findUnique({ where: { id: quote.id } });
              if (!lockedQuote || lockedQuote.requesterId !== account.userId) {
                throw notFound('Quote not found');
              }
              if (lockedQuote.expiresAt <= lockedNow) {
                throw quoteExpired('Quote has expired; request a new quote');
              }
              if (lockedQuote.startsAt.getTime() < lockedNow.getTime() + LEAD_MS) {
                throw resourceConflict('Booking no longer meets the minimum lead time');
              }
              const driverRow = await loadDriverEligibility(
                tx,
                lockedQuote.driverId,
                lockedQuote.startsAt,
                lockedQuote.endsAt,
              );
              const vehicleRow = await loadVehicleEligibility(
                tx,
                lockedQuote.vehicleId,
                lockedQuote.startsAt,
                lockedQuote.endsAt,
              );
              // Stale snapshots win over eligibility drift: the requester must
              // re-quote rather than silently pay a changed price/version.
              if (
                !driverRow ||
                !vehicleRow ||
                vehicleRow.ownerId !== account.userId ||
                driverRow.userId === account.userId
              ) {
                if (!vehicleRow || vehicleRow.ownerId !== account.userId) {
                  throw notFound('Vehicle not found');
                }
                if (!driverRow) throw notFound('Driver not found');
                throw forbidden('You cannot hire yourself');
              }
              if (
                driverRow.version !== lockedQuote.driverVersion ||
                vehicleRow.version !== lockedQuote.vehicleVersion ||
                driverRow.hourlyRateMinor !== lockedQuote.driverRateMinor
              ) {
                throw quoteStale('Resources changed since the quote; request a new quote');
              }
              const currentDriver = assertDriverEligible(driverRow, account);
              const currentVehicle = assertVehicleEligible(
                vehicleRow,
                account,
                lockedQuote.passengers,
              );

              const bookingExpiry = new Date(
                Math.min(
                  lockedNow.getTime() + 30 * 60 * 1000,
                  lockedQuote.startsAt.getTime() - 15 * 60 * 1000,
                ),
              );
              const booking = await tx.booking.create({
                data: {
                  quoteId: lockedQuote.id,
                  passengerId: account.userId,
                  vehicleId: currentVehicle.id,
                  driverId: currentDriver.id,
                  service: 'DRIVER_HIRE',
                  status: 'PENDING',
                  startsAt: lockedQuote.startsAt,
                  endsAt: lockedQuote.endsAt,
                  totalMinor: lockedQuote.totalMinor,
                  currency: 'INR',
                  expiresAt: bookingExpiry,
                },
              });
              const decision = await tx.bookingDecision.create({
                data: {
                  bookingId: booking.id,
                  providerId: currentDriver.userId,
                  kind: 'DRIVER',
                  status: 'PENDING',
                },
              });
              const trip = await tx.trip.create({
                data: {
                  bookingId: booking.id,
                  driverId: currentDriver.id,
                  vehicleId: currentVehicle.id,
                  status: 'SCHEDULED',
                  startsAt: lockedQuote.startsAt,
                  endsAt: lockedQuote.endsAt,
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
              // Both holds are inserted inside the lock; the GiST exclusions
              // remain the authoritative no-overlap guard.
              await tx.resourceReservation.createMany({
                data: [
                  {
                    driverId: currentDriver.id,
                    bookingId: booking.id,
                    startsAt: lockedQuote.startsAt,
                    endsAt: lockedQuote.endsAt,
                  },
                  {
                    vehicleId: currentVehicle.id,
                    bookingId: booking.id,
                    startsAt: lockedQuote.startsAt,
                    endsAt: lockedQuote.endsAt,
                  },
                ],
              });

              const dto: BookingDto = {
                id: booking.id,
                passengerId: booking.passengerId,
                service: 'DRIVER_HIRE',
                vehicleId: booking.vehicleId,
                driverId: booking.driverId,
                tripId: trip.id,
                status: 'PENDING',
                startsAt: booking.startsAt.toISOString(),
                endsAt: booking.endsAt.toISOString(),
                totalMinor: Number(booking.totalMinor),
                currency: 'INR',
                expiresAt: booking.expiresAt.toISOString(),
                version: booking.version,
                paymentStatus: 'NOT_COLLECTED',
                decisions: [
                  {
                    providerId: decision.providerId,
                    kind: 'DRIVER',
                    status: 'PENDING',
                    decidedAt: null,
                  },
                ],
              };
              const body = { success: true as const, data: dto };
              await tx.idempotencyKey.update({
                where: { id: reservation.id },
                data: { responseStatus: 201, responseBody: body },
              });
              return { status: 201, body };
            },
          );
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const winner = await prisma.idempotencyKey.findUnique({
            where: {
              userId_operation_key: {
                userId: account.userId,
                operation: OPERATION,
                key: idempotencyKey,
              },
            },
          });
          const result =
            winner && winner.expiresAt > new Date() ? await replay(winner, hash) : null;
          if (result) return result;
          throw resourceConflict('Quote already has a booking or the key was reused');
        }
        if (isExclusionViolation(error)) {
          throw resourceConflict('Driver or vehicle is no longer free for that interval');
        }
        throw error;
      }
    };

    return withBoundedRetry(attempt, retryableExhausted);
  }

  return { quoteBooking, createBooking };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown }).code === 'P2002' || sqlStateOf(error) === '23505';
}
