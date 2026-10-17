import { Router, type Request, type Response } from 'express';
import { RoleInputSchema } from '@drivehire/contracts';
import type { Config } from '../../config/env.js';
import { badRequest, forbidden } from '../../errors.js';
import type { MailAdapter } from '../../ports.js';
import type { PrismaClient } from '../../generated/client/client.js';
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
  mail: MailAdapter;
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

/**
 * Real account/auth routes. Handlers own strict IO and response envelopes; the
 * service owns every business transaction. Rejections are forwarded to the
 * central error handler by Express 5's async support.
 */
export function createAccountsRouter({ prisma, config, mail }: AccountsDependencies): Router {
  const service = createAccountsService({ prisma, config });
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    await service.register(req.body, mail);
    res.status(202).json({ success: true, data: { acknowledged: true } });
  });

  router.post('/auth/verify-email', async (req, res) => {
    await service.verifyEmail(req.body);
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.post('/auth/resend-otp', async (req, res) => {
    await service.resendOtp(req.body, mail);
    res.status(202).json({ success: true, data: { acknowledged: true } });
  });

  router.post('/auth/login', async (req, res) => {
    const session = await service.login(req.body);
    writeRefreshCookie(res, session.refreshToken, config);
    res.json(tokenEnvelope(session));
  });

  router.post('/auth/refresh', async (req, res) => {
    const session = await service.refresh(readRefreshCookie(req));
    writeRefreshCookie(res, session.refreshToken, config);
    res.json(tokenEnvelope(session));
  });

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

  router.post('/auth/forgot-password', async (req, res) => {
    await service.forgotPassword(req.body, mail);
    res.status(202).json({ success: true, data: { acknowledged: true } });
  });

  router.post('/auth/reset-password', async (req, res) => {
    await service.resetPassword(req.body);
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.post('/users/me/roles', service.requireAccount, async (req, res) => {
    const role = (req.body as { role?: unknown } | undefined)?.role;
    if (typeof role !== 'string') throw badRequest('Request validation failed');
    // Only DRIVER is self-grantable; ADMIN is operator-granted and OWNER is retired.
    if (role !== 'DRIVER') throw forbidden('That role cannot be self-enabled');
    RoleInputSchema.parse(req.body);
    const user = await service.enableDriver(accountOf(req));
    res.json({ success: true, data: user });
  });

  return router;
}
