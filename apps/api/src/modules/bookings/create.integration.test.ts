import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { BookingSchema, QuoteSchema } from '@drivehire/contracts';
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

async function seedAccount(
  fixture: DatabaseFixture,
  email: string,
  roles: string[] = ['PASSENGER'],
): Promise<string> {
  const passwordHash = await argon2Hash(PASSWORD);
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Booking Test User', $2, now()) RETURNING id`,
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

async function seedCity(
  fixture: DatabaseFixture,
  name: string,
): Promise<{ id: string; timezone: string }> {
  const city = await fixture.migrationPool.query<{ id: string; timezone: string }>(
    `INSERT INTO cities(name, region, country, timezone)
     VALUES ($1, 'MH', 'IN', 'Asia/Kolkata') RETURNING id, timezone`,
    [name],
  );
  return city.rows[0] as { id: string; timezone: string };
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * HOUR).toISOString().slice(0, 10);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface ApprovedDriver {
  driverId: string;
  userId: string;
}

async function seedApprovedDriver(
  fixture: DatabaseFixture,
  input: {
    userId: string;
    cityId: string;
    licenseNumber: string;
    hourlyRateMinor?: number;
    licenseExpiresOn?: string;
  },
): Promise<ApprovedDriver> {
  const licenseExpiresOn = input.licenseExpiresOn ?? isoDate(365);
  const driver = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
       license_country, license_expires_on, city_id, hourly_rate_minor)
     VALUES ($1, 'cipher', $2, 'IN', $3, $4, $5) RETURNING id`,
    [
      input.userId,
      digest(`license:${input.licenseNumber}`),
      licenseExpiresOn,
      input.cityId,
      input.hourlyRateMinor ?? 50000,
    ],
  );
  const driverId = driver.rows[0]?.id as string;
  const request = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO verification_requests(driver_id, revision, subject_version, status, submitted_by, submitted_at, decided_at)
     VALUES ($1, 1, 1, 'APPROVED', $2, now(), now()) RETURNING id`,
    [driverId, input.userId],
  );
  const verificationId = request.rows[0]?.id as string;
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
  const future = new Date(Date.now() + 7 * 24 * HOUR);
  await fixture.runtimePool.query(
    `INSERT INTO availability_windows(driver_id, kind, starts_at, ends_at)
     VALUES ($1, 'AVAILABLE', now(), $2)`,
    [driverId, future],
  );
  return { driverId, userId: input.userId };
}

async function seedApprovedVehicle(
  fixture: DatabaseFixture,
  input: { ownerId: string; cityId: string; seats?: number; registration: string },
): Promise<string> {
  const vehicle = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2021, 'HATCHBACK', $3, 'MANUAL', 'PETROL', $4)
     RETURNING id`,
    [input.ownerId, digest(`vehicle:${input.registration}`), input.seats ?? 5, input.cityId],
  );
  const vehicleId = vehicle.rows[0]?.id as string;
  const request = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO verification_requests(vehicle_id, revision, subject_version, status, submitted_by, submitted_at, decided_at)
     VALUES ($1, 1, 1, 'APPROVED', $2, now(), now()) RETURNING id`,
    [vehicleId, input.ownerId],
  );
  const verificationId = request.rows[0]?.id as string;
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

function quoteInput(input: {
  vehicleId: string;
  driverId: string;
  destinationCityId: string;
  originCityId: string;
  startsAt: Date;
  hours?: number;
  passengers?: number;
  service?: string;
}): Record<string, unknown> {
  return {
    service: input.service ?? 'DRIVER_HIRE',
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    startsAt: input.startsAt.toISOString(),
    endsAt: new Date(input.startsAt.getTime() + (input.hours ?? 2) * HOUR).toISOString(),
    originCityId: input.originCityId,
    destinationCityId: input.destinationCityId,
    passengers: input.passengers ?? 1,
  };
}

async function createQuote(
  app: ReturnType<typeof createApp>,
  token: string,
  body: Record<string, unknown>,
) {
  return auth(app, token).post('/api/v1/booking-quotes').send(body);
}

function createBooking(
  app: ReturnType<typeof createApp>,
  token: string,
  quoteId: string,
  key: string,
) {
  return auth(app, token).post('/api/v1/bookings').set('Idempotency-Key', key).send({ quoteId });
}

function newKey(label: string): string {
  return `${label}-${randomUUID()}`;
}

async function heldRows(fixture: DatabaseFixture, bookingId: string): Promise<number> {
  const rows = await fixture.runtimePool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM resource_reservations
     WHERE booking_id=$1 AND released_at IS NULL`,
    [bookingId],
  );
  return Number(rows.rows[0]?.n ?? '0');
}

interface BookingFixture {
  passengerEmail: string;
  passengerId: string;
  driverEmail: string;
  driverId: string;
  vehicleId: string;
  originId: string;
  destinationId: string;
}

async function seedBookingFixture(
  fixture: DatabaseFixture,
  options: { vehicleSeats?: number } = {},
): Promise<BookingFixture> {
  const origin = await seedCity(fixture, 'Pune');
  const destination = await seedCity(fixture, 'Mumbai');
  const passengerId = await seedAccount(fixture, 'book-pax@example.com');
  const driverUserId = await seedAccount(fixture, 'book-driver@example.com', [
    'PASSENGER',
    'DRIVER',
  ]);
  const driver = await seedApprovedDriver(fixture, {
    userId: driverUserId,
    cityId: origin.id,
    licenseNumber: 'MH12-2020-0001',
  });
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: passengerId,
    cityId: origin.id,
    registration: 'MH12-AB-1234',
    ...(options.vehicleSeats === undefined ? {} : { seats: options.vehicleSeats }),
  });
  return {
    passengerEmail: 'book-pax@example.com',
    passengerId,
    driverEmail: 'book-driver@example.com',
    driverId: driver.driverId,
    vehicleId,
    originId: origin.id,
    destinationId: destination.id,
  };
}

async function validQuote(
  fixture: DatabaseFixture,
  app: ReturnType<typeof createApp>,
  token: string,
  s: BookingFixture,
  options: { startsAt?: Date; hours?: number } = {},
): Promise<string> {
  const response = await createQuote(
    app,
    token,
    quoteInput({
      vehicleId: s.vehicleId,
      driverId: s.driverId,
      originCityId: s.originId,
      destinationCityId: s.destinationId,
      startsAt: options.startsAt ?? nextBookingStart(),
      ...(options.hours === undefined ? {} : { hours: options.hours }),
    }),
  );
  expect(response.status).toBe(201);
  expect(QuoteSchema.safeParse(response.body.data).success).toBe(true);
  return response.body.data.id as string;
}

function expectBookingContract(response: { body: unknown }): void {
  const data = (response.body as { data?: unknown }).data;
  expect(BookingSchema.safeParse(data).success).toBe(true);
}

describe('Milestone05 Task1: resource locking, quotes and idempotent booking creation', () => {
  it('foreign_vehicle404_self_hire403', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      await seedAccount(fixture, 'book-other@example.com');
      const ownDriver = await seedApprovedDriver(fixture, {
        userId: s.passengerId,
        cityId: s.originId,
        licenseNumber: 'MH12-2020-9999',
      });
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const other = await login(app, 'book-other@example.com');

      const foreign = await createQuote(
        app,
        other,
        quoteInput({
          vehicleId: s.vehicleId,
          driverId: s.driverId,
          originCityId: s.originId,
          destinationCityId: s.destinationId,
          startsAt: nextBookingStart(),
        }),
      );
      expect(foreign.status).toBe(404);

      const selfHire = await createQuote(
        app,
        passenger,
        quoteInput({
          vehicleId: s.vehicleId,
          driverId: ownDriver.driverId,
          originCityId: s.originId,
          destinationCityId: s.destinationId,
          startsAt: nextBookingStart(),
        }),
      );
      expect(selfHire.status).toBe(403);
    });
  }, 60000);

  it('service_modes_other_than_DRIVER_HIRE422', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);

      const response = await createQuote(
        app,
        passenger,
        quoteInput({
          vehicleId: s.vehicleId,
          driverId: s.driverId,
          originCityId: s.originId,
          destinationCityId: s.destinationId,
          startsAt: nextBookingStart(),
          service: 'INSTANT',
        }),
      );
      expect(response.status).toBe(422);
    });
  }, 60000);

  it('quote_stale_rate409', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await validQuote(fixture, app, passenger, s);

      await fixture.runtimePool.query(
        `UPDATE driver_profiles
         SET hourly_rate_minor = hourly_rate_minor + 10000, version = version + 1
         WHERE id=$1`,
        [s.driverId],
      );
      const response = await createBooking(app, passenger, quoteId, newKey('stale-rate'));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('QUOTE_STALE');

      const persisted = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings',
      );
      expect(persisted.rows[0]?.n).toBe('0');
      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations',
      );
      expect(holds.rows[0]?.n).toBe('0');
    });
  }, 90000);

  it('quote_expired409', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await validQuote(fixture, app, passenger, s);

      await fixture.migrationPool.query(
        "UPDATE booking_quotes SET expires_at = now() - interval '1 second' WHERE id=$1",
        [quoteId],
      );
      const response = await createBooking(app, passenger, quoteId, newKey('expired'));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('QUOTE_EXPIRED');

      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations',
      );
      expect(holds.rows[0]?.n).toBe('0');
    });
  }, 90000);

  it('overlapping_create_exactly_one_commit', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const start = nextBookingStart();
      const firstQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: start,
        hours: 3,
      });
      const secondQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: new Date(start.getTime() + HOUR),
        hours: 3,
      });

      const [first, second] = await Promise.all([
        createBooking(app, passenger, firstQuote, newKey('overlap-a')),
        createBooking(app, passenger, secondQuote, newKey('overlap-b')),
      ]);
      const responses = [first, second];
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const winner = responses.find((response) => response.status === 201);
      const loser = responses.find((response) => response.status === 409);
      expect(loser?.body.error.code).toBe('RESOURCE_CONFLICT');
      expectBookingContract(winner as { body: unknown });
      const winningId = winner?.body.data.id as string;
      const held = await heldRows(fixture, winningId);
      expect(held).toBe(2);
      const bookings = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings',
      );
      expect(bookings.rows[0]?.n).toBe('1');
    });
  }, 90000);

  it('adjacent_intervals_both_commit', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const start = nextBookingStart();
      const firstQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: start,
        hours: 2,
      });
      const secondQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: new Date(start.getTime() + 2 * HOUR),
        hours: 2,
      });

      const first = await createBooking(app, passenger, firstQuote, newKey('adjacent-a'));
      const second = await createBooking(app, passenger, secondQuote, newKey('adjacent-b'));
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expectBookingContract(first);
      expectBookingContract(second);
      expect(first.body.data.id).not.toBe(second.body.data.id);
      expect(await heldRows(fixture, first.body.data.id as string)).toBe(2);
      expect(await heldRows(fixture, second.body.data.id as string)).toBe(2);
      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations WHERE released_at IS NULL',
      );
      expect(holds.rows[0]?.n).toBe('4');
    });
  }, 90000);

  it('same_key_same_body_same_id', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await validQuote(fixture, app, passenger, s);
      const key = newKey('replay');

      const first = await createBooking(app, passenger, quoteId, key);
      expect(first.status).toBe(201);
      expectBookingContract(first);
      const replay = await createBooking(app, passenger, quoteId, key);
      expect(replay.status).toBe(201);
      expectBookingContract(replay);
      expect(replay.body.data.id).toBe(first.body.data.id);

      const bookings = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings',
      );
      expect(bookings.rows[0]?.n).toBe('1');
      expect(await heldRows(fixture, first.body.data.id as string)).toBe(2);
      const idempotency = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM idempotency_keys',
      );
      expect(idempotency.rows[0]?.n).toBe('1');
    });
  }, 90000);

  it('same_key_different_body409', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const start = nextBookingStart();
      const firstQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: start,
        hours: 2,
      });
      const secondQuote = await validQuote(fixture, app, passenger, s, {
        startsAt: new Date(start.getTime() + 2 * HOUR),
        hours: 2,
      });
      const key = newKey('mismatch');

      const first = await createBooking(app, passenger, firstQuote, key);
      expect(first.status).toBe(201);
      expectBookingContract(first);
      const mismatch = await createBooking(app, passenger, secondQuote, key);
      expect(mismatch.status).toBe(409);
      expect(mismatch.body.error.code).toBe('IDEMPOTENCY_MISMATCH');

      const bookings = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings',
      );
      expect(bookings.rows[0]?.n).toBe('1');
    });
  }, 90000);

  it('injected_child_failure_leaves_no_holds', async () => {
    await withTestDatabase(async (fixture) => {
      const s = await seedBookingFixture(fixture);
      const app = buildApp();
      const passenger = await login(app, s.passengerEmail);
      const quoteId = await validQuote(fixture, app, passenger, s);
      const key = newKey('rollback');

      await fixture.migrationPool.query(`
        CREATE OR REPLACE FUNCTION test_injected_booking_child_failure() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected child failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_injected_booking_child_failure_trg
          BEFORE INSERT ON trip_status_history
          FOR EACH ROW EXECUTE FUNCTION test_injected_booking_child_failure();
      `);
      try {
        const response = await createBooking(app, passenger, quoteId, key);
        expect(response.status).toBe(500);
      } finally {
        await fixture.migrationPool.query(
          'DROP TRIGGER IF EXISTS test_injected_booking_child_failure_trg ON trip_status_history',
        );
        await fixture.migrationPool.query(
          'DROP FUNCTION IF EXISTS test_injected_booking_child_failure()',
        );
      }

      const booking = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM bookings WHERE quote_id=$1',
        [quoteId],
      );
      expect(booking.rows[0]?.n).toBe('0');
      const decisions = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM booking_decisions',
      );
      expect(decisions.rows[0]?.n).toBe('0');
      const trips = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM trips',
      );
      expect(trips.rows[0]?.n).toBe('0');
      const holds = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM resource_reservations',
      );
      expect(holds.rows[0]?.n).toBe('0');
      const idempotency = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM idempotency_keys WHERE key=$1',
        [key],
      );
      expect(idempotency.rows[0]?.n).toBe('0');
    });
  }, 90000);
});
