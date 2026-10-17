import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

export const testEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://runtime:local-secret@127.0.0.1:55433/drivehire_test',
  APP_ORIGIN: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
};
describe('environment boundary', () => {
  it('normalizes an origin allowlist and validates numeric configuration', () => {
    const config = parseEnv({
      ...testEnvironment,
      PORT: '4200',
      CORS_ORIGINS: ' http://localhost:5173, http://127.0.0.1:5173 ',
    });
    expect(config.port).toBe(4200);
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
  });
  it.each([
    { PORT: '0' },
    { DATABASE_URL: 'https://example.com/db' },
    { CORS_ORIGINS: '*' },
    { APP_ORIGIN: 'http://localhost:5173/path' },
    { TRUST_PROXY_HOPS: 'true' },
  ])('rejects unsafe or malformed startup values %j', (override) => {
    expect(() => parseEnv({ ...testEnvironment, ...override })).toThrow();
  });
  it('rejects missing required values without exposing the supplied secrets', () => {
    expect(() => parseEnv({ DATABASE_URL: 'password-to-keep-private' })).toThrow();
    try {
      parseEnv({ DATABASE_URL: 'password-to-keep-private' });
    } catch (error) {
      expect(String(error)).not.toContain('password-to-keep-private');
    }
  });
  it('refuses insecure production origins or unconfigured production dependencies', () => {
    expect(() => parseEnv({ ...testEnvironment, NODE_ENV: 'production' })).toThrow();
    expect(() => parseEnv({ ...testEnvironment, NODE_ENV: 'staging' })).toThrow();
  });
});
