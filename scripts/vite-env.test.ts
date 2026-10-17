import { afterEach, expect, it, vi } from 'vitest';
import { build, resolveConfig } from 'vite';
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

it('production_resolution_keeps_react_production', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITE_USER_NODE_ENV', 'development');
  const result = await build({
    ...(await configured()),
    root: 'apps/web',
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const moduleIds = outputs.flatMap((output) =>
    'output' in output
      ? output.output.flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))
      : [],
  );
  expect(moduleIds.filter((id) => id.includes('react-dom'))).toContainEqual(
    expect.stringContaining('react-dom-client.production.js'),
  );
  expect(moduleIds.some((id) => id.includes('react-dom-client.development.js'))).toBe(false);
});
