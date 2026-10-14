import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/AppError';

export function validate<T>(part: 'body' | 'query' | 'params', schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[part]);
    if (!parsed.success)
      return next(
        new AppError('VALIDATION_ERROR', 400, 'Invalid request input', parsed.error.flatten())
      );
    res.locals[part] = parsed.data;
    if (part === 'body') req.body = parsed.data;
    return next();
  };
}
