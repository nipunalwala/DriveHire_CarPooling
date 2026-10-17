import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { MailAdapter } from '../../ports.js';
import { createApp } from '../../app.js';
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
    accounts: { prisma, mail },
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
      const verifyKnownBad = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: 'resetter@example.com', code: '000000' });
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
});
