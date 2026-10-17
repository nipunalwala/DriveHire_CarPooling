// Milestone02 Task5: validate reviewed migrations without applying DDL.
// Checks: schema syntax, migration files present, file-vs-applied checksum
// drift on the migration-identity target. Fails closed without that target.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

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

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  process.exit();
}

async function main() {
  const argv = process.argv.slice(2);
  const eqForm = argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);
  const flagIndex = argv.indexOf('--target');
  const targetArg = eqForm ?? (flagIndex === -1 ? undefined : argv[flagIndex + 1]);
  const targetVar = targetArg === 'test' ? 'TEST_MIGRATION_DATABASE_URL' : 'MIGRATION_DATABASE_URL';
  try {
    loadEnvFile('.env');
  } catch {
    /* CI supplies the environment directly. */
  }
  const offline = !process.env[targetVar];
  if (offline) {
    process.env[targetVar] = 'postgresql://validate:validate@localhost:1/unused';
  }
  if (!process.env.MIGRATION_DATABASE_URL) {
    // Config loader requires this name; offline dummy never connects.
    process.env.MIGRATION_DATABASE_URL = process.env[targetVar];
  }

  const cli = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
  const validated = spawnSync(process.execPath, [cli, 'validate'], {
    cwd: 'apps/api',
    env: process.env,
    stdio: 'inherit',
  });
  if ((validated.status ?? 1) !== 0) fail('schema.prisma failed validation.');

  const entries = (await readdir('apps/api/prisma/migrations', { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) fail('no migration directories found.');
  for (const name of entries) {
    const sql = await readFile(`apps/api/prisma/migrations/${name}/migration.sql`, 'utf8').catch(
      () => '',
    );
    if (!sql.trim()) fail(`migration ${name} has no migration.sql content.`);
  }
  console.log(`migrations on disk: ${entries.join(', ')}`);

  if (offline) {
    console.log('no migration target configured; history drift check skipped.');
    return;
  }

  const target = migratorTarget(process.env[targetVar]);
  if (!target) {
    fail(
      `${targetVar} must be a migration-identity PostgreSQL URL (no query/fragment, migrator user).`,
    );
  }
  const pool = new pg.Pool({ connectionString: target, max: 1 });
  try {
    const historyTable = await pool.query("SELECT to_regclass('public._prisma_migrations') AS r");
    if (!historyTable.rows[0]?.r) {
      console.log('no migration history on target; all local migrations are pending deploy.');
      return;
    }
    const history = await pool.query('SELECT migration_name, checksum FROM _prisma_migrations');
    const applied = new Map(history.rows.map((r) => [r.migration_name, r.checksum]));
    for (const name of entries) {
      const file = await readFile(`apps/api/prisma/migrations/${name}/migration.sql`);
      const sha = createHash('sha256').update(file).digest('hex');
      if (applied.has(name) && applied.get(name) !== sha) {
        fail(
          `drift detected: ${name} differs from the applied migration. Never edit applied migrations.`,
        );
      }
    }
    const pending = entries.filter((n) => !applied.has(n));
    console.log(
      pending.length === 0
        ? 'history matches reviewed files; nothing pending.'
        : `pending deploy: ${pending.join(', ')}`,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

await main();
