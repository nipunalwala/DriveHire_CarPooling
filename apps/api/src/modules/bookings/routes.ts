import { Router, type Request, type RequestHandler } from 'express';
import type { PrismaClient } from '../../generated/client/client.js';
import { badRequest, unauthenticated } from '../../errors.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { createDecisionsService } from './decisions.js';
import { createBookingsService } from './service.js';

export interface BookingsDependencies {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

export function createBookingsRouter(deps: BookingsDependencies): Router {
  const service = createBookingsService({ prisma: deps.prisma });
  const decisions = createDecisionsService({ prisma: deps.prisma });
  const router = Router();

  function requestIdOf(res: { getHeader(name: string): unknown }): string {
    return String(res.getHeader('X-Request-ID') ?? '');
  }

  router.post('/booking-quotes', deps.requireAccount, async (req, res) => {
    const quote = await service.quoteBooking(accountOf(req), req.body);
    res.status(201).json({ success: true, data: quote });
  });

  router.post('/bookings', deps.requireAccount, async (req, res) => {
    const key = req.header('Idempotency-Key');
    if (!key) throw badRequest('Idempotency-Key header is required');
    const result = await service.createBooking(
      accountOf(req),
      req.body,
      key,
      String(res.getHeader('X-Request-ID')),
    );
    res.status(result.status).json(result.body);
  });

  router.post('/bookings/:id/decisions', deps.requireAccount, async (req, res) => {
    const booking = await decisions.decideBooking(
      accountOf(req),
      String(req.params.id ?? ''),
      req.body,
      requestIdOf(res),
    );
    res.status(200).json({ success: true, data: booking });
  });

  router.post('/bookings/:id/cancel', deps.requireAccount, async (req, res) => {
    const booking = await decisions.cancelBooking(
      accountOf(req),
      String(req.params.id ?? ''),
      req.body,
      requestIdOf(res),
    );
    res.status(200).json({ success: true, data: booking });
  });

  return router;
}
