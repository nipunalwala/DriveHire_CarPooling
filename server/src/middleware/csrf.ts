import type { RequestHandler } from 'express';
import { loadEnv } from '../config/env';
import { AppError } from '../errors/AppError';
export const verifyRefreshOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (!origin) return next();
  const env = loadEnv();
  const allowed = [
    env.CLIENT_URL,
    ...env.CORS_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ];
  if (!allowed.includes(origin))
    return next(new AppError('FORBIDDEN', 403, 'Request origin is not allowed'));
  return next();
};
