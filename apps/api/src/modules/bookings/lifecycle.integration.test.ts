import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { BookingSchema, TripSchema } from '@drivehire/contracts';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import { expireBookings } from './jobs.js';
import { createAdminService } from '../admin/service.js';
import { createBookingsService } from './service.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const JWT_SECRET = randomBytes(32).toString('base64url');
const OUTBOX_KEY = randomBytes(32).toString('base64url');
const APP_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'CorrectHorse1!';
const HOUR = 3600 * 1000;

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
afterAll(async () => {
  await prisma.$disconnect();
});

const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  APP_ORIGIN,
  CORS_ORIGINS: APP_ORIGIN,
  AUTH_JWT_SECRET: JWT_SECRET,
  AUTH_OUTBOX_KEY: OUTBOX_KEY,
});

function buildApp() {
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
  });
}

function auth(app: ReturnType<typeof createApp>, token: string) {
  const base = request(app);
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', bearer),
    post: (path: string) => base.post(path).set('Authorization', bearer),
  };
}

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * HOUR).toISOString().slice(0, 10);
}

async function seedAccount(
  fixture: DatabaseFixture,
  email: string,
  roles: string[] = ['PASSENGER'],
): Promise<string> {
  const passwordHash = await argon2Hash(PASSWORD);
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Lifecycle Test User', $2, now()) RETURNING id`,
    [email, passwordHash],
  );
  const userId = user.rows[0]?.id as string;
  for (const role of roles) {
    await fixture.runtimePool.query('INSERT INTO user_roles(user_id, role) VALUES ($1, $2)', [
      userId,
      role,
    ]);
  }
  return userId;
}

async function seedCity(fixture: DatabaseFixture, name: string): Promise<string> {
  const city = await fixture.migrationPool.query<{ id: string }>(
    `INSERT INTO cities(name, region, country, timezone)
     VALUES ($1, 'MH', 'IN', 'Asia/Kolkata') RETURNING id`,
    [name],
  );
  return city.rows[0]?.id as string;
}

async function seedApprovedDriver(
  fixture: DatabaseFixture,
  input: { userId: string; cityId: string; licenseNumber: string },
): Promise<string> {
  const licenseExpiresOn = isoDate(365);
  const driver = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
       license_country, license_expires_on, city_id, hourly_rate_minor)
     VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000) RETURNING id`,
    [input.userId, digest(`license:${input.licenseNumber}`), licenseExpiresOn, input.cityId],
  );
  const driverId = driver.rows[0]?.id as string;
  const verification = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO verification_requests(driver_id, revision, subject_version, status, submitted_by, submitted_at, decided_at)
     VALUES ($1, 1, 1, 'APPROVED', $2, now(), now()) RETURNING id`,
    [driverId, input.userId],
  );
  const verificationId = verification.rows[0]?.id as string;
  const document = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO documents(uploader_id, driver_id, kind, object_key, content_type, byte_size,
       sha256, scan_status, expires_on)
     VALUES ($1, $2, 'LICENSE', $3, 'application/pdf', 10, $4, 'CLEAN', $5) RETURNING id`,
    [
      input.userId,
      driverId,
      randomUUID(),
      digest(`license-doc:${input.licenseNumber}`),
      licenseExpiresOn,
    ],
  );
  await fixture.runtimePool.query(
    'INSERT INTO verification_documents(verification_id, document_id) VALUES ($1, $2)',
    [verificationId, document.rows[0]?.id],
  );
  await fixture.runtimePool.query(
    `UPDATE driver_profiles
     SET verification_status='APPROVED', current_verification_id=$2, accepting_bookings=true, version=2
     WHERE id=$1`,
    [driverId, verificationId],
  );
  await fixture.runtimePool.query(
    `INSERT INTO availability_windows(driver_id, kind, starts_at, ends_at)
     VALUES ($1, 'AVAILABLE', now(), $2)`,
    [driverId, new Date(Date.now() + 7 * 24 * HOUR)],
  );
  return driverId;
}

async function seedApprovedVehicle(
  fixture: DatabaseFixture,
  input: { ownerId: string; cityId: string; registration: string },
): Promise<string> {
  const vehicle = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2021, 'HATCHBACK', 5, 'MANUAL', 'PETROL', $3)
     RETURNING id`,
    [input.ownerId, digest(`vehicle:${input.registration}`), input.cityId],
  );
  const vehicleId = vehicle.rows[0]?.id as string;
  const verification = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO verification_requests(vehicle_id, revision, subject_version, status, submitted_by, submitted_at, decided_at)
     VALUES ($1, 1, 1, 'APPROVED', $2, now(), now()) RETURNING id`,
    [vehicleId, input.ownerId],
  );
  const verificationId = verification.rows[0]?.id as string;
  for (const kind of ['REGISTRATION', 'INSURANCE'] as const) {
    const document = await fixture.runtimePool.query<{ id: string }>(
      `INSERT INTO documents(uploader_id, vehicle_id, kind, object_key, content_type, byte_size,
         sha256, scan_status, expires_on)
       VALUES ($1, $2, $3, $4, 'application/pdf', 10, $5, 'CLEAN', $6) RETURNING id`,
      [
        input.ownerId,
        vehicleId,
        kind,
        randomUUID(),
        digest(`vehicle-doc:${input.registration}:${kind}`),
        kind === 'INSURANCE' ? isoDate(365) : null,
      ],
    );
    await fixture.runtimePool.query(
      'INSERT INTO verification_documents(verification_id, document_id) VALUES ($1, $2)',
      [verificationId, document.rows[0]?.id],
    );
  }
  await fixture.runtimePool.query(
    `UPDATE vehicles
     SET verification_status='APPROVED', current_verification_id=$2, version=2
     WHERE id=$1`,
    [vehicleId, verificationId],
  );
  return vehicleId;
}

function nextBookingStart(offsetHours = 0): Date {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  return new Date(date.getTime() + (3 + offsetHours) * HOUR);
}

interface BookingFixture {
  passengerEmail: string;
  passengerId: string;
  driverEmail: string;
  driverUserId: string;
  driverId: string;
  vehicleId: string;
  originId: string;
  destinationId: string;
}

async function seedBookingFixture(fixture: DatabaseFixture): Promise<BookingFixture> {
  const originId = await seedCity(fixture, 'Pune');
  const destinationId = await seedCity(fixture, 'Mumbai');
  const passengerId = await seedAccount(fixture, 'lifecycle-pax@example.com');
  const driverUserId = await seedAccount(fixture, 'lifecycle-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  const driverId = await seedApprovedDriver(fixture, {
    userId: driverUserId,
    cityId: originId,
    licenseNumber: 'MH12-2020-0201',
  });
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: passengerId,
    cityId: originId,
    registration: 'MH12-EF-9012',
  });
  return {
    passengerEmail: 'lifecycle-pax@example.com',
    passengerId,
    driverEmail: 'lifecycle-driver@example.com',
    driverUserId,
    driverId,
    vehicleId,
    originId,
    destinationId,
  };
}

async function createQuote(
  app: ReturnType<typeof createApp>,
  token: string,
  s: BookingFixture,
  startsAt: Date,
): Promise<string> {
  const response = await auth(app, token)
    .post('/api/v1/booking-quotes')
    .send({
      service: 'DRIVER_HIRE',
      vehicleId: s.vehicleId,
      driverId: s.driverId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * HOUR).toISOString(),
      originCityId: s.originId,
      destinationCityId: s.destinationId,
      passengers: 1,
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

interface PendingBooking {
  id: string;
  version: number;
  tripId: string;
  driverId: string;
}

async function createPendingBooking(
  app: ReturnType<typeof createApp>,
  token: string,
  s: BookingFixture,
  label: string,
  startsAt = nextBookingStart(),
): Promise<PendingBooking> {
  const quoteId = await createQuote(app, token, s, startsAt);
  const response = await auth(app, token)
    .post('/api/v1/bookings')
    .set('Idempotency-Key', `${label}-${randomUUID()}`)
    .send({ quoteId });
  expect(response.status).toBe(201);
  expect(BookingSchema.safeParse(response.body.data).success).toBe(true);
  return response.body.data as PendingBooking;
}

function decide(
  app: ReturnType<typeof createApp>,
  token: string,
  bookingId: string,
  body: Record<string, unknown>,
) {
  return auth(app, token).post(`/api/v1/bookings/${bookingId}/decisions`).send(body);
}

function cancel(
  app: ReturnType<typeof createApp>,
  token: string,
  bookingId: string,
  body: Record<string, unknown>,
) {
  return auth(app, token).post(`/api/v1/bookings/${bookingId}/cancel`).send(body);
}

function transition(
  app: ReturnType<typeof createApp>,
  token: string,
  tripId: string,
  body: Record<string, unknown>,
) {
  return auth(app, token).post(`/api/v1/trips/${tripId}/transitions`).send(body);
}

async function acceptBooking(
  app: ReturnType<typeof createApp>,
  token: string,
  booking: PendingBooking,
): Promise<void> {
  const response = await decide(app, token, booking.id, {
    decision: 'ACCEPT',
    version: booking.version,
  });
  expect(response.status).toBe(200);
  expect(TripSchema.safeParse(response.body.data).success).toBe(false);
  expect(response.body.data.status).toBe('CONFIRMED');
}

async function persistedBooking(
  fixture: DatabaseFixture,
  bookingId: string,
): Promise<{ status: string; version: number; cancel_reason: string | null }> {
  const rows = await fixture.runtimePool.query<{
    status: string;
    version: number;
    cancel_reason: string | null;
  }>('SELECT status, version, cancel_reason FROM bookings WHERE id=$1', [bookingId]);
  return rows.rows[0] as { status: string; version: number; cancel_reason: string | null };
}

async function tripRow(
  fixture: DatabaseFixture,
  bookingId: string,
): Promise<{ id: string; status: string; version: number; incident_flag: boolean }> {
  const rows = await fixture.runtimePool.query<{
    id: string;
    status: string;
    version: number;
    incident_flag: boolean;
  }>('SELECT id, status, version, incident_flag FROM trips WHERE booking_id=$1', [bookingId]);
  return rows.rows[0] as { id: string; status: string; version: number; incident_flag: boolean };
}

async function heldRows(fixture: DatabaseFixture, bookingId: string): Promise<number> {
  const rows = await fixture.runtimePool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM resource_reservations
     WHERE booking_id=$1 AND released_at IS NULL`,
    [bookingId],
  );
  return Number(rows.rows[0]?.n ?? '0');
}

async function historyRows(
  fixture: DatabaseFixture,
  tripId: string,
): Promise<{ from_status: string | null; to_status: string; trip_version: number }[]> {
  const rows = await fixture.runtimePool.query<{
    from_status: string | null;
    to_status: string;
    trip_version: number;
  }>(
    'SELECT from_status, to_status, trip_version FROM trip_status_history WHERE trip_id=$1 ORDER BY trip_version',
    [tripId],
  );
  return rows.rows;
}

async function auditCount(
  fixture: DatabaseFixture,
  subjectId: string,
  action: string,
): Promise<number> {
  const rows = await fixture.runtimePool.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM audit_logs WHERE subject_id=$1 AND action=$2',
    [subjectId, action],
  );
  return Number(rows.rows[0]?.n ?? '0');
}

async function releasedAtText(fixture: DatabaseFixture, bookingId: string): Promise<string | null> {
  const rows = await fixture.runtimePool.query<{ released: string | null }>(
    `SELECT min(released_at)::text AS released FROM resource_reservations WHERE booking_id=$1`,
    [bookingId],
  );
  return rows.rows[0]?.released ?? null;
}

describe('Milestone05 Task2: lifecycle, expiry and reconciliation', { timeout: 60000 }, () => {
  it('accept_vs_expiry_has_one_legal_terminal_state', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);

      const expiring = await createPendingBooking(app, passenger, s, 'accept-expire');
      await fixture.migrationPool.query(
        "UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id=$1",
        [expiring.id],
      );

      const [acceptResponse, expiredCount] = await Promise.all([
        decide(app, driver, expiring.id, {
          decision: 'ACCEPT',
          version: expiring.version,
        }),
        expireBookings(new Date(), prisma),
      ]);

      expect(acceptResponse.status).toBe(409);
      expect(['BOOKING_EXPIRED', 'BOOKING_NOT_PENDING']).toContain(acceptResponse.body.error.code);
      expect(expiredCount).toBe(1);
      expect(await persistedBooking(fixture, expiring.id)).toMatchObject({
        status: 'EXPIRED',
        version: 2,
      });
      expect((await tripRow(fixture, expiring.id)).status).toBe('EXPIRED');
      expect(await heldRows(fixture, expiring.id)).toBe(0);

      const confirmed = await createPendingBooking(
        app,
        passenger,
        s,
        'accepted-first',
        nextBookingStart(4),
      );
      await acceptBooking(app, driver, confirmed);
      await fixture.migrationPool.query(
        "UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id=$1",
        [confirmed.id],
      );
      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect(await persistedBooking(fixture, confirmed.id)).toMatchObject({
        status: 'CONFIRMED',
        version: 2,
      });
      expect((await tripRow(fixture, confirmed.id)).status).toBe('ASSIGNED');
      expect(await heldRows(fixture, confirmed.id)).toBe(2);
    });
  });

  it('cancel_vs_accept_has_one_legal_outcome_and_releases_once', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'cancel-accept');

      const [acceptResponse, cancelResponse] = await Promise.all([
        decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        }),
        cancel(app, passenger, booking.id, {
          version: booking.version,
          reason: 'Plans changed before the driver accepted.',
        }),
      ]);

      expect([acceptResponse.status, cancelResponse.status].sort()).toEqual([200, 409]);
      const accepted = acceptResponse.status === 200;
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: accepted ? 'CONFIRMED' : 'CANCELLED',
        version: 2,
      });
      expect((await tripRow(fixture, booking.id)).status).toBe(accepted ? 'ASSIGNED' : 'CANCELLED');
      expect(await heldRows(fixture, booking.id)).toBe(accepted ? 2 : 0);
      expect(
        (await auditCount(fixture, booking.id, 'BOOKING_DRIVER_ACCEPT')) +
          (await auditCount(fixture, booking.id, 'BOOKING_CANCEL')),
      ).toBe(1);
    });
  });

  it('suspended_user_vs_create_is_consistent', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await createQuote(app, passenger, s, nextBookingStart());

      await fixture.migrationPool.query(
        "UPDATE users SET status='SUSPENDED', suspended_at=now() WHERE id=$1",
        [s.passengerId],
      );

      const response = await auth(app, passenger)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', `suspended-${randomUUID()}`)
        .send({ quoteId });
      expect(response.status).toBe(401);
      const bookings = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings WHERE quote_id=$1',
        [quoteId],
      );
      expect(bookings.rows[0]?.n).toBe('0');
    });
  });

  it('suspension_reconciliation_cancels_unstarted_and_keeps_audit_once', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'suspend-cancel');
      await acceptBooking(app, driver, booking);

      await fixture.migrationPool.query(
        "UPDATE users SET status='SUSPENDED', suspended_at=now() WHERE id=$1",
        [s.passengerId],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(1);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'CANCELLED',
        cancel_reason: 'Passenger account is not active',
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('CANCELLED');
      expect(await heldRows(fixture, booking.id)).toBe(0);
      expect(await auditCount(fixture, booking.id, 'BOOKING_CANCELLED')).toBe(1);

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect(await auditCount(fixture, booking.id, 'BOOKING_CANCELLED')).toBe(1);
    });
  });

  it('qualification_expiry_reconciliation_cancels_unstarted_commitment', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'qualification');
      await acceptBooking(app, driver, booking);

      await fixture.migrationPool.query(
        "UPDATE driver_profiles SET verification_status='EXPIRED' WHERE id=$1",
        [s.driverId],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(1);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'CANCELLED',
        cancel_reason: 'Driver qualification is no longer approved',
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('CANCELLED');
      expect(await heldRows(fixture, booking.id)).toBe(0);
    });
  });

  it('active_incident_is_flagged_once_without_releasing_physical_use', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'active-incident');
      await acceptBooking(app, driver, booking);

      await fixture.migrationPool.query(
        "UPDATE trips SET status='STARTED', started_at=now() WHERE booking_id=$1",
        [booking.id],
      );
      await fixture.migrationPool.query(
        "UPDATE users SET status='SUSPENDED', suspended_at=now() WHERE id=$1",
        [s.driverUserId],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      const trip = await tripRow(fixture, booking.id);
      expect(trip).toMatchObject({ status: 'STARTED', incident_flag: true });
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'CONFIRMED',
      });
      expect(await heldRows(fixture, booking.id)).toBe(2);
      expect(await auditCount(fixture, trip.id, 'TRIP_INCIDENT_FLAGGED')).toBe(1);

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect((await tripRow(fixture, booking.id)).incident_flag).toBe(true);
      expect(await auditCount(fixture, trip.id, 'TRIP_INCIDENT_FLAGGED')).toBe(1);
    });
  });

  it('active_overrun_blocks_adjacent_next_start', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const start = nextBookingStart();
      const first = await createPendingBooking(app, passenger, s, 'overrun-first', start);
      await acceptBooking(app, driver, first);
      const second = await createPendingBooking(
        app,
        passenger,
        s,
        'overrun-second',
        new Date(start.getTime() + 2 * HOUR),
      );
      await acceptBooking(app, driver, second);

      await fixture.migrationPool.query(
        `UPDATE trips SET status='STARTED', started_at=now() - interval '90 minutes',
             starts_at=now() - interval '90 minutes', ends_at=now() - interval '30 minutes'
           WHERE booking_id=$1`,
        [first.id],
      );
      await fixture.migrationPool.query(
        `UPDATE bookings SET starts_at=now() - interval '90 minutes',
             ends_at=now() - interval '30 minutes' WHERE id=$1`,
        [first.id],
      );
      await fixture.migrationPool.query(
        `UPDATE trips SET starts_at=now() - interval '5 minutes',
             ends_at=now() + interval '55 minutes' WHERE booking_id=$1`,
        [second.id],
      );
      await fixture.migrationPool.query(
        `UPDATE bookings SET starts_at=now() - interval '5 minutes',
             ends_at=now() + interval '55 minutes' WHERE id=$1`,
        [second.id],
      );

      const secondTrip = await tripRow(fixture, second.id);
      const response = await transition(app, driver, secondTrip.id, {
        toStatus: 'STARTED',
        version: secondTrip.version,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RESOURCE_CONFLICT');
      expect((await tripRow(fixture, first.id)).status).toBe('STARTED');
      expect((await tripRow(fixture, second.id)).status).toBe('ASSIGNED');
      expect(await heldRows(fixture, second.id)).toBe(2);
    });
  });

  it('started_trip_never_auto_expires', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'started');
      await acceptBooking(app, driver, booking);

      await fixture.migrationPool.query(
        `UPDATE trips SET status='STARTED', started_at=now() - interval '2 hours',
             starts_at=now() - interval '2 hours', ends_at=now() - interval '1 hour'
           WHERE booking_id=$1`,
        [booking.id],
      );
      await fixture.migrationPool.query(
        `UPDATE bookings SET starts_at=now() - interval '2 hours',
             ends_at=now() - interval '1 hour', expires_at=now() - interval '1 hour'
           WHERE id=$1`,
        [booking.id],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'CONFIRMED',
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('STARTED');
      expect(await heldRows(fixture, booking.id)).toBe(2);

      await fixture.migrationPool.query(
        "UPDATE trips SET status='IN_TRANSIT' WHERE booking_id=$1",
        [booking.id],
      );
      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect((await tripRow(fixture, booking.id)).status).toBe('IN_TRANSIT');
      expect(await heldRows(fixture, booking.id)).toBe(2);
      expect(await auditCount(fixture, booking.id, 'BOOKING_EXPIRED')).toBe(0);
    });
  });

  it('child_failure_rolls_back_expiry_writes', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const booking = await createPendingBooking(app, passenger, s, 'child-failure');
      await fixture.migrationPool.query(
        "UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id=$1",
        [booking.id],
      );
      const trip = await tripRow(fixture, booking.id);
      await fixture.runtimePool.query(
        `INSERT INTO trip_status_history
             (trip_id, from_status, to_status, actor_type, trip_version, request_id)
           VALUES ($1, 'SCHEDULED', 'ASSIGNED', 'WORKER', $2, 'conflict-test')`,
        [trip.id, trip.version + 1],
      );

      await expect(expireBookings(new Date(), prisma)).rejects.toThrow();
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'PENDING',
        version: 1,
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('SCHEDULED');
      expect(await heldRows(fixture, booking.id)).toBe(2);
      expect(await auditCount(fixture, booking.id, 'BOOKING_EXPIRED')).toBe(0);
    });
  });

  it('repeated_expiry_does_not_duplicate_history_release_or_audit', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const booking = await createPendingBooking(app, passenger, s, 'repeated');
      await fixture.migrationPool.query(
        "UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id=$1",
        [booking.id],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(1);
      const trip = await tripRow(fixture, booking.id);
      const history = await historyRows(fixture, trip.id);
      const released = await releasedAtText(fixture, booking.id);
      expect(history.at(-1)).toMatchObject({ to_status: 'EXPIRED', trip_version: 2 });
      expect(await auditCount(fixture, booking.id, 'BOOKING_EXPIRED')).toBe(1);

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect(await historyRows(fixture, trip.id)).toEqual(history);
      expect(await releasedAtText(fixture, booking.id)).toBe(released);
      expect(await auditCount(fixture, booking.id, 'BOOKING_EXPIRED')).toBe(1);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'EXPIRED',
        version: 2,
      });
    });
  });

  it('pending_booking_is_not_expired_before_its_deadline', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const booking = await createPendingBooking(app, passenger, s, 'no-leeway');
      await fixture.migrationPool.query(
        "UPDATE bookings SET expires_at = now() + interval '45 seconds' WHERE id=$1",
        [booking.id],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(0);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'PENDING',
        version: 1,
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('SCHEDULED');
      expect(await heldRows(fixture, booking.id)).toBe(2);
    });
  });

  it('assigned_but_unstarted_booking_expires_at_start_grace', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'assigned-grace');
      await acceptBooking(app, driver, booking);

      await fixture.migrationPool.query(
        `UPDATE bookings SET starts_at=now() - interval '31 minutes',
             ends_at=now() + interval '89 minutes' WHERE id=$1`,
        [booking.id],
      );
      await fixture.migrationPool.query(
        `UPDATE trips SET starts_at=now() - interval '31 minutes',
             ends_at=now() + interval '89 minutes' WHERE booking_id=$1`,
        [booking.id],
      );

      expect(await expireBookings(new Date(), prisma)).toBe(1);
      expect(await persistedBooking(fixture, booking.id)).toMatchObject({
        status: 'EXPIRED',
        cancel_reason: 'Unstarted booking expired',
      });
      expect((await tripRow(fixture, booking.id)).status).toBe('EXPIRED');
      expect(await heldRows(fixture, booking.id)).toBe(0);
      const history = await historyRows(fixture, booking.tripId);
      expect(history.at(-1)).toMatchObject({ to_status: 'EXPIRED' });
    });
  });
  it('review_rejection_requires_reason_atomically', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'review-reject');
      const result = await decide(app, driver, booking.id, {
        decision: 'REJECT',
        version: booking.version,
      });
      expect(result.status).toBe(422);
      expect((await persistedBooking(fixture, booking.id)).status).toBe('PENDING');
      expect(await heldRows(fixture, booking.id)).toBe(2);
    });
  });
  it.each([false, true])(
    'review_suspension_resolves_commitment_immediately_active_%s',
    async (active) => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(app, passenger, s, 'review-suspend');
        if (active) {
          await acceptBooking(app, driver, booking);
          await fixture.migrationPool.query(
            "UPDATE trips SET status='STARTED', started_at=now() WHERE booking_id=$1",
            [booking.id],
          );
        }
        const adminId = await seedAccount(fixture, 'review-admin@example.com', ['ADMIN']);
        await createAdminService({ prisma }).suspendUser(
          { userId: adminId, roles: ['ADMIN'], sessionId: randomUUID() },
          s.driverUserId,
          { reason: 'Safety review requires suspension' },
          { requestId: 'review-suspension' },
        );
        expect((await persistedBooking(fixture, booking.id)).status).toBe(
          active ? 'CONFIRMED' : 'CANCELLED',
        );
        expect(await heldRows(fixture, booking.id)).toBe(active ? 2 : 0);
        expect(await tripRow(fixture, booking.id)).toMatchObject(
          active ? { status: 'STARTED', incident_flag: true } : { status: 'CANCELLED' },
        );
      });
    },
  );
  it('review_authenticated_create_cannot_commit_after_suspension_wins_lock', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await createQuote(app, passenger, s, nextBookingStart());
      const locker = await fixture.migrationPool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await locker.query('BEGIN');
        await locker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [s.passengerId]);
        const pid = (await locker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
          .pid;
        pending = createBookingsService({ prisma })
          .createBooking(
            { userId: s.passengerId, roles: ['PASSENGER'], sessionId: randomUUID() },
            { quoteId },
            randomUUID(),
            'review-race',
          )
          .then(
            () => ({ status: 201 }),
            (error: unknown) => error,
          );
        let blocked = false;
        for (let n = 0; n < 80 && !blocked; n++) {
          blocked = (
            await fixture.migrationPool.query<{ blocked: boolean }>(
              'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',
              [pid],
            )
          ).rows[0]!.blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await locker.query(
          "UPDATE users SET status='SUSPENDED', token_version=token_version+1 WHERE id=$1",
          [s.passengerId],
        );
        await locker.query('COMMIT');
        expect(await pending).toMatchObject({ status: 403 });
        expect(
          (await fixture.runtimePool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,
        ).toBe(0);
      } finally {
        await locker.query('ROLLBACK');
        locker.release();
        await pending;
      }
    });
  });
  it('review_eligible_active_overrun_flags_once_and_preserves_holds', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const booking = await createPendingBooking(app, passenger, s, 'review-overdue');
      await acceptBooking(app, driver, booking);
      await fixture.migrationPool.query(
        "UPDATE trips SET status='STARTED', starts_at=now()-interval '2 hours', ends_at=now()-interval '1 minute', started_at=now()-interval '2 hours' WHERE booking_id=$1",
        [booking.id],
      );
      await fixture.migrationPool.query(
        "UPDATE resource_reservations SET starts_at=now()-interval '2 hours', ends_at=now()-interval '1 minute' WHERE booking_id=$1",
        [booking.id],
      );
      await expireBookings(new Date(), prisma);
      const extension = await fixture.runtimePool.query<{ extended: boolean }>(
        "SELECT bool_and(ends_at > now()+interval '10 minutes') AS extended FROM resource_reservations WHERE booking_id=$1",
        [booking.id],
      );
      expect(extension.rows[0]!.extended).toBe(true);
      const trip = await tripRow(fixture, booking.id);
      expect(trip).toMatchObject({ status: 'STARTED', incident_flag: true });
      expect(await heldRows(fixture, booking.id)).toBe(2);
      expect(await auditCount(fixture, trip.id, 'TRIP_INCIDENT_FLAGGED')).toBe(1);
      await expireBookings(new Date(), prisma);
      expect(await auditCount(fixture, trip.id, 'TRIP_INCIDENT_FLAGGED')).toBe(1);
    });
  });
});
