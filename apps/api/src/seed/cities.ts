import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';
import { provisionCuratedCities } from '../modules/cities/reference-data.js';

try {
  loadEnvFile('../../.env');
} catch {
  /* CI supplies the environment directly. */
}

function migrationTarget(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
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

const target = migrationTarget(process.env[targetVar]);
if (!target) {
  console.error(
    `${targetVar} must be a migration-identity PostgreSQL URL (no query/fragment, migrator user). No cities provisioned.`,
  );
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: target, max: 1 });
  pool.on('error', () => {});
  try {
    const result = await provisionCuratedCities(pool);
    console.log(`Provisioned ${result.curated} curated cities (idempotent).`);
  } catch (error) {
    console.error(
      'City provisioning failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
