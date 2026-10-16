// Milestone02 Task5: deploy reviewed migrations with the migration identity.
// Refuses runtime URLs and unparseable targets before Prisma runs.
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. */
}

function migratorTarget(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
  if (url.search !== '' || url.hash !== '') return null;
  if (!url.username.includes('migrator') || url.username.includes('runtime')) return null;
  return value;
}

const argv = process.argv.slice(2);
const eqForm = argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);
const flagIndex = argv.indexOf('--target');
const targetArg = eqForm ?? (flagIndex === -1 ? undefined : argv[flagIndex + 1]);
const targetVar = targetArg === 'test' ? 'TEST_MIGRATION_DATABASE_URL' : 'MIGRATION_DATABASE_URL';

const target = migratorTarget(process.env[targetVar]);
if (!target) {
  console.error(
    `${targetVar} must be a migration-identity PostgreSQL URL (no query/fragment, migrator user). No migrations ran.`,
  );
  process.exitCode = 1;
  process.exit();
}

const cli = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
  cwd: 'apps/api',
  env: { ...process.env, MIGRATION_DATABASE_URL: target },
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
