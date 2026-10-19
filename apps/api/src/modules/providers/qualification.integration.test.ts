import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { hash as argon2Hash } from '@node-rs/argon2';
import { Client } from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createProvidersService } from './service.js';
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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Decoder-valid fixtures are generated at test time with real pixel data plus a
// known EXIF marker. A hand-built synthetic PNG/JPEG is not decoder-valid, so it
// could not prove the decode/re-encode or metadata-strip behavior at all.
const EVIDENCE_METADATA_MARKER = 'EVIDENCE-SECRET-MARKER';
const POLYGLOT_TRAILER = Buffer.from('<script id="polyglot">alert(1)</script>', 'ascii');

async function imageWithMetadata(
  format: 'png' | 'jpeg' | 'webp',
  options: { width?: number; height?: number; marker?: string } = {},
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width: options.width ?? 24,
      height: options.height ?? 16,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  }).withMetadata({
    exif: { IFD0: { ImageDescription: options.marker ?? EVIDENCE_METADATA_MARKER } },
  });
  if (format === 'png') return pipeline.png().toBuffer();
  if (format === 'jpeg') return pipeline.jpeg().toBuffer();
  return pipeline.webp().toBuffer();
}

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
    patch: (path: string) => base.patch(path).set('Authorization', bearer),
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

/** Wait until `expected` backends are blocked on a lock (barrier for races). */
async function waitForLockWaiters(client: Client, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // The observing client is inside an open transaction; its statistics
    // snapshot is cached on first access, so discard it before each poll or a
    // waiter that blocks later would stay invisible (Postgres monitoring docs).
    await client.query('SELECT pg_stat_clear_snapshot()');
    const result = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
    );
    if (Number(result.rows[0]?.n ?? '0') >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expected} blocked queries`);
}

/**
 * Hold a `FOR UPDATE` lock on a row, start (but do not await) the racing
 * requests, wait until they block on that row, then release and collect them.
 * This makes the concurrent-write interleaving deterministic instead of timing
 * dependent.
 */
async function raceWithRowLock<T>(
  locks: { table: string; id: string }[],
  start: () => Promise<T>,
  expectedWaiters: number,
): Promise<T> {
  const locker = new Client({ connectionString: databaseUrl });
  await locker.connect();
  try {
    await locker.query('BEGIN');
    for (const lock of locks) {
      await locker.query(`SELECT id FROM ${lock.table} WHERE id = $1 FOR UPDATE`, [lock.id]);
    }
    const pending = start();
    await waitForLockWaiters(locker, expectedWaiters);
    await locker.query('COMMIT');
    return await pending;
  } finally {
    await locker.end().catch(() => {});
  }
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
        body: await imageWithMetadata('png'),
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

  it('image_metadata_stripped_and_reencoded_on_upload', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-metadata@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-metadata@example.com');

      for (const format of ['png', 'jpeg', 'webp'] as const) {
        const declared =
          format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        const source = await imageWithMetadata(format);
        expect(source.includes(Buffer.from(EVIDENCE_METADATA_MARKER))).toBe(true);

        const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
          kind: 'LICENSE',
          filename: `id.${format}`,
          contentType: declared,
          body: source,
        });
        expect(uploaded.status).toBe(201);
        const content = await getBinary(
          app,
          `/api/v1/documents/${uploaded.body.data.id as string}/content`,
          owner,
        );
        expect(content.status).toBe(200);
        expect(String(content.headers['content-type'])).toContain(declared);
        const bytes = Buffer.from(content.body as Buffer);

        // A real decode of the stored bytes proves they are a valid image of the
        // same format/geometry, not merely a header with metadata chunks removed.
        const meta = await sharp(bytes).metadata();
        expect(meta.format).toBe(format);
        expect(meta.width).toBe(24);
        expect(meta.height).toBe(16);
        expect(bytes.includes(Buffer.from(EVIDENCE_METADATA_MARKER))).toBe(false);
      }
    });
  }, 60000);

  it('invalid_or_corrupt_image_rejected', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-corrupt@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-corrupt@example.com');

      // Valid magic, undecodable body: the previous magic-only path accepted it.
      const corruptPng = Buffer.concat([
        PNG_SIGNATURE,
        Buffer.from('this is not a decodable png body', 'ascii'),
      ]);
      const pngResponse = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'corrupt.png',
        contentType: 'image/png',
        body: corruptPng,
      });
      expect(pngResponse.status).toBe(415);

      const corruptJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const jpegResponse = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'corrupt.jpg',
        contentType: 'image/jpeg',
        body: corruptJpeg,
      });
      expect(jpegResponse.status).toBe(415);

      const corruptWebp = Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.from([0x1a, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP', 'ascii'),
        Buffer.from('not a decodable webp body', 'ascii'),
      ]);
      const webpResponse = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'corrupt.webp',
        contentType: 'image/webp',
        body: corruptWebp,
      });
      expect(webpResponse.status).toBe(415);
    });
  }, 60000);

  it('decompression_bomb_rejected', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-bomb@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-bomb@example.com');

      // A real, decodable PNG whose pixel count exceeds the bounded decode limit
      // but whose compressed size stays under the 5 MiB upload ceiling.
      const bomb = await imageWithMetadata('png', { width: 7000, height: 7000, marker: 'BOMB' });
      expect(bomb.byteLength).toBeLessThan(5 * 1024 * 1024);

      const response = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'bomb.png',
        contentType: 'image/png',
        body: bomb,
      });
      expect(response.status).toBe(415);
    });
  }, 60000);

  it('polyglot_trailing_payload_removed', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-polyglot@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-polyglot@example.com');

      // A valid JPEG with an appended polyglot payload after EOI. Metadata-skip
      // copying would carry the trailer through; decode/re-encode must not.
      const polyglot = Buffer.concat([await imageWithMetadata('jpeg'), POLYGLOT_TRAILER]);
      const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'polyglot.jpg',
        contentType: 'image/jpeg',
        body: polyglot,
      });
      expect(uploaded.status).toBe(201);
      const content = await getBinary(
        app,
        `/api/v1/documents/${uploaded.body.data.id as string}/content`,
        owner,
      );
      expect(content.status).toBe(200);
      const bytes = Buffer.from(content.body as Buffer);
      expect(bytes.includes(POLYGLOT_TRAILER)).toBe(false);
      expect((await sharp(bytes).metadata()).format).toBe('jpeg');
    });
  }, 60000);

  it('material_edit_resolves_orphan_pending_verification', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't1-orphan@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-orphan@example.com');

      const profile = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(profile.status).toBe(200);
      const version = profile.body.data.version as number;
      const license = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'license.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(license.status).toBe(201);
      const submitted = await auth(app, owner)
        .post('/api/v1/drivers/me/verification')
        .send({ version });
      expect(submitted.status).toBe(201);
      const verificationId = submitted.body.data.id as string;

      // Submitting bumps the profile revision; a material edit must present the
      // freshly-read version so the change is accepted and invalidates review.
      const current = await auth(app, owner).get('/api/v1/drivers/me');
      expect(current.status).toBe(200);
      const edited = await auth(app, owner)
        .put('/api/v1/drivers/me')
        .send(
          driverInput(cityId, {
            licenseNumber: 'KA01-2020-4242',
            version: current.body.data.version as number,
          }),
        );
      expect(edited.status).toBe(200);

      // The superseded revision is resolved (kept as immutable history)...
      const prior = await fixture.runtimePool.query<{ status: string; reason: string | null }>(
        'SELECT status, reason FROM verification_requests WHERE id=$1',
        [verificationId],
      );
      expect(prior.rows[0]?.status).toBe('REJECTED');
      expect(prior.rows[0]?.reason).toBeTruthy();
      const links = await fixture.runtimePool.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM verification_documents WHERE verification_id=$1',
        [verificationId],
      );
      expect(links.rows[0]?.n).toBe('1');

      // ...so the corrected owner can resubmit immediately.
      const resubmit = await auth(app, owner)
        .post('/api/v1/drivers/me/verification')
        .send({ version: edited.body.data.version as number });
      expect(resubmit.status).toBe(201);
      expect(resubmit.body.data.id).not.toBe(verificationId);
    });
  }, 60000);

  it('concurrent_driver_upserts_reject_lost_update', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedAccount(fixture, 't1-race-driver@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-race-driver@example.com');
      const created = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(created.status).toBe(200);
      const version = created.body.data.version as number;
      const driver = await fixture.runtimePool.query<{ id: string }>(
        'SELECT id FROM driver_profiles WHERE user_id=$1',
        [userId],
      );
      const driverId = driver.rows[0]?.id as string;

      const responses = await raceWithRowLock(
        [{ table: 'driver_profiles', id: driverId }],
        () =>
          Promise.all([
            auth(app, owner)
              .put('/api/v1/drivers/me')
              .send(driverInput(cityId, { hourlyRateMinor: 61000, version })),
            auth(app, owner)
              .put('/api/v1/drivers/me')
              .send(driverInput(cityId, { hourlyRateMinor: 62000, version })),
          ]),
        2,
      );
      expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
      const persisted = await fixture.runtimePool.query<{ version: number }>(
        'SELECT version FROM driver_profiles WHERE id=$1',
        [driverId],
      );
      expect(persisted.rows[0]?.version).toBe(version + 1);
    });
  }, 60000);

  it('concurrent_listing_updates_reject_lost_update', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedAccount(fixture, 't1-race-listing@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-race-listing@example.com');
      // Build the profile through the real API so the encrypted license is valid
      // for the private DTO, then promote it to an approved, non-listed driver.
      const created = await auth(app, owner).put('/api/v1/drivers/me').send(driverInput(cityId));
      expect(created.status).toBe(200);
      const driver = await fixture.runtimePool.query<{ id: string }>(
        'SELECT id FROM driver_profiles WHERE user_id=$1',
        [userId],
      );
      const driverId = driver.rows[0]?.id as string;
      await fixture.runtimePool.query(
        "UPDATE driver_profiles SET verification_status='APPROVED', accepting_bookings=false WHERE id=$1",
        [driverId],
      );

      const responses = await raceWithRowLock(
        [{ table: 'driver_profiles', id: driverId }],
        () =>
          Promise.all([
            auth(app, owner)
              .patch('/api/v1/drivers/me/listing')
              .send({ enabled: true, version: 1 }),
            auth(app, owner)
              .patch('/api/v1/drivers/me/listing')
              .send({ enabled: true, version: 1 }),
          ]),
        2,
      );
      expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
      const persisted = await fixture.runtimePool.query<{
        version: number;
        acceptingBookings: boolean;
      }>(
        'SELECT version, accepting_bookings AS "acceptingBookings" FROM driver_profiles WHERE id=$1',
        [driverId],
      );
      expect(persisted.rows[0]?.version).toBe(2);
      expect(persisted.rows[0]?.acceptingBookings).toBe(true);
    });
  }, 60000);

  it('concurrent_vehicle_updates_reject_lost_update', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      await seedAccount(fixture, 't1-race-vehicle@example.com', ['PASSENGER']);
      const app = buildApp();
      const owner = await login(app, 't1-race-vehicle@example.com');

      const created = await auth(app, owner)
        .post('/api/v1/vehicles')
        .send(vehicleInput(cityId, 'KA01-AA-7777'));
      expect(created.status).toBe(201);
      const vehicleId = created.body.data.id as string;
      const version = created.body.data.version as number;

      const responses = await raceWithRowLock(
        [{ table: 'vehicles', id: vehicleId }],
        () =>
          Promise.all([
            auth(app, owner)
              .put(`/api/v1/vehicles/${vehicleId}`)
              .send({ ...vehicleInput(cityId, 'KA01-AA-7777', version), make: 'Honda' }),
            auth(app, owner)
              .put(`/api/v1/vehicles/${vehicleId}`)
              .send({ ...vehicleInput(cityId, 'KA01-AA-7777', version), make: 'Toyota' }),
          ]),
        2,
      );
      expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
      const persisted = await fixture.runtimePool.query<{ version: number }>(
        'SELECT version FROM vehicles WHERE id=$1',
        [vehicleId],
      );
      expect(persisted.rows[0]?.version).toBe(version + 1);
    });
  }, 60000);

  it('expiry_job_uses_current_valid_insurance', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const userId = await seedAccount(fixture, 't1-insurance@example.com', ['DRIVER']);
      const adminId = await seedAccount(fixture, 't1-insurance-admin@example.com', ['ADMIN']);
      const expiredOn = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const validOn = futureDate(200);

      /**
       * Persist an APPROVED vehicle whose immutable reviewed revision links the
       * given insurance. Any later upload that is not part of the revision is
       * deliberately unreviewed, exactly as a fresh owner upload would be.
       */
      async function seedApprovedVehicle(reviewedInsuranceExpiresOn: string): Promise<string> {
        const vehicle = await fixture.runtimePool.query<{ id: string }>(
          `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
               make, model, year, category, seats, transmission, fuel_type, city_id, verification_status)
             VALUES ($1, 'cipher', $2, 'Maruti', 'Swift', 2020, 'HATCHBACK', 4, 'MANUAL', 'PETROL', $3, 'APPROVED')
             RETURNING id`,
          [userId, randomBytes(32).toString('hex'), cityId],
        );
        const vehicleId = vehicle.rows[0]?.id as string;
        const insurance = await fixture.runtimePool.query<{ id: string }>(
          `INSERT INTO documents(uploader_id, vehicle_id, kind, object_key, content_type, byte_size,
               sha256, scan_status, expires_on)
             VALUES ($1, $2, 'INSURANCE', $3, 'application/pdf', 10, $4, 'CLEAN', $5) RETURNING id`,
          [
            userId,
            vehicleId,
            randomBytes(24).toString('hex'),
            randomBytes(32).toString('hex'),
            reviewedInsuranceExpiresOn,
          ],
        );
        const revision = await fixture.runtimePool.query<{ id: string }>(
          `INSERT INTO verification_requests(vehicle_id, revision, subject_version, status,
               submitted_by, decided_by, submitted_at, decided_at)
             VALUES ($1, 1, 1, 'APPROVED', $2, $3, now() - interval '9 days', now() - interval '8 days')
             RETURNING id`,
          [vehicleId, userId, adminId],
        );
        const revisionId = revision.rows[0]?.id as string;
        await fixture.runtimePool.query(
          'INSERT INTO verification_documents(verification_id, document_id) VALUES ($1, $2)',
          [revisionId, insurance.rows[0]?.id as string],
        );
        await fixture.runtimePool.query(
          'UPDATE vehicles SET current_verification_id = $1 WHERE id = $2',
          [revisionId, vehicleId],
        );
        return vehicleId;
      }
      async function seedUnreviewedInsurance(vehicleId: string, expiresOn: string): Promise<void> {
        await fixture.runtimePool.query(
          `INSERT INTO documents(uploader_id, vehicle_id, kind, object_key, content_type, byte_size,
               sha256, scan_status, expires_on)
             VALUES ($1, $2, 'INSURANCE', $3, 'application/pdf', 10, $4, 'CLEAN', $5)`,
          [
            userId,
            vehicleId,
            randomBytes(24).toString('hex'),
            randomBytes(32).toString('hex'),
            expiresOn,
          ],
        );
      }

      // Reviewed insurance still valid: a stray older expired upload must not
      // expire an approval whose immutable snapshot is valid.
      const currentValid = await seedApprovedVehicle(validOn);
      await seedUnreviewedInsurance(currentValid, expiredOn);
      // Reviewed insurance expired: a newer unreviewed upload cannot rescue it.
      const currentExpired = await seedApprovedVehicle(expiredOn);
      await seedUnreviewedInsurance(currentExpired, validOn);

      const service = createProvidersService({
        prisma,
        config,
        storage: createPrivateStorage({ root: config.storagePrivateRoot }),
        scanner: realScanner,
      });
      await service.expireQualifications();

      const statuses = await fixture.runtimePool.query<{ id: string; status: string }>(
        'SELECT id, verification_status AS status FROM vehicles WHERE id = ANY($1::uuid[])',
        [[currentValid, currentExpired]],
      );
      const byId = new Map(statuses.rows.map((row) => [row.id, row.status]));
      expect(byId.get(currentValid)).toBe('APPROVED');
      expect(byId.get(currentExpired)).toBe('EXPIRED');
    });
  }, 60000);

  it('driver_search_time_filter_paginates_true_matches', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const start = new Date(Date.now() + 30 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      // Covering windows exist for indices 0 (also blocked), 1, 22, 23, 24.
      const covered = new Set([0, 1, 22, 23, 24]);
      const ids: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const passwordHash = await argon2Hash(PASSWORD);
        const user = await fixture.runtimePool.query<{ id: string }>(
          `INSERT INTO users(email, display_name, password_hash, email_verified_at)
             VALUES ($1, $2, $3, now()) RETURNING id`,
          [`t1-search-${index}@example.com`, `Search Driver ${index}`, passwordHash],
        );
        const driver = await fixture.runtimePool.query<{ id: string }>(
          `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
               license_country, license_expires_on, city_id, hourly_rate_minor, verification_status,
               accepting_bookings, updated_at)
             VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000, 'APPROVED', true, now() - ($5 || ' minutes')::interval)
             RETURNING id`,
          [
            user.rows[0]?.id as string,
            index.toString(16).padStart(64, '0'),
            futureDate(),
            cityId,
            String(index),
          ],
        );
        const driverId = driver.rows[0]?.id as string;
        ids.push(driverId);
        if (covered.has(index)) {
          await fixture.runtimePool.query(
            `INSERT INTO availability_windows(driver_id, kind, starts_at, ends_at)
               VALUES ($1, 'AVAILABLE', now() - interval '2 hours', now() + interval '6 hours')`,
            [driverId],
          );
        }
        if (index === 0) {
          const block = await fixture.runtimePool.query<{ id: string }>(
            `INSERT INTO availability_windows(driver_id, kind, starts_at, ends_at)
               VALUES ($1, 'BLOCKED', now() - interval '2 hours', now() + interval '6 hours')
               RETURNING id`,
            [driverId],
          );
          await fixture.runtimePool.query(
            `INSERT INTO resource_reservations(driver_id, availability_block_id, starts_at, ends_at)
               VALUES ($1, $2, now() - interval '1 hour', now() + interval '2 hours')`,
            [driverId, block.rows[0]?.id as string],
          );
        }
      }
      const app = buildApp();
      const response = await request(app).get('/api/v1/drivers').query({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        pageSize: '20',
      });
      expect(response.status).toBe(200);
      // 25 drivers qualify as drivers, but only 4 are free for the window; the
      // count/pagination must reflect the true matches (indices 22-24 sit beyond
      // the first 20-row slice yet remain reachable).
      expect(response.body.meta.total).toBe(4);
      const returned = (response.body.data as { id: string }[]).map((row) => row.id);
      expect(returned).toHaveLength(4);
      expect([...returned].sort()).toEqual([ids[1], ids[22], ids[23], ids[24]].sort());

      const invalid = await request(app)
        .get('/api/v1/drivers')
        .query({ startsAt: 'not-a-date', endsAt: 'also-not-a-date' });
      expect(invalid.status).toBe(400);
    });
  }, 60000);

  it('verification_reason_is_owner_private_only', async () => {
    await withTestDatabase(async (fixture) => {
      const cityId = await seedCity(fixture);
      const adminId = await seedAccount(fixture, 't1-reason-admin@example.com', ['ADMIN']);
      const driverUserId = await seedAccount(fixture, 't1-reason-driver@example.com', ['DRIVER']);
      const ownerUserId = await seedAccount(fixture, 't1-reason-owner@example.com', ['PASSENGER']);
      // A normal approved driver proves the public DTOs stay reason-free.
      const publicUserId = await seedAccount(fixture, 't1-reason-public@example.com', ['DRIVER']);
      const app = buildApp();
      const driverToken = await login(app, 't1-reason-driver@example.com');
      const ownerToken = await login(app, 't1-reason-owner@example.com');

      // Rejected driver: the persisted administrator reason is owner-private.
      const profile = await auth(app, driverToken)
        .put('/api/v1/drivers/me')
        .send(driverInput(cityId));
      expect(profile.status).toBe(200);
      const driverRow = await fixture.runtimePool.query<{ id: string }>(
        'SELECT id FROM driver_profiles WHERE user_id=$1',
        [driverUserId],
      );
      const driverId = driverRow.rows[0]?.id as string;
      const driverReason = 'License image is unreadable; upload a clearer scan.';
      const driverRevision = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO verification_requests(driver_id, revision, subject_version, status,
             submitted_by, decided_by, submitted_at, decided_at, reason)
           VALUES ($1, 1, 1, 'REJECTED', $2, $3, now() - interval '2 days',
             now() - interval '1 day', $4) RETURNING id`,
        [driverId, driverUserId, adminId, driverReason],
      );
      await fixture.runtimePool.query(
        `UPDATE driver_profiles SET current_verification_id=$1, verification_status='REJECTED'
           WHERE id=$2`,
        [driverRevision.rows[0]?.id, driverId],
      );

      const mine = await auth(app, driverToken).get('/api/v1/drivers/me');
      expect(mine.status).toBe(200);
      expect(mine.body.data.verificationReason).toBe(driverReason);

      // Rejected vehicle: same owner-private-only reason on the owner list.
      const vehicle = await auth(app, ownerToken)
        .post('/api/v1/vehicles')
        .send(vehicleInput(cityId, 'KA01-RR-0001'));
      expect(vehicle.status).toBe(201);
      const vehicleId = vehicle.body.data.id as string;
      const vehicleReason = 'Insurance certificate does not match the registration.';
      const vehicleRevision = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO verification_requests(vehicle_id, revision, subject_version, status,
             submitted_by, decided_by, submitted_at, decided_at, reason)
           VALUES ($1, 1, 1, 'REJECTED', $2, $3, now() - interval '2 days',
             now() - interval '1 day', $4) RETURNING id`,
        [vehicleId, ownerUserId, adminId, vehicleReason],
      );
      await fixture.runtimePool.query(
        `UPDATE vehicles SET current_verification_id=$1, verification_status='REJECTED' WHERE id=$2`,
        [vehicleRevision.rows[0]?.id, vehicleId],
      );
      const vehicles = await auth(app, ownerToken).get('/api/v1/users/me/vehicles');
      expect(vehicles.status).toBe(200);
      const listed = (vehicles.body.data as { id: string; verificationReason?: string }[]).find(
        (row) => row.id === vehicleId,
      );
      expect(listed?.verificationReason).toBe(vehicleReason);

      // Public driver surfaces never expose the private reason field.
      const publicDriver = await fixture.runtimePool.query<{ id: string }>(
        `INSERT INTO driver_profiles(user_id, license_number_ciphertext, license_number_digest,
             license_country, license_expires_on, city_id, hourly_rate_minor,
             verification_status, accepting_bookings)
           VALUES ($1, 'cipher', $2, 'IN', $3, $4, 50000, 'APPROVED', true) RETURNING id`,
        [publicUserId, 'e'.repeat(64), futureDate(), cityId],
      );
      const publicDriverId = publicDriver.rows[0]?.id as string;
      const search = await request(app).get('/api/v1/drivers');
      expect(search.status).toBe(200);
      for (const item of search.body.data as Record<string, unknown>[]) {
        expect('verificationReason' in item).toBe(false);
      }
      const detail = await request(app).get(`/api/v1/drivers/${publicDriverId}`);
      expect(detail.status).toBe(200);
      expect('verificationReason' in (detail.body.data as Record<string, unknown>)).toBe(false);
    });
  }, 60000);

  it('missing_clean_evidence_returns_404', async () => {
    await withTestDatabase(async (fixture) => {
      await seedAccount(fixture, 't1-missing@example.com', ['DRIVER']);
      const app = buildApp();
      const owner = await login(app, 't1-missing@example.com');
      const uploaded = await upload(app, '/api/v1/drivers/me/documents', owner, {
        kind: 'LICENSE',
        filename: 'license.pdf',
        contentType: 'application/pdf',
        body: CLEAN_PDF,
      });
      expect(uploaded.status).toBe(201);
      const documentId = uploaded.body.data.id as string;
      const row = await fixture.runtimePool.query<{ objectKey: string }>(
        'SELECT object_key AS "objectKey" FROM documents WHERE id=$1',
        [documentId],
      );
      const storage = createPrivateStorage({ root: config.storagePrivateRoot });
      rmSync(storage.cleanPath(row.rows[0]?.objectKey as string));

      const response = await getBinary(app, `/api/v1/documents/${documentId}/content`, owner);
      expect(response.status).toBe(404);
    });
  }, 60000);
});
