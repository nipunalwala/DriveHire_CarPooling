import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createClamAvScan } from '../../adapters/clamav-scan.js';
import { createPrivateStorage, toAsyncIterable } from '../../adapters/private-storage.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import type { ScanAdapter } from '../../ports.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const JWT_SECRET = randomBytes(32).toString('base64url');
const OUTBOX_KEY = randomBytes(32).toString('base64url');
const APP_ORIGIN = 'http://localhost:5173';
// The dedicated backend integration ClamAV target (compose.test.yml, 13310).
const SCAN_PORT = 13310;
const PASSWORD = 'CorrectHorse1!';

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
const storageRoot = mkdtempSync(join(tmpdir(), 'drivehire-providers-'));
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
/** Real adapter surface that fails transport-closed, never a fake success. */
const failingScanner: ScanAdapter = {
  async scan() {
    throw new Error('SCANNER_UNAVAILABLE');
  },
};

function buildApp(scanner: ScanAdapter = realScanner) {
  const storage = createPrivateStorage({ root: config.storagePrivateRoot });
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
    providers: { storage, scanner },
  });
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const CLEAN_PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'ascii');
// Stock ClamAV detects EICAR only as an exact whole-file hash, so it cannot be
// embedded inside an allowlisted image/PDF. The dedicated test scanner loads
// `docker/clamav/drivehire-test.ndb`, a benign content signature, so a real
// scanner rejection can be proven end-to-end with a format-valid carrier.
const MALWARE_MARKER = 'DRIVEHIRE-MALWARE-MARKER';
const MALWARE_PDF = Buffer.from(`%PDF-1.4\n${MALWARE_MARKER}\n%%EOF\n`, 'ascii');

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Real PNG structure carrying a tEXt metadata chunk with a secret marker. */
const PNG_WITH_METADATA = Buffer.concat([
  PNG_SIGNATURE,
  chunk('IHDR', Buffer.alloc(13)),
  chunk('tEXt', Buffer.from('Author\0EVIDENCE-SECRET-MARKER', 'latin1')),
  chunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
  chunk('IEND', Buffer.alloc(0)),
]);
/** Real JPEG structure carrying an APP1/EXIF segment with a secret marker. */
const JPEG_WITH_METADATA = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe1, 0x00, 0x10]),
  Buffer.from('EXIF-SECRET-42', 'latin1'),
  Buffer.from([0xff, 0xda, 0x00, 0x04]),
  Buffer.from([0x00, 0x11, 0x22, 0x33]),
  Buffer.from([0xff, 0xd9]),
]);
const SECRET_MARKER = Buffer.from('SECRET');

function binaryParser(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (value: Buffer) => chunks.push(Buffer.from(value)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

function auth(app: ReturnType<typeof createApp>, token: string) {
  const base = request(app);
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', bearer),
    post: (path: string) => base.post(path).set('Authorization', bearer),
    put: (path: string) => base.put(path).set('Authorization', bearer),
    delete: (path: string) => base.delete(path).set('Authorization', bearer),
  };
}

async function getBinary(app: ReturnType<typeof createApp>, path: string, token: string) {
  return auth(app, token)
    .get(path)
    .buffer(true)
    .parse(binaryParser as never);
}

function upload(
  app: ReturnType<typeof createApp>,
  path: string,
  token: string,
  file: { kind: string; filename: string; contentType: string; body: Buffer; expiresOn?: string },
) {
  let agent = auth(app, token).post(path).field('kind', file.kind);
  if (file.expiresOn) agent = agent.field('expiresOn', file.expiresOn);
  return agent.attach('file', file.body, {
    filename: file.filename,
    contentType: file.contentType,
  });
}

async function seedAccount(
  fixture: DatabaseFixture,
  email: string,
  roles: string[] = [],
): Promise<string> {
  const passwordHash = await argon2Hash(PASSWORD);
  const user = await fixture.runtimePool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Qualification User', $2, now()) RETURNING id`,
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

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

async function seedCity(fixture: DatabaseFixture): Promise<string> {
  const city = await fixture.migrationPool.query<{ id: string }>(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Pune', 'MH', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  return city.rows[0]?.id as string;
}

function futureDate(days = 365): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function driverInput(cityId: string, overrides: Record<string, unknown> = {}) {
  return {
    licenseNumber: 'KA01-2020-0001',
    licenseCountry: 'IN',
    licenseExpiresOn: futureDate(),
    serviceCityId: cityId,
    hourlyRateMinor: 50000,
    ...overrides,
  };
}

function vehicleInput(cityId: string, registrationNumber: string, version?: number) {
  return {
    registrationNumber,
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    category: 'HATCHBACK',
    seats: 4,
    transmission: 'MANUAL',
    fuelType: 'PETROL',
    cityId,
    ...(version !== undefined ? { version } : {}),
  };
}

describe('Milestone04 Task1: private evidence and qualification services', () => {
  it('foreign_file_and_vehicle404', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't1-owner@example.com', ['DRIVER']);
      await seedAccount(fixture, 't1-foreign@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-owner@example.com');
      const foreign = await login(app, 't1-foreign@example.com');

      const created = await auth(app, owner)
        .post('/api/v1/vehicles')
        .send(vehicleInput(cityId, 'KA01-AA-0001'));
      expect(created.status).toBe(201);
      const vehicleId = created.body.data.id as string;

      const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'license.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.scanStatus).toBe('CLEAN');
      const documentId = uploaded.body.data.id as string;

      // Foreign account cannot read the private evidence...
      const foreignDownload = await getBinary(
        app,
        `/api/v1/documents/${documentId}/content`,
        foreign,
      );
      expect(foreignDownload.status).toBe(404);
      // ...but the owner gets the authorized clean content.
      const ownerDownload = await getBinary(app, `/api/v1/documents/${documentId}/content`, owner);
      expect(ownerDownload.status).toBe(200);
      expect(String(ownerDownload.headers['content-type'])).toContain('application/pdf');
      expect(Buffer.from(ownerDownload.body as Buffer).equals(CLEAN_PDF)).toBe(true);

      // Foreign account cannot edit or attach evidence to the vehicle.
      const foreignEdit = await auth(app, foreign)
        .put(`/api/v1/vehicles/${vehicleId}`)
        .send(vehicleInput(cityId, 'KA01-AA-0001', created.body.data.version));
      expect(foreignEdit.status).toBe(404);
      const foreignDoc = await upload(app, `/api/v1/vehicles/${vehicleId}/documents`, foreign, {
        kind: 'REGISTRATION',
        filename: 'reg.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(foreignDoc.status).toBe(404);
    });
  }, 60000);

  it('MIME_magic_spoof_rejected', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-spoof@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-spoof@example.com');

      // Declared image but PDF magic, and vice versa; both are rejected.
      const pdfAsPng = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'spoof.png',
        contentType: 'image/png',
        body: CLEAN_PDF,
      });
      expect(pdfAsPng.status).toBe(415);
      const pngAsJpeg = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'spoof.jpg',
        contentType: 'image/jpeg',
        body: PNG_WITH_METADATA,
      });
      expect(pngAsJpeg.status).toBe(415);
      const disallowed = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'script.txt',
        contentType: 'text/plain',
        body: Buffer.from('<script>alert(1)</script>', 'ascii'),
      });
      expect(disallowed.status).toBe(415);
    });
  }, 60000);

  it('size_above5MiB413', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-size@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-size@example.com');
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 1024);
      oversized.write('%PDF-', 'ascii');
      const response = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'huge.pdf',
        contentType: 'application/pdf',
        body: oversized,
      });
      expect(response.status).toBe(413);
    });
  }, 60000);

  it('quarantine_not_downloadable', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-quarantine@example.com', ['DRIVER']);
      const app = buildApp(failingScanner);
      const owner = await login(app, 't1-quarantine@example.com');

      const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'quarantine.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.scanStatus).toBe('PENDING');
      const documentId = uploaded.body.data.id as string;

      const row = await fixture.runtimePool.query<{ objectKey: string; scanStatus: string }>(
        'SELECT object_key AS "objectKey", scan_status AS "scanStatus" FROM documents WHERE id=$1',
        [documentId],
      );
      const objectKey = row.rows[0]?.objectKey as string;
      expect(row.rows[0]?.scanStatus).toBe('PENDING');
      const storage = createPrivateStorage({ root: config.storagePrivateRoot });
      expect(existsSync(storage.quarantinePath(objectKey))).toBe(true);
      expect(existsSync(storage.cleanPath(objectKey))).toBe(false);

      // A quarantined object is never downloadable, even by its owner.
      const quarantinedDownload = await getBinary(
        app,
        `/api/v1/documents/${documentId}/content`,
        owner,
      );
      expect(quarantinedDownload.status).not.toBe(200);
      expect(quarantinedDownload.status).toBe(404);
    });
  }, 60000);

  it('scanner_failure_blocks_submission', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't1-scannerdown@example.com', ['DRIVER']);
      const app = buildApp(failingScanner);
      const owner = await login(app, 't1-scannerdown@example.com');

      const profile = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(profile.status).toBe(200);
      const version = profile.body.data.version as number;

      const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'license.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.scanStatus).toBe('PENDING');

      const submitted = await auth(app, owner)
        .post('/api/v1/drivers/me/verification')
        .send({ version });
      expect(submitted.status).toBe(400);

      const requests = await fixture.runtimePool.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM verification_requests',
      );
      expect(requests.rows[0]?.n).toBe('0');
    });
  }, 60000);

  it('real_eicar_rejected', async () => {
    // The real ClamAV daemon rejects the canonical EICAR test signature.
    await expect(
      realScanner.scan(toAsyncIterable(Buffer.from(EICAR, 'ascii')), new AbortController().signal),
    ).resolves.toBe('REJECTED');

    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-eicar@example.com', ['DRIVER']);
      const app = buildApp(realScanner);
      const owner = await login(app, 't1-eicar@example.com');

      const response = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'evidence.pdf',
        contentType: 'application/pdf',
        body: MALWARE_PDF,
      });
      expect(response.status).toBe(422);

      const row = await fixture.runtimePool.query<{
        id: string;
        objectKey: string;
        scanStatus: string;
        retiredAt: Date | null;
      }>(
        'SELECT id, object_key AS "objectKey", scan_status AS "scanStatus", retired_at AS "retiredAt" FROM documents ORDER BY created_at DESC LIMIT 1',
      );
      expect(row.rows[0]?.scanStatus).toBe('REJECTED');
      expect(row.rows[0]?.retiredAt).not.toBeNull();
      const storage = createPrivateStorage({ root: config.storagePrivateRoot });
      const objectKey = row.rows[0]?.objectKey as string;
      expect(existsSync(storage.cleanPath(objectKey))).toBe(false);
      expect(existsSync(storage.quarantinePath(objectKey))).toBe(false);

      // Rejected malware is never downloadable, even by its uploader.
      const download = await getBinary(
        app,
        `/api/v1/documents/${row.rows[0]?.id as string}/content`,
        owner,
      );
      expect(download.status).not.toBe(200);
      expect(download.status).toBe(404);
    });
  }, 60000);

  it('material_edit_with_hold409', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedAccount(fixture, 't1-hold@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-hold@example.com');

      const profile = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(profile.status).toBe(200);
      const version = profile.body.data.version as number;

      const driver = await fixture.runtimePool.query<{ id: string }>(
        'SELECT id FROM driver_profiles WHERE user_id=$1',
        [userId],
      );
      const driverId = driver.rows[0]?.id as string;
      const block = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO availability_windows(driver_id, kind, starts_at, ends_at)
           VALUES ($1, 'BLOCKED', now() + interval '1 hour', now() + interval '3 hours') RETURNING id`,
        [driverId],
      );
      await fixture.runtimePool.query(
        `INSERT INTO resource_reservations(driver_id, availability_block_id, starts_at, ends_at)
           VALUES ($1, $2, now() + interval '1 hour', now() + interval '3 hours')`,
        [driverId, block.rows[0]?.id as string],
      );

      const material = await auth(app, owner)
        .put('/api/v1/drivers/me')
        .send(driverInput(cityId, { licenseNumber: 'KA01-2020-9999', version }));
      expect(material.status).toBe(409);
      expect(material.body.error.code).toBe('CONFLICT');
    });
  }, 60000);

  it('expired_approval_unusable_even_if_worker_paused', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedAccount(fixture, 't1-expired@example.com', ['DRIVER']);
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      const driver = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
             license_country, license_expires_on, city_id, hourly_rate_minor, verification_status, accepting_bookings)
           VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000, 'APPROVED', true) RETURNING id`,
        [userId, 'expired-digest-1', yesterday, cityId],
      );
      const driverId = driver.rows[0]?.id as string;
      const app = buildApp();

      // Even though the qualification worker has not run, the stale approval
      // is already unusable for public discovery.
      const search = await request(app).get('/api/v1/drivers');
      expect(search.status).toBe(200);
      expect(search.body.data.some((row: { id: string }) => row.id === driverId)).toBe(false);
      const detail = await request(app).get(`/api/v1/drivers/${driverId}`);
      expect(detail.status).toBe(404);

      const persisted = await fixture.runtimePool.query<{ status: string }>(
        'SELECT verification_status AS status FROM driver_profiles WHERE id=$1',
        [driverId],
      );
      // Worker paused: the row still reads APPROVED, yet is not discoverable.
      expect(persisted.rows[0]?.status).toBe('APPROVED');
    });
  }, 60000);

  it('stale_submit_version409', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't1-stale@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-stale@example.com');

      const created = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(created.status).toBe(200);
      const staleVersion = created.body.data.version as number;
      // A non-material edit (rate change) still advances the profile version.
      const edited = await auth(app, owner)
        .put('/api/v1/drivers/me')
        .send(driverInput(cityId, { hourlyRateMinor: 60000, version: staleVersion }));
      expect(edited.status).toBe(200);
      const current = edited.body.data.version as number;
      expect(current).toBeGreaterThan(staleVersion);

      const license = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'license.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(license.status).toBe(201);

      // A stale subject version can never snapshot newer qualification state.
      const stale = await auth(app, owner)
        .post('/api/v1/drivers/me/verification')
        .send({ version: staleVersion });
      expect(stale.status).toBe(409);
      const fresh = await auth(app, owner)
        .post('/api/v1/drivers/me/verification')
        .send({ version: current });
      expect(fresh.status).toBe(201);
    });
  }, 60000);

  it('image_metadata_stripped_on_upload', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-metadata@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-metadata@example.com');

      const png = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'id.png',
        contentType: 'image/png',
        body: PNG_WITH_METADATA,
      });
      expect(png.status).toBe(201);
      const pngContent = await getBinary(
        app,
        `/api/v1/documents/${png.body.data.id as string}/content`,
        owner,
      );
      expect(pngContent.status).toBe(200);
      const pngBytes = Buffer.from(pngContent.body as Buffer);
      expect(pngBytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(pngBytes.includes(Buffer.from('tEXt'))).toBe(false);
      expect(pngBytes.includes(Buffer.from('EVIDENCE-SECRET-MARKER'))).toBe(false);
      expect(pngBytes.includes(SECRET_MARKER)).toBe(false);

      const jpeg = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'id.jpg',
        contentType: 'image/jpeg',
        body: JPEG_WITH_METADATA,
      });
      expect(jpeg.status).toBe(201);
      const jpegContent = await getBinary(
        app,
        `/api/v1/documents/${jpeg.body.data.id as string}/content`,
        owner,
      );
      expect(jpegContent.status).toBe(200);
      const jpegBytes = Buffer.from(jpegContent.body as Buffer);
      expect(jpegBytes.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);
      expect(jpegBytes.includes(Buffer.from('EXIF-SECRET-42'))).toBe(false);
      expect(jpegBytes.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
    });
  }, 60000);
});
