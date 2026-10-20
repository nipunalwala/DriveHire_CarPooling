import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, expect } from 'vitest';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import type { DatabaseFixture } from '../../test/database-fixture.js';
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
export const prisma = createPrisma(databaseUrl);
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

export function buildApp() {
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
  });
}

export function auth(app: ReturnType<typeof createApp>, token: string) {
  const base = request(app);
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', bearer),
    post: (path: string) => base.post(path).set('Authorization', bearer),
  };
}

export async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

export async function seedAccount(
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

export async function seedCity(
  fixture: DatabaseFixture,
  name: string,
  timezone = 'Asia/Kolkata',
): Promise<{ id: string; timezone: string }> {
  const city = await fixture.migrationPool.query<{ id: string; timezone: string }>(
    `INSERT INTO cities(name, region, country, timezone)
     VALUES ($1, 'MH', 'IN', $2) RETURNING id, timezone`,
    [name, timezone],
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

export async function seedApprovedDriver(
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

export async function seedApprovedVehicle(
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
