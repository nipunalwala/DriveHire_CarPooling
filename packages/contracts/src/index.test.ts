import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, HealthResponseSchema } from './index.js';

describe('public operational contracts', () => {
  it('accepts a live health response and rejects extra private fields', () => {
    expect(HealthResponseSchema.parse({ success: true, data: { status: 'ok' } })).toEqual({
      success: true,
      data: { status: 'ok' },
    });
    expect(
      HealthResponseSchema.safeParse({
        success: true,
        data: { status: 'ok', databaseUrl: 'private' },
      }).success,
    ).toBe(false);
  });
  it('requires a request ID and excludes stack traces in errors', () => {
    expect(
      ApiErrorSchema.safeParse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed' },
      }).success,
    ).toBe(false);
    expect(
      ApiErrorSchema.safeParse({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed',
          requestId: 'request-123',
          stack: 'private',
        },
      }).success,
    ).toBe(false);
  });
});
