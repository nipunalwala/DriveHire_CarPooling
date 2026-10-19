import { Router } from 'express';
import type { PrismaClient } from '../../generated/client/client.js';
import { createCitiesService } from './service.js';

export function createCitiesRouter({ prisma }: { prisma: PrismaClient }): Router {
  const service = createCitiesService({ prisma });
  const router = Router();

  router.get('/cities', async (req, res) => {
    res.json(await service.list(req.query as Record<string, string>));
  });

  return router;
}
