// Milestone02 Task4: real PostgreSQL constraint suite (replaces the
// exit-2 placeholder for `npm run db:test:constraints`).
// Fails closed when the dedicated test target or fixture is absent.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. */
}

function isDedicatedTarget(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return false;
  if (url.search !== '' || url.hash !== '') return false;
  if (url.pathname !== '/drivehire_test') return false;
  if (url.hostname === 'database-test') return url.port === '5432';
  return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '55433';
}

const requiredFiles = [
  'apps/api/src/test/database-fixture.ts',
  'apps/api/src/modules/resources/constraints.integration.test.ts',
];
for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`constraint fixture absent: ${file}. No checks ran.`);
    process.exitCode = 1;
    process.exit();
  }
}
if (!isDedicatedTarget(process.env.TEST_DATABASE_URL)) {
  console.error(
    'TEST_DATABASE_URL must target the dedicated drivehire_test database. No checks ran.',
  );
  process.exitCode = 1;
  process.exit();
}
if (!isDedicatedTarget(process.env.TEST_MIGRATION_DATABASE_URL)) {
  console.error(
    'TEST_MIGRATION_DATABASE_URL must target the dedicated drivehire_test database. No checks ran.',
  );
  process.exitCode = 1;
  process.exit();
}

const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.integration.config.ts',
    '--fileParallelism=false',
    'apps/api/src/modules/resources/constraints.integration.test.ts',
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
