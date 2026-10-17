import { Router, type Request, type RequestHandler, type Response } from 'express';
import { RoleInputSchema } from '@drivehire/contracts';
import type { Config } from '../../config/env.js';
import { badRequest, forbidden, tooManyRequests } from '../../errors.js';
import type { PrismaClient } from '../../generated/client/client.js';
import { createProfileService } from './profile.js';
import { createRateLimiter, type RateLimitBudget, type RateLimiter } from './rate-limit.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_TTL_SECONDS,
  createAccountsService,
  type AccountRequest,
  type AuthenticatedSession,
} from './service.js';

export interface AccountsDependencies {
  prisma: PrismaClient;
  config: Config;
}

function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return value.join('=');
  }
  return undefined;
}

function writeRefreshCookie(res: Response, token: string, config: Config): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secure,
    path: '/api/v1/auth',
    maxAge: REFRESH_COOKIE_TTL_SECONDS * 1000,
  });
}

function clearRefreshCookie(res: Response, config: Config): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secure,
    path: '/api/v1/auth',
  });
}

function tokenEnvelope(session: AuthenticatedSession) {
  return {
    success: true as const,
    data: {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    },
  };
}

function accountOf(req: Request) {
  const account = (req as AccountRequest).account;
  if (!account) throw badRequest('Request validation failed');
  return account;
}

function submittedEmail(req: Request): string | undefined {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : undefined;
}

/**
 * Durable route/account/IP budget guard. IP budgets apply to every caller
 * uniformly; address budgets key on the submitted email so the generic
 * acknowledgements stay enumeration-safe. Applied before any hashing or account
 * lookup, and denies with 429 + Retry-After per the active OpenAPI.
 */
function limitRequests(
  limiter: RateLimiter,
  name: string,
  budgets: { ip: RateLimitBudget; address?: RateLimitBudget },
): RequestHandler {
  return async (req, _res, next) => {
    const checks: Array<{ key: string; budget: RateLimitBudget }> = [
      { key: `${name}:ip:${req.ip ?? 'unknown'}`, budget: budgets.ip },
    ];
    if (budgets.address) {
      const email = submittedEmail(req);
      if (email) checks.push({ key: `${name}:address:${email}`, budget: budgets.address });
    }
    try {
      for (const check of checks) {
        const result = await limiter.consume(check.key, check.budget);
        if (!result.allowed) {
          _res.setHeader('Retry-After', String(result.retryAfterSeconds));
          next(tooManyRequests('Too many requests; please try again later'));
          return;
        }
      }
      next();
    } catch (error) {
      next(error as Error);
    }
  };
}

/**
 * Real account/auth/profile routes. Handlers own strict IO and response
 * envelopes; the services own every business transaction. Rejections are
 * forwarded to the central error handler by Express 5's async support.
 */
export function createAccountsRouter({ prisma, config }: AccountsDependencies): Router {
  const service = createAccountsService({ prisma, config });
  const profile = createProfileService({ prisma });
  const limiter = createRateLimiter({ prisma, pepper: config.authJwtSecret });
  const router = Router();

  router.post(
    '/auth/register',
    limitRequests(limiter, 'register', { ip: { limit: 5, windowSeconds: 3600 } }),
    async (req, res) => {
      await service.register(req.body);
      res.status(202).json({ success: true, data: { acknowledged: true } });
    },
  );

  router.post(
    '/auth/verify-email',
    limitRequests(limiter, 'verify', { ip: { limit: 10, windowSeconds: 60 } }),
    async (req, res) => {
      await service.verifyEmail(req.body);
      res.json({ success: true, data: { acknowledged: true } });
    },
  );

  router.post(
    '/auth/resend-otp',
    limitRequests(limiter, 'resend', {
      ip: { limit: 10, windowSeconds: 3600 },
      address: { limit: 5, windowSeconds: 3600 },
    }),
    async (req, res) => {
      await service.resendOtp(req.body);
      res.status(202).json({ success: true, data: { acknowledged: true } });
    },
  );

  router.post(
    '/auth/login',
    limitRequests(limiter, 'login', {
      ip: { limit: 10, windowSeconds: 60 },
      address: { limit: 10, windowSeconds: 900 },
    }),
    async (req, res) => {
      const session = await service.login(req.body);
      writeRefreshCookie(res, session.refreshToken, config);
      res.json(tokenEnvelope(session));
    },
  );

  router.post(
    '/auth/refresh',
    limitRequests(limiter, 'refresh', { ip: { limit: 60, windowSeconds: 60 } }),
    async (req, res) => {
      const session = await service.refresh(readRefreshCookie(req));
      writeRefreshCookie(res, session.refreshToken, config);
      res.json(tokenEnvelope(session));
    },
  );

  router.post('/auth/logout', async (req, res) => {
    const header = req.headers.authorization;
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    await service.logout(readRefreshCookie(req), bearer);
    clearRefreshCookie(res, config);
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.post('/auth/logout-all', service.requireAccount, async (req, res) => {
    await service.logoutAll(accountOf(req));
    clearRefreshCookie(res, config);
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.get('/auth/sessions', service.requireAccount, async (req, res) => {
    const page = await service.listSessions(accountOf(req), req.query as Record<string, string>);
    res.json(page);
  });

  router.delete('/auth/sessions/:id', service.requireAccount, async (req, res) => {
    const sessionId = req.params['id'];
    await service.revokeSession(accountOf(req), typeof sessionId === 'string' ? sessionId : '');
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.post(
    '/auth/forgot-password',
    limitRequests(limiter, 'forgot', {
      ip: { limit: 10, windowSeconds: 3600 },
      address: { limit: 5, windowSeconds: 3600 },
    }),
    async (req, res) => {
      await service.forgotPassword(req.body);
      res.status(202).json({ success: true, data: { acknowledged: true } });
    },
  );

  router.post(
    '/auth/reset-password',
    limitRequests(limiter, 'reset', { ip: { limit: 10, windowSeconds: 3600 } }),
    async (req, res) => {
      await service.resetPassword(req.body);
      res.json({ success: true, data: { acknowledged: true } });
    },
  );

  router.get('/users/me', service.requireAccount, async (req, res) => {
    const user = await profile.getProfile(accountOf(req));
    res.json({ success: true, data: user });
  });

  router.patch('/users/me', service.requireAccount, async (req, res) => {
    const user = await profile.updateProfile(accountOf(req), req.body);
    res.json({ success: true, data: user });
  });

  router.post('/users/me/roles', service.requireAccount, async (req, res) => {
    const role = (req.body as { role?: unknown } | undefined)?.role;
    if (typeof role !== 'string') throw badRequest('Request validation failed');
    // Only DRIVER is self-grantable; ADMIN is operator-granted and OWNER is retired.
    if (role !== 'DRIVER') throw forbidden('That role cannot be self-enabled');
    // Strict schema rejects unknown/extra properties as 400, never a 500.
    if (!RoleInputSchema.safeParse(req.body).success) {
      throw badRequest('Request validation failed');
    }
    const user = await profile.enableDriver(accountOf(req));
    res.json({ success: true, data: user });
  });

  return router;
}
