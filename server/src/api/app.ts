import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { loadEnv } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import { globalLimiter } from '../middleware/rateLimits';
import { errorHandler } from '../middleware/errorHandler';
import { checkDatabase } from '../repositories/healthRepository';

export function createApp() {
  const app = express();
  const env = loadEnv();
  const origins = env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: origins.length ? origins : [env.CLIENT_URL], credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'];
        const requestId = typeof id === 'string' ? id.slice(0, 100) : randomUUID();
        res.setHeader('X-Request-Id', requestId);
        return requestId;
      }
    })
  );
  app.use(globalLimiter);
  app.get('/api/v1/health', (_req, res) =>
    res.status(200).json({ success: true, data: { status: 'ok' } })
  );
  app.get('/api/v1/ready', async (_req, res, next) => {
    try {
      await checkDatabase();
      return res.status(200).json({ success: true, data: { status: 'ready' } });
    } catch {
      return next(new AppError('NOT_READY', 503, 'Database is not ready'));
    }
  });
  app.use((_req, res) =>
    res
      .status(404)
      .json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
  );
  app.use(errorHandler);
  return app;
}
