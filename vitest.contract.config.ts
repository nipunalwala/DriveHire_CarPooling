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
    include: ['apps/api/src/**/*.contract.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
