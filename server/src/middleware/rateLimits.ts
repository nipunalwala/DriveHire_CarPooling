import rateLimit from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
const envelope = (_req: Request, res: Response) =>
  res
    .status(429)
    .json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
export function createRateLimiter(limit: number, windowMs = 60_000): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: envelope
  });
}
export const globalLimiter = createRateLimiter(300);
export const authLimiter = createRateLimiter(10);
export const uploadLimiter = createRateLimiter(20);
