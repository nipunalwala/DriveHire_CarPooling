import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createProvidersService } from './service.js';
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

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
const storageRoot = mkdtempSync(join(tmpdir(), 'drivehire-qual-boundaries-'));
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

const realScanner = createClamAvScan(config.scan);

function buildApp() {
  const storage = createPrivateStorage({ root: config.storagePrivateRoot });
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
    providers: { storage, scanner: realScanner },
  });
}

function hex64(): string {
  return randomBytes(32).toString('hex');
}

/** Real persisted account row; no login is needed for either boundary. */
async function seedUser(
  fixture: DatabaseFixture,
  email: string,
  roles: string[] = [],
): Promise<string> {
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Boundary User', 'not-used', now()) RETURNING id`,
    [email],
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

/** A real curated-style city identity; Asia/Kolkata is the subject home timezone. */
async function seedCity(fixture: DatabaseFixture): Promise<string> {
  const city = await fixture.migrationPool.query<{ id: string }>(
    `INSERT INTO cities(name, region, country, timezone)
     VALUES ('Pune', 'MH', 'IN', 'Asia/Kolkata') RETURNING id`,
  );
  return city.rows[0]?.id as string;
}

async function seedVehicle(
  fixture: DatabaseFixture,
  ownerId: string,
  cityId: string,
  status = 'APPROVED',
): Promise<string> {
  const row = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
         make, model, year, category, seats, transmission, fuel_type, city_id, verification_status)
       VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2020, 'HATCHBACK', 4, 'MANUAL', 'PETROL', $3, $4)
       RETURNING id`,
    [ownerId, hex64(), cityId, status],
  );
  return row.rows[0]?.id as string;
}

async function seedVehicleDocument(
  fixture: DatabaseFixture,
  uploaderId: string,
  vehicleId: string,
  kind: 'REGISTRATION' | 'INSURANCE',
  expiresOn: string | null,
): Promise<string> {
  const row = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO documents(uploader_id, vehicle_id, kind, object_key, content_type, byte_size,
         sha256, scan_status, expires_on)
       VALUES ($1, $2, $3, $4, 'application/pdf', 10, $5, 'CLEAN', $6) RETURNING id`,
    [uploaderId, vehicleId, kind, randomBytes(24).toString('hex'), hex64(), expiresOn],
  );
  return row.rows[0]?.id as string;
}

/**
 * Persist an APPROVED immutable verification snapshot for a vehicle and point
 * the vehicle at it, exactly as admin approval does. The linked documents are
 * the reviewed revision; uploads made later are deliberately not included.
 */
async function seedApprovedRevision(
  fixture: DatabaseFixture,
  params: { vehicleId: string; submittedBy: string; decidedBy: string; documentIds: string[] },
): Promise<string> {
  const request = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO verification_requests(vehicle_id, revision, subject_version, status,
         submitted_by, decided_by, submitted_at, decided_at)
       VALUES ($1, 1, 1, 'APPROVED', $2, $3, now() - interval '9 days', now() - interval '8 days')
       RETURNING id`,
    [params.vehicleId, params.submittedBy, params.decidedBy],
  );
  const revisionId = request.rows[0]?.id as string;
  for (const documentId of params.documentIds) {
    await fixture.runtimePool.query(
      'INSERT INTO verification_documents(verification_id, document_id) VALUES ($1, $2)',
      [revisionId, documentId],
    );
  }
  await fixture.runtimePool.query(
    'UPDATE vehicles SET current_verification_id = $1 WHERE id = $2',
    [revisionId, params.vehicleId],
  );
  return revisionId;
}

describe('Milestone04 qualification boundary gaps', () => {
  it('expiry uses the approved immutable insurance snapshot, not a newer unreviewed upload', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const ownerId = await seedUser(fixture, 'qb-snapshot-owner@example.com', ['DRIVER']);
      const adminId = await seedUser(fixture, 'qb-snapshot-admin@example.com', ['ADMIN']);

      const reviewedExpired = '2020-01-01';
      const reviewedValid = '2099-06-01';
      const unreviewedValid = '2099-01-01';

      // Subject: the approved revision reviewed an insurance that has since expired.
      const gapVehicle = await seedVehicle(fixture, ownerId, cityId);
      const gapRegistration = await seedVehicleDocument(
        fixture,
        ownerId,
        gapVehicle,
        'REGISTRATION',
        null,
      );
      const gapReviewedInsurance = await seedVehicleDocument(
        fixture,
        ownerId,
        gapVehicle,
        'INSURANCE',
        reviewedExpired,
      );
      // A newer, CLEAN, still-valid insurance exists but is not part of any revision.
      const gapUnreviewedInsurance = await seedVehicleDocument(
        fixture,
        ownerId,
        gapVehicle,
        'INSURANCE',
        unreviewedValid,
      );
      await seedApprovedRevision(fixture, {
        vehicleId: gapVehicle,
        submittedBy: ownerId,
        decidedBy: adminId,
        documentIds: [gapRegistration, gapReviewedInsurance],
      });

      // Control: an approved revision whose reviewed insurance is still valid.
      const controlVehicle = await seedVehicle(fixture, ownerId, cityId);
      const controlRegistration = await seedVehicleDocument(
        fixture,
        ownerId,
        controlVehicle,
        'REGISTRATION',
        null,
      );
      const controlInsurance = await seedVehicleDocument(
        fixture,
        ownerId,
        controlVehicle,
        'INSURANCE',
        reviewedValid,
      );
      await seedApprovedRevision(fixture, {
        vehicleId: controlVehicle,
        submittedBy: ownerId,
        decidedBy: adminId,
        documentIds: [controlRegistration, controlInsurance],
      });

      // Prove the newer upload really is newer, valid and outside every revision.
      const newer = await fixture.runtimePool.query<{ expiresOn: string; links: string }>(
        `SELECT to_char(d.expires_on, 'YYYY-MM-DD') AS "expiresOn",
                (SELECT count(*)::text FROM verification_documents vd WHERE vd.document_id = d.id)
                  AS links
         FROM documents d WHERE d.id = $1`,
        [gapUnreviewedInsurance],
      );
      expect(newer.rows[0]?.expiresOn).toBe(unreviewedValid);
      expect(newer.rows[0]?.links).toBe('0');
      expect(unreviewedValid > reviewedExpired).toBe(true);

      const service = createProvidersService({
        prisma,
        config,
        storage: createPrivateStorage({ root: config.storagePrivateRoot }),
        scanner: realScanner,
      });
      await service.expireQualifications();

      const statuses = await fixture.runtimePool.query<{ id: string; status: string }>(
        'SELECT id, verification_status AS status FROM vehicles WHERE id = ANY($1::uuid[])',
        [[gapVehicle, controlVehicle]],
      );
      const byId = new Map(statuses.rows.map((row) => [row.id, row.status]));
      // The approved snapshot governs: its reviewed insurance is expired, so the
      // vehicle is EXPIRED even though an unreviewed newer upload is valid.
      expect(byId.get(gapVehicle)).toBe('EXPIRED');
      // The valid reviewed snapshot remains APPROVED.
      expect(byId.get(controlVehicle)).toBe('APPROVED');
    });
  }, 60000);

  it('public driver search and detail reject a home-city-expired license while UTC date is still expiresOn', async () => {
    // expiresOn dayD = 2031-06-15 in the Asia/Kolkata home city. The next local
    // day at 00:30 (= 2031-06-15T19:00:00Z) is past that midnight expiry even
    // though the UTC calendar date is still dayD. The expiry worker is stopped.
    const dayD = '2031-06-15';
    const fakeNow = new Date('2031-06-15T19:00:00.000Z');

    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedUser(fixture, 'qb-tz-driver@example.com', ['DRIVER']);
      const driver = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
             license_country, license_expires_on, city_id, hourly_rate_minor,
             verification_status, accepting_bookings)
           VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000, 'APPROVED', true) RETURNING id`,
        [userId, hex64(), dayD, cityId],
      );
      const driverId = driver.rows[0]?.id as string;

      const app = buildApp();
      vi.setSystemTime(fakeNow);
      try {
        const search = await request(app).get('/api/v1/drivers');
        expect(search.status).toBe(200);
        const returned = (search.body.data as { id: string }[]).map((row) => row.id);
        expect(returned).not.toContain(driverId);
        expect(search.body.meta.total).toBe(0);

        const detail = await request(app).get(`/api/v1/drivers/${driverId}`);
        expect(detail.status).toBe(404);
      } finally {
        vi.useRealTimers();
      }

      // Worker stopped: the row still reads APPROVED yet must not be usable.
      const persisted = await fixture.runtimePool.query<{ status: string }>(
        'SELECT verification_status AS status FROM driver_profiles WHERE id = $1',
        [driverId],
      );
      expect(persisted.rows[0]?.status).toBe('APPROVED');
    });
  }, 60000);
});
