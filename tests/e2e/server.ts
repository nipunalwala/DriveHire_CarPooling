import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { withTestDatabase } from '../../apps/api/src/test/database-fixture.js';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';
import { createPrisma } from '../../apps/api/src/runtime/prisma.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createLogger } from '../../apps/api/src/config/logger.js';
import { createApp } from '../../apps/api/src/app.js';
import { createAuthEmailDelivery } from '../../apps/api/src/modules/accounts/email-jobs.js';
import { createSmtpMail } from '../../apps/api/src/adapters/smtp-mail.js';

loadEnvFile('.env');
// Dedicated E2E Compose has its own ports and data. Never reuse the backend
// integration target or accept a caller-supplied development database.
for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL']) {
  const url = new URL(requireTestDatabaseUrl(process.env[key]));
  url.port = '55434';
  process.env[key] = url.toString();
}
await withTestDatabase(async () => {
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
    SMTP_PORT: '11026',
    SMTP_TLS: 'none',
  });
  const prisma = createPrisma(config.databaseUrl);
  const logger = createLogger('error');
  const app = createApp({
    config,
    logger,
    accounts: { prisma },
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
