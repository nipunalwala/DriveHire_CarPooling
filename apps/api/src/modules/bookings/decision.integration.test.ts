import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { BookingSchema } from '@drivehire/contracts';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';

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
     VALUES ($1, 'Decision Test User', $2, now()) RETURNING id`,
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

function nextBookingStart(): Date {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  return new Date(date.getTime() + 3 * HOUR);
}

interface PendingBooking {
  id: string;
  version: number;
  driverId: string;
}

interface BookingFixture {
  passengerEmail: string;
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
  const passengerId = await seedAccount(fixture, 'decision-pax@example.com');
  const driverUserId = await seedAccount(fixture, 'decision-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  const driverId = await seedApprovedDriver(fixture, {
    userId: driverUserId,
    cityId: originId,
    licenseNumber: 'MH12-2020-0101',
  });
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: passengerId,
    cityId: originId,
    registration: 'MH12-CD-5678',
  });
  return {
    passengerEmail: 'decision-pax@example.com',
    driverEmail: 'decision-driver@example.com',
    driverUserId,
    driverId,
    vehicleId,
    originId,
    destinationId,
  };
}

async function createPendingBooking(
  fixture: DatabaseFixture,
  app: ReturnType<typeof createApp>,
  token: string,
  s: BookingFixture,
  label: string,
): Promise<PendingBooking> {
  const startsAt = nextBookingStart();
  const quote = await auth(app, token)
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
  expect(quote.status).toBe(201);
  const response = await auth(app, token)
    .post('/api/v1/bookings')
    .set('Idempotency-Key', `${label}-${randomUUID()}`)
    .send({ quoteId: quote.body.data.id });
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

async function persistedBooking(
  fixture: DatabaseFixture,
  bookingId: string,
): Promise<{ status: string; version: number }> {
  const rows = await fixture.runtimePool.query<{ status: string; version: number }>(
    'SELECT status, version FROM bookings WHERE id=$1',
    [bookingId],
  );
  return rows.rows[0] as { status: string; version: number };
}

async function heldRows(fixture: DatabaseFixture, bookingId: string): Promise<number> {
  const rows = await fixture.runtimePool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM resource_reservations
     WHERE booking_id=$1 AND released_at IS NULL`,
    [bookingId],
  );
  return Number(rows.rows[0]?.n ?? '0');
}

async function auditCount(
  fixture: DatabaseFixture,
  bookingId: string,
  action: string,
): Promise<number> {
  const rows = await fixture.runtimePool.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM audit_logs WHERE subject_id=$1 AND action=$2',
    [bookingId, action],
  );
  return Number(rows.rows[0]?.n ?? '0');
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

describe(
  'Milestone05 Task2: booking consent and cancellation decisions',
  { timeout: 60000 },
  () => {
    it('driver_accept_confirms_single_consent', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'accept');

        const response = await decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        });
        expect(response.status).toBe(200);
        expect(BookingSchema.safeParse(response.body.data).success).toBe(true);
        expect(response.body.data).toMatchObject({ status: 'CONFIRMED', version: 2 });
        expect(response.body.data.decisions).toHaveLength(1);
        expect(response.body.data.decisions[0]).toMatchObject({
          providerId: s.driverUserId,
          kind: 'DRIVER',
          status: 'ACCEPTED',
        });
        expect(response.body.data.decisions[0].decidedAt).not.toBeNull();

        const persisted = await persistedBooking(fixture, booking.id);
        expect(persisted).toMatchObject({ status: 'CONFIRMED', version: 2 });
        const decisions = await fixture.runtimePool.query<{ status: string; n: string }>(
          `SELECT status, (SELECT count(*)::text FROM booking_decisions WHERE booking_id=$1) AS n
         FROM booking_decisions WHERE booking_id=$1`,
          [booking.id],
        );
        expect(decisions.rows).toHaveLength(1);
        expect(decisions.rows[0]).toMatchObject({ status: 'ACCEPTED', n: '1' });
        expect((await tripRow(fixture, booking.id)).status).toBe('ASSIGNED');
        expect(await heldRows(fixture, booking.id)).toBe(2);
        const history = await fixture.runtimePool.query<{ from_status: string; to_status: string }>(
          'SELECT from_status, to_status FROM trip_status_history WHERE trip_id=$1 ORDER BY trip_version',
          [(await tripRow(fixture, booking.id)).id],
        );
        expect(history.rows).toEqual([
          { from_status: null, to_status: 'SCHEDULED' },
          { from_status: 'SCHEDULED', to_status: 'ASSIGNED' },
        ]);
        expect(await auditCount(fixture, booking.id, 'BOOKING_DRIVER_ACCEPT')).toBe(1);
      });
    });

    it('stale_decision_version_is_rejected_without_mutation', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'stale');

        const response = await decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version + 7,
        });
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('STALE_VERSION');
        expect(await persistedBooking(fixture, booking.id)).toMatchObject({
          status: 'PENDING',
          version: 1,
        });
        expect(await heldRows(fixture, booking.id)).toBe(2);
        expect(await auditCount(fixture, booking.id, 'BOOKING_DRIVER_ACCEPT')).toBe(0);
      });
    });

    it('foreign_decision_denied', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'foreign');

        const response = await decide(app, passenger, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        });
        expect(response.status).toBe(403);
        expect(await persistedBooking(fixture, booking.id)).toMatchObject({
          status: 'PENDING',
          version: 1,
        });
        expect(await heldRows(fixture, booking.id)).toBe(2);
      });
    });

    it('expired_booking_cannot_be_accepted', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'expired');

        await fixture.migrationPool.query(
          "UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id=$1",
          [booking.id],
        );
        const response = await decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        });
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('BOOKING_EXPIRED');
        expect(await persistedBooking(fixture, booking.id)).toMatchObject({
          status: 'PENDING',
          version: 1,
        });
        const decisions = await fixture.runtimePool.query<{ status: string }>(
          'SELECT status FROM booking_decisions WHERE booking_id=$1',
          [booking.id],
        );
        expect(decisions.rows[0]?.status).toBe('PENDING');
        expect(await heldRows(fixture, booking.id)).toBe(2);
      });
    });

    it('driver_rejection_records_reason_and_releases_once', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'reject');

        const response = await decide(app, driver, booking.id, {
          decision: 'REJECT',
          version: booking.version,
          reason: 'Driver unavailable for this interval.',
        });
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('REJECTED');
        expect(response.body.data.decisions[0]).toMatchObject({
          status: 'REJECTED',
          providerId: s.driverUserId,
        });

        const decision = await fixture.runtimePool.query<{ status: string; reason: string }>(
          'SELECT status, reason FROM booking_decisions WHERE booking_id=$1',
          [booking.id],
        );
        expect(decision.rows[0]).toMatchObject({
          status: 'REJECTED',
          reason: 'Driver unavailable for this interval.',
        });
        expect((await tripRow(fixture, booking.id)).status).toBe('REJECTED');
        expect(await heldRows(fixture, booking.id)).toBe(0);
        expect(await auditCount(fixture, booking.id, 'BOOKING_DRIVER_REJECT')).toBe(1);

        const repeated = await decide(app, driver, booking.id, {
          decision: 'REJECT',
          version: booking.version,
          reason: 'Driver unavailable for this interval.',
        });
        expect(repeated.status).toBe(409);
        expect(await auditCount(fixture, booking.id, 'BOOKING_DRIVER_REJECT')).toBe(1);
        expect(await heldRows(fixture, booking.id)).toBe(0);
      });
    });

    it('passenger_cancel_confirmed_before_cutoff_releases_once', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'cancel');

        const accepted = await decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        });
        expect(accepted.status).toBe(200);

        const response = await cancel(app, passenger, booking.id, {
          version: accepted.body.data.version,
          reason: 'Plans changed before the trip.',
        });
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('CANCELLED');
        expect(response.body.data.decisions[0].status).toBe('ACCEPTED');
        expect(await persistedBooking(fixture, booking.id)).toMatchObject({
          status: 'CANCELLED',
          version: 3,
        });
        expect((await tripRow(fixture, booking.id)).status).toBe('CANCELLED');
        expect(await heldRows(fixture, booking.id)).toBe(0);
        expect(await auditCount(fixture, booking.id, 'BOOKING_CANCEL')).toBe(1);
        const history = await fixture.runtimePool.query<{ from_status: string; to_status: string }>(
          'SELECT from_status, to_status FROM trip_status_history WHERE trip_id=$1 ORDER BY trip_version',
          [(await tripRow(fixture, booking.id)).id],
        );
        expect(history.rows).toEqual([
          { from_status: null, to_status: 'SCHEDULED' },
          { from_status: 'SCHEDULED', to_status: 'ASSIGNED' },
          { from_status: 'ASSIGNED', to_status: 'CANCELLED' },
        ]);

        const repeated = await cancel(app, passenger, booking.id, {
          version: accepted.body.data.version,
          reason: 'Plans changed before the trip.',
        });
        expect(repeated.status).toBe(409);
        expect(await auditCount(fixture, booking.id, 'BOOKING_CANCEL')).toBe(1);
        expect(await heldRows(fixture, booking.id)).toBe(0);
      });
    });

    it('confirmed_passenger_cancel_inside_cutoff_is_denied', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'cutoff');

        const accepted = await decide(app, driver, booking.id, {
          decision: 'ACCEPT',
          version: booking.version,
        });
        expect(accepted.status).toBe(200);

        const soon = new Date(Date.now() + 10 * 60 * 1000);
        await fixture.migrationPool.query('UPDATE bookings SET starts_at=$2 WHERE id=$1', [
          booking.id,
          soon,
        ]);
        await fixture.migrationPool.query('UPDATE trips SET starts_at=$2 WHERE booking_id=$1', [
          booking.id,
          soon,
        ]);

        const response = await cancel(app, passenger, booking.id, {
          version: accepted.body.data.version,
          reason: 'Too late to cancel this trip.',
        });
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('CANCELLATION_CUTOFF');
        expect(await persistedBooking(fixture, booking.id)).toMatchObject({
          status: 'CONFIRMED',
          version: 2,
        });
        expect(await heldRows(fixture, booking.id)).toBe(2);
        expect((await tripRow(fixture, booking.id)).status).toBe('ASSIGNED');
      });
    });

    it('accept_vs_cancel_race_has_one_legal_outcome', async () => {
      await withTestDatabase(async (fixture) => {
        const s = await seedBookingFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const booking = await createPendingBooking(fixture, app, passenger, s, 'race');

        const [acceptResponse, cancelResponse] = await Promise.all([
          decide(app, driver, booking.id, { decision: 'ACCEPT', version: booking.version }),
          cancel(app, passenger, booking.id, {
            version: booking.version,
            reason: 'Race cancellation request.',
          }),
        ]);

        expect([acceptResponse.status, cancelResponse.status].sort()).toEqual([200, 409]);
        const accepted = acceptResponse.status === 200;
        const persisted = await persistedBooking(fixture, booking.id);
        expect(persisted.status).toBe(accepted ? 'CONFIRMED' : 'CANCELLED');
        expect(await heldRows(fixture, booking.id)).toBe(accepted ? 2 : 0);
        expect((await tripRow(fixture, booking.id)).status).toBe(
          accepted ? 'ASSIGNED' : 'CANCELLED',
        );
        expect(
          (await auditCount(fixture, booking.id, 'BOOKING_DRIVER_ACCEPT')) +
            (await auditCount(fixture, booking.id, 'BOOKING_CANCEL')),
        ).toBe(1);
      });
    });
  },
);
