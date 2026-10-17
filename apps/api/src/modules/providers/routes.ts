import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { badRequest, forbidden, unauthenticated } from '../../errors.js';
import type { Config } from '../../config/env.js';
import type { PrismaClient } from '../../generated/client/client.js';
import type { ScanAdapter, StorageAdapter } from '../../ports.js';
import type { AccountRequest, CurrentAccount } from '../accounts/service.js';
import { createProvidersService, type ProviderDeps, type UploadInput } from './service.js';
import { createAvailabilityService } from './availability.js';
import { readMultipart } from './multipart.js';

export interface ProvidersDependencies extends ProviderDeps {
  prisma: PrismaClient;
  config: Config;
  storage: StorageAdapter;
  scanner: ScanAdapter;
  requireAccount: RequestHandler;
}

function accountOf(req: Request): CurrentAccount {
  const account = (req as AccountRequest).account;
  if (!account) throw unauthenticated('Authentication required');
  return account;
}

function requireRole(role: 'DRIVER'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const account = (req as AccountRequest).account;
    if (!account) return next(unauthenticated('Authentication required'));
    if (!account.roles.includes(role)) return next(forbidden('Driver role is required'));
    next();
  };
}

async function readUpload(req: Request): Promise<UploadInput> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw badRequest('Expected multipart/form-data');
  }
  const body = await readMultipart(req, contentType);
  const file = body.files[0];
  if (!file) throw badRequest('A file is required');
  const input: UploadInput = {
    kind: body.fields['kind'] ?? '',
    declaredContentType: file.contentType,
    bytes: file.data,
  };
  const expiresOn = body.fields['expiresOn'];
  if (expiresOn) input.expiresOn = expiresOn;
  return input;
}

export function createProvidersRouter(deps: ProvidersDependencies): Router {
  const service = createProvidersService(deps);
  const availability = createAvailabilityService({ prisma: deps.prisma });
  const router = Router();
  const driver = [deps.requireAccount, requireRole('DRIVER')];

  // Public directory (must precede the /drivers/:id param route).
  router.get('/drivers', async (req, res) => {
    const page = await service.searchDrivers(req.query as Record<string, string>);
    res.json(page);
  });

  router.get('/drivers/me', ...driver, async (req, res) => {
    res.json({ success: true, data: await service.getMyDriver(accountOf(req)) });
  });

  router.put('/drivers/me', ...driver, async (req, res) => {
    res.json({ success: true, data: await service.upsertDriver(accountOf(req), req.body) });
  });

  router.get('/drivers/me/documents', ...driver, async (req, res) => {
    const page = await service.listDriverDocuments(
      accountOf(req),
      req.query as Record<string, string>,
    );
    res.json(page);
  });

  router.post('/drivers/me/documents', ...driver, async (req, res) => {
    const document = await service.uploadDriverDocument(accountOf(req), await readUpload(req));
    res.status(201).json({ success: true, data: document });
  });

  router.post('/drivers/me/verification', ...driver, async (req, res) => {
    const verification = await service.submitDriverVerification(accountOf(req), req.body);
    res.status(201).json({ success: true, data: verification });
  });

  router.patch('/drivers/me/listing', ...driver, async (req, res) => {
    res.json({ success: true, data: await service.setDriverListing(accountOf(req), req.body) });
  });

  router.get('/drivers/me/availability', ...driver, async (req, res) => {
    res.json(await availability.list(accountOf(req), req.query as Record<string, string>));
  });

  router.post('/drivers/me/availability', ...driver, async (req, res) => {
    const window = await availability.create(accountOf(req), req.body);
    res.status(201).json({ success: true, data: window });
  });

  router.delete('/drivers/me/availability/:id', ...driver, async (req, res) => {
    const ack = await availability.remove(accountOf(req), String(req.params['id'] ?? ''));
    res.json({ success: true, data: ack });
  });

  router.get('/drivers/:id', async (req, res) => {
    res.json({ success: true, data: await service.getDriver(String(req.params['id'] ?? '')) });
  });

  // Personal vehicles (ownership is users.id; no OWNER role/fleet surface).
  router.post('/vehicles', deps.requireAccount, async (req, res) => {
    const vehicle = await service.createVehicle(accountOf(req), req.body);
    res.status(201).json({ success: true, data: vehicle });
  });

  router.get('/users/me/vehicles', deps.requireAccount, async (req, res) => {
    res.json(await service.listMyVehicles(accountOf(req), req.query as Record<string, string>));
  });

  router.put('/vehicles/:id', deps.requireAccount, async (req, res) => {
    const vehicle = await service.updateVehicle(
      accountOf(req),
      String(req.params['id'] ?? ''),
      req.body,
    );
    res.json({ success: true, data: vehicle });
  });

  router.delete('/vehicles/:id', deps.requireAccount, async (req, res) => {
    const ack = await service.archiveVehicle(accountOf(req), String(req.params['id'] ?? ''));
    res.json({ success: true, data: ack });
  });

  router.get('/vehicles/:id/documents', deps.requireAccount, async (req, res) => {
    const page = await service.listVehicleDocuments(
      accountOf(req),
      String(req.params['id'] ?? ''),
      req.query as Record<string, string>,
    );
    res.json(page);
  });

  router.post('/vehicles/:id/documents', deps.requireAccount, async (req, res) => {
    const document = await service.uploadVehicleDocument(
      accountOf(req),
      String(req.params['id'] ?? ''),
      await readUpload(req),
    );
    res.status(201).json({ success: true, data: document });
  });

  router.post('/vehicles/:id/verification', deps.requireAccount, async (req, res) => {
    const verification = await service.submitVehicleVerification(
      accountOf(req),
      String(req.params['id'] ?? ''),
      req.body,
    );
    res.status(201).json({ success: true, data: verification });
  });

  // Authorized private evidence content (never quarantined, never foreign).
  router.get('/documents/:id/content', deps.requireAccount, async (req, res) => {
    const content = await service.getDocumentContent(
      accountOf(req),
      String(req.params['id'] ?? ''),
    );
    res.setHeader('Content-Type', content.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${content.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    content.stream.pipe(res);
  });

  router.delete('/documents/:id', deps.requireAccount, async (req, res) => {
    const ack = await service.retireDocument(accountOf(req), String(req.params['id'] ?? ''));
    res.json({ success: true, data: ack });
  });

  return router;
}
