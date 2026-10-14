import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = String(req.id ?? res.getHeader('X-Request-Id') ?? 'unknown');
  if (error instanceof AppError)
    return res
      .status(error.status)
      .json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      });
  if (error?.name === 'ZodError')
    return res
      .status(400)
      .json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request input' }
      });
  if (error?.code === '23505' || error?.code === '23P01')
    return res
      .status(409)
      .json({
        success: false,
        error: { code: 'CONFLICT', message: 'The requested resource conflicts with existing data' }
      });
  if (error?.code === '23503' || error?.code === '23514')
    return res
      .status(400)
      .json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request violates a data constraint' }
      });
  logger.error(
    { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' },
    'Unhandled request error'
  );
  return res
    .status(500)
    .json({
      success: false,
      error: { code: 'INTERNAL', message: 'An unexpected error occurred', details: { requestId } }
    });
};
