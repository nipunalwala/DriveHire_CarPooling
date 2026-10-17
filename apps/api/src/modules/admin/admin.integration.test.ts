import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createClamAvScan } from '../../adapters/clamav-scan.js';
import { createPrivateStorage } from '../../adapters/private-storage.js';
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
const SCAN_PORT = 13310;
const PASSWORD = 'CorrectHorse1!';
const CLEAN_PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'ascii');

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
const storageRoot = mkdtempSync(join(tmpdir(), 'drivehire-admin-'));
afterAll(async () => {
  await prisma.$disconnect();
  rmSync(storageRoot, { recursive: true, force: true });
});

const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  APP_ORIGIN,
  CORS_ORIGINS: APP_ORIGIN,
  AUTH_JWT_SECRET: JWT_SECRET,
  AUTH_OUTBOX_KEY: OUTBOX_KEY,
  SCAN_HOST: '127.0.0.1',
  SCAN_PORT: String(SCAN_PORT),
  STORAGE_PRIVATE_ROOT: storageRoot,
});

const scanner = createClamAvScan(config.scan);

function buildApp() {
  const storage = createPrivateStorage({ root: config.storagePrivateRoot });
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
    providers: { storage, scanner },
    admin: { prisma },
  });
}

function auth(app: ReturnType<typeof createApp>, token: string) {
  const base = request(app);
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', bearer),
    post: (path: string) => base.post(path).set('Authorization', bearer),
    patch: (path: string) => base.patch(path).set('Authorization', bearer),
    put: (path: string) => base.put(path).set('Authorization', bearer),
    delete: (path: string) => base.delete(path).set('Authorization', bearer),
  };
}

async function seedAccount(
  fixture: DatabaseFixture,
  email: string,
  roles: string[] = [],
): Promise<string> {
  const passwordHash = await argon2Hash(PASSWORD);
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Admin Test User', $2, now()) RETURNING id`,
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

async function seedCity(fixture: DatabaseFixture, name = 'Pune'): Promise<string> {
  const city = await fixture.migrationPool.query<{ id: string }>(
    "INSERT INTO cities(name, region, country, timezone) VALUES ($1, 'MH', 'IN', 'Asia/Kolkata') RETURNING id",
    [name],
  );
  return city.rows[0]?.id as string;
}

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function futureDate(days = 365): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function driverInput(cityId: string, overrides: { version?: number; licenseNumber?: string } = {}) {
  return {
    licenseNumber: overrides.licenseNumber ?? 'KA01-2020-0001',
    licenseCountry: 'IN',
    licenseExpiresOn: futureDate(),
    serviceCityId: cityId,
    hourlyRateMinor: 50000,
    ...(overrides.version !== undefined ? { version: overrides.version } : {}),
  };
}

function uploadLicense(app: ReturnType<typeof createApp>, token: string, name = 'license.pdf') {
  return auth(app, token)
    .post('/api/v1/drivers/me/documents')
    .field('kind', 'LICENSE')
    .attach('file', CLEAN_PDF, { filename: name, contentType: 'application/pdf' });
}

async function submitDriverVerification(
  app: ReturnType<typeof createApp>,
  fixture: DatabaseFixture,
  email: string,
  cityId: string,
  licenseNumber?: string,
): Promise<{ token: string; userId: string; verificationId: string; version: number }> {
  const userId = await seedAccount(fixture, email, ['DRIVER']);
  const token = await login(app, email);
  const profile = await auth(app, token)
    .put('/api/v1/drivers/me')
    .send(driverInput(cityId, licenseNumber ? { licenseNumber } : {}));
  expect(profile.status).toBe(200);
  const license = await uploadLicense(app, token);
  expect(license.status).toBe(201);
  const submitted = await auth(app, token)
    .post('/api/v1/drivers/me/verification')
    .send({ version: profile.body.data.version as number });
  expect(submitted.status).toBe(201);
  return {
    token,
    userId,
    verificationId: submitted.body.data.id as string,
    version: submitted.body.data.version as number,
  };
}

async function seedBookingHold(
  fixture: DatabaseFixture,
  input: {
    passengerId: string;
    driverId: string;
    vehicleId: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<void> {
  const cityA = await seedCity(fixture, 'Origin City');
  const cityB = await seedCity(fixture, 'Destination City');
  const quote = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version,
        driver_version, starts_at, ends_at, origin_city_id, destination_city_id, passengers,
        billable_hours, driver_rate_minor, driver_subtotal_minor, total_minor, expires_at)
       VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 1, 50000, 50000, 50000,
        now() + interval '1 hour') RETURNING id`,
    [
      input.passengerId,
      input.vehicleId,
      input.driverId,
      input.startsAt,
      input.endsAt,
      cityA,
      cityB,
    ],
  );
  const booking = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO bookings(quote_id, passenger_id, vehicle_id, driver_id, service, status,
        starts_at, ends_at, total_minor, expires_at)
       VALUES ($1, $2, $3, $4, 'DRIVER_HIRE', 'CONFIRMED', $5, $6, 50000, now() + interval '1 hour')
       RETURNING id`,
    [
      quote.rows[0]?.id as string,
      input.passengerId,
      input.vehicleId,
      input.driverId,
      input.startsAt,
      input.endsAt,
    ],
  );
  await fixture.runtimePool.query(
    `INSERT INTO resource_reservations(booking_id, driver_id, starts_at, ends_at)
       VALUES ($1, $2, $3, $4)`,
    [booking.rows[0]?.id as string, input.driverId, input.startsAt, input.endsAt],
  );
}

const DECISION_REASON = 'Reviewed against the submitted qualification evidence.';

describe('Milestone04 Task2: minimal administrator APIs and evidence review', () => {
  it('foreign_role403', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't2-passenger@example.com', ['PASSENGER']);
      const app = buildApp();
      const passenger = await login(app, 't2-passenger@example.com');

      const users = await auth(app, passenger).get('/api/v1/admin/users');
      expect(users.status).toBe(403);
      const verifications = await auth(app, passenger).get('/api/v1/admin/verifications');
      expect(verifications.status).toBe(403);
      const audits = await auth(app, passenger).get('/api/v1/admin/audit-logs');
      expect(audits.status).toBe(403);
    });
  }, 60000);

  it('last_admin_suspend409', async () => {
    await withTestDatabase(async (fixture) => {
      const adminId = await seedAccount(fixture, 't2-lastadmin@example.com', ['ADMIN']);
      const app = buildApp();
      const admin = await login(app, 't2-lastadmin@example.com');

      const lastAdminSuspension = await auth(app, admin)
        .post(`/api/v1/admin/users/${adminId}/suspend`)
        .send({ reason: 'Attempting to remove the sole administrator account.' });
      expect(lastAdminSuspension.status).toBe(409);

      const persisted = await fixture.runtimePool.query<{ status: string }>(
        'SELECT status FROM users WHERE id=$1',
        [adminId],
      );
      expect(persisted.rows[0]?.status).toBe('ACTIVE');
    });
  }, 60000);

  it('sensitive_read_appends_safe_audit', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't2-admin@example.com', ['ADMIN']);
      const targetId = await seedAccount(fixture, 't2-target@example.com', ['PASSENGER']);
      const app = buildApp();
      const admin = await login(app, 't2-admin@example.com');

      const read = await auth(app, admin).get(`/api/v1/admin/users/${targetId}`);
      expect(read.status).toBe(200);
      expect(read.body.data.id).toBe(targetId);

      const audit = await fixture.runtimePool.query<{
        action: string;
        actorId: string;
        subjectId: string;
        reason: string | null;
        beforeSafe: unknown;
        afterSafe: unknown;
      }>(
        `SELECT action, actor_id AS "actorId", subject_id AS "subjectId", reason,
                before_safe AS "beforeSafe", after_safe AS "afterSafe"
           FROM audit_logs WHERE action='ADMIN_USER_READ' AND subject_id=$1`,
        [targetId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]?.actorId).toBeTruthy();
      // Safe metadata only: no secrets/PII are stored in the audit row.
      expect(audit.rows[0]?.reason).toBeNull();
      expect(audit.rows[0]?.beforeSafe).toBeNull();
      expect(audit.rows[0]?.afterSafe).toBeNull();
    });
  }, 60000);

  it('stale_revision409', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't2-decider@example.com', ['ADMIN']);
      const app = buildApp();
      const admin = await login(app, 't2-decider@example.com');

      const first = await submitDriverVerification(
        app,
        fixture,
        't2-driver-a@example.com',
        cityId,
        'KA01-2020-1001',
      );
      const approved = await auth(app, admin)
        .post(`/api/v1/admin/verifications/${first.verificationId}/decision`)
        .send({ decision: 'APPROVE', version: first.version, reason: DECISION_REASON });
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');

      // Re-using the reviewed revision is a conflict, not a second decision.
      const stale = await auth(app, admin)
        .post(`/api/v1/admin/verifications/${first.verificationId}/decision`)
        .send({ decision: 'REJECT', version: first.version, reason: DECISION_REASON });
      expect(stale.status).toBe(409);

      // A material subject edit after submission invalidates the revision even
      // though the request row is still PENDING.
      const second = await submitDriverVerification(
        app,
        fixture,
        't2-driver-b@example.com',
        cityId,
        'KA01-2020-1002',
      );
      const profile = await auth(app, second.token).get('/api/v1/drivers/me');
      expect(profile.status).toBe(200);
      const edited = await auth(app, second.token)
        .put('/api/v1/drivers/me')
        .send({
          ...driverInput(cityId, { version: profile.body.data.version as number }),
          licenseNumber: 'KA01-2020-7777',
        });
      expect(edited.status).toBe(200);
      const staleEvidence = await auth(app, admin)
        .post(`/api/v1/admin/verifications/${second.verificationId}/decision`)
        .send({ decision: 'APPROVE', version: second.version, reason: DECISION_REASON });
      expect(staleEvidence.status).toBe(409);
    });
  }, 90000);

  it('self_approval403', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const app = buildApp();
      const self = await submitDriverVerification(app, fixture, 't2-selfadmin@example.com', cityId);
      // Grant ADMIN after submission so the same account can attempt review.
      await fixture.runtimePool.query(
        "INSERT INTO user_roles(user_id, role) VALUES ($1, 'ADMIN')",
        [self.userId],
      );
      const refreshed = await login(app, 't2-selfadmin@example.com');

      const selfApproval = await auth(app, refreshed)
        .post(`/api/v1/admin/verifications/${self.verificationId}/decision`)
        .send({ decision: 'APPROVE', version: self.version, reason: DECISION_REASON });
      expect(selfApproval.status).toBe(403);
    });
  }, 60000);

  it('runtime_audit_update_denied', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't2-admin2@example.com', ['ADMIN']);
      const targetId = await seedAccount(fixture, 't2-audit-target@example.com', ['PASSENGER']);
      const app = buildApp();
      const admin = await login(app, 't2-admin2@example.com');
      const read = await auth(app, admin).get(`/api/v1/admin/users/${targetId}`);
      expect(read.status).toBe(200);

      const row = await fixture.runtimePool.query<{ id: string }>(
        "SELECT id FROM audit_logs WHERE action='ADMIN_USER_READ' LIMIT 1",
      );
      const auditId = row.rows[0]?.id as string;
      await expect(
        fixture.runtimePool.query("UPDATE audit_logs SET action='TAMPERED' WHERE id=$1", [auditId]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        fixture.runtimePool.query('DELETE FROM audit_logs WHERE id=$1', [auditId]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  }, 60000);

  it('suspended_sessions_immediately_invalid', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't2-suspender@example.com', ['ADMIN']);
      const targetId = await seedAccount(fixture, 't2-suspended@example.com', ['PASSENGER']);
      const app = buildApp();
      const admin = await login(app, 't2-suspender@example.com');
      const targetToken = await login(app, 't2-suspended@example.com');

      const before = await auth(app, targetToken).get('/api/v1/users/me');
      expect(before.status).toBe(200);

      const suspended = await auth(app, admin)
        .post(`/api/v1/admin/users/${targetId}/suspend`)
        .send({ reason: 'Repeated policy violations were confirmed by support.' });
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');

      // The already-issued access token stops working on the very next request.
      const after = await auth(app, targetToken).get('/api/v1/users/me');
      expect(after.status).toBe(401);
      // Fresh sign-in is refused while suspended.
      const relogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 't2-suspended@example.com', password: PASSWORD });
      expect(relogin.status).toBe(403);
    });
  }, 60000);

  it('driver_block_overlap23P01', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't2-blocker@example.com', ['DRIVER']);
      const app = buildApp();
      const driver = await login(app, 't2-blocker@example.com');

      const start = Date.now() + 3600 * 1000;
      const firstEnd = start + 2 * 3600 * 1000;
      const secondEnd = start + 3 * 3600 * 1000;
      const window = await auth(app, driver)
        .post('/api/v1/drivers/me/availability')
        .send({
          kind: 'BLOCKED',
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(firstEnd).toISOString(),
        });
      expect(window.status).toBe(201);

      // Overlapping BLOCKED windows hold the same driver resource: the GiST
      // exclusion constraint rejects the second reservation.
      const overlap = await auth(app, driver)
        .post('/api/v1/drivers/me/availability')
        .send({
          kind: 'BLOCKED',
          startsAt: new Date(start + 3600 * 1000).toISOString(),
          endsAt: new Date(secondEnd).toISOString(),
        });
      expect(overlap.status).toBe(409);

      const reservations = await fixture.runtimePool.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM resource_reservations WHERE released_at IS NULL',
      );
      expect(reservations.rows[0]?.n).toBe('1');
    });
  }, 60000);

  it('remove_available_window_with_hold409', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const driverId = await seedAccount(fixture, 't2-hold-driver@example.com', ['DRIVER']);
      const passengerId = await seedAccount(fixture, 't2-hold-passenger@example.com', [
        'PASSENGER',
      ]);
      const app = buildApp();
      const driver = await login(app, 't2-hold-driver@example.com');
      const profile = await auth(app, driver).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(profile.status).toBe(200);

      const vehicle = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
            make, model, year, category, seats, transmission, fuel_type, city_id)
           VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2020, 'HATCHBACK', 4, 'MANUAL', 'PETROL', $3)
           RETURNING id`,
        [driverId, `hold-reg-${driverId}`, cityId],
      );
      const vehicleId = vehicle.rows[0]?.id as string;

      const start = Date.now() + 3600 * 1000;
      const end = start + 5 * 3600 * 1000;
      const window = await auth(app, driver)
        .post('/api/v1/drivers/me/availability')
        .send({
          kind: 'AVAILABLE',
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
        });
      expect(window.status).toBe(201);
      const windowId = window.body.data.id as string;

      await seedBookingHold(fixture, {
        passengerId,
        driverId: (
          await fixture.runtimePool.query<{ id: string }>(
            'SELECT id FROM driver_profiles WHERE user_id=$1',
            [driverId],
          )
        ).rows[0]?.id as string,
        vehicleId,
        startsAt: new Date(start + 3600 * 1000),
        endsAt: new Date(start + 2 * 3600 * 1000),
      });

      const removed = await auth(app, driver).delete(`/api/v1/drivers/me/availability/${windowId}`);
      expect(removed.status).toBe(409);

      // Removing a BLOCKED window releases its hold exactly once.
      const block = await auth(app, driver)
        .post('/api/v1/drivers/me/availability')
        .send({
          kind: 'BLOCKED',
          startsAt: new Date(end + 3600 * 1000).toISOString(),
          endsAt: new Date(end + 2 * 3600 * 1000).toISOString(),
        });
      expect(block.status).toBe(201);
      const release = await auth(app, driver).delete(
        `/api/v1/drivers/me/availability/${block.body.data.id as string}`,
      );
      expect(release.status).toBe(200);
      const released = await fixture.runtimePool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM resource_reservations
           WHERE availability_block_id=$1 AND released_at IS NOT NULL`,
        [block.body.data.id as string],
      );
      expect(released.rows[0]?.n).toBe('1');
      const secondDelete = await auth(app, driver).delete(
        `/api/v1/drivers/me/availability/${block.body.data.id as string}`,
      );
      expect(secondDelete.status).toBe(404);
    });
  }, 90000);
});
