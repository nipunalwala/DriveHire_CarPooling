import { Router, type Request, type RequestHandler } from 'express';
import { unauthenticated } from '../../errors.js';
import type { PrismaClient } from '../../generated/client/client.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { requireAdmin } from './service.js';
import { createAdminOperations } from './operations.js';

export interface AdminOperationsDependencies {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

/**
 * Read-only administrator journey operations. The coordinator mounts this
 * factory alongside the existing admin router; mutations stay in the participant
 * booking/trip services.
 */
export function createAdminOperationsRouter(deps: AdminOperationsDependencies): Router {
  const operations = createAdminOperations({ prisma: deps.prisma });
  const router = Router();
  const admin = [deps.requireAccount, requireAdmin];

  router.get('/admin/bookings', ...admin, async (req, res) => {
    res.json(await operations.listBookings(accountOf(req), req.query as Record<string, unknown>));
  });

  router.get('/admin/trips', ...admin, async (req, res) => {
    res.json(await operations.listTrips(accountOf(req), req.query as Record<string, unknown>));
  });

  return router;
}
