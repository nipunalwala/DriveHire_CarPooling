import { Router, type Request, type RequestHandler } from 'express';
import { unauthenticated } from '../../errors.js';
import type { PrismaClient } from '../../generated/client/client.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { createAdminService, requireAdmin, type RequestContext } from './service.js';

export interface AdminDependencies {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

function contextOf(req: Request): RequestContext {
  const header = req.headers['x-request-id'];
  const requestId = Array.isArray(header) ? header[0] : header;
  return { requestId: typeof requestId === 'string' && requestId ? requestId : 'unknown' };
}

export function createAdminRouter(deps: AdminDependencies): Router {
  const service = createAdminService({ prisma: deps.prisma });
  const router = Router();
  const admin = [deps.requireAccount, requireAdmin];

  router.get('/admin/users', ...admin, async (req, res) => {
    res.json(await service.listUsers(accountOf(req), req.query as Record<string, string>));
  });

  router.get('/admin/users/:id', ...admin, async (req, res) => {
    res.json({
      success: true,
      data: await service.getUser(accountOf(req), String(req.params['id'] ?? ''), contextOf(req)),
    });
  });

  router.post('/admin/users/:id/suspend', ...admin, async (req, res) => {
    res.json({
      success: true,
      data: await service.suspendUser(
        accountOf(req),
        String(req.params['id'] ?? ''),
        req.body,
        contextOf(req),
      ),
    });
  });

  router.post('/admin/users/:id/reactivate', ...admin, async (req, res) => {
    res.json({
      success: true,
      data: await service.reactivateUser(
        accountOf(req),
        String(req.params['id'] ?? ''),
        req.body,
        contextOf(req),
      ),
    });
  });

  router.get('/admin/verifications', ...admin, async (req, res) => {
    res.json(await service.listVerifications(accountOf(req), req.query as Record<string, string>));
  });

  router.get('/admin/verifications/:id', ...admin, async (req, res) => {
    res.json({
      success: true,
      data: await service.getVerification(
        accountOf(req),
        String(req.params['id'] ?? ''),
        contextOf(req),
      ),
    });
  });

  router.post('/admin/verifications/:id/decision', ...admin, async (req, res) => {
    res.json({
      success: true,
      data: await service.decideVerification(
        accountOf(req),
        String(req.params['id'] ?? ''),
        req.body,
        contextOf(req),
      ),
    });
  });

  router.get('/admin/audit-logs', ...admin, async (req, res) => {
    res.json(await service.listAuditLogs(accountOf(req), req.query as Record<string, string>));
  });

  return router;
}
