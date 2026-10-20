import { adminCarpools } from './operations.js';
import { createCarpoolLifecycle } from './lifecycle.js';
import { createSeatsService } from './seats.js';
import { Router, type Request, type RequestHandler } from 'express';
import type { PrismaClient } from '../../generated/client/client.js';
import { notFound, unauthenticated } from '../../errors.js';
import { z } from 'zod';
import type { AccountRequest } from '../accounts/service.js';
import { createCarpoolsService } from './service.js';
export function createCarpoolsRouter({
  prisma,
  requireAccount,
}: {
  prisma: PrismaClient;
  requireAccount: RequestHandler;
}) {
  const router = Router(),
    service = createCarpoolsService({ prisma });
  const account = (req: Request) => {
    const account = (req as AccountRequest).account;
    if (!account) throw unauthenticated();
    return account;
  };
  const id = (req: Request) => {
    const id = String(req.params.id ?? '');
    if (!z.uuid().safeParse(id).success) throw notFound();
    return id;
  };
  router.get('/carpools', async (req, res) => res.json(await service.searchCarpools(req.query)));
  router.get('/users/me/carpools', requireAccount, async (req, res) =>
    res.json(await service.listMyCarpools(account(req), req.query)),
  );
  router.get(
    '/carpools/:id',
    (req, res, next) => (req.header('Authorization') ? requireAccount(req, res, next) : next()),
    async (req, res) =>
      res.json({
        success: true,
        data: await service.getCarpool(id(req), (req as AccountRequest).account),
      }),
  );
  router.post('/carpools', requireAccount, async (req, res) =>
    res.status(201).json({
      success: true,
      data: await service.createCarpool(
        account(req),
        req.body,
        String(res.getHeader('X-Request-ID')),
      ),
    }),
  );
  router.put('/carpools/:id', requireAccount, async (req, res) =>
    res.json({
      success: true,
      data: await service.updateCarpool(
        account(req),
        id(req),
        req.body,
        String(res.getHeader('X-Request-ID')),
      ),
    }),
  );
  router.post('/carpools/:id/publish', requireAccount, async (req, res) =>
    res.json({
      success: true,
      data: await service.publishCarpool(
        account(req),
        id(req),
        req.body,
        String(res.getHeader('X-Request-ID')),
      ),
    }),
  );
  const seats = createSeatsService({ prisma });
  router.post('/carpools/:id/seat-requests', requireAccount, async (req, res) => {
    const result = await seats.requestSeat(
      account(req),
      id(req),
      req.body,
      req.header('Idempotency-Key') ?? '',
      String(res.getHeader('X-Request-ID')),
    );
    res.status(result.status).json(result.body);
  });
  router.get('/carpools/:id/seat-requests', requireAccount, async (req, res) =>
    res.json(await seats.listSeatRequests(account(req), id(req), req.query)),
  );
  router.get('/users/me/seat-requests', requireAccount, async (req, res) =>
    res.json(await seats.listMySeats(account(req), req.query)),
  );
  router.post('/seat-requests/:id/cancel', requireAccount, async (req, res) =>
    res.json({
      success: true,
      data: await seats.cancelSeat(
        account(req),
        id(req),
        req.body,
        String(res.getHeader('X-Request-ID')),
      ),
    }),
  );
  const lifecycle = createCarpoolLifecycle({ prisma });
  router.post('/carpools/:id/cancel', requireAccount, async (req, res) =>
    res.json({
      success: true,
      data: await lifecycle.cancelCarpool(
        account(req),
        id(req),
        req.body,
        String(res.getHeader('X-Request-ID')),
      ),
    }),
  );
  router.get('/admin/carpools', requireAccount, async (req, res) =>
    res.json(await adminCarpools(prisma, account(req), req.query)),
  );
  return router;
}
