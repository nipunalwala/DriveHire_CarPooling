import { createCarpoolsRouter } from './modules/carpools/routes.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Config } from './config/env.js';
import { safeErrorMetadata } from './config/logger.js';
import { HttpError } from './errors.js';
import type { PrismaClient } from './generated/client/client.js';
import type { ScanAdapter, StorageAdapter } from './ports.js';
import { createAccountsRouter } from './modules/accounts/routes.js';
import { createAccountsService } from './modules/accounts/service.js';
import { createCitiesRouter } from './modules/cities/routes.js';
import { createProvidersRouter } from './modules/providers/routes.js';
import { createAdminRouter } from './modules/admin/routes.js';
import { createAdminOperationsRouter } from './modules/admin/operations-routes.js';
import { createBookingsRouter } from './modules/bookings/routes.js';
import { createBookingsReadRouter } from './modules/bookings/read-routes.js';
import { createTripsRouter } from './modules/trips/routes.js';

export type ReadinessState = { database: boolean; schema: boolean; worker: boolean };
export type ReadinessProbe = () => Promise<ReadinessState>;

/** Optional real account dependencies; absent means only operational routes mount. */
export type AccountsDependencies = { prisma: PrismaClient };
/** Optional private-evidence dependencies for the provider onboarding routes. */
export type ProviderDependencies = { storage: StorageAdapter; scanner: ScanAdapter };
/** Optional administrator dependencies; mounts the admin review surface. */
export type AdminDependencies = { prisma: PrismaClient };

async function isReady(probe: ReadinessProbe): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Readiness timeout')), 2000);
        timeout.unref();
      }),
    ]);
    return state.database && state.schema && state.worker;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createApp(options: {
  config: Config;
  logger: Logger;
  readiness: ReadinessProbe;
  accounts?: AccountsDependencies;
  providers?: ProviderDependencies;
  admin?: AdminDependencies;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', options.config.trustProxyHops);
  app.use((req, res, next) => {
    const candidate = req.header('X-Request-ID');
    res.setHeader(
      'X-Request-ID',
      candidate && /^[A-Za-z0-9_-]{8,80}$/.test(candidate) ? candidate : randomUUID(),
    );
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    pinoHttp({
      logger: options.logger,
      genReqId: (_req, res) => String(res.getHeader('X-Request-ID')),
      customProps: (_req, res) => ({ requestId: String(res.getHeader('X-Request-ID')) }),
      wrapSerializers: false,
      serializers: {
        req: (req: IncomingMessage) => ({ method: req.method, url: req.url?.split('?')[0] }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        err: (error: unknown) => safeErrorMetadata(error),
      },
    }),
  );
  app.use(
    helmet({
      strictTransportSecurity: options.config.secure
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || options.config.corsOrigins.includes(origin)) callback(null, true);
        else callback(new HttpError(403, 'FORBIDDEN', 'Origin is not allowed'));
      },
    }),
  );
  app.use(express.json({ limit: '100kb', strict: true }));
  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });
  app.get('/api/v1/ready', async (_req, res, next) => {
    if (await isReady(options.readiness)) res.json({ success: true, data: { status: 'ok' } });
    else next(new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'Service is not ready'));
  });
  if (options.accounts) {
    app.use('/api/v1', createCitiesRouter({ prisma: options.accounts.prisma }));
    app.use(
      '/api/v1',
      createAccountsRouter({ prisma: options.accounts.prisma, config: options.config }),
    );
    const bookingGuard = createAccountsService({
      prisma: options.accounts.prisma,
      config: options.config,
    });
    app.use(
      '/api/v1',
      createBookingsRouter({
        prisma: options.accounts.prisma,
        requireAccount: bookingGuard.requireAccount,
      }),
    );
    app.use(
      '/api/v1',
      createBookingsReadRouter({
        prisma: options.accounts.prisma,
        requireAccount: bookingGuard.requireAccount,
      }),
    );
    app.use(
      '/api/v1',
      createTripsRouter({
        prisma: options.accounts.prisma,
        requireAccount: bookingGuard.requireAccount,
      }),
    );
    app.use(
      '/api/v1',
      createAdminOperationsRouter({
        prisma: options.accounts.prisma,
        requireAccount: bookingGuard.requireAccount,
      }),
    );
    app.use(
      '/api/v1',
      createCarpoolsRouter({
        prisma: options.accounts.prisma,
        requireAccount: bookingGuard.requireAccount,
      }),
    );
    if (options.providers) {
      const accountGuard = createAccountsService({
        prisma: options.accounts.prisma,
        config: options.config,
      });
      app.use(
        '/api/v1',
        createProvidersRouter({
          prisma: options.accounts.prisma,
          config: options.config,
          storage: options.providers.storage,
          scanner: options.providers.scanner,
          requireAccount: accountGuard.requireAccount,
        }),
      );
    }
    if (options.admin) {
      const accountGuard = createAccountsService({
        prisma: options.accounts.prisma,
        config: options.config,
      });
      app.use(
        '/api/v1',
        createAdminRouter({
          prisma: options.admin.prisma,
          requireAccount: accountGuard.requireAccount,
        }),
      );
    }
  }
  app.use((_req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Resource not found'));
  });
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    let failure = new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    if (error instanceof HttpError) failure = error;
    else if (error instanceof SyntaxError && 'status' in error && error.status === 400)
      failure = new HttpError(400, 'BAD_REQUEST', 'Malformed JSON request');
    else if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    )
      failure = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the limit');
    if (failure.status === 500)
      req.log.error(safeErrorMetadata(error), 'Unexpected request failure');
    res.status(failure.status).json({
      success: false,
      error: {
        code: failure.code,
        message: failure.message,
        requestId: String(res.getHeader('X-Request-ID')),
      },
    });
  };
  app.use(errors);
  return app;
}
