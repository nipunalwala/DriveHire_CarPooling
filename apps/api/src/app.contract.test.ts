import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, HealthResponseSchema } from '@drivehire/contracts';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';

describe('foundation API contract', () => {
  it('serves Health and Error envelopes on real HTTP handlers', async () => {
    const app = createApp({
      config: parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://runtime:test@localhost/drivehire_test',
        APP_ORIGIN: 'http://localhost:5173',
      }),
      logger: createLogger('silent'),
      readiness: async () => ({ database: false, schema: false, worker: false }),
    });
    const health = await request(app).get('/api/v1/health');
    expect(HealthResponseSchema.safeParse(health.body).success).toBe(true);
    const ready = await request(app).get('/api/v1/ready');
    expect(ready.status).toBe(503);
    expect(ApiErrorSchema.safeParse(ready.body).success).toBe(true);
  });
});
