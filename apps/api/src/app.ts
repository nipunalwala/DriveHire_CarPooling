import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Config } from './config/env.js';
import { safeErrorMetadata } from './config/logger.js';

export type ReadinessState = { database: boolean; schema: boolean; worker: boolean };
export type ReadinessProbe = () => Promise<ReadinessState>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

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

export function createApp(options: { config: Config; logger: Logger; readiness: ReadinessProbe }) {
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
