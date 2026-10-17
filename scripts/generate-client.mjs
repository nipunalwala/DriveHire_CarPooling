// Generate the Prisma client (offline-safe; never connects by itself).
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. */
}
if (!process.env.MIGRATION_DATABASE_URL) {
  process.env.MIGRATION_DATABASE_URL = 'postgresql://generate:generate@localhost:1/unused';
}
const result = spawnSync(
  process.execPath,
  [resolve(process.cwd(), 'node_modules/prisma/build/index.js'), 'generate'],
  {
    cwd: 'apps/api',
    env: process.env,
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;
