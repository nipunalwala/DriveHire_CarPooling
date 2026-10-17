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
import type { MailAdapter } from '../../ports.js';
import type { PrismaClient } from '../../generated/client/client.js';
import type { Config } from '../../config/env.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  tooManyRequests,
  unauthenticated,
} from '../../errors.js';

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

type UserRow = {
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

function toUserDto(row: UserRow, roles: Role[]): UserDto {
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
  register(input: unknown, mail: MailAdapter): Promise<{ acknowledged: true }>;
  verifyEmail(input: unknown): Promise<{ acknowledged: true }>;
  resendOtp(input: unknown, mail: MailAdapter): Promise<{ acknowledged: true }>;
  login(input: unknown): Promise<AuthenticatedSession>;
  refresh(rawRefreshToken: string | undefined): Promise<AuthenticatedSession>;
  logout(
    rawRefreshToken: string | undefined,
    bearer: string | undefined,
  ): Promise<{ acknowledged: true }>;
  logoutAll(account: CurrentAccount): Promise<{ acknowledged: true }>;
  listSessions(account: CurrentAccount, query: Record<string, string>): Promise<Page<SessionDto>>;
  revokeSession(account: CurrentAccount, sessionId: string): Promise<{ acknowledged: true }>;
  forgotPassword(input: unknown, mail: MailAdapter): Promise<{ acknowledged: true }>;
  resetPassword(input: unknown): Promise<{ acknowledged: true }>;
  enableDriver(account: CurrentAccount): Promise<UserDto>;
  requireAccount(req: Request, res: Response, next: NextFunction): void;
}

const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

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

  async function rolesOf(userId: string): Promise<Role[]> {
    const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    return [...new Set(rows.map((row) => row.role as Role))].sort();
  }

  async function createSession(
    userId: string,
    when: Date,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const absoluteExpiresAt = new Date(when.getTime() + FAMILY_TTL_DAYS * 24 * 3600 * 1000);
    const session = await prisma.refreshSession.create({
      data: { userId, absoluteExpiresAt },
      select: { id: true },
    });
    const refreshToken = newOpaqueToken();
    await prisma.refreshToken.create({
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
      user: toUserDto(user, await rolesOf(user.id)),
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
        roles: await rolesOf(claims.sub),
      };
    } catch {
      return null;
    }
  }

  return {
    async register(input, mail) {
      const payload = parseOrBadRequest(RegisterInputSchema, input);
      const email = normalizeEmail(payload.email);
      const passwordHashed = await passwordHash(payload.password);
      let otp = '';
      const created = await prisma.$transaction(async (tx) => {
        try {
          const user = await tx.user.create({
            data: { email, displayName: payload.displayName, passwordHash: passwordHashed },
            select: { id: true },
          });
          await tx.userRole.create({ data: { userId: user.id, role: 'PASSENGER' } });
          const now = new Date();
          otp = sixDigitOtp();
          await tx.authChallenge.create({
            data: {
              userId: user.id,
              purpose: 'VERIFY_EMAIL',
              secretHash: hmacHex('otp', otp),
              expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
              attempts: 0,
              resendAfter: new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000),
            },
          });
          // The verification email is committed durably with the account so a
          // delivery failure can never strand an unverified account (Task2
          // delivers from this outbox via the worker).
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
              payload: { subject: 'Verify your DriveHire account' },
              occurredAt: now,
              availableAt: now,
            },
          });
          return user.id;
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
      // Direct send keeps Task1 journeys usable; outbox retry (Task2) is the
      // durable backstop. Failures after commit must not fail the request.
      try {
        await mail.send({
          recipient: email,
          subject: 'Verify your DriveHire account',
          text: `Your DriveHire verification code is ${otp}. It expires in 10 minutes.`,
          messageId: created,
        });
      } catch {
        /* Outbox retry covers delivery. */
      }
      return { acknowledged: true };
    },

    async verifyEmail(input) {
      const payload = parseOrBadRequest(OtpInputSchema, input);
      const challenge = (
        await prisma.$queryRaw<
          Array<{ id: string; userId: string; attempts: number; secretHash: string }>
        >`
          SELECT c.id, c.user_id AS "userId", c.attempts, c.secret_hash AS "secretHash"
          FROM auth_challenges c
          JOIN users u ON u.id = c.user_id
          WHERE u.email = ${normalizeEmail(payload.email)}
            AND c.purpose = 'VERIFY_EMAIL'
            AND c.consumed_at IS NULL
            AND c.invalidated_at IS NULL
            AND c.expires_at > now()
          ORDER BY c.created_at DESC
          LIMIT 1`
      )?.at(0);
      if (!challenge) throw badRequest('Verification code is invalid or expired');
      const expected = Buffer.from(hmacHex('otp', payload.code), 'hex');
      const stored = Buffer.from(challenge.secretHash, 'hex');
      if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) {
        // Atomic conditional attempt bump: an exhausted row can never pass.
        // Exactly five wrong attempts are allowed; the sixth is a conflict.
        const bumped = await prisma.authChallenge.updateMany({
          where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
          data: { attempts: { increment: 1 } },
        });
        if (bumped.count === 0) {
          throw conflict('Too many failed attempts. Request a new code.');
        }
        throw badRequest('Verification code is invalid or expired');
      }
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        // An exhausted challenge is dead for every code, including the original.
        await prisma.authChallenge.update({
          where: { id: challenge.id },
          data: { invalidatedAt: new Date() },
        });
        throw badRequest('Verification code is invalid or expired');
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: challenge.userId },
          data: { emailVerifiedAt: new Date() },
        }),
        prisma.authChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        }),
      ]);
      return { acknowledged: true };
    },

    async resendOtp(input, mail) {
      const payload = parseOrBadRequest(EmailInputSchema, input);
      const email = normalizeEmail(payload.email);
      const challenge = (
        await prisma.$queryRaw<Array<{ id: string; userId: string; resendAfter: Date }>>`
          SELECT c.id, c.user_id AS "userId", c.resend_after AS "resendAfter"
          FROM auth_challenges c
          JOIN users u ON u.id = c.user_id
          WHERE u.email = ${email}
            AND c.purpose = 'VERIFY_EMAIL'
            AND c.consumed_at IS NULL
            AND c.invalidated_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 1`
      )?.at(0);
      // Unknown or consumed challenges answer with a generic acknowledgement.
      if (!challenge) return { acknowledged: true };
      if (challenge.resendAfter.getTime() > Date.now()) {
        throw tooManyRequests('Please wait before requesting another code');
      }
      const otp = sixDigitOtp();
      const now = Date.now();
      await prisma.$transaction(async (tx) => {
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
            aggregateId: challenge.userId,
            eventType: 'AUTH_VERIFY_EMAIL',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'AUTH_VERIFY_EMAIL',
            aggregateType: 'user',
            aggregateId: challenge.userId,
            aggregateVersion: priorVersions + 1,
            payload: { subject: 'Your new DriveHire verification code' },
            occurredAt: new Date(now),
            availableAt: new Date(now),
          },
        });
      });
      try {
        await mail.send({
          recipient: email,
          subject: 'Your new DriveHire verification code',
          text: `Your DriveHire verification code is ${otp}. It expires in 10 minutes.`,
          messageId: challenge.userId,
        });
      } catch {
        /* Outbox retry covers delivery. */
      }
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
      const session = await createSession(user.id, new Date());
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
        const successor = newOpaqueToken();
        await tx.refreshToken.update({
          where: { id: row.id },
          data: { consumedAt: now },
        });
        await tx.refreshToken.create({
          data: {
            sessionId: row.sessionId,
            tokenHash: hmacHex('refresh', successor),
            parentTokenId: row.id,
            expiresAt: row.session.absoluteExpiresAt,
          },
        });
        const user = await tx.user.findUniqueOrThrow({
          where: { id: row.session.userId },
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

    async forgotPassword(input, mail) {
      const payload = parseOrBadRequest(EmailInputSchema, input);
      const email = normalizeEmail(payload.email);
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) return { acknowledged: true }; // Generic; no enumeration.
      const rawToken = newOpaqueToken();
      const now = Date.now();
      await prisma.$transaction(async (tx) => {
        // A newer request invalidates the prior reset challenge.
        await tx.authChallenge.updateMany({
          where: {
            userId: user.id,
            purpose: 'RESET_PASSWORD',
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: new Date(now) },
        });
        await tx.authChallenge.create({
          data: {
            userId: user.id,
            purpose: 'RESET_PASSWORD',
            secretHash: hmacHex('reset', rawToken),
            expiresAt: new Date(now + RESET_TTL_MINUTES * 60_000),
            attempts: 0,
            resendAfter: new Date(now + RESEND_COOLDOWN_SECONDS * 1000),
          },
        });
        const priorVersions = await tx.outboxEvent.count({
          where: {
            aggregateType: 'user',
            aggregateId: user.id,
            eventType: 'AUTH_RESET_PASSWORD',
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'AUTH_RESET_PASSWORD',
            aggregateType: 'user',
            aggregateId: user.id,
            aggregateVersion: priorVersions + 1,
            payload: { subject: 'Reset your DriveHire password' },
            occurredAt: new Date(now),
            availableAt: new Date(now),
          },
        });
      });
      try {
        await mail.send({
          recipient: email,
          subject: 'Reset your DriveHire password',
          text: `Use this one-use link within 15 minutes to reset your password: ${config.appOrigin}/reset-password?token=${rawToken}`,
          messageId: user.id,
        });
      } catch {
        /* Outbox retry covers delivery. */
      }
      return { acknowledged: true };
    },

    async resetPassword(input) {
      const payload = parseOrBadRequest(ResetInputSchema, input);
      const challenge = await prisma.authChallenge.findFirst({
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
      // One use only: the conditional consume decides the winner.
      const consumed = await prisma.authChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, invalidatedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) throw badRequest('Reset link is invalid or expired');
      const passwordHashed = await passwordHash(payload.newPassword);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: challenge.userId },
          data: { passwordHash: passwordHashed },
        });
        // Every existing access/refresh credential stops being valid.
        await revokeAllSessions(tx, challenge.userId, 'PASSWORD_RESET');
      });
      return { acknowledged: true };
    },

    async enableDriver(account) {
      const user = await prisma.user.findUnique({ where: { id: account.userId } });
      if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt === null) {
        throw forbidden('Verified active accounts may enable driver onboarding');
      }
      try {
        await prisma.userRole.create({ data: { userId: account.userId, role: 'DRIVER' } });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          throw conflict('Driver role is already enabled');
        }
        throw error;
      }
      return toUserDto(user, await rolesOf(account.userId));
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
