import { Router, type Request, type RequestHandler } from 'express';
import type { PrismaClient } from '../../generated/client/client.js';
import { unauthenticated } from '../../errors.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { createBookingsReadService } from './read-service.js';

export interface BookingsReadDependencies {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

export function createBookingsReadRouter(deps: BookingsReadDependencies): Router {
  const service = createBookingsReadService({ prisma: deps.prisma });
  const router = Router();

  router.get('/bookings', deps.requireAccount, async (req, res) => {
    res.json(await service.listBookings(accountOf(req), req.query as Record<string, unknown>));
  });

  router.get('/drivers/me/bookings', deps.requireAccount, async (req, res) => {
    res.json(
      await service.listDriverBookings(accountOf(req), req.query as Record<string, unknown>),
    );
  });

  router.get('/bookings/:id', deps.requireAccount, async (req, res) => {
    const booking = await service.getBooking(accountOf(req), String(req.params.id ?? ''));
    res.json({ success: true as const, data: booking });
  });

  return router;
}
