import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@drivehire/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: [
      'apps/**/src/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/*.contract.test.ts', '**/*.integration.test.ts', '**/node_modules/**'],
    environment: 'node',
    restoreMocks: true,
  },
});
