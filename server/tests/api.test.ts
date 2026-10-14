import { vi, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/api/app';
import { errorHandler } from '../src/middleware/errorHandler';
import { validate } from '../src/middleware/validate';
import { AppError } from '../src/errors/AppError';
import { z } from 'zod';

vi.mock('../src/repositories/healthRepository', () => ({ checkDatabase: vi.fn() }));
import { checkDatabase } from '../src/repositories/healthRepository';

describe('foundation HTTP app', () => {
  it('serves health and propagates a request id', async () => {
    const response = await request(createApp())
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-123');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' } });
    expect(response.headers['x-request-id']).toBe('trace-123');
  });
  it('reports readiness from the database repository', async () => {
    vi.mocked(checkDatabase).mockResolvedValueOnce(undefined);
    const ready = await request(createApp()).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    vi.mocked(checkDatabase).mockRejectedValueOnce(new Error('offline'));
    const notReady = await request(createApp()).get('/api/v1/ready');
    expect(notReady.status).toBe(503);
    expect(notReady.body.error.code).toBe('NOT_READY');
  });
  it('uses the not-found envelope', async () => {
    const response = await request(createApp()).get('/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('applies Zod request validation middleware', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/validate',
      validate('body', z.object({ count: z.number().int().positive() })),
      (_req, res) => res.json({ success: true })
    );
    app.use(errorHandler);
    const response = await request(app).post('/validate').send({ count: -1 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('maps typed, PostgreSQL and unknown errors to the common envelope', async () => {
    const app = express();
    app.get('/typed', (_req, _res, next) => next(new AppError('CONFLICT', 409, 'Conflict')));
    app.get('/db', (_req, _res, next) => next(Object.assign(new Error('db'), { code: '23505' })));
    app.get('/unknown', (_req, _res, next) => next(new Error('secret detail')));
    app.use(errorHandler);
    const typed = await request(app).get('/typed');
    expect(typed.status).toBe(409);
    expect(typed.body.error.message).toBe('Conflict');
    const db = await request(app).get('/db');
    expect(db.status).toBe(409);
    expect(db.body.error.code).toBe('CONFLICT');
    const unknown = await request(app).get('/unknown');
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(unknown.body)).not.toContain('secret detail');
  });
  it('limits a route after the configured request count', async () => {
    const { createRateLimiter } = await import('../src/middleware/rateLimits');
    const app = express();
    app.use(createRateLimiter(1));
    app.get('/', (_req, res) => res.json({ success: true }));
    expect((await request(app).get('/')).status).toBe(200);
    const limited = await request(app).get('/');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
