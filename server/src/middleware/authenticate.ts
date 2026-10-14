import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { readAccessToken, type AccessClaims } from '../lib/accessToken';
// Express request augmentation requires namespace merging.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? readAccessToken(token) : undefined;
  if (!user) return next(new AppError('UNAUTHENTICATED', 401, 'Please sign in to continue'));
  req.user = user;
  return next();
};
export function requireRole(...roles: AccessClaims['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED', 401, 'Please sign in to continue'));
    return roles.includes(req.user.role)
      ? next()
      : next(new AppError('FORBIDDEN', 403, 'You do not have access to this action'));
  };
}
export const requireActive: RequestHandler = (req, _res, next) =>
  !req.user
    ? next(new AppError('UNAUTHENTICATED', 401, 'Please sign in to continue'))
    : req.user.status === 'active'
      ? next()
      : next(new AppError('ACCOUNT_INACTIVE', 403, 'Verify your account before continuing'));
