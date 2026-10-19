import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '../../generated/client/client.js';
import { unauthenticated } from '../../errors.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { createTripsService } from './service.js';

export interface TripsDependencies {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

function requestIdOf(res: Response): string {
  const header = res.getHeader('X-Request-ID');
  return typeof header === 'string' ? header : '';
}

export function createTripsRouter(deps: TripsDependencies): Router {
  const service = createTripsService({ prisma: deps.prisma });
  const router = Router();

  router.get('/trips', deps.requireAccount, async (req, res) => {
    const page = await service.listTrips(accountOf(req), req.query as Record<string, string>);
    res.json(page);
  });

  router.get('/trips/:id', deps.requireAccount, async (req, res) => {
    const trip = await service.getTrip(accountOf(req), req.params.id as string);
    res.json({ success: true as const, data: trip });
  });

  router.get('/trips/:id/history', deps.requireAccount, async (req, res) => {
    const page = await service.tripHistory(
      accountOf(req),
      req.params.id as string,
      req.query as Record<string, string>,
    );
    res.json(page);
  });

  router.post('/trips/:id/transitions', deps.requireAccount, async (req, res) => {
    const trip = await service.transitionTrip(
      accountOf(req),
      req.params.id as string,
      req.body,
      requestIdOf(res),
    );
    res.json({ success: true as const, data: trip });
  });

  return router;
}
