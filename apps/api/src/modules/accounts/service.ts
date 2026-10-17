import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  EmailInputSchema,
  LoginInputSchema,
  OtpInputSchema,
  RegisterInputSchema,
  ResetInputSchema,
} from '@drivehire/contracts';
import type { Page, PageMeta, SessionDto, UserDto } from '@drivehire/contracts';
import type { PrismaClient } from '../../generated/client/client.js';
import type { Config } from '../../config/env.js';
import { authEmailAad, encryptOutboxSecret } from './outbox-crypto.js';
import { badRequest, conflict, forbidden, notFound, unauthenticated } from '../../errors.js';

export type Role = 'PASSENGER' | 'DRIVER' | 'ADMIN';
export type CurrentAccount = { userId: string; roles: Role[]; sessionId: string };
/** Express request narrowed after requireAccount succeeded. */
export type AccountRequest = Request & { account?: CurrentAccount };

/** Minimal delegate surface shared by the client and an interactive transaction. */
type Db = Pick<PrismaClient, 'refreshToken' | 'refreshSession' | 'user'>;

const ACCESS_TTL_SECONDS = 900;
const ACCESS_TTL_CLAIM = '15m';
const FAMILY_TTL_DAYS = 30;
const REFRESH_COOKIE_TTL_SECONDS = FAMILY_TTL_DAYS * 24 * 3600;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const RESET_TTL_MINUTES = 15;

export const REFRESH_COOKIE = 'drivehire_refresh';
export { ACCESS_TTL_SECONDS, REFRESH_COOKIE_TTL_SECONDS };

export type UserRow = {
  id: string;
  displayName: string;
  email: string;
  emailVerifiedAt: Date | null;
  phone: string | null;
  status: string;
  tokenVersion: number;
  createdAt: Date;
};

async function passwordHash(plain: string): Promise<string> {
  return argon2Hash(plain);
}

async function passwordMatches(stored: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(stored, plain);
  } catch {
    return false;
  }
}

/** Lazily-created hash used only to equalize timing for unknown accounts. */
let dummyHash: Promise<string> | undefined;
function equalizeTiming(plain: string): Promise<void> {
  dummyHash ??= argon2Hash('drivehire-timing-equalizer');
  return dummyHash.then((stored) => passwordMatches(stored, plain)).then(() => undefined);
}

export function toUserDto(row: UserRow, roles: Role[]): UserDto {
  const user: UserDto = {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    roles,
    status: row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    createdAt: row.createdAt.toISOString(),
  };
  if (row.phone !== null) user.phone = row.phone;
  return user;
}

export interface AuthenticatedSession {
  accessToken: string;
  expiresIn: 900;
  user: UserDto;
  refreshToken: string;
  sessionId: string;
}

export interface AccountsService {
  register(input: unknown): Promise<{ acknowledged: true }>;
  verifyEmail(input: unknown): Promise<{ acknowledged: true }>;
  resendOtp(input: unknown): Promise<{ acknowledged: true }>;
  login(input: unknown): Promise<AuthenticatedSession>;
  refresh(rawRefreshToken: string | undefined): Promise<AuthenticatedSession>;
  logout(
    rawRefreshToken: string | undefined,
    bearer: string | undefined,
  ): Promise<{ acknowledged: true }>;
  logoutAll(account: CurrentAccount): Promise<{ acknowledged: true }>;
  listSessions(account: CurrentAccount, query: Record<string, string>): Promise<Page<SessionDto>>;
  revokeSession(account: CurrentAccount, sessionId: string): Promise<{ acknowledged: true }>;
  forgotPassword(input: unknown): Promise<{ acknowledged: true }>;
  resetPassword(input: unknown): Promise<{ acknowledged: true }>;
  requireAccount(req: Request, res: Response, next: NextFunction): void;
}

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function rolesOf(prisma: PrismaClient, userId: string): Promise<Role[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
  return [...new Set(rows.map((row) => row.role as Role))].sort();
}

export function createAccountsService({
  prisma,
  config,
}: {
  prisma: PrismaClient;
  config: Config;
}): AccountsService {
  const issuerKey = new TextEncoder().encode(config.authJwtSecret);

  function hmacHex(domain: string, value: string): string {
    return createHmac('sha256', config.authJwtSecret).update(`${domain}:${value}`).digest('hex');
  }

  function newOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  function sixDigitOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  function normalizeEmail(raw: string): string {
    return raw.trim().toLowerCase();
  }

  async function issueAccessToken(
    userId: string,
    sessionId: string,
    tokenVersion: number,
  ): Promise<string> {
    return new SignJWT({ sid: sessionId, tv: tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TTL_CLAIM)
      .setIssuer('drivehire')
      .setAudience('drivehire-api')
      .sign(issuerKey);
  }

  async function createSession(
    db: Db,
    userId: string,
    when: Date,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const absoluteExpiresAt = new Date(when.getTime() + FAMILY_TTL_DAYS * 24 * 3600 * 1000);
    const session = await db.refreshSession.create({
      data: { userId, absoluteExpiresAt },
      select: { id: true },
    });
    const refreshToken = newOpaqueToken();
    await db.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: hmacHex('refresh', refreshToken),
        expiresAt: absoluteExpiresAt,
      },
    });
    return { sessionId: session.id, refreshToken };
  }

  async function sessionResponse(
    user: UserRow,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthenticatedSession> {
    const accessToken = await issueAccessToken(user.id, sessionId, user.tokenVersion);
    return {
      accessToken,
      expiresIn: ACCESS_TTL_SECONDS as 900,
      user: toUserDto(user, await rolesOf(prisma, user.id)),
      refreshToken,
      sessionId,
    };
  }

  /**
   * Replay-of-any-token evidence revokes the whole rotation family. Every token
   * in the family is both revoked and consumed so a concurrent replay can never
   * leave a usable successor. Runs on the supplied client so callers can keep it
   * inside the transaction that observed the race.
   */
  async function revokeFamily(db: Db, sessionId: string, reason: string): Promise<void> {
    const now = new Date();
    await db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    await db.refreshToken.updateMany({
      where: { sessionId, consumedAt: null },
      data: { consumedAt: now },
    });
    await db.refreshSession.update({
      where: { id: sessionId },
      data: { revokedAt: now, revocationReason: reason },
    });
  }

  /** Account-level credential invalidation shared by reset and logout-all. */
  async function revokeAllSessions(db: Db, userId: string, reason: string): Promise<void> {
    const now = new Date();
    await db.refreshToken.updateMany({
      where: { session: { userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    await db.refreshToken.updateMany({
      where: { session: { userId }, consumedAt: null },
      data: { consumedAt: now },
    });
    await db.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revocationReason: reason },
    });
    await db.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  function parseOrBadRequest<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    const result = schema.safeParse(input);
    if (!result.success) throw badRequest('Request validation failed');
    return result.data;
  }

  async function accountFromBearer(bearer: string): Promise<CurrentAccount | null> {
    try {
      const verified = await jwtVerify(bearer, issuerKey, {
        issuer: 'drivehire',
        audience: 'drivehire-api',
      });
      const claims = verified.payload as { sub?: string; sid?: string; tv?: number };
      if (!claims.sub || !claims.sid || typeof claims.tv !== 'number') return null;
      const state = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: { status: true, tokenVersion: true },
      });
      if (!state || state.status !== 'ACTIVE' || state.tokenVersion !== claims.tv) return null;
      const session = await prisma.refreshSession.findUnique({
        where: { id: claims.sid },
        select: { userId: true, revokedAt: true, absoluteExpiresAt: true },
      });
      if (!session || session.userId !== claims.sub) return null;
      if (session.revokedAt || session.absoluteExpiresAt <= new Date()) return null;
      return {
        userId: claims.sub,
        sessionId: claims.sid,
        roles: await rolesOf(prisma, claims.sub),
      };
    } catch {
      return null;
    }
  }

  return {
    async register(input) {
      const payload = parseOrBadRequest(RegisterInputSchema, input);
      const email = normalizeEmail(payload.email);
      const passwordHashed = await passwordHash(payload.password);
      const otp = sixDigitOtp();
      await prisma.$transaction(async (tx) => {
        try {
          const user = await tx.user.create({
            data: { email, displayName: payload.displayName, passwordHash: passwordHashed },
            select: { id: true },
          });
          await tx.userRole.create({ data: { userId: user.id, role: 'PASSENGER' } });
          const now = new Date();
          const challenge = await tx.authChallenge.create({
            data: {
              userId: user.id,
              purpose: 'VERIFY_EMAIL',
              secretHash: hmacHex('otp', otp),
              expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
              attempts: 0,
              resendAfter: new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000),
            },
            select: { id: true },
          });
          // The account, single-live challenge and encrypted auth-email job
          // commit atomically; the raw OTP only lives in the AEAD ciphertext.
          const priorVersions = await tx.outboxEvent.count({
            where: {
              aggregateType: 'user',
              aggregateId: user.id,
              eventType: 'AUTH_VERIFY_EMAIL',
            },
          });
          await tx.outboxEvent.create({
            data: {
              eventType: 'AUTH_VERIFY_EMAIL',
              aggregateType: 'user',
              aggregateId: user.id,
              aggregateVersion: priorVersions + 1,
              payload: { challengeId: challenge.id },
              sensitivePayloadCiphertext: encryptOutboxSecret(
                config.authOutboxKey,
                authEmailAad('AUTH_VERIFY_EMAIL', user.id),
                { recipient: email, secret: otp },
              ),
              occurredAt: now,
              availableAt: now,
            },
          });
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: string }).code === 'P2002'
          ) {
            throw conflict('Email already registered');
          }
          throw error;
        }
      });
      return { acknowledged: true };
    },

    async verifyEmail(input) {
      const payload = parseOrBadRequest(OtpInputSchema, input);
      const email = normalizeEmail(payload.email);
      const expected = Buffer.from(hmacHex('otp', payload.code), 'hex');
      // Lock the live challenge row so a valid code can be redeemed exactly once
      // even when several requests arrive concurrently; the transaction commits
      // or rolls back the attempt accounting and the single consumption together.
      const outcome = await prisma.$transaction(async (tx) => {
        const challenge = (
          await tx.$queryRaw<
            Array<{ id: string; userId: string; attempts: number; secretHash: string }>
          >`
            SELECT c.id, c.user_id AS "userId", c.attempts, c.secret_hash AS "secretHash"
            FROM auth_challenges c
            JOIN users u ON u.id = c.user_id
            WHERE u.email = ${email}
              AND c.purpose = 'VERIFY_EMAIL'
              AND c.consumed_at IS NULL
              AND c.invalidated_at IS NULL
              AND c.expires_at > now()
            ORDER BY c.created_at DESC
            LIMIT 1
            FOR UPDATE OF c`
        )?.at(0);
        if (!challenge) return 'INVALID' as const;
        const stored = Buffer.from(challenge.secretHash, 'hex');
        const matches = stored.length === expected.length && timingSafeEqual(stored, expected);
        if (!matches) {
          // Exactly five wrong attempts are allowed; the sixth is a conflict.
          const bumped = await tx.authChallenge.updateMany({
            where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
            data: { attempts: { increment: 1 } },
          });
          return bumped.count === 0 ? ('CONFLICT' as const) : ('INVALID' as const);
        }
        if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
          // An exhausted challenge is dead for every code, including the original.
          await tx.authChallenge.update({
            where: { id: challenge.id },
            data: { invalidatedAt: new Date() },
          });
          return 'INVALID' as const;
        }
        // Conditional consume decides the single winner under concurrency.
        const consumed = await tx.authChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null, invalidatedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count === 0) return 'INVALID' as const;
        await tx.user.update({
          where: { id: challenge.userId },
          data: { emailVerifiedAt: new Date() },
        });
        return 'OK' as const;
      });
      if (outcome === 'CONFLICT') {
        throw conflict('Too many failed attempts. Request a new code.');
      }
      if (outcome === 'INVALID') throw badRequest('Verification code is invalid or expired');
      return { acknowledged: true };
    },

    async resendOtp(input) {
      const payload = parseOrBadRequest(EmailInputSchema, input);
      const email = normalizeEmail(payload.email);
      const now = Date.now();
      await prisma.$transaction(async (tx) => {
        // The account row lock serializes concurrent resends so the per-user
        // outbox aggregate version cannot collide (count+1 under a stable lock).
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
        const userId = locked[0]?.id;
        // Unknown accounts answer with the same generic acknowledgement.
        if (!userId) return;
        const challenge = (
          await tx.$queryRaw<Array<{ id: string; resendAfter: Date }>>`
            SELECT c.id, c.resend_after AS "resendAfter"
            FROM auth_challenges c
            WHERE c.user_id = ${userId}
              AND c.purpose = 'VERIFY_EMAIL'
              AND c.consumed_at IS NULL
              AND c.invalidated_at IS NULL
            ORDER BY c.created_at DESC
            LIMIT 1`
        )?.at(0);
        if (!challenge) return;
        // Within the per-address cooldown we silently skip the resend but still
        // answer generically, so a known address cannot be distinguished from
        // an unknown one by a 429.
        if (challenge.resendAfter.getTime() > now) return;
        const otp = sixDigitOtp();
        await tx.authChallenge.update({
          where: { id: challenge.id },
          data: {
            secretHash: hmacHex('otp', otp),
            attempts: 0,
            expiresAt: new Date(now + OTP_TTL_MINUTES * 60_000),
            resendAfter: new Date(now + RESEND_COOLDOWN_SECONDS * 1000),
          },
        });
        const priorVersions = await tx.outboxEvent.count({
          where: {
            aggregateType: 'user',
            aggregateId: userId,
            eventType: 'AUTH_VERIFY_EMAIL',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'AUTH_VERIFY_EMAIL',
            aggregateType: 'user',
            aggregateId: userId,
            aggregateVersion: priorVersions + 1,
            payload: { challengeId: challenge.id },
            sensitivePayloadCiphertext: encryptOutboxSecret(
              config.authOutboxKey,
              authEmailAad('AUTH_VERIFY_EMAIL', userId),
              { recipient: email, secret: otp },
            ),
            occurredAt: new Date(now),
            availableAt: new Date(now),
          },
        });
      });
      return { acknowledged: true };
    },

    async login(input) {
      const payload = parseOrBadRequest(LoginInputSchema, input);
      const email = normalizeEmail(payload.email);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        await equalizeTiming(payload.password);
        throw unauthenticated('Invalid email or password');
      }
      if (!(await passwordMatches(user.passwordHash, payload.password))) {
        throw unauthenticated('Invalid email or password');
      }
      if (user.status === 'SUSPENDED') throw forbidden('Account is suspended');
      if (user.emailVerifiedAt === null) {
        throw forbidden('Verify your email before signing in');
      }
      // The session must not outlive a credential change that races this login.
      // Lock the account row and re-check the hash/version it was verified
      // against inside the same transaction, so a concurrent reset (which takes
      // the same lock) either rejects this login or revokes the session it emits.
      const session = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ passwordHash: string; tokenVersion: number }>>`
          SELECT password_hash AS "passwordHash", token_version AS "tokenVersion"
          FROM users WHERE id = ${user.id} FOR UPDATE`;
        const current = locked[0];
        if (
          !current ||
          current.passwordHash !== user.passwordHash ||
          current.tokenVersion !== user.tokenVersion
        ) {
          return null;
        }
        return createSession(tx, user.id, new Date());
      });
      if (!session) throw unauthenticated('Invalid email or password');
      return sessionResponse(user, session.sessionId, session.refreshToken);
    },

    async refresh(rawRefreshToken) {
      if (!rawRefreshToken) throw unauthenticated('Refresh credentials missing');
      const now = new Date();
      const rotated = await prisma.$transaction(async (tx) => {
        const row = await tx.refreshToken.findUnique({
          where: { tokenHash: hmacHex('refresh', rawRefreshToken) },
          include: { session: true },
        });
        if (!row) return null;
        if (row.revokedAt || row.consumedAt) {
          // Replay of an already-rotated or revoked token kills the family.
          await revokeFamily(tx, row.sessionId, 'REPLAY');
          return null;
        }
        if (row.session.revokedAt || row.session.absoluteExpiresAt <= now || row.expiresAt <= now) {
          return null;
        }
        // A conditional consume decides the single winner under concurrency. A
        // losing concurrent replay revokes the whole family so no successor can
        // survive, instead of surfacing an internal uniqueness error.
        const consumed = await tx.refreshToken.updateMany({
          where: { id: row.id, consumedAt: null, revokedAt: null },
          data: { consumedAt: now },
        });
        if (consumed.count === 0) {
          await revokeFamily(tx, row.sessionId, 'REPLAY');
          return null;
        }
        const user = await tx.user.findUniqueOrThrow({
          where: { id: row.session.userId },
        });
        // A suspended or non-active account must not mint fresh credentials.
        if (user.status !== 'ACTIVE') {
          await revokeFamily(tx, row.sessionId, 'SUSPENDED');
          return null;
        }
        const successor = newOpaqueToken();
        await tx.refreshToken.create({
          data: {
            sessionId: row.sessionId,
            tokenHash: hmacHex('refresh', successor),
            parentTokenId: row.id,
            expiresAt: row.session.absoluteExpiresAt,
          },
        });
        return { user, sessionId: row.sessionId, refreshToken: successor };
      });
      if (!rotated) throw unauthenticated('Session expired or revoked');
      return sessionResponse(rotated.user, rotated.sessionId, rotated.refreshToken);
    },

    async logout(rawRefreshToken, bearer) {
      if (rawRefreshToken) {
        await prisma.$transaction(async (tx) => {
          const row = await tx.refreshToken.findUnique({
            where: { tokenHash: hmacHex('refresh', rawRefreshToken) },
            select: { sessionId: true },
          });
          if (row) await revokeFamily(tx, row.sessionId, 'LOGOUT');
        });
      }
      if (bearer) {
        const account = await accountFromBearer(bearer);
        if (account) {
          await prisma.$transaction((tx) => revokeFamily(tx, account.sessionId, 'LOGOUT'));
        }
      }
      return { acknowledged: true };
    },

    async logoutAll(account) {
      await prisma.$transaction((tx) => revokeAllSessions(tx, account.userId, 'LOGOUT_ALL'));
      return { acknowledged: true };
    },

    async listSessions(account, query) {
      const parsed = parseOrBadRequest(PageQuerySchema, query);
      const now = new Date();
      const live = {
        userId: account.userId,
        revokedAt: null,
        absoluteExpiresAt: { gt: now },
      };
      const [total, rows] = await Promise.all([
        prisma.refreshSession.count({ where: live }),
        prisma.refreshSession.findMany({
          where: live,
          orderBy: { createdAt: 'desc' },
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
        }),
      ]);
      const meta: PageMeta = { page: parsed.page, pageSize: parsed.pageSize, total };
      return {
        success: true,
        data: rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.absoluteExpiresAt.toISOString(),
          current: row.id === account.sessionId,
        })),
        meta,
      };
    },

    async revokeSession(account, sessionId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
        throw badRequest('Invalid session identifier');
      }
      const session = await prisma.refreshSession.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true },
      });
      if (!session || session.userId !== account.userId) throw notFound('Session not found');
      await prisma.$transaction((tx) => revokeFamily(tx, session.id, 'REVOKED'));
      return { acknowledged: true };
    },

    async forgotPassword(input) {
      const payload = parseOrBadRequest(EmailInputSchema, input);
      const email = normalizeEmail(payload.email);
      const rawToken = newOpaqueToken();
      const now = Date.now();
      await prisma.$transaction(async (tx) => {
        // Lock the account row so concurrent requests serialize: the previous
        // reset challenge is invalidated and the outbox aggregate version is
        // counted under a stable lock instead of a racy max+1.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
        const userId = locked[0]?.id;
        if (!userId) return; // Generic; no enumeration.
        // A newer request invalidates the prior reset challenge.
        await tx.authChallenge.updateMany({
          where: {
            userId,
            purpose: 'RESET_PASSWORD',
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: new Date(now) },
        });
        const challenge = await tx.authChallenge.create({
          data: {
            userId,
            purpose: 'RESET_PASSWORD',
            secretHash: hmacHex('reset', rawToken),
            expiresAt: new Date(now + RESET_TTL_MINUTES * 60_000),
            attempts: 0,
            resendAfter: new Date(now + RESEND_COOLDOWN_SECONDS * 1000),
          },
          select: { id: true },
        });
        const priorVersions = await tx.outboxEvent.count({
          where: {
            aggregateType: 'user',
            aggregateId: userId,
            eventType: 'AUTH_RESET_PASSWORD',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'AUTH_RESET_PASSWORD',
            aggregateType: 'user',
            aggregateId: userId,
            aggregateVersion: priorVersions + 1,
            payload: { challengeId: challenge.id },
            sensitivePayloadCiphertext: encryptOutboxSecret(
              config.authOutboxKey,
              authEmailAad('AUTH_RESET_PASSWORD', userId),
              { recipient: email, secret: rawToken },
            ),
            occurredAt: new Date(now),
            availableAt: new Date(now),
          },
        });
      });
      return { acknowledged: true };
    },

    async resetPassword(input) {
      const payload = parseOrBadRequest(ResetInputSchema, input);
      const passwordHashed = await passwordHash(payload.newPassword);
      // The one-use consume, password change and session revocation are a
      // single transaction so a crash can never consume the token without
      // applying the reset (or apply it without revoking sessions).
      await prisma.$transaction(async (tx) => {
        const challenge = await tx.authChallenge.findFirst({
          where: {
            purpose: 'RESET_PASSWORD',
            secretHash: hmacHex('reset', payload.token),
            consumedAt: null,
            invalidatedAt: null,
          },
          select: { id: true, userId: true, expiresAt: true },
        });
        if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
          throw badRequest('Reset link is invalid or expired');
        }
        const consumed = await tx.authChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null, invalidatedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count === 0) throw badRequest('Reset link is invalid or expired');
        // Take the same account-row lock login uses so a stale-password login
        // cannot commit a session after this reset and then refresh.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${challenge.userId} FOR UPDATE`;
        await tx.user.update({
          where: { id: challenge.userId },
          data: { passwordHash: passwordHashed },
        });
        // Every existing access/refresh credential stops being valid.
        await revokeAllSessions(tx, challenge.userId, 'PASSWORD_RESET');
      });
      return { acknowledged: true };
    },

    requireAccount(req, _res, next) {
      const header = req.headers.authorization;
      const bearer =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!bearer) {
        next(unauthenticated('Authentication required'));
        return;
      }
      accountFromBearer(bearer)
        .then((account) => {
          if (!account) {
            next(unauthenticated('Authentication required'));
            return;
          }
          (req as AccountRequest).account = account;
          next();
        })
        .catch(() => next(unauthenticated('Authentication required')));
    },
  };
}
