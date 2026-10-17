import { afterEach, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import config from '../apps/web/vite.config.js';

afterEach(() => vi.unstubAllEnvs());
async function configured() {
  if (typeof config !== 'function') throw new Error('Expected Vite configuration function');
  return config({ command: 'build', mode: 'production' });
}
it('accepts Vite internal NODE_ENV metadata while exposing only the approved API prefix', async () => {
  vi.stubEnv('VITE_USER_NODE_ENV', 'development');
  vi.stubEnv('NODE_ENV', undefined);
  const result = await resolveConfig(
    { ...(await configured()), configFile: false },
    'build',
    'production',
    'production',
  );
  expect(result.isProduction).toBe(true);
  expect(result.env.VITE_USER_NODE_ENV).toBeUndefined();
  expect(result.define?.['import.meta.env.VITE_API_BASE_URL']).toBe('"/api/v1"');
});
it('still refuses unexpected public configuration', async () => {
  vi.stubEnv('VITE_PRIVATE_TOKEN', 'test-only');
  await expect(configured()).rejects.toThrow('Only VITE_API_BASE_URL');
});
