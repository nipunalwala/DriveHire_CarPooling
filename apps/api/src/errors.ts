/** Safe HTTP error carrying an envelope status and code; no stack in responses. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function unauthenticated(message = 'Authentication required'): HttpError {
  return new HttpError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message = 'You are not allowed to do that'): HttpError {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Resource not found'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

export function tooManyRequests(message: string): HttpError {
  return new HttpError(429, 'RATE_LIMITED', message);
}

export function badRequest(message: string, details?: Record<string, unknown>): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message, details);
}
