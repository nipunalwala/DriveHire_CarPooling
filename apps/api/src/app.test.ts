import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';

const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://runtime:test@127.0.0.1:55433/drivehire_test',
  APP_ORIGIN: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
});
const makeApp = (readiness = async () => ({ database: false, schema: false, worker: false })) =>
  createApp({ config, logger: createLogger('silent'), readiness });
describe('API operational boundary', () => {
  it('correlates completion and unexpected-error logs without logging secrets', async () => {
    const lines: string[] = [];
    const logger = createLogger('info', {
      write: (line: string) => {
        lines.push(line);
      },
    });
    const app = createApp({
      config,
      logger,
      readiness: async () => ({ database: false, schema: false, worker: false }),
    });
    app.set('json replacer', (key: string, value: unknown) => {
      if (key === 'status') throw new Error('private-failure-detail');
      return value;
    });
    const response = await request(app)
      .get('/api/v1/health?token=private-query')
      .set('X-Request-ID', 'review-request-123')
      .set('Authorization', 'Bearer private-auth');
    expect(response.status).toBe(500);
    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.length).toBeGreaterThanOrEqual(2);
    for (const record of records) expect(record.requestId).toBe(response.headers['x-request-id']);
    expect(records.some((record) => record.msg === 'Unexpected request failure')).toBe(true);
    expect(lines.join('')).not.toMatch(/private-query|private-auth|private-failure-detail/);
  });
  it('returns liveness independently of readiness and includes security/correlation headers', async () => {
    const result = await request(makeApp())
      .get('/api/v1/health')
      .set('X-Request-ID', 'request-12345');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, data: { status: 'ok' } });
    expect(result.headers['x-request-id']).toBe('request-12345');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.headers['x-powered-by']).toBeUndefined();
  });
  it('fails closed when dependencies are missing or fail, without leaking details', async () => {
    for (const probe of [
      async () => ({ database: true, schema: false, worker: true }),
      async () => {
        throw new Error('database-password');
      },
    ]) {
      const result = await request(makeApp(probe)).get('/api/v1/ready');
      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(JSON.stringify(result.body)).not.toContain('database-password');
    }
  });
  it('returns readiness only when every dependency is ready', async () => {
    const result = await request(
      makeApp(async () => ({ database: true, schema: true, worker: true })),
    ).get('/api/v1/ready');
    expect(result.status).toBe(200);
  });
  it('allows exact configured origin and denies untrusted origins', async () => {
    const allowed = await request(makeApp())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(makeApp())
      .get('/api/v1/health')
      .set('Origin', 'https://attacker.example');
    expect(denied.status).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('returns safe errors for unknown routes, malformed JSON, and oversized JSON', async () => {
    const unknown = await request(makeApp()).get('/api/v1/no-such-route');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.requestId).toEqual(expect.any(String));
    const malformed = await request(makeApp())
      .post('/api/v1/missing')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('BAD_REQUEST');
    const huge = await request(makeApp())
      .post('/api/v1/missing')
      .send({ value: 'x'.repeat(110_000) });
    expect(huge.status).toBe(413);
    expect(JSON.stringify(huge.body)).not.toContain('x'.repeat(100));
  });
});
