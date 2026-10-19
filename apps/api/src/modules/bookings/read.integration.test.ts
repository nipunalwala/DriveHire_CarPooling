import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { BookingSchema, HistoryEntrySchema } from '@drivehire/contracts';
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

function auth(app: ReturnType<typeof createApp>, token?: string) {
  const base = request(app);
  return {
    get: (path: string) =>
      token === undefined ? base.get(path) : base.get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => base.post(path).set('Authorization', `Bearer ${token}`),
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
     VALUES ($1, 'Read Test User', $2, now()) RETURNING id`,
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
  input: { userId: string; cityId: string; licenseNumber?: string },
): Promise<string> {
  const licenseExpiresOn = isoDate(365);
  const license = input.licenseNumber ?? 'read-license';
  const driver = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
       license_country, license_expires_on, city_id, hourly_rate_minor)
     VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000) RETURNING id`,
    [input.userId, digest(license), licenseExpiresOn, input.cityId],
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
    [input.userId, driverId, randomUUID(), digest(`${license}-doc`), licenseExpiresOn],
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
  input: { ownerId: string; cityId: string; registration?: string },
): Promise<string> {
  const registration = input.registration ?? 'read-vehicle';
  const vehicle = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2021, 'HATCHBACK', 5, 'MANUAL', 'PETROL', $3)
     RETURNING id`,
    [input.ownerId, digest(registration), input.cityId],
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
        digest(`${registration}-doc:${kind}`),
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

function nextBookingStart(offsetHours: number): Date {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  return new Date(date.getTime() + offsetHours * HOUR);
}

interface ReadFixture {
  passengerEmail: string;
  passengerUserId: string;
  otherPassengerEmail: string;
  otherPassengerUserId: string;
  driverEmail: string;
  driverUserId: string;
  driverId: string;
  vehicleId: string;
  otherVehicleId: string;
  originId: string;
  destinationId: string;
}

async function seedReadFixture(fixture: DatabaseFixture): Promise<ReadFixture> {
  const originId = await seedCity(fixture, 'Pune');
  const destinationId = await seedCity(fixture, 'Mumbai');
  const passengerUserId = await seedAccount(fixture, 'read-pax@example.com');
  const otherPassengerUserId = await seedAccount(fixture, 'read-other@example.com');
  const driverUserId = await seedAccount(fixture, 'read-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  await seedAccount(fixture, 'read-admin@example.com', ['PASSENGER', 'ADMIN']);
  const driverId = await seedApprovedDriver(fixture, { userId: driverUserId, cityId: originId });
  // A DRIVER_HIRE request always reserves the requester's own vehicle, and
  // vehicle ownership is immutable, so the creating passenger is also the
  // current owner. Owner authorization is therefore exercised with the
  // passenger principal rather than an impossible post-creation transfer.
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: passengerUserId,
    cityId: originId,
    registration: 'read-vehicle',
  });
  const otherVehicleId = await seedApprovedVehicle(fixture, {
    ownerId: otherPassengerUserId,
    cityId: originId,
    registration: 'read-other-vehicle',
  });
  return {
    passengerEmail: 'read-pax@example.com',
    passengerUserId,
    otherPassengerEmail: 'read-other@example.com',
    otherPassengerUserId,
    driverEmail: 'read-driver@example.com',
    driverUserId,
    driverId,
    vehicleId,
    otherVehicleId,
    originId,
    destinationId,
  };
}

async function createPendingBooking(
  app: ReturnType<typeof createApp>,
  token: string,
  s: ReadFixture,
  startsAt: Date,
  resources?: { driverId?: string; vehicleId: string },
): Promise<{ id: string; tripId: string; version: number }> {
  const quote = await auth(app, token)
    .post('/api/v1/booking-quotes')
    .send({
      service: 'DRIVER_HIRE',
      vehicleId: resources?.vehicleId ?? s.vehicleId,
      driverId: resources?.driverId ?? s.driverId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * HOUR).toISOString(),
      originCityId: s.originId,
      destinationCityId: s.destinationId,
      passengers: 1,
    });
  expect(quote.status).toBe(201);
  const created = await auth(app, token)
    .post('/api/v1/bookings')
    .set('Idempotency-Key', `read-${randomUUID()}`)
    .send({ quoteId: quote.body.data.id });
  expect(created.status).toBe(201);
  expect(BookingSchema.safeParse(created.body.data).success).toBe(true);
  return created.body.data as { id: string; tripId: string; version: number };
}

describe('Milestone05 Task2: booking and trip reads', { timeout: 60000 }, () => {
  it('list_is_self_scoped_paginated_and_status_filtered', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedReadFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const otherPassenger = await login(app, s.otherPassengerEmail);
      const driver = await login(app, s.driverEmail);

      const first = await createPendingBooking(app, passenger, s, nextBookingStart(3));
      const second = await createPendingBooking(app, passenger, s, nextBookingStart(7));
      const foreign = await createPendingBooking(app, otherPassenger, s, nextBookingStart(11), {
        vehicleId: s.otherVehicleId,
      });

      const own = await auth(app, passenger).get('/api/v1/bookings');
      expect(own.status).toBe(200);
      expect(own.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(own.body.data.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
      expect(
        own.body.data.every(
          (item: { passengerId: string }) => item.passengerId === s.passengerUserId,
        ),
      ).toBe(true);

      const injected = await auth(app, passenger).get(
        `/api/v1/bookings?passengerId=${s.otherPassengerUserId}`,
      );
      expect(injected.status).toBe(200);
      expect(injected.body.meta.total).toBe(2);

      const pageOne = await auth(app, passenger).get('/api/v1/bookings?page=1&pageSize=1');
      expect(pageOne.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
      expect(pageOne.body.data).toHaveLength(1);
      expect(pageOne.body.data[0].id).toBe(second.id);
      const pageTwo = await auth(app, passenger).get('/api/v1/bookings?page=2&pageSize=1');
      expect(pageTwo.body.data[0].id).toBe(first.id);

      const accepted = await auth(app, driver)
        .post(`/api/v1/bookings/${second.id}/decisions`)
        .send({ decision: 'ACCEPT', version: second.version });
      expect(accepted.status).toBe(200);

      const confirmed = await auth(app, passenger).get('/api/v1/bookings?status=CONFIRMED');
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.meta.total).toBe(1);
      expect(confirmed.body.data[0].id).toBe(second.id);
      const pending = await auth(app, passenger).get('/api/v1/bookings?status=PENDING');
      expect(pending.body.meta.total).toBe(1);
      expect(pending.body.data[0].id).toBe(first.id);
      expect(foreign.id).not.toBe(first.id);

      const invalid = await auth(app, passenger).get('/api/v1/bookings?status=NOT_A_STATUS');
      expect(invalid.status).toBe(400);
      const unauthenticated = await auth(app).get('/api/v1/bookings');
      expect(unauthenticated.status).toBe(401);
    });
  });

  it('driver_listing_is_role_gated_self_scoped_and_paginated', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedReadFixture(fixture);
      const otherDriverEmail = 'read-driver2@example.com';
      const otherDriverUserId = await seedAccount(fixture, otherDriverEmail, [
        'PASSENGER',
        'DRIVER',
      ]);
      const otherDriverId = await seedApprovedDriver(fixture, {
        userId: otherDriverUserId,
        cityId: s.originId,
        licenseNumber: 'read-license-2',
      });
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const otherPassenger = await login(app, s.otherPassengerEmail);
      const driver = await login(app, s.driverEmail);

      const first = await createPendingBooking(app, passenger, s, nextBookingStart(3));
      const second = await createPendingBooking(app, passenger, s, nextBookingStart(7));
      const foreign = await createPendingBooking(app, otherPassenger, s, nextBookingStart(11), {
        driverId: otherDriverId,
        vehicleId: s.otherVehicleId,
      });

      const mine = await auth(app, driver).get('/api/v1/drivers/me/bookings');
      expect(mine.status).toBe(200);
      expect(mine.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mine.body.data.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
      expect(mine.body.data.every((item: unknown) => BookingSchema.safeParse(item).success)).toBe(
        true,
      );
      expect(
        mine.body.data.every((item: { driverId: string }) => item.driverId === s.driverId),
      ).toBe(true);
      expect(mine.body.data.some((item: { id: string }) => item.id === foreign.id)).toBe(false);

      const injected = await auth(app, driver).get(
        `/api/v1/drivers/me/bookings?driverId=${otherDriverId}`,
      );
      expect(injected.status).toBe(200);
      expect(injected.body.meta.total).toBe(2);

      const pageOne = await auth(app, driver).get('/api/v1/drivers/me/bookings?page=1&pageSize=1');
      expect(pageOne.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
      expect(pageOne.body.data).toHaveLength(1);
      expect(pageOne.body.data[0].id).toBe(second.id);
      const pageTwo = await auth(app, driver).get('/api/v1/drivers/me/bookings?page=2&pageSize=1');
      expect(pageTwo.body.data[0].id).toBe(first.id);

      const passengerDenied = await auth(app, passenger).get('/api/v1/drivers/me/bookings');
      expect(passengerDenied.status).toBe(403);
      const anonymous = await auth(app).get('/api/v1/drivers/me/bookings');
      expect(anonymous.status).toBe(401);

      await fixture.migrationPool.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND role='DRIVER'",
        [s.driverUserId],
      );
      const revoked = await auth(app, driver).get('/api/v1/drivers/me/bookings');
      expect(revoked.status).toBe(403);
    });
  });

  it('detail_authorizes_passenger_driver_owner_and_admin_but_hides_foreign_objects', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedReadFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const otherPassenger = await login(app, s.otherPassengerEmail);
      const driver = await login(app, s.driverEmail);
      const admin = await login(app, 'read-admin@example.com');
      const booking = await createPendingBooking(app, passenger, s, nextBookingStart(3));
      const foreign = await createPendingBooking(app, otherPassenger, s, nextBookingStart(9), {
        vehicleId: s.otherVehicleId,
      });

      // The passenger created the booking with their own immutable vehicle, so
      // the same principal exercises both the passenger and owner branches.
      for (const [token, label] of [
        [passenger, 'passenger-owner'],
        [driver, 'driver'],
        [admin, 'admin'],
      ] as const) {
        const response = await auth(app, token).get(`/api/v1/bookings/${booking.id}`);
        expect(response.status, label).toBe(200);
        expect(BookingSchema.safeParse(response.body.data).success, label).toBe(true);
      }

      const foreignResponse = await auth(app, passenger).get(`/api/v1/bookings/${foreign.id}`);
      expect(foreignResponse.status).toBe(404);
      const missing = await auth(app, passenger).get(`/api/v1/bookings/${randomUUID()}`);
      expect(missing.status).toBe(404);
      const invalidId = await auth(app, passenger).get('/api/v1/bookings/not-a-uuid');
      expect(invalidId.status).toBe(404);
      const anonymous = await auth(app).get(`/api/v1/bookings/${booking.id}`);
      expect(anonymous.status).toBe(401);
    });
  });

  it('trip_history_is_mounted_and_participant_scoped', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedReadFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const otherPassenger = await login(app, s.otherPassengerEmail);
      const driver = await login(app, s.driverEmail);
      const admin = await login(app, 'read-admin@example.com');
      const booking = await createPendingBooking(app, passenger, s, nextBookingStart(3));
      const accepted = await auth(app, driver)
        .post(`/api/v1/bookings/${booking.id}/decisions`)
        .send({ decision: 'ACCEPT', version: booking.version });
      expect(accepted.status).toBe(200);

      const history = await auth(app, passenger).get(
        `/api/v1/trips/${booking.tripId}/history?page=1&pageSize=10`,
      );
      expect(history.status).toBe(200);
      expect(history.body.meta).toEqual({ page: 1, pageSize: 10, total: 1 });
      expect(history.body.data).toHaveLength(1);
      expect(HistoryEntrySchema.safeParse(history.body.data[0]).success).toBe(true);
      expect(history.body.data[0]).toMatchObject({
        fromStatus: 'SCHEDULED',
        toStatus: 'ASSIGNED',
      });

      for (const token of [driver, admin]) {
        expect((await auth(app, token).get(`/api/v1/trips/${booking.tripId}/history`)).status).toBe(
          200,
        );
      }
      const foreign = await auth(app, otherPassenger).get(
        `/api/v1/trips/${booking.tripId}/history`,
      );
      expect(foreign.status).toBe(404);
      const invalid = await auth(app, passenger).get('/api/v1/trips/not-a-uuid/history');
      expect(invalid.status).toBe(404);
    });
  });
});
