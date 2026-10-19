import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { HistoryEntrySchema, TripSchema, type HistoryEntryDto } from '@drivehire/contracts';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { HttpError } from '../../errors.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import { createAccountsRouter } from '../accounts/routes.js';
import { createAccountsService } from '../accounts/service.js';
import { createBookingsRouter } from '../bookings/routes.js';
import { createTripsRouter } from './routes.js';
import { createTripsService } from './service.js';

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

// The coordinator mounts createTripsRouter inside createApp once every phase05
// router exists. Until then this focused suite composes the real accounts,
// booking and trip routers so the trip IO/auth/envelope behaviour runs here.
function buildApp() {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('X-Request-ID', randomUUID());
    next();
  });
  app.use(express.json({ limit: '100kb', strict: true }));
  const accounts = createAccountsService({ prisma, config });
  app.use('/api/v1', createAccountsRouter({ prisma, config }));
  app.use('/api/v1', createBookingsRouter({ prisma, requireAccount: accounts.requireAccount }));
  app.use('/api/v1', createTripsRouter({ prisma, requireAccount: accounts.requireAccount }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const failure =
      error instanceof HttpError
        ? error
        : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    res.status(failure.status).json({
      success: false,
      error: {
        code: failure.code,
        message: failure.message,
        requestId: String(res.getHeader('X-Request-ID')),
      },
    });
  };
  app.use(errors);
  return app;
}

type TestApp = ReturnType<typeof buildApp>;

function auth(app: TestApp, token: string) {
  const base = request(app);
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', bearer),
    post: (path: string) => base.post(path).set('Authorization', bearer),
  };
}

async function login(app: TestApp, email: string): Promise<string> {
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
     VALUES ($1, 'Trip Test User', $2, now()) RETURNING id`,
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

interface TripFixture {
  passengerEmail: string;
  passengerId: string;
  driverEmail: string;
  driverUserId: string;
  driverId: string;
  vehicleId: string;
  originId: string;
  destinationId: string;
}

async function seedTripFixture(fixture: DatabaseFixture): Promise<TripFixture> {
  const originId = await seedCity(fixture, 'Pune');
  const destinationId = await seedCity(fixture, 'Mumbai');
  const passengerId = await seedAccount(fixture, 'trip-pax@example.com');
  const driverUserId = await seedAccount(fixture, 'trip-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  const driverId = await seedApprovedDriver(fixture, {
    userId: driverUserId,
    cityId: originId,
    licenseNumber: 'MH12-2020-0505',
  });
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: passengerId,
    cityId: originId,
    registration: 'MH12-EF-9012',
  });
  return {
    passengerEmail: 'trip-pax@example.com',
    passengerId,
    driverEmail: 'trip-driver@example.com',
    driverUserId,
    driverId,
    vehicleId,
    originId,
    destinationId,
  };
}

interface CreatedBooking {
  bookingId: string;
  tripId: string;
  version: number;
}

async function createBooking(
  app: TestApp,
  token: string,
  s: TripFixture,
  label: string,
  startsAt: Date,
  hours = 2,
): Promise<CreatedBooking> {
  const quote = await auth(app, token)
    .post('/api/v1/booking-quotes')
    .send({
      service: 'DRIVER_HIRE',
      vehicleId: s.vehicleId,
      driverId: s.driverId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + hours * HOUR).toISOString(),
      originCityId: s.originId,
      destinationCityId: s.destinationId,
      passengers: 1,
    });
  expect(quote.status).toBe(201);
  const booking = await auth(app, token)
    .post('/api/v1/bookings')
    .set('Idempotency-Key', `${label}-${randomUUID()}`)
    .send({ quoteId: quote.body.data.id });
  expect(booking.status).toBe(201);
  return {
    bookingId: booking.body.data.id as string,
    tripId: booking.body.data.tripId as string,
    version: booking.body.data.version as number,
  };
}

async function acceptBooking(
  fixture: DatabaseFixture,
  created: CreatedBooking,
  driverUserId: string,
): Promise<number> {
  await fixture.migrationPool.query(
    `UPDATE bookings SET status='CONFIRMED', version=version+1 WHERE id=$1`,
    [created.bookingId],
  );
  await fixture.migrationPool.query(
    `UPDATE booking_decisions SET status='ACCEPTED', decided_at=now() WHERE booking_id=$1`,
    [created.bookingId],
  );
  await fixture.migrationPool.query(
    `UPDATE trips SET status='ASSIGNED', version=version+1 WHERE id=$1`,
    [created.tripId],
  );
  const trip = await fixture.migrationPool.query<{ version: number }>(
    'SELECT version FROM trips WHERE id=$1',
    [created.tripId],
  );
  const version = trip.rows[0]?.version as number;
  await fixture.migrationPool.query(
    `INSERT INTO trip_status_history(trip_id, from_status, to_status, actor_id, actor_type, trip_version, request_id)
     VALUES ($1, 'SCHEDULED', 'ASSIGNED', $2, 'USER', $3, 'test-accept')`,
    [created.tripId, driverUserId, version],
  );
  return version;
}

async function openStartWindow(
  fixture: DatabaseFixture,
  bookingId: string,
  tripId: string,
): Promise<void> {
  const startsAt = new Date(Date.now() + 5 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * HOUR);
  await fixture.migrationPool.query('UPDATE bookings SET starts_at=$2, ends_at=$3 WHERE id=$1', [
    bookingId,
    startsAt,
    endsAt,
  ]);
  await fixture.migrationPool.query('UPDATE trips SET starts_at=$2, ends_at=$3 WHERE id=$1', [
    tripId,
    startsAt,
    endsAt,
  ]);
  await fixture.migrationPool.query(
    'UPDATE resource_reservations SET starts_at=$2, ends_at=$3 WHERE booking_id=$1',
    [bookingId, startsAt, endsAt],
  );
}

function transition(app: TestApp, token: string, tripId: string, body: Record<string, unknown>) {
  return auth(app, token).post(`/api/v1/trips/${tripId}/transitions`).send(body);
}

function expectTripContract(response: { body: unknown }): void {
  const data = (response.body as { data?: unknown }).data;
  expect(TripSchema.safeParse(data).success).toBe(true);
}

function historyData(response: { body: unknown }): HistoryEntryDto[] {
  const data = (response.body as { data?: unknown }).data as unknown[];
  return data.map((entry) => HistoryEntrySchema.parse(entry));
}

describe('Milestone05 Task2: trip lifecycle, object authorization and overrun guard', () => {
  it('assignment_gates_transition_and_object_access_is_enforced', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      await seedAccount(fixture, 'trip-other@example.com');
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const other = await login(app, 'trip-other@example.com');
      const created = await createBooking(app, passenger, s, 'gate', nextBookingStart());

      const before = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version: created.version,
      });
      expect(before.status).toBe(409);
      expect(before.body.error.code).toBe('ILLEGAL_TRANSITION');

      const passengerAttempt = await transition(app, passenger, created.tripId, {
        toStatus: 'STARTED',
        version: created.version,
      });
      expect(passengerAttempt.status).toBe(403);

      const foreignRead = await auth(app, other).get(`/api/v1/trips/${created.tripId}`);
      expect(foreignRead.status).toBe(404);

      const driverRead = await auth(app, driver).get(`/api/v1/trips/${created.tripId}`);
      expect(driverRead.status).toBe(200);
      expectTripContract(driverRead);

      const persisted = await fixture.runtimePool.query<{ status: string }>(
        'SELECT status FROM trips WHERE id=$1',
        [created.tripId],
      );
      expect(persisted.rows[0]?.status).toBe('SCHEDULED');
    });
  }, 60000);

  it('start_window_and_version_cas_are_enforced', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const created = await createBooking(app, passenger, s, 'window', nextBookingStart());
      const version = await acceptBooking(fixture, created, s.driverUserId);

      const closed = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version,
      });
      expect(closed.status).toBe(409);
      expect(closed.body.error.code).toBe('START_WINDOW');

      await openStartWindow(fixture, created.bookingId, created.tripId);

      const stale = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version: version + 7,
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');

      const started = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version,
      });
      expect(started.status).toBe(200);
      expectTripContract(started);
      expect(started.body.data).toMatchObject({ status: 'STARTED', version: version + 1 });

      const audit = await fixture.runtimePool.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM audit_logs WHERE subject_id=$1 AND action='TRIP_STARTED'",
        [created.tripId],
      );
      expect(audit.rows[0]?.n).toBe('1');
    });
  }, 60000);

  it('illegal_skip_is_rejected_and_terminal_state_is_locked', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const created = await createBooking(app, passenger, s, 'skip', nextBookingStart());
      const accepted = await acceptBooking(fixture, created, s.driverUserId);
      await openStartWindow(fixture, created.bookingId, created.tripId);
      const started = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version: accepted,
      });
      expect(started.status).toBe(200);
      const startedVersion = started.body.data.version as number;

      const skip = await transition(app, driver, created.tripId, {
        toStatus: 'COMPLETED',
        version: startedVersion,
      });
      expect(skip.status).toBe(409);
      expect(skip.body.error.code).toBe('ILLEGAL_TRANSITION');

      const transit = await transition(app, driver, created.tripId, {
        toStatus: 'IN_TRANSIT',
        version: startedVersion,
      });
      expect(transit.status).toBe(200);
      const transitVersion = transit.body.data.version as number;

      const completed = await transition(app, driver, created.tripId, {
        toStatus: 'COMPLETED',
        version: transitVersion,
      });
      expect(completed.status).toBe(200);
      expect(completed.body.data.status).toBe('COMPLETED');

      const booking = await fixture.runtimePool.query<{ status: string }>(
        'SELECT status FROM bookings WHERE id=$1',
        [created.bookingId],
      );
      expect(booking.rows[0]?.status).toBe('COMPLETED');
      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations WHERE booking_id=$1 AND released_at IS NULL',
        [created.bookingId],
      );
      expect(holds.rows[0]?.n).toBe('0');

      const afterTerminal = await transition(app, driver, created.tripId, {
        toStatus: 'FAILED',
        version: completed.body.data.version as number,
        reason: 'Too late to change a completed trip.',
      });
      expect(afterTerminal.status).toBe(409);
      expect(afterTerminal.body.error.code).toBe('TRIP_TERMINAL');
    });
  }, 60000);

  it('failed_transition_requires_reason_and_releases_parent', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const created = await createBooking(app, passenger, s, 'fail', nextBookingStart());
      const accepted = await acceptBooking(fixture, created, s.driverUserId);
      await openStartWindow(fixture, created.bookingId, created.tripId);
      const started = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version: accepted,
      });
      const startedVersion = started.body.data.version as number;

      const noReason = await transition(app, driver, created.tripId, {
        toStatus: 'FAILED',
        version: startedVersion,
      });
      expect(noReason.status).toBe(422);

      const reason = 'Vehicle failure stopped the journey.';
      const failed = await transition(app, driver, created.tripId, {
        toStatus: 'FAILED',
        version: startedVersion,
        reason,
      });
      expect(failed.status).toBe(200);
      expect(failed.body.data.status).toBe('FAILED');

      const booking = await fixture.runtimePool.query<{ status: string }>(
        'SELECT status FROM bookings WHERE id=$1',
        [created.bookingId],
      );
      expect(booking.rows[0]?.status).toBe('FAILED');
      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations WHERE booking_id=$1 AND released_at IS NULL',
        [created.bookingId],
      );
      expect(holds.rows[0]?.n).toBe('0');
      const audit = await fixture.runtimePool.query<{ reason: string }>(
        "SELECT reason FROM audit_logs WHERE subject_id=$1 AND action='TRIP_FAILED'",
        [created.tripId],
      );
      expect(audit.rows[0]?.reason).toBe(reason);
    });
  }, 60000);

  it('active_overrun_blocks_an_adjacent_next_start', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const start = nextBookingStart();
      const first = await createBooking(app, passenger, s, 'overrun-a', start, 2);
      const second = await createBooking(
        app,
        passenger,
        s,
        'overrun-b',
        new Date(start.getTime() + 2 * HOUR),
        2,
      );
      await acceptBooking(fixture, first, s.driverUserId);
      const secondVersion = await acceptBooking(fixture, second, s.driverUserId);

      const overrunEnd = new Date(Date.now() - 5 * 60 * 1000);
      const overrunStart = new Date(overrunEnd.getTime() - 2 * HOUR);
      await fixture.migrationPool.query(
        `UPDATE trips SET status='STARTED', version=version+1, started_at=$2, starts_at=$2, ends_at=$3
           WHERE id=$1`,
        [first.tripId, overrunStart, overrunEnd],
      );
      await fixture.migrationPool.query(
        'UPDATE resource_reservations SET starts_at=$2, ends_at=$3 WHERE booking_id=$1 AND released_at IS NULL',
        [first.bookingId, overrunStart, overrunEnd],
      );
      const nextEnd = new Date(overrunEnd.getTime() + 2 * HOUR);
      await fixture.migrationPool.query(
        'UPDATE bookings SET starts_at=$2, ends_at=$3 WHERE id=$1',
        [second.bookingId, overrunEnd, nextEnd],
      );
      await fixture.migrationPool.query('UPDATE trips SET starts_at=$2, ends_at=$3 WHERE id=$1', [
        second.tripId,
        overrunEnd,
        nextEnd,
      ]);
      await fixture.migrationPool.query(
        'UPDATE resource_reservations SET starts_at=$2, ends_at=$3 WHERE booking_id=$1 AND released_at IS NULL',
        [second.bookingId, overrunEnd, nextEnd],
      );

      const blocked = await transition(app, driver, second.tripId, {
        toStatus: 'STARTED',
        version: secondVersion,
      });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('RESOURCE_CONFLICT');

      await fixture.migrationPool.query(
        "UPDATE trips SET status='COMPLETED', completed_at=now(), version=version+1 WHERE id=$1",
        [first.tripId],
      );
      const released = await transition(app, driver, second.tripId, {
        toStatus: 'STARTED',
        version: secondVersion,
      });
      expect(released.status).toBe(200);
      expect(released.body.data.status).toBe('STARTED');
    });
  }, 60000);

  it('overrun_completion_flags_an_incident', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const created = await createBooking(app, passenger, s, 'incident', nextBookingStart());
      const accepted = await acceptBooking(fixture, created, s.driverUserId);
      await openStartWindow(fixture, created.bookingId, created.tripId);
      const started = await transition(app, driver, created.tripId, {
        toStatus: 'STARTED',
        version: accepted,
      });
      const startedVersion = started.body.data.version as number;

      // Preserve the real ends_at > starts_at invariant: an actual overrun has
      // both bounds in the past, with the trip having started before it ended.
      await fixture.migrationPool.query(
        `UPDATE trips
           SET starts_at=now() - interval '3 hours',
               ends_at=now() - interval '1 minute',
               started_at=now() - interval '3 hours'
         WHERE id=$1`,
        [created.tripId],
      );
      const transit = await transition(app, driver, created.tripId, {
        toStatus: 'IN_TRANSIT',
        version: startedVersion,
      });
      expect(transit.status).toBe(200);
      expect(transit.body.data.incidentFlag).toBe(true);
    });
  }, 60000);

  it('list_and_history_are_participant_scoped_and_paginated', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      await seedAccount(fixture, 'trip-outsider@example.com');
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const driver = await login(app, s.driverEmail);
      const outsider = await login(app, 'trip-outsider@example.com');
      const created = await createBooking(app, passenger, s, 'scope', nextBookingStart());
      const accepted = await acceptBooking(fixture, created, s.driverUserId);
      await openStartWindow(fixture, created.bookingId, created.tripId);
      await transition(app, driver, created.tripId, { toStatus: 'STARTED', version: accepted });

      const list = await auth(app, passenger).get('/api/v1/trips?page=1&pageSize=10');
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(1);
      expect(TripSchema.safeParse(list.body.data[0]).success).toBe(true);

      const filtered = await auth(app, passenger).get('/api/v1/trips?status=STARTED');
      expect(filtered.body.meta.total).toBe(1);
      const emptyFilter = await auth(app, passenger).get('/api/v1/trips?status=SCHEDULED');
      expect(emptyFilter.body.meta.total).toBe(0);

      const outsiderList = await auth(app, outsider).get('/api/v1/trips');
      expect(outsiderList.body.meta.total).toBe(0);

      const history = await auth(app, passenger).get(
        `/api/v1/trips/${created.tripId}/history?page=1&pageSize=1`,
      );
      expect(history.status).toBe(200);
      expect(history.body.meta.total).toBe(2);
      expect(history.body.meta.pageSize).toBe(1);
      expect(historyData(history)).toHaveLength(1);

      const fullHistory = await auth(app, passenger).get(`/api/v1/trips/${created.tripId}/history`);
      const entries = historyData(fullHistory);
      expect(entries.map((entry) => entry.toStatus)).toEqual(['ASSIGNED', 'STARTED']);

      const foreignHistory = await auth(app, outsider).get(
        `/api/v1/trips/${created.tripId}/history`,
      );
      expect(foreignHistory.status).toBe(404);
    });
  }, 60000);
  it.each(['LICENSE', 'INSURANCE', 'PASSENGER_STATUS'] as const)(
    'review_start_revalidates_%s',
    async (kind) => {
      await withTestDatabase(async (fixture) => {
        const s = await seedTripFixture(fixture);
        const app = buildApp();
        const passenger = await login(app, s.passengerEmail);
        const driver = await login(app, s.driverEmail);
        const created = await createBooking(app, passenger, s, 'review-start', nextBookingStart());
        const version = await acceptBooking(fixture, created, s.driverUserId);
        await openStartWindow(fixture, created.bookingId, created.tripId);
        if (kind === 'PASSENGER_STATUS') {
          await fixture.migrationPool.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [
            s.passengerId,
          ]);
        } else {
          await fixture.migrationPool.query(
            'UPDATE documents SET expires_on=current_date - 1 WHERE kind=$1 AND (driver_id=$2 OR vehicle_id=$3)',
            [kind, s.driverId, s.vehicleId],
          );
        }
        const result = await transition(app, driver, created.tripId, {
          toStatus: 'STARTED',
          version,
        });
        expect(result.status).toBe(409);
        expect(
          (
            await fixture.runtimePool.query('SELECT status FROM trips WHERE id=$1', [
              created.tripId,
            ])
          ).rows[0].status,
        ).toBe('ASSIGNED');
        expect(
          (
            await fixture.runtimePool.query(
              'SELECT count(*)::int AS n FROM resource_reservations WHERE booking_id=$1 AND released_at IS NULL',
              [created.bookingId],
            )
          ).rows[0].n,
        ).toBe(2);
      });
    },
  );

  it('review_locked_actor_cannot_use_a_pre_suspension_snapshot', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedTripFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const created = await createBooking(app, passenger, s, 'stale-actor', nextBookingStart());
      const version = await acceptBooking(fixture, created, s.driverUserId);
      await openStartWindow(fixture, created.bookingId, created.tripId);
      await fixture.migrationPool.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [
        s.driverUserId,
      ]);
      await expect(
        createTripsService({ prisma }).transitionTrip(
          { userId: s.driverUserId, roles: ['DRIVER'], sessionId: randomUUID() },
          created.tripId,
          { toStatus: 'STARTED', version },
          'stale-actor',
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await fixture.runtimePool.query('SELECT status FROM trips WHERE id=$1', [created.tripId]))
          .rows[0].status,
      ).toBe('ASSIGNED');
    });
  });
});
