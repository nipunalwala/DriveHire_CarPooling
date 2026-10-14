import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./tests/setup.ts']
  }
});
