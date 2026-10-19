import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { BookingSchema, TripSchema } from '@drivehire/contracts';
import { parseEnv } from '../../config/env.js';
import { HttpError } from '../../errors.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import { createAccountsService } from '../accounts/service.js';
import { createAdminOperationsRouter } from './operations-routes.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const JWT_SECRET = randomBytes(32).toString('base64url');
const OUTBOX_KEY = randomBytes(32).toString('base64url');
const APP_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'CorrectHorse1!';
const HOUR = 60 * 60 * 1000;

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  APP_ORIGIN,
  CORS_ORIGINS: APP_ORIGIN,
  AUTH_JWT_SECRET: JWT_SECRET,
  AUTH_OUTBOX_KEY: OUTBOX_KEY,
});
const accounts = createAccountsService({ prisma, config });
const passwordHash = argon2Hash(PASSWORD);

afterAll(async () => {
  await prisma.$disconnect();
});

const fail: ErrorRequestHandler = (error, _req, res, _next) => {
  const failure =
    error instanceof HttpError
      ? error
      : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  res.status(failure.status).json({
    success: false,
    error: { code: failure.code, message: failure.message, requestId: 'test-request-id' },
  });
};

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Request-ID', 'test-request-id');
    next();
  });
  app.use(
    '/api/v1',
    createAdminOperationsRouter({ prisma, requireAccount: accounts.requireAccount }),
  );
  app.use(fail);
  return app;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * HOUR);
}

async function seedAccount(
  fixture: DatabaseFixture,
  email: string,
  roles: string[],
): Promise<string> {
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Operations Test User', $2, now()) RETURNING id`,
    [email, await passwordHash],
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
    "INSERT INTO cities(name, region, country, timezone) VALUES ($1, 'MH', 'IN', 'Asia/Kolkata') RETURNING id",
    [name],
  );
  return city.rows[0]?.id as string;
}

async function login(email: string): Promise<string> {
  const session = await accounts.login({ email, password: PASSWORD });
  return session.accessToken;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

interface JourneyActors {
  adminEmail: string;
  passengerId: string;
  driverUserId: string;
  driverId: string;
  vehicleId: string;
  originCityId: string;
  destinationCityId: string;
}

async function seedJourneyActors(fixture: DatabaseFixture): Promise<JourneyActors> {
  const originCityId = await seedCity(fixture, 'Pune');
  const destinationCityId = await seedCity(fixture, 'Mumbai');
  await seedAccount(fixture, 'operations-admin@example.com', ['PASSENGER', 'ADMIN']);
  const passengerId = await seedAccount(fixture, 'operations-pax@example.com', ['PASSENGER']);
  const driverUserId = await seedAccount(fixture, 'operations-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  const driver = await fixture.runtimePool.query<{ id: string }>(
    'INSERT INTO driver_profiles(user_id, city_id) VALUES ($1, $2) RETURNING id',
    [driverUserId, originCityId],
  );
  const vehicle = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2021, 'HATCHBACK', 5, 'MANUAL', 'PETROL', $3)
     RETURNING id`,
    [passengerId, sha256(`vehicle:${randomUUID()}`), originCityId],
  );
  return {
    adminEmail: 'operations-admin@example.com',
    passengerId,
    driverUserId,
    driverId: driver.rows[0]?.id as string,
    vehicleId: vehicle.rows[0]?.id as string,
    originCityId,
    destinationCityId,
  };
}

interface JourneyOptions {
  actors: JourneyActors;
  bookingStatus?: string;
  decisionStatus?: string;
  tripStatus?: string;
  bookingStartsAt?: Date;
  bookingEndsAt?: Date;
  tripStartsAt?: Date;
  tripEndsAt?: Date;
}

async function seedJourney(
  fixture: DatabaseFixture,
  options: JourneyOptions,
): Promise<{ bookingId: string; tripId: string }> {
  const startsAt = options.bookingStartsAt ?? hoursFromNow(24);
  const endsAt = options.bookingEndsAt ?? new Date(startsAt.getTime() + 2 * HOUR);
  const tripStartsAt = options.tripStartsAt ?? startsAt;
  const tripEndsAt = options.tripEndsAt ?? endsAt;
  const decided = (options.decisionStatus ?? 'PENDING') !== 'PENDING';
  const actors = options.actors;

  const quote = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version,
       driver_version, starts_at, ends_at, origin_city_id, destination_city_id, passengers,
       billable_hours, driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
     VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 100000,
       'INR', now()) RETURNING id`,
    [
      actors.passengerId,
      actors.vehicleId,
      actors.driverId,
      startsAt,
      endsAt,
      actors.originCityId,
      actors.destinationCityId,
    ],
  );
  const booking = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO bookings(quote_id, passenger_id, vehicle_id, driver_id, service, status,
       starts_at, ends_at, total_minor, currency, expires_at)
     VALUES ($1, $2, $3, $4, 'DRIVER_HIRE', $5, $6, $7, 100000, 'INR', $8) RETURNING id`,
    [
      quote.rows[0]?.id,
      actors.passengerId,
      actors.vehicleId,
      actors.driverId,
      options.bookingStatus ?? 'PENDING',
      startsAt,
      endsAt,
      hoursFromNow(1),
    ],
  );
  const bookingId = booking.rows[0]?.id as string;
  await fixture.runtimePool.query(
    `INSERT INTO booking_decisions(booking_id, provider_id, kind, status, decided_at)
     VALUES ($1, $2, 'DRIVER', $3, $4)`,
    [
      bookingId,
      actors.driverUserId,
      options.decisionStatus ?? 'PENDING',
      decided ? new Date() : null,
    ],
  );
  const trip = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO trips(booking_id, driver_id, vehicle_id, status, starts_at, ends_at,
       started_at, completed_at, incident_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) RETURNING id`,
    [
      bookingId,
      actors.driverId,
      actors.vehicleId,
      options.tripStatus ?? 'SCHEDULED',
      tripStartsAt,
      tripEndsAt,
      ['STARTED', 'IN_TRANSIT'].includes(options.tripStatus ?? '') ? tripStartsAt : null,
      options.tripStatus === 'COMPLETED' ? tripEndsAt : null,
    ],
  );
  return { bookingId, tripId: trip.rows[0]?.id as string };
}

function queryString(values: Record<string, string | number>): string {
  const pairs: [string, string][] = Object.entries(values).map(([key, value]) => [
    key,
    String(value),
  ]);
  return new URLSearchParams(pairs).toString();
}

describe('Milestone05 administrator journey read operations', () => {
  it('admin_op_reads_require_current_admin_role', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 'operations-admin@example.com', ['PASSENGER', 'ADMIN']);
      await seedAccount(fixture, 'operations-pax@example.com', ['PASSENGER']);
      const app = buildApp();
      const adminToken = await login('operations-admin@example.com');
      const passengerToken = await login('operations-pax@example.com');

      const anonymous = await request(app).get('/api/v1/admin/bookings');
      expect(anonymous.status).toBe(401);

      const passenger = await request(app)
        .get('/api/v1/admin/bookings')
        .set(bearer(passengerToken));
      expect(passenger.status).toBe(403);

      const admin = await request(app).get('/api/v1/admin/bookings').set(bearer(adminToken));
      expect(admin.status).toBe(200);
      expect(admin.body).toEqual({
        success: true,
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });
  });

  it('admin_bookings_filter_status_and_scheduled_window_with_stable_pagination', async () => {
    await withTestDatabase(async (fixture) => {
      const actors = await seedJourneyActors(fixture);
      const pending = await seedJourney(fixture, {
        actors,
        bookingStatus: 'PENDING',
        bookingStartsAt: hoursFromNow(24),
      });
      const confirmedEarlier = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CONFIRMED',
        decisionStatus: 'ACCEPTED',
        bookingStartsAt: hoursFromNow(48),
      });
      const confirmedLater = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CONFIRMED',
        decisionStatus: 'ACCEPTED',
        bookingStartsAt: hoursFromNow(49),
      });
      const cancelled = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CANCELLED',
        bookingStartsAt: hoursFromNow(240),
      });
      const app = buildApp();
      const token = await login(actors.adminEmail);
      const from = hoursFromNow(24).toISOString();
      const to = hoursFromNow(72).toISOString();

      const firstPage = await request(app)
        .get(
          `/api/v1/admin/bookings?${queryString({
            status: 'CONFIRMED',
            from,
            to,
            page: 1,
            pageSize: 1,
          })}`,
        )
        .set(bearer(token));
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
      expect(firstPage.body.data).toHaveLength(1);
      expect(firstPage.body.data[0].id).toBe(confirmedLater.bookingId);
      expect(firstPage.body.data[0].tripId).toBe(confirmedLater.tripId);
      expect(firstPage.body.data[0].paymentStatus).toBe('NOT_COLLECTED');
      expect(BookingSchema.safeParse(firstPage.body.data[0]).success).toBe(true);

      const secondPage = await request(app)
        .get(
          `/api/v1/admin/bookings?${queryString({
            status: 'CONFIRMED',
            from,
            to,
            page: 2,
            pageSize: 1,
          })}`,
        )
        .set(bearer(token));
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.data[0].id).toBe(confirmedEarlier.bookingId);

      const pendingOnly = await request(app)
        .get(`/api/v1/admin/bookings?${queryString({ status: 'PENDING' })}`)
        .set(bearer(token));
      expect(pendingOnly.status).toBe(200);
      expect(pendingOnly.body.data.map((row: { id: string }) => row.id)).toEqual([
        pending.bookingId,
      ]);

      const cancelledOnly = await request(app)
        .get(`/api/v1/admin/bookings?${queryString({ status: 'CANCELLED' })}`)
        .set(bearer(token));
      expect(cancelledOnly.status).toBe(200);
      expect(cancelledOnly.body.data.map((row: { id: string }) => row.id)).toEqual([
        cancelled.bookingId,
      ]);

      const invalidPage = await request(app)
        .get('/api/v1/admin/bookings?page=0')
        .set(bearer(token));
      expect(invalidPage.status).toBe(400);

      const invalidDate = await request(app)
        .get('/api/v1/admin/bookings?from=not-a-date')
        .set(bearer(token));
      expect(invalidDate.status).toBe(400);

      const reversed = await request(app)
        .get(`/api/v1/admin/bookings?${queryString({ from: to, to: from })}`)
        .set(bearer(token));
      expect(reversed.status).toBe(400);
    });
  });

  it('admin_trips_filter_overdue_active_use_and_exact_status', async () => {
    await withTestDatabase(async (fixture) => {
      const actors = await seedJourneyActors(fixture);
      const startedPast = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CONFIRMED',
        decisionStatus: 'ACCEPTED',
        tripStatus: 'STARTED',
        bookingStartsAt: hoursFromNow(-5),
        bookingEndsAt: hoursFromNow(-3),
      });
      const transitPast = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CONFIRMED',
        decisionStatus: 'ACCEPTED',
        tripStatus: 'IN_TRANSIT',
        bookingStartsAt: hoursFromNow(-4),
        bookingEndsAt: hoursFromNow(-2),
      });
      const scheduledPast = await seedJourney(fixture, {
        actors,
        bookingStatus: 'PENDING',
        tripStatus: 'SCHEDULED',
        bookingStartsAt: hoursFromNow(-6),
        bookingEndsAt: hoursFromNow(-5),
      });
      const completedPast = await seedJourney(fixture, {
        actors,
        bookingStatus: 'COMPLETED',
        decisionStatus: 'ACCEPTED',
        tripStatus: 'COMPLETED',
        bookingStartsAt: hoursFromNow(-8),
        bookingEndsAt: hoursFromNow(-7),
      });
      const startedFuture = await seedJourney(fixture, {
        actors,
        bookingStatus: 'CONFIRMED',
        decisionStatus: 'ACCEPTED',
        tripStatus: 'STARTED',
        bookingStartsAt: hoursFromNow(1),
        bookingEndsAt: hoursFromNow(3),
      });
      const app = buildApp();
      const token = await login(actors.adminEmail);

      const overdue = await request(app).get('/api/v1/admin/trips?overdue=true').set(bearer(token));
      expect(overdue.status).toBe(200);
      expect(overdue.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(overdue.body.data.map((row: { id: string }) => row.id)).toEqual([
        transitPast.tripId,
        startedPast.tripId,
      ]);
      for (const row of overdue.body.data) {
        expect(TripSchema.safeParse(row).success).toBe(true);
        expect(row.kind).toBe('BOOKING');
        expect(new Date(row.endsAt).getTime()).toBeLessThan(Date.now());
      }

      const startedOverdue = await request(app)
        .get('/api/v1/admin/trips?status=STARTED&overdue=true')
        .set(bearer(token));
      expect(startedOverdue.status).toBe(200);
      expect(startedOverdue.body.data.map((row: { id: string }) => row.id)).toEqual([
        startedPast.tripId,
      ]);

      const completed = await request(app)
        .get('/api/v1/admin/trips?status=COMPLETED')
        .set(bearer(token));
      expect(completed.status).toBe(200);
      expect(completed.body.data.map((row: { id: string }) => row.id)).toEqual([
        completedPast.tripId,
      ]);

      const completedNotOverdue = await request(app)
        .get('/api/v1/admin/trips?status=COMPLETED&overdue=true')
        .set(bearer(token));
      expect(completedNotOverdue.status).toBe(200);
      expect(completedNotOverdue.body.data).toEqual([]);

      const noOverdueRestriction = await request(app)
        .get('/api/v1/admin/trips?status=SCHEDULED&overdue=false')
        .set(bearer(token));
      expect(noOverdueRestriction.status).toBe(200);
      expect(noOverdueRestriction.body.data.map((row: { id: string }) => row.id)).toEqual([
        scheduledPast.tripId,
      ]);

      const futureActive = await request(app)
        .get('/api/v1/admin/trips?status=STARTED')
        .set(bearer(token));
      expect(futureActive.status).toBe(200);
      expect(futureActive.body.data.map((row: { id: string }) => row.id)).toEqual([
        startedFuture.tripId,
        startedPast.tripId,
      ]);

      const invalidStatus = await request(app)
        .get('/api/v1/admin/trips?status=NOT_A_STATUS')
        .set(bearer(token));
      expect(invalidStatus.status).toBe(400);

      const invalidOverdue = await request(app)
        .get('/api/v1/admin/trips?overdue=maybe')
        .set(bearer(token));
      expect(invalidOverdue.status).toBe(400);
    });
  });
});
