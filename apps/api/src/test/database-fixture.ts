import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client, Pool } from 'pg';
import { requireTestDatabaseUrl } from '../runtime/test-database.js';

const execFileAsync = promisify(execFile);

/**
 * Cross-process fixture-serialization mutex. A dedicated session-scoped
 * advisory lock (0x4452495645485f35, unrelated to Prisma's migration-engine
 * advisory key) serializes the entire withTestDatabase lifecycle so two
 * fixtures can never interleave their GRANT/TRUNCATE/migration statements,
 * which otherwise raise "tuple concurrently updated"/deadlock errors and can
 * delete another callback's rows.
 */
const FIXTURE_SERIALIZATION_LOCK_KEY = '4923077977547759413';

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
    GRANT SELECT, INSERT, UPDATE ON driver_profiles TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON vehicles TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON documents TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON verification_requests TO ${quoted};
    GRANT SELECT, INSERT ON verification_documents TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON availability_windows TO ${quoted};
    GRANT SELECT, INSERT ON booking_quotes TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON bookings TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON booking_decisions TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON carpools TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON seat_requests TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON trips TO ${quoted};
    GRANT SELECT, INSERT, UPDATE ON resource_reservations TO ${quoted};
    GRANT SELECT, INSERT ON trip_status_history TO ${quoted};
    GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO ${quoted};
    GRANT SELECT, INSERT ON audit_logs TO ${quoted};
  `);
  // Append-only posture (mirrors 0004_invariants): enforce by explicit
  // revoke so pre-existing or migration-order drift cannot widen access.
  await migrationPool.query(`
    REVOKE UPDATE, DELETE ON booking_quotes FROM ${quoted};
    REVOKE UPDATE, DELETE ON trip_status_history FROM ${quoted};
    REVOKE UPDATE, DELETE ON audit_logs FROM ${quoted};
    REVOKE UPDATE, DELETE ON verification_documents FROM ${quoted};
    REVOKE DELETE ON verification_requests FROM ${quoted};
    REVOKE DELETE ON users FROM ${quoted};
    REVOKE DELETE ON user_roles FROM ${quoted};
    REVOKE DELETE ON driver_profiles FROM ${quoted};
    REVOKE DELETE ON vehicles FROM ${quoted};
    REVOKE DELETE ON documents FROM ${quoted};
    REVOKE DELETE ON availability_windows FROM ${quoted};
    REVOKE DELETE ON bookings FROM ${quoted};
    REVOKE DELETE ON booking_decisions FROM ${quoted};
    REVOKE DELETE ON carpools FROM ${quoted};
    REVOKE DELETE ON seat_requests FROM ${quoted};
    REVOKE DELETE ON trips FROM ${quoted};
    REVOKE DELETE ON resource_reservations FROM ${quoted};
    REVOKE DELETE ON outbox_events FROM ${quoted};
    REVOKE DELETE ON job_leases FROM ${quoted};
  `);
}

const TRUNCATE_TABLES = [
  'trip_status_history',
  'trips',
  'seat_requests',
  'carpools',
  'booking_decisions',
  'bookings',
  'booking_quotes',
  'resource_reservations',
  'availability_windows',
  'idempotency_keys',
  'audit_logs',
  'outbox_events',
  'verification_documents',
  'verification_requests',
  'documents',
  'driver_profiles',
  'vehicles',
  'auth_challenges',
  'refresh_tokens',
  'refresh_sessions',
  'user_roles',
  'users',
  'rate_limit_buckets',
  'admin_policy',
  'job_leases',
  'cities',
].join(', ');

/**
 * Deploy reviewed migrations with the migration identity (used by the
 * fixture and by tests that need to rebuild schema state explicitly).
 */
export async function deployTestMigrations(migrationUrl: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [resolve(process.cwd(), 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: 'apps/api',
      env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
      timeout: 120000,
    },
  );
}

/** Drop all Milestone02 tables (extensions kept) to reproduce pre-migration state. */
export async function dropTestSchema(migrationPool: Pool): Promise<void> {
  await migrationPool.query(`DROP TABLE IF EXISTS ${TRUNCATE_TABLES} CASCADE`);
  const history = await migrationPool.query<{ r: string | null }>(
    "SELECT to_regclass('public._prisma_migrations') AS r",
  );
  if (history.rows[0]?.r) {
    await migrationPool.query(
      "DELETE FROM _prisma_migrations WHERE migration_name IN ('0001_identity', '0002_qualification', '0003_journeys', '0004_invariants', '0005_carpool_terminal_states')",
    );
  }
}

/**
 * Verify the dedicated target, take the cross-process serialization lock,
 * deploy reviewed migrations with the migration identity, then run the
 * callback with both pools. Never touches development or retired databases
 * (guard fails closed); the lock is released in `finally`.
 */
export async function withTestDatabase<T>(
  run: (fixture: DatabaseFixture) => Promise<T>,
): Promise<T> {
  const runtimeUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const migrationUrl = requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL);
  // The mutex owns a dedicated connection. It must stay independent of the
  // migration/runtime pools: reusing the sole client of a max:1 pool would
  // make the reset wait on the very lock its own session holds (deadlock).
  const lockClient = new Client({ connectionString: migrationUrl });
  lockClient.on('error', () => {});
  const migrationPool = new Pool({ connectionString: migrationUrl, max: 2 });
  migrationPool.on('error', () => {});
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 4 });
  runtimePool.on('error', () => {});
  let lockHeld = false;
  try {
    await lockClient.connect();
    // Validate the actual dedicated target on the lock connection before any
    // mutation (deploy/grants/truncate) and before taking the lock.
    const target = await lockClient.query<{ db: string }>('SELECT current_database() AS db');
    if (target.rows[0]?.db !== 'drivehire_test') {
      throw new Error('Refusing fixture outside the dedicated drivehire_test database');
    }
    await lockClient.query('SELECT pg_advisory_lock($1::bigint) AS locked', [
      FIXTURE_SERIALIZATION_LOCK_KEY,
    ]);
    lockHeld = true;
    await assertDedicatedTarget(migrationPool, runtimePool);
    await deployTestMigrations(migrationUrl);
    const sentinel = await migrationPool.query<{
      cities: string | null;
      profiles: string | null;
      journeys: string | null;
    }>(
      "SELECT to_regclass('public.cities') AS cities, to_regclass('public.driver_profiles') AS profiles, to_regclass('public.bookings') AS journeys",
    );
    if (!sentinel.rows[0]?.cities || !sentinel.rows[0]?.profiles || !sentinel.rows[0]?.journeys) {
      // History without tables (dropped without history reset): clear and redeploy.
      await migrationPool.query(
        "DELETE FROM _prisma_migrations WHERE migration_name IN ('0001_identity', '0002_qualification', '0003_journeys', '0004_invariants', '0005_carpool_terminal_states')",
      );
      await deployTestMigrations(migrationUrl);
    }
    await applyRuntimeGrants(migrationPool, runtimeRoleOf(runtimeUrl));
    const reset = async (): Promise<void> => {
      await assertDedicatedTarget(migrationPool, runtimePool);
      await migrationPool.query(`TRUNCATE ${TRUNCATE_TABLES} CASCADE`);
      await migrationPool.query(
        'INSERT INTO admin_policy (id, version) VALUES (1, 1) ON CONFLICT DO NOTHING',
      );
      await applyRuntimeGrants(migrationPool, runtimeRoleOf(runtimeUrl));
    };
    await reset();
    return await run({ migrationPool, runtimePool, reset });
  } finally {
    if (lockHeld) {
      await lockClient
        .query('SELECT pg_advisory_unlock($1::bigint) AS unlocked', [
          FIXTURE_SERIALIZATION_LOCK_KEY,
        ])
        .catch(() => {});
    }
    await lockClient.end().catch(() => {});
    await runtimePool.end().catch(() => {});
    await migrationPool.end().catch(() => {});
  }
}
