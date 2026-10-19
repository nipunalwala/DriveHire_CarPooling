import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { hash as argon2Hash } from '@node-rs/argon2';
import {
  withTestDatabase,
  type DatabaseFixture,
} from '../../apps/api/src/test/database-fixture.js';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';
import { createPrisma } from '../../apps/api/src/runtime/prisma.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createLogger } from '../../apps/api/src/config/logger.js';
import { createApp } from '../../apps/api/src/app.js';
import { createAuthEmailDelivery } from '../../apps/api/src/modules/accounts/email-jobs.js';
import { createSmtpMail } from '../../apps/api/src/adapters/smtp-mail.js';
import { createPrivateStorage } from '../../apps/api/src/adapters/private-storage.js';
import { createClamAvScan } from '../../apps/api/src/adapters/clamav-scan.js';
import { provisionCuratedCities } from '../../apps/api/src/modules/cities/reference-data.js';

loadEnvFile('.env');
// Dedicated E2E Compose has its own ports and data. Never reuse the backend
// integration target or accept a caller-supplied development database. Ports
// are env-overridable for isolated runs; the defaults stay the committed E2E
// Compose ports so CI and local browser runs are unchanged.
const E2E_DATABASE_PORT = process.env.E2E_DATABASE_PORT ?? '55434';
const E2E_SMTP_PORT = process.env.E2E_SMTP_PORT ?? '11026';

// Test-only fixtures for the provider/admin browser journeys. They are written
// into the isolated E2E database (55434) through the harness migration
// identity and are never used by the API at runtime. The curated city
// catalogue comes from the backend reference-data source so the browser
// fixture never drifts from the production catalogue (codes, not state names).
const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@drivehire.test';
// Generated per run and shared only through a gitignored file; never logged.
const E2E_ADMIN_PASSWORD = randomBytes(24).toString('base64url');
// Kept outside test-results: Playwright wipes its output directory at run start.
const E2E_FIXTURE_FILE = resolve('.cache', 'e2e-fixtures.json');

async function provisionE2EFixtures(fixture: DatabaseFixture): Promise<void> {
  await provisionCuratedCities(fixture.migrationPool);
  const passwordHash = await argon2Hash(E2E_ADMIN_PASSWORD);
  const existing = await fixture.migrationPool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [E2E_ADMIN_EMAIL],
  );
  let adminId = existing.rows[0]?.id;
  if (!adminId) {
    const created = await fixture.migrationPool.query<{ id: string }>(
      `INSERT INTO users(email, display_name, password_hash, email_verified_at, status)
       VALUES ($1, 'E2E Administrator', $2, now(), 'ACTIVE') RETURNING id`,
      [E2E_ADMIN_EMAIL, passwordHash],
    );
    adminId = created.rows[0]?.id as string;
  }
  await fixture.migrationPool.query(
    'INSERT INTO user_roles(user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [adminId, 'ADMIN'],
  );
  mkdirSync(resolve('.cache'), { recursive: true });
  writeFileSync(
    E2E_FIXTURE_FILE,
    JSON.stringify({ admin: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD } }),
  );
}

for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
  const url = new URL(requireTestDatabaseUrl(process.env[key]));
  url.port = E2E_DATABASE_PORT;
  process.env[key] = url.toString();
}
await withTestDatabase(async (fixture) => {
  const config = parseEnv({
    ...process.env,
    NODE_ENV: 'test',
    PORT: '4002',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    APP_ORIGIN: 'http://127.0.0.1:5174',
    CORS_ORIGINS: 'http://127.0.0.1:5174',
    AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
    AUTH_OUTBOX_KEY: randomBytes(32).toString('base64url'),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: E2E_SMTP_PORT,
    SMTP_TLS: 'none',
    SCAN_HOST: '127.0.0.1',
    SCAN_PORT: '13311',
    STORAGE_PRIVATE_ROOT: resolve('test-results', 'private-e2e-evidence'),
  });
  const prisma = createPrisma(config.databaseUrl);
  await provisionE2EFixtures(fixture);
  const logger = createLogger('error');
  const app = createApp({
    config,
    logger,
    accounts: { prisma },
    providers: {
      storage: createPrivateStorage({ root: config.storagePrivateRoot }),
      scanner: createClamAvScan(config.scan),
    },
    admin: { prisma },
    readiness: async () => ({ database: true, schema: true, worker: true }),
  });
  const server = app.listen(4002, '127.0.0.1');
  await once(server, 'listening');
  const controller = new AbortController();
  const delivery = createAuthEmailDelivery({
    prisma,
    config,
    mail: createSmtpMail(config),
    logger,
  });
  let active = Promise.resolve();
  let delivering = false;
  const timer = setInterval(() => {
    if (delivering) return;
    delivering = true;
    active = delivery
      .deliverAuthEmails(controller.signal)
      .catch(() => {
        console.error('E2E email delivery failed; inspect the test fixture.');
      })
      .finally(() => {
        delivering = false;
      });
  }, 150);
  const vite = spawn(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174'],
    {
      cwd: resolve('apps/web'),
      stdio: 'inherit',
      env: { ...process.env, DRIVEHIRE_E2E: '1' },
    },
  );
  await new Promise<void>((done, reject) => {
    process.once('SIGTERM', done);
    process.once('SIGINT', done);
    vite.once('error', reject);
    vite.once('exit', done);
  });
  clearInterval(timer);
  controller.abort();
  await active;
  vite.kill();
  await new Promise<void>((done) => server.close(() => done()));
  await prisma.$disconnect();
});
