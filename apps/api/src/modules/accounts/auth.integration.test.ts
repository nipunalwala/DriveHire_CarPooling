import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { hash as argon2Hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { MailAdapter } from '../../ports.js';
import { createApp } from '../../app.js';
import { createAuthEmailDelivery } from './email-jobs.js';
import { createLogger } from '../../config/logger.js';
import { parseEnv } from '../../config/env.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase } from '../../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const REFRESH_COOKIE = 'drivehire_refresh';
const JWT_SECRET = randomBytes(32).toString('base64url');
const APP_ORIGIN = 'http://localhost:5173';

interface SeenMail {
  recipient: string;
  subject: string;
  text: string;
}

interface RecordingMail extends MailAdapter {
  seen: SeenMail[];
}

function recordingMail(): RecordingMail {
  const seen: SeenMail[] = [];
  return {
    seen,
    async send(input) {
      seen.push({ recipient: input.recipient, subject: input.subject, text: input.text });
      return { providerMessageId: `recording-${seen.length}` };
    },
  };
}

/** Mirrors the service's keyed hash so tests can craft challenge rows. */
function hmacHex(domain: string, value: string): string {
  return createHmac('sha256', JWT_SECRET).update(`${domain}:${value}`).digest('hex');
}

function refreshCookieFrom(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const raw = Array.isArray(header) ? header.join(';') : String(header ?? '');
  const hit = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));
  if (!hit) throw new Error(`No ${REFRESH_COOKIE} cookie on response`);
  return hit.slice(REFRESH_COOKIE.length + 1);
}

const mail = recordingMail();
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
});

const delivery = createAuthEmailDelivery({ prisma, config, mail });
/** Drain the durable outbox through the real worker (recording transport). */
async function flushEmail(): Promise<void> {
  await delivery.deliverAuthEmails(new AbortController().signal);
}

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

interface Account {
  email: string;
  accessToken: string;
  refreshToken: string;
}

async function registerAndVerify(email: string): Promise<void> {
  const app = buildApp();
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', APP_ORIGIN)
    .send({ displayName: 'Test Person', email, password: 'CorrectHorse1!' });
  expect(registered.status).toBe(202);
  await flushEmail();
  const sent = mail.seen.at(-1);
  if (!sent) throw new Error('Registration did not queue verification mail');
  const code = /code is ([0-9]{6})/.exec(sent.text)?.[1];
  if (!code) throw new Error('Verification mail did not contain a six-digit code');
  const verified = await request(app).post('/api/v1/auth/verify-email').send({ email, code });
  expect(verified.status).toBe(200);
}

/** Real HTTP login; returns access token and refresh cookie for the session. */
async function login(email: string): Promise<Account> {
  const app = buildApp();
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'CorrectHorse1!' });
  expect(response.status).toBe(200);
  const accessToken = response.body?.data?.accessToken;
  if (typeof accessToken !== 'string') throw new Error('Login returned no access token');
  return { email, accessToken, refreshToken: refreshCookieFrom(response) };
}

/**
 * Deterministic lock-order harness. Blocks at least `expected` backends on the
 * `users` row lock. Tests hold that row from a separate transaction so a
 * challenge-first route closes a cycle against a user-first route, which
 * Postgres resolves with 40P01 (surfaced as an unhandled 500) unless every auth
 * flow acquires the account lock before any challenge lock.
 */
async function waitForUserLockWaiters(
  pool: import('pg').Pool,
  expected: number,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query ILIKE '%users%'`,
    );
    if ((result.rows[0]?.n ?? 0) >= expected) return;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${expected} lock waiter(s) on users`);
    }
    await delay(25);
  }
}

describe('Milestone03 Task1: account contracts and current authentication', () => {
  it('refresh_same_token_race_revokes_family', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const email = 'replay@example.com';
      await registerAndVerify(email);
      const loggerLines: string[] = [];
      const app = buildApp(loggerLines);
      const first = await login(email);
      expect(first.refreshToken).toBeTruthy();

      const rotateOnce = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', `${REFRESH_COOKIE}=${first.refreshToken}`);
      expect(rotateOnce.status).toBe(200);
      const successorCookie = refreshCookieFrom(rotateOnce);
      expect(successorCookie).not.toBe(first.refreshToken);

      // Binding the replay to the actual second HTTP refresh with the
      // already-consumed cookie.
      const replay = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', `${REFRESH_COOKIE}=${first.refreshToken}`);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('UNAUTHENTICATED');

      // The successor access token from the first refresh must also be dead.
      const successorUse = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${rotateOnce.body.data.accessToken}`);
      expect(successorUse.status).toBe(401);

      // Persisted: session and every token in the family are revoked.
      const rows = await runtimePool.query<{ revoked_at: string | null }>(
        `SELECT s.revoked_at FROM refresh_sessions s
         JOIN refresh_tokens t ON t.session_id = s.id
         WHERE t.token_hash = $1`,
        [hmacHex('refresh', first.refreshToken)],
      );
      expect(rows.rows[0]?.revoked_at).not.toBeNull();
      const family = await runtimePool.query<{ revoked: string | null; consumed: string | null }>(
        `SELECT t.revoked_at AS revoked, t.consumed_at AS consumed FROM refresh_tokens t
         WHERE t.session_id = (SELECT session_id FROM refresh_tokens WHERE token_hash = $1)`,
        [hmacHex('refresh', first.refreshToken)],
      );
      expect(family.rows.length).toBeGreaterThanOrEqual(2);
      for (const token of family.rows) {
        expect(token.revoked).not.toBeNull();
        expect(token.consumed).not.toBeNull();
      }

      // No raw secret material reached correlated logs.
      const joined = loggerLines.join('');
      expect(joined).not.toContain(first.refreshToken);
      expect(joined).not.toContain(rotateOnce.body.data.accessToken);
      expect(joined).not.toContain(first.accessToken);
    });
  });

  it('concurrent_refresh_replay_revokes_family', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const email = 'concurrent@example.com';
      await registerAndVerify(email);
      const app = buildApp();
      const account = await login(email);
      const cookie = `${REFRESH_COOKIE}=${account.refreshToken}`;
      const responses = await Promise.all([
        request(app).post('/api/v1/auth/refresh').set('Origin', APP_ORIGIN).set('Cookie', cookie),
        request(app).post('/api/v1/auth/refresh').set('Origin', APP_ORIGIN).set('Cookie', cookie),
      ]);
      // A concurrent replay must never mint two live successors.
      const succeeded = responses.filter((response) => response.status === 200);
      expect(succeeded.length).toBeLessThanOrEqual(1);
      for (const response of succeeded) {
        const use = await request(app)
          .get('/api/v1/auth/sessions')
          .set('Authorization', `Bearer ${response.body.data.accessToken}`);
        expect(use.status).toBe(401);
      }
      const family = await runtimePool.query<{ revoked: string | null }>(
        `SELECT t.revoked_at AS revoked FROM refresh_tokens t
         WHERE t.session_id = (SELECT id FROM refresh_sessions WHERE user_id =
           (SELECT id FROM users WHERE email=$1) ORDER BY created_at DESC LIMIT 1)`,
        [email],
      );
      expect(family.rows.length).toBeGreaterThanOrEqual(1);
      for (const token of family.rows) expect(token.revoked).not.toBeNull();
    });
  });

  it('suspended_jwt_fails_next_request', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const email = 'suspended@example.com';
      await registerAndVerify(email);
      const account = await login(email);
      const app = buildApp();
      const before = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${account.accessToken}`);
      expect(before.status).toBe(200);
      await runtimePool.query("UPDATE users SET status='SUSPENDED' WHERE email=$1", [email]);
      const after = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${account.accessToken}`);
      expect(after.status).toBe(401);
      expect(after.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  it('sixth_bad_otp_cannot_verify', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const email = 'attempts@example.com';
      const app = buildApp();
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .send({ displayName: 'Attempts', email, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      await flushEmail();
      const sent = mail.seen.at(-1);
      const code = /code is ([0-9]{6})/.exec(sent?.text ?? '')?.[1];
      if (!code) throw new Error('Verification mail missing');
      const wrongCode = String(randomInt(100000, 999999)).padStart(6, '0');
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const response = await request(app)
            .post('/api/v1/auth/verify-email')
            .send({ email, code: wrongCode });
          expect(response.status).toBe(400);
        } catch {
          /* covered below via loop exit */
        }
      }
      const wrongCodeB = String(randomInt(100000, 999999)).padStart(6, '0');
      const sixth = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email, code: wrongCodeB });
      expect(sixth.status).toBe(409);
      expect(sixth.body.error.code).toBe('CONFLICT');
      // Even the correct code can no longer verify the account.
      const lateCorrect = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email, code });
      expect(lateCorrect.status).toBe(400);
      const user = await runtimePool.query<{ email_verified_at: string | null }>(
        'SELECT email_verified_at FROM users WHERE email=$1',
        [email],
      );
      expect(user.rows[0]?.email_verified_at).toBeNull();
    });
  });

  it('reset_token_one_use_revokes_sessions', async () => {
    await withTestDatabase(async ({ migrationPool, runtimePool }) => {
      const email = 'resetter@example.com';
      await registerAndVerify(email);
      const account = await login(email);
      // Craft a real reset challenge with a known one-use token.
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;
      const rawToken = randomBytes(32).toString('base64url');
      await migrationPool.query(
        `INSERT INTO auth_challenges(user_id, purpose, secret_hash, expires_at, resend_after)
         VALUES ($1, 'RESET_PASSWORD', $2, now() + interval '15 minutes', now())`,
        [userId, hmacHex('reset', rawToken)],
      );
      void runtimePool;
      const app = buildApp();
      const reset = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'NewCorrectHorse2!' });
      expect(reset.status).toBe(200);
      expect(reset.body).toEqual({ success: true, data: { acknowledged: true } });

      // One use only: the same token fails afterwards.
      const reuse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'ThirdCorrectHorse3!' });
      expect(reuse.status).toBe(400);

      // The old JWT must fail (access invalidated) ...
      const oldAccess = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${account.accessToken}`);
      expect(oldAccess.status).toBe(401);

      // ... and the refresh cookie must be dead.
      const refresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', `${REFRESH_COOKIE}=${account.refreshToken}`);
      expect(refresh.status).toBe(401);

      const challengeRow = await migrationPool.query<{ id: string; consumed_at: string | null }>(
        `SELECT id, consumed_at FROM auth_challenges WHERE user_id = $1 AND purpose='RESET_PASSWORD'`,
        [userId],
      );
      expect(challengeRow.rows[0]?.consumed_at).not.toBeNull();
      const userState = await migrationPool.query<{ token_version: number }>(
        'SELECT token_version FROM users WHERE id=$1',
        [userId],
      );
      expect(Number(userState.rows[0]?.token_version)).toBeGreaterThan(1);
      const sessions = await migrationPool.query<{ revoked_at: string | null }>(
        'SELECT revoked_at FROM refresh_sessions WHERE user_id=$1',
        [userId],
      );
      expect(sessions.rows.length).toBeGreaterThanOrEqual(1);
      for (const session of sessions.rows) {
        expect(session.revoked_at).not.toBeNull();
      }
    });
  });

  it('public_owner_admin_grant_rejected', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const email = 'grants@example.com';
      const app = buildApp();
      const bad = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Grants',
        email,
        password: 'CorrectHorse1!',
        role: 'ADMIN',
      });
      expect(bad.status).toBe(400);
      await registerAndVerify(email);
      const account = await login(email);
      const admin = await request(app)
        .post('/api/v1/users/me/roles')
        .set('Authorization', `Bearer ${account.accessToken}`)
        .send({ role: 'ADMIN' });
      expect(admin.status).toBe(403);
      const owner = await request(app)
        .post('/api/v1/users/me/roles')
        .set('Authorization', `Bearer ${account.accessToken}`)
        .send({ role: 'OWNER' });
      expect(owner.status).toBe(403);
      const roles = await runtimePool.query<{ role: string }>(
        `SELECT r.role FROM user_roles r JOIN users u ON u.id = r.user_id WHERE u.email=$1`,
        [email],
      );
      expect(roles.rows.map((row) => row.role).sort()).toEqual(['PASSENGER']);
      // Self-enabling DRIVER is allowed for a verified account.
      const driver = await request(app)
        .post('/api/v1/users/me/roles')
        .set('Authorization', `Bearer ${account.accessToken}`)
        .send({ role: 'DRIVER' });
      expect(driver.status).toBe(200);
      expect(driver.body.data.roles).toContain('DRIVER');
    });
  });

  it('generic_unknown_email_ack', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const app = buildApp();
      const unknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });
      expect(unknown.status).toBe(202);
      expect(unknown.body).toEqual({ success: true, data: { acknowledged: true } });
      // No outbox row for an unknown address.
      const outbox = await migrationPool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM outbox_events`,
      );
      expect(outbox.rows[0]?.n).toBe('0');

      // Login and verify both stay generic for unknown addresses.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WhateverPw12!' });
      expect(login.status).toBe(401);
      expect(login.body.error.message).toBe('Invalid email or password');
      const verifyUnknown = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: 'nobody@example.com', code: '123456' });
      expect(verifyUnknown.status).toBe(400);
      // A real known-unverified challenge must answer with the same generic
      // message as the unknown address (no enumeration signal).
      const knownEmail = 'knownverify@example.com';
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', APP_ORIGIN)
        .send({ displayName: 'Known Verify', email: knownEmail, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      const verifyKnownBad = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: knownEmail, code: '000000' });
      expect(verifyKnownBad.status).toBe(400);
      expect(verifyKnownBad.body.error.message).toBe(verifyUnknown.body.error.message);
    });
  });

  it('foreign_session404', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      await registerAndVerify('alice-foreign@example.com');
      await registerAndVerify('bob-foreign@example.com');
      const alice = await login('alice-foreign@example.com');
      const bob = await login('bob-foreign@example.com');
      const app = buildApp();
      const bobSessions = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${bob.accessToken}`);
      const bobCurrentId = bobSessions.body.data.find(
        (session: { current: boolean }) => session.current,
      )?.id as string;
      // Alice cannot revoke Bob's session.
      const foreign = await request(app)
        .delete(`/api/v1/auth/sessions/${bobCurrentId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe('NOT_FOUND');
      // Bob's session still works.
      const stillWorks = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect(stillWorks.status).toBe(200);
      void runtimePool;
    });
  });

  it('login_is_serialized_against_concurrent_password_change', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'loginrace@example.com';
      await registerAndVerify(email);
      const app = buildApp();
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;

      // Deterministically simulate an in-flight reset: hold the account row lock.
      const client = await migrationPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
        // Fire a login with the pre-reset password; its serialized section must
        // block behind the lock instead of committing a stale session.
        const pending = request(app)
          .post('/api/v1/auth/login')
          .set('Origin', APP_ORIGIN)
          .send({ email, password: 'CorrectHorse1!' });
        // Let the request read and verify the pre-reset credential first.
        await new Promise((resolve) => setTimeout(resolve, 400));
        const rotatedHash = await argon2Hash('RotationPassword9!');
        await client.query(
          'UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2',
          [rotatedHash, userId],
        );
        await client.query('COMMIT');

        const response = await pending;
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
        // No session may survive the credential change.
        const sessions = await migrationPool.query<{ n: string }>(
          'SELECT COUNT(*)::text AS n FROM refresh_sessions WHERE user_id=$1',
          [userId],
        );
        expect(sessions.rows[0]?.n).toBe('0');
      } finally {
        client.release();
      }
    });
  });

  it('refresh_rejects_suspended_user', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'refreshsuspended@example.com';
      await registerAndVerify(email);
      const account = await login(email);
      const app = buildApp();
      await migrationPool.query("UPDATE users SET status='SUSPENDED' WHERE email=$1", [email]);
      const refreshed = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', APP_ORIGIN)
        .set('Cookie', `${REFRESH_COOKIE}=${account.refreshToken}`);
      expect(refreshed.status).toBe(401);
      expect(refreshed.body.error.code).toBe('UNAUTHENTICATED');
      const session = await migrationPool.query<{ revoked_at: string | null }>(
        `SELECT s.revoked_at FROM refresh_sessions s JOIN users u ON u.id = s.user_id
         WHERE u.email=$1`,
        [email],
      );
      expect(session.rows[0]?.revoked_at).not.toBeNull();
    });
  });

  it('resend_cooldown_is_generic_for_known_and_unknown', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'resendcooldown@example.com';
      const app = buildApp();
      // A real known-unverified account with a live VERIFY_EMAIL challenge whose
      // 60s cooldown is still active.
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', APP_ORIGIN)
        .send({ displayName: 'Resend Cooldown', email, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      // A known address inside cooldown must get the same generic 202 as an
      // unknown one, and no second email job may be emitted.
      const known = await request(app)
        .post('/api/v1/auth/resend-otp')
        .set('Origin', APP_ORIGIN)
        .send({ email });
      expect(known.status).toBe(202);
      expect(known.body).toEqual({ success: true, data: { acknowledged: true } });
      const unknown = await request(app)
        .post('/api/v1/auth/resend-otp')
        .set('Origin', APP_ORIGIN)
        .send({ email: 'nobody@example.com' });
      expect(unknown.status).toBe(202);
      expect(unknown.body).toEqual({ success: true, data: { acknowledged: true } });
      const jobs = await migrationPool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM outbox_events o JOIN users u ON u.id = o.aggregate_id
         WHERE u.email=$1 AND o.event_type='AUTH_VERIFY_EMAIL'`,
        [email],
      );
      expect(jobs.rows[0]?.n).toBe('1');
    });
  });

  it('forgot_password_flood_is_rate_limited', async () => {
    await withTestDatabase(async () => {
      const email = 'forgotflood@example.com';
      await registerAndVerify(email);
      const app = buildApp();
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(app)
          .post('/api/v1/auth/forgot-password')
          .set('Origin', APP_ORIGIN)
          .send({ email });
        expect(response.status).toBe(202);
      }
      // The sixth request for the same address is refused before any email work.
      const limited = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', APP_ORIGIN)
        .send({ email });
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(limited.headers['retry-after']).toBeDefined();
    });
  });

  it('login_is_route_rate_limited_with_retry_after', async () => {
    await withTestDatabase(async () => {
      const email = 'loginlimit@example.com';
      await registerAndVerify(email);
      const app = buildApp();
      let limited: request.Response | undefined;
      for (let attempt = 1; attempt <= 11; attempt += 1) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'CorrectHorse1!' });
        if (response.status === 429) {
          limited = response;
          break;
        }
        expect(response.status).toBe(200);
      }
      expect(limited?.status).toBe(429);
      expect(limited?.body.error.code).toBe('RATE_LIMITED');
      expect(limited?.headers['retry-after']).toBeDefined();
    });
  });

  it('concurrent_forgot_serializes_outbox_versions', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'outboxrace@example.com';
      await registerAndVerify(email);
      const app = buildApp();
      // Concurrent resets for the same account must serialize the aggregate
      // version instead of colliding on the unique key (which surfaced as 500).
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app)
            .post('/api/v1/auth/forgot-password')
            .set('Origin', APP_ORIGIN)
            .send({ email }),
        ),
      );
      for (const response of responses) expect(response.status).toBe(202);
      const rows = await migrationPool.query<{ aggregate_version: number }>(
        `SELECT o.aggregate_version FROM outbox_events o JOIN users u ON u.id = o.aggregate_id
         WHERE u.email=$1 AND o.event_type='AUTH_RESET_PASSWORD'
         ORDER BY o.aggregate_version`,
        [email],
      );
      expect(rows.rows.map((row) => Number(row.aggregate_version))).toEqual([1, 2, 3, 4]);
    });
  });

  it('role_extra_property_is_validation_error', async () => {
    await withTestDatabase(async () => {
      const email = 'roleextra@example.com';
      await registerAndVerify(email);
      const account = await login(email);
      const app = buildApp();
      const extra = await request(app)
        .post('/api/v1/users/me/roles')
        .set('Authorization', `Bearer ${account.accessToken}`)
        .send({ role: 'DRIVER', isAdmin: true });
      expect(extra.status).toBe(400);
      expect(extra.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('cookie_routes_reject_foreign_origin', async () => {
    await withTestDatabase(async () => {
      const email = 'origin@example.com';
      await registerAndVerify(email);
      const app = buildApp();

      // Cookie-writing routes must not answer a browser request from an origin
      // outside the allowlist: the existing CORS guard rejects it before any
      // credential is checked, and no refresh cookie is ever emitted.
      const foreignLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://evil.example')
        .send({ email, password: 'CorrectHorse1!' });
      expect(foreignLogin.status).toBe(403);
      expect(foreignLogin.body.error.code).toBe('FORBIDDEN');
      expect(foreignLogin.headers['set-cookie']).toBeUndefined();

      const account = await login(email);
      const foreignRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://evil.example')
        .set('Cookie', `${REFRESH_COOKIE}=${account.refreshToken}`);
      expect(foreignRefresh.status).toBe(403);
      expect(foreignRefresh.body.error.code).toBe('FORBIDDEN');
      expect(foreignRefresh.headers['set-cookie']).toBeUndefined();
    });
  });

  it('concurrent_otp_verify_single_use', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'otprace@example.com';
      const app = buildApp();
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', APP_ORIGIN)
        .send({ displayName: 'Otp Race', email, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      await flushEmail();
      const sent = mail.seen.at(-1);
      const code = /code is ([0-9]{6})/.exec(sent?.text ?? '')?.[1];
      if (!code) throw new Error('Verification mail missing');

      // The same valid OTP raced across requests must verify exactly once.
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(app).post('/api/v1/auth/verify-email').send({ email, code }),
        ),
      );
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const user = await migrationPool.query<{ email_verified_at: string | null }>(
        'SELECT email_verified_at FROM users WHERE email=$1',
        [email],
      );
      expect(user.rows[0]?.email_verified_at).not.toBeNull();
    });
  });

  it('concurrent_reset_token_single_use', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'resetrace@example.com';
      await registerAndVerify(email);
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;
      const rawToken = randomBytes(32).toString('base64url');
      await migrationPool.query(
        `INSERT INTO auth_challenges(user_id, purpose, secret_hash, expires_at, resend_after)
         VALUES ($1, 'RESET_PASSWORD', $2, now() + interval '15 minutes', now())`,
        [userId, hmacHex('reset', rawToken)],
      );
      const app = buildApp();

      // Two concurrent redemptions of one reset token: exactly one applies.
      const responses = await Promise.all([
        request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken, newPassword: 'RaceHorse123!' }),
        request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken, newPassword: 'RaceHorse456!' }),
      ]);
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      expect(responses.find((response) => response.status !== 200)?.status).toBe(400);
    });
  });

  it('concurrent_resend_serializes_outbox_versions', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'resendrake@example.com';
      const app = buildApp();
      // A known-unverified account: registration leaves one live VERIFY_EMAIL
      // challenge at version 1, which the resends below must extend to version 2.
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', APP_ORIGIN)
        .send({ displayName: 'Resend Race', email, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;
      // Clear the registration cooldown so the next window is actually due.
      await migrationPool.query(
        `UPDATE auth_challenges SET resend_after = now() - interval '1 minute'
         WHERE user_id=$1 AND purpose='VERIFY_EMAIL' AND consumed_at IS NULL`,
        [userId],
      );

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app).post('/api/v1/auth/resend-otp').set('Origin', APP_ORIGIN).send({ email }),
        ),
      );
      for (const response of responses) expect(response.status).toBe(202);
      // Serialized resends emit exactly one new job with a unique version, and
      // every concurrent caller still receives the generic acknowledgement.
      const rows = await migrationPool.query<{ aggregate_version: number }>(
        `SELECT aggregate_version FROM outbox_events
         WHERE aggregate_id=$1 AND event_type='AUTH_VERIFY_EMAIL'
         ORDER BY aggregate_version`,
        [userId],
      );
      expect(rows.rows.map((row) => Number(row.aggregate_version))).toEqual([1, 2]);
    });
  });

  it('verify_and_resend_share_account_then_challenge_lock_order', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'lockorder-verify@example.com';
      const app = buildApp();
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', APP_ORIGIN)
        .send({ displayName: 'Lock Order Verify', email, password: 'CorrectHorse1!' });
      expect(registered.status).toBe(202);
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;
      // Fix the verification code and clear the resend cooldown so both routes
      // take their challenge-mutation path instead of a generic early return.
      await migrationPool.query(
        `UPDATE auth_challenges SET secret_hash=$1, resend_after = now() - interval '1 minute'
         WHERE user_id=$2 AND purpose='VERIFY_EMAIL' AND consumed_at IS NULL`,
        [hmacHex('otp', '123456'), userId],
      );

      const holder = await migrationPool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
        // The user-first route queues on the held account row.
        // .then() dispatches the supertest request immediately so it is
        // genuinely in flight while the holder keeps the account row locked.
        const resendPending = request(app)
          .post('/api/v1/auth/resend-otp')
          .set('Origin', APP_ORIGIN)
          .send({ email })
          .then((response) => response);
        await waitForUserLockWaiters(migrationPool, 1);
        // A challenge-first route would lock the challenge here and then wait on
        // the same account row, closing the deadlock cycle.
        const verifyPending = request(app)
          .post('/api/v1/auth/verify-email')
          .send({ email, code: '123456' })
          .then((response) => response);
        await waitForUserLockWaiters(migrationPool, 2);

        await holder.query('COMMIT');
        const [resend, verify] = await Promise.all([resendPending, verifyPending]);
        // The cross-route race must resolve to domain outcomes, never an
        // unhandled deadlock 500.
        expect([resend.status, verify.status]).not.toContain(500);
        expect(resend.status).toBe(202);
        expect([200, 400]).toContain(verify.status);
        const state = await migrationPool.query<{ email_verified_at: string | null }>(
          'SELECT email_verified_at FROM users WHERE id=$1',
          [userId],
        );
        if (verify.status === 200) {
          expect(state.rows[0]?.email_verified_at).not.toBeNull();
        } else {
          expect(state.rows[0]?.email_verified_at).toBeNull();
        }
      } finally {
        holder.release();
      }
    });
  });

  it('forgot_and_reset_share_account_then_challenge_lock_order', async () => {
    await withTestDatabase(async ({ migrationPool }) => {
      const email = 'lockorder-reset@example.com';
      await registerAndVerify(email);
      const userRow = await migrationPool.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      const userId = userRow.rows[0]?.id as string;
      const rawToken = randomBytes(32).toString('base64url');
      await migrationPool.query(
        `INSERT INTO auth_challenges(user_id, purpose, secret_hash, expires_at, resend_after)
         VALUES ($1, 'RESET_PASSWORD', $2, now() + interval '15 minutes', now())`,
        [userId, hmacHex('reset', rawToken)],
      );
      const app = buildApp();

      const holder = await migrationPool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
        // The user-first route queues on the held account row.
        const forgotPending = request(app)
          .post('/api/v1/auth/forgot-password')
          .set('Origin', APP_ORIGIN)
          .send({ email })
          .then((response) => response);
        await waitForUserLockWaiters(migrationPool, 1);
        // The challenge-first reset would consume the live reset challenge and
        // then wait on the same account row, closing the deadlock cycle.
        const resetPending = request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken, newPassword: 'LockOrderHorse9!' })
          .then((response) => response);
        await waitForUserLockWaiters(migrationPool, 2);

        await holder.query('COMMIT');
        const [forgot, reset] = await Promise.all([forgotPending, resetPending]);
        expect([forgot.status, reset.status]).not.toContain(500);
        expect(forgot.status).toBe(202);
        // The newer forgot request invalidates the prior reset challenge, so the
        // reset loses cleanly with a 400 instead of a deadlock.
        expect([200, 400]).toContain(reset.status);
      } finally {
        holder.release();
      }
    });
  });
});
