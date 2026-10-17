import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase } from '../../test/database-fixture.js';
import { testMailpitUrl, testSmtpPort } from '../../test/test-services.js';
import type { MailAdapter } from '../../ports.js';
import { createSmtpMail, SmtpError } from '../../adapters/smtp-mail.js';
import { createAuthEmailDelivery } from './email-jobs.js';
import { authEmailAad, decryptOutboxSecret } from './outbox-crypto.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const JWT_SECRET = randomBytes(32).toString('base64url');
const OUTBOX_KEY = randomBytes(32).toString('base64url');
const APP_ORIGIN = 'http://localhost:5173';
const MAILPIT_API = testMailpitUrl();

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
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: testSmtpPort(),
});

function buildApp(loggerLines?: string[]) {
  const logger = loggerLines
    ? createLogger('info', {
        write: (line: string) => {
          loggerLines.push(line);
        },
      })
    : createLogger('silent');
  return createApp({
    config,
    logger,
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
  });
}

function recordingMail(): MailAdapter & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    async send(input) {
      seen.push(input.text);
      return { providerMessageId: `recording-${seen.length}` };
    },
  };
}

function failingMail(): MailAdapter {
  return {
    async send() {
      throw new SmtpError('SMTP_UNAVAILABLE', 'SMTP transport is unavailable');
    },
  };
}

function drain(mail: MailAdapter, loggerLines?: string[]) {
  const logger = loggerLines
    ? createLogger('info', {
        write: (line: string) => {
          loggerLines.push(line);
        },
      })
    : createLogger('silent');
  return createAuthEmailDelivery({ prisma, config, mail, logger });
}

interface MailpitAddress {
  Address: string;
}
interface MailpitSummary {
  ID: string;
  To?: MailpitAddress[];
}
interface MailpitMessage {
  ID: string;
  To?: MailpitAddress[];
  Subject: string;
  Text: string;
}

async function clearMailpit(): Promise<void> {
  const response = await fetch(`${MAILPIT_API}/api/v1/messages`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('Failed to clear Mailpit');
}

async function waitForMailpitMessage(recipient: string, timeoutMs = 8000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  let last: MailpitMessage | undefined;
  while (Date.now() < deadline) {
    const listed = await fetch(`${MAILPIT_API}/api/v1/messages`);
    const json = (await listed.json()) as { messages?: MailpitSummary[] };
    for (const summary of json.messages ?? []) {
      if (!summary.To?.some((address) => address.Address === recipient)) continue;
      const detail = await fetch(`${MAILPIT_API}/api/v1/message/${summary.ID}`);
      const message = (await detail.json()) as MailpitMessage;
      last = message;
      if (message.Text) return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`No Mailpit message arrived for ${recipient} (${last?.Subject ?? 'none'})`);
}

async function userIdByEmail(pool: import('pg').Pool, email: string): Promise<string> {
  const row = await pool.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [email]);
  const id = row.rows[0]?.id;
  if (!id) throw new Error(`No user row for ${email}`);
  return id;
}

/** Register only; the auth-email job stays pending until a worker drains it. */
async function enqueueRegister(email: string): Promise<void> {
  const app = buildApp();
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', APP_ORIGIN)
    .send({ displayName: 'Email Person', email, password: 'CorrectHorse1!' });
  expect(registered.status).toBe(202);
}

async function verifyViaMailpit(email: string): Promise<void> {
  const message = await waitForMailpitMessage(email);
  const code = /code is ([0-9]{6})/.exec(message.Text)?.[1];
  if (!code) throw new Error('Verification mail did not contain a six-digit code');
  const app = buildApp();
  const verified = await request(app).post('/api/v1/auth/verify-email').send({ email, code });
  expect(verified.status).toBe(200);
}

describe('Milestone03 Task2: real authentication email and own profiles', () => {
  it('challenge_and_email_job_rollback_together', async () => {
    await withTestDatabase(async ({ migrationPool, runtimePool }) => {
      const email = 'rollback@example.com';
      const role = (await runtimePool.query<{ u: string }>('SELECT current_user AS u')).rows[0]?.u;
      if (!role) throw new Error('Runtime role unavailable');
      const quoted = `"${role.replaceAll('"', '""')}"`;
      await migrationPool.query(`REVOKE INSERT ON outbox_events FROM ${quoted}`);
      try {
        const app = buildApp();
        const failed = await request(app)
          .post('/api/v1/auth/register')
          .set('Origin', APP_ORIGIN)
          .send({ displayName: 'Rollback Person', email, password: 'CorrectHorse1!' });
        expect(failed.status).toBe(500);
        const counts = await migrationPool.query<{
          users: string;
          challenges: string;
          outbox: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::text FROM users WHERE email=$1) AS users,
             (SELECT COUNT(*)::text FROM auth_challenges c JOIN users u ON u.id=c.user_id WHERE u.email=$1) AS challenges,
             (SELECT COUNT(*)::text FROM outbox_events) AS outbox`,
          [email],
        );
        expect(counts.rows[0]?.users).toBe('0');
        expect(counts.rows[0]?.challenges).toBe('0');
        expect(counts.rows[0]?.outbox).toBe('0');
      } finally {
        await migrationPool.query(`GRANT INSERT ON outbox_events TO ${quoted}`);
      }
    });
  });

  it('smtp_failure_not_marked_delivered', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'smtpfail@example.com';
      await enqueueRegister(email);
      const logs: string[] = [];
      const delivery = drain(failingMail(), logs);
      await delivery.deliverAuthEmails(new AbortController().signal);
      const userId = await userIdByEmail(migrationPool, email);
      const row = await migrationPool.query<{
        processed_at: string | null;
        attempts: number;
        available_at: string;
        sensitive_payload_ciphertext: string;
      }>(
        `SELECT processed_at, attempts, available_at, sensitive_payload_ciphertext
         FROM outbox_events WHERE aggregate_id=$1 AND event_type='AUTH_VERIFY_EMAIL'`,
        [userId],
      );
      expect(row.rows[0]?.processed_at).toBeNull();
      expect(Number(row.rows[0]?.attempts)).toBeGreaterThanOrEqual(1);
      const secret = decryptOutboxSecret(
        config.authOutboxKey,
        authEmailAad('AUTH_VERIFY_EMAIL', userId),
        row.rows[0]?.sensitive_payload_ciphertext as string,
      );
      expect(logs.join('')).not.toContain(secret.secret);
      expect(logs.join('')).not.toContain(secret.recipient);
    });
  });

  it('lease_retry_after_crash', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'leaserecovery@example.com';
      await enqueueRegister(email);
      const userId = await userIdByEmail(migrationPool, email);
      // A crashed worker still holds an unexpired lease: the job must be skipped.
      await migrationPool.query(
        `UPDATE outbox_events SET lease_until = now() + interval '5 minutes', attempts = 1
         WHERE aggregate_id=$1`,
        [userId],
      );
      const first = recordingMail();
      await drain(first).deliverAuthEmails(new AbortController().signal);
      expect(first.seen).toHaveLength(0);
      const held = await migrationPool.query<{ processed_at: string | null }>(
        'SELECT processed_at FROM outbox_events WHERE aggregate_id=$1',
        [userId],
      );
      expect(held.rows[0]?.processed_at).toBeNull();
      // Once the lease expires the same job is reclaimed and delivered exactly once.
      await migrationPool.query(
        `UPDATE outbox_events SET lease_until = now() - interval '1 second' WHERE aggregate_id=$1`,
        [userId],
      );
      const second = recordingMail();
      await drain(second).deliverAuthEmails(new AbortController().signal);
      expect(second.seen).toHaveLength(1);
      const done = await migrationPool.query<{ processed_at: string | null; attempts: number }>(
        'SELECT processed_at, attempts FROM outbox_events WHERE aggregate_id=$1',
        [userId],
      );
      expect(done.rows[0]?.processed_at).not.toBeNull();
      expect(Number(done.rows[0]?.attempts)).toBe(2);
    });
  });

  it('raw_secret_not_in_safe_payload_or_logs', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'rawsecret@example.com';
      await enqueueRegister(email);
      const userId = await userIdByEmail(migrationPool, email);
      const app = buildApp();
      const forgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', APP_ORIGIN)
        .send({ email });
      expect(forgot.status).toBe(202);
      const logs: string[] = [];
      await drain(failingMail(), logs).deliverAuthEmails(new AbortController().signal);
      const row = await migrationPool.query<{
        payload: unknown;
        sensitive_payload_ciphertext: string;
      }>(
        `SELECT payload, sensitive_payload_ciphertext FROM outbox_events
         WHERE aggregate_id=$1 AND event_type='AUTH_RESET_PASSWORD'`,
        [userId],
      );
      const secret = decryptOutboxSecret(
        config.authOutboxKey,
        authEmailAad('AUTH_RESET_PASSWORD', userId),
        row.rows[0]?.sensitive_payload_ciphertext as string,
      );
      expect(secret.recipient).toBe(email);
      expect(JSON.stringify(row.rows[0]?.payload)).not.toContain(secret.secret);
      expect(logs.join('')).not.toContain(secret.secret);
    });
  });

  it('mailpit_contains_working_expiring_one_use_link', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'mailpit-reset@example.com';
      await clearMailpit();
      await enqueueRegister(email);
      const smtpDelivery = drain(createSmtpMail(config));
      await smtpDelivery.deliverAuthEmails(new AbortController().signal);
      await verifyViaMailpit(email);

      const app = buildApp();
      const login = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', APP_ORIGIN)
        .send({ email, password: 'CorrectHorse1!' });
      expect(login.status).toBe(200);
      await clearMailpit();

      const forgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', APP_ORIGIN)
        .send({ email });
      expect(forgot.status).toBe(202);
      await smtpDelivery.deliverAuthEmails(new AbortController().signal);

      const message = await waitForMailpitMessage(email);
      const link = new RegExp(`${APP_ORIGIN}/reset-password\\?token=([A-Za-z0-9_-]+)`).exec(
        message.Text,
      );
      const rawToken = link?.[1];
      if (!rawToken) throw new Error('Reset mail did not contain a working link');
      expect(message.Subject).toMatch(/reset/i);

      const userId = await userIdByEmail(migrationPool, email);
      const challenge = await migrationPool.query<{ expires_at: string }>(
        `SELECT expires_at FROM auth_challenges
         WHERE user_id=$1 AND purpose='RESET_PASSWORD' AND consumed_at IS NULL`,
        [userId],
      );
      const expiresInMinutes =
        (new Date(challenge.rows[0]?.expires_at as string).getTime() - Date.now()) / 60_000;
      expect(expiresInMinutes).toBeGreaterThan(13);
      expect(expiresInMinutes).toBeLessThanOrEqual(15);

      const reset = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'NewCorrectHorse2!' });
      expect(reset.status).toBe(200);

      const reuse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'ThirdCorrectHorse3!' });
      expect(reuse.status).toBe(400);
    });
  });

  it('profile_foreign404', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      await clearMailpit();
      const alice = 'alice-profile@example.com';
      const bob = 'bob-profile@example.com';
      await enqueueRegister(alice);
      await enqueueRegister(bob);
      const smtpDelivery = drain(createSmtpMail(config));
      await smtpDelivery.deliverAuthEmails(new AbortController().signal);
      await verifyViaMailpit(alice);
      await verifyViaMailpit(bob);
      const app = buildApp();

      const aliceLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: alice, password: 'CorrectHorse1!' });
      expect(aliceLogin.status).toBe(200);
      const aliceToken = aliceLogin.body.data.accessToken as string;
      const bobId = await userIdByEmail(migrationPool, bob);

      const me = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(alice);
      expect(me.body.data.roles).toEqual(['PASSENGER']);

      // No cross-account profile endpoint: a foreign user id is simply absent.
      const foreign = await request(app)
        .get(`/api/v1/users/${bobId}`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe('NOT_FOUND');

      // Own profile edits persist and never touch another account.
      const updated = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ displayName: 'Alice Updated' });
      expect(updated.status).toBe(200);
      expect(updated.body.data.displayName).toBe('Alice Updated');
      const persisted = await migrationPool.query<{ display_name: string }>(
        'SELECT display_name FROM users WHERE email=$1',
        [alice],
      );
      expect(persisted.rows[0]?.display_name).toBe('Alice Updated');

      // A phone already owned by another account is a conflict, not a leak.
      await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ displayName: 'Alice Updated' });
      const setBobPhone = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ phone: '+919876543210' });
      expect(setBobPhone.status).toBe(200);
      const bobLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: bob, password: 'CorrectHorse1!' });
      const foreignPhone = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${bobLogin.body.data.accessToken}`)
        .send({ phone: '+919876543210' });
      expect(foreignPhone.status).toBe(409);
      expect(foreignPhone.body.error.code).toBe('CONFLICT');

      // Suspended accounts lose profile access immediately.
      await migrationPool.query("UPDATE users SET status='SUSPENDED' WHERE email=$1", [alice]);
      const suspended = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(suspended.status).toBe(401);
    });
  });

  it('no_OWNER_or_ADMIN_self_grant', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      await clearMailpit();
      const email = 'roles2@example.com';
      await enqueueRegister(email);
      const smtpDelivery = drain(createSmtpMail(config));
      await smtpDelivery.deliverAuthEmails(new AbortController().signal);
      await verifyViaMailpit(email);
      const app = buildApp();
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'CorrectHorse1!' });
      const token = login.body.data.accessToken as string;

      for (const role of ['ADMIN', 'OWNER']) {
        const denied = await request(app)
          .post('/api/v1/users/me/roles')
          .set('Authorization', `Bearer ${token}`)
          .send({ role });
        expect(denied.status).toBe(403);
      }
      const driver = await request(app)
        .post('/api/v1/users/me/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'DRIVER' });
      expect(driver.status).toBe(200);
      expect(driver.body.data.roles.sort()).toEqual(['DRIVER', 'PASSENGER']);
      const roles = await migrationPool.query<{ role: string }>(
        `SELECT r.role FROM user_roles r JOIN users u ON u.id=r.user_id WHERE u.email=$1`,
        [email],
      );
      expect(roles.rows.map((row) => row.role).sort()).toEqual(['DRIVER', 'PASSENGER']);
    });
  });
});
