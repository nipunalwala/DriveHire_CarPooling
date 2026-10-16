import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../runtime/test-database.js';

const execFileAsync = promisify(execFile);

export interface DatabaseFixture {
  migrationPool: Pool;
  runtimePool: Pool;
  reset(): Promise<void>;
}

function runtimeRoleOf(databaseUrl: string): string {
  return new URL(databaseUrl).username;
}

async function assertDedicatedTarget(migrationPool: Pool, runtimePool: Pool): Promise<void> {
  const mig = await migrationPool.query<{ db: string; user: string }>(
    'SELECT current_database() AS db, current_user AS "user"',
  );
  const run = await runtimePool.query<{ db: string; user: string }>(
    'SELECT current_database() AS db, current_user AS "user"',
  );
  if (mig.rows[0]?.db !== 'drivehire_test' || run.rows[0]?.db !== 'drivehire_test') {
    throw new Error('Refusing fixture outside the dedicated drivehire_test database');
  }
  if (!mig.rows[0]?.user || mig.rows[0].user === run.rows[0]?.user) {
    throw new Error('Migration identity must differ from the runtime identity');
  }
}

/** Re-assert the minimal 0001 runtime grants (idempotent; deploy owns them). */
async function applyRuntimeGrants(migrationPool: Pool, runtimeRole: string): Promise<void> {
  const quoted = `"${runtimeRole.replaceAll('"', '""')}"`;
  await migrationPool.query(`
    GRANT SELECT ON cities TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON users TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON user_roles TO ${quoted};
    GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_sessions TO ${quoted};
    GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO ${quoted};
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_challenges TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON outbox_events TO ${quoted};
    GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO ${quoted};
    GRANT SELECT ON admin_policy TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON job_leases TO ${quoted};
  `);
}

const TRUNCATE_TABLES = [
  'auth_challenges',
  'refresh_tokens',
  'refresh_sessions',
  'user_roles',
  'users',
  'outbox_events',
  'rate_limit_buckets',
  'job_leases',
  'cities',
].join(', ');

/**
 * Deploy reviewed migrations with the migration identity, verify the
 * dedicated target, then run the callback with both pools.
 * Never touches development or retired databases (guard fails closed).
 */
export async function withTestDatabase<T>(
  run: (fixture: DatabaseFixture) => Promise<T>,
): Promise<T> {
  const runtimeUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const migrationUrl = requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL);
  const migrationPool = new Pool({ connectionString: migrationUrl, max: 2 });
  migrationPool.on('error', () => {});
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 4 });
  runtimePool.on('error', () => {});
  try {
    await execFileAsync(
      process.execPath,
      [resolve(process.cwd(), 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: 'apps/api',
        env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
        timeout: 120000,
      },
    );
    await assertDedicatedTarget(migrationPool, runtimePool);
    await applyRuntimeGrants(migrationPool, runtimeRoleOf(runtimeUrl));
    const reset = async (): Promise<void> => {
      await assertDedicatedTarget(migrationPool, runtimePool);
      await migrationPool.query(`TRUNCATE ${TRUNCATE_TABLES} CASCADE`);
      await applyRuntimeGrants(migrationPool, runtimeRoleOf(runtimeUrl));
    };
    await reset();
    return await run({ migrationPool, runtimePool, reset });
  } finally {
    await runtimePool.end().catch(() => {});
    await migrationPool.end().catch(() => {});
  }
}
