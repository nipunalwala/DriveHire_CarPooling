import { loadEnvFile } from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from './test-database.js';
import { probeReadiness } from './database.js';
try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}
const pool = new Pool({
  connectionString: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL),
  connectionTimeoutMillis: 2000,
  max: 2,
});
afterAll(() => pool.end());
describe('Phase01 PostgreSQL foundation (no business schema)', () => {
  it('connects as the nonsuperuser runtime role and confirms btree_gist availability', async () => {
    const identity = await pool.query<{ superuser: boolean; db: string }>(
      'SELECT usesuper AS superuser, current_database() AS db FROM pg_user WHERE usename=current_user',
    );
    expect(identity.rows[0]).toEqual({ superuser: false, db: 'drivehire_test' });
    const extension = await pool.query(
      "SELECT name FROM pg_available_extensions WHERE name='btree_gist'",
    );
    expect(extension.rows).toEqual([{ name: 'btree_gist' }]);
  });
  it('keeps readiness unavailable when Phase02 schema and heartbeat are absent', async () => {
    expect(await probeReadiness(pool)).toEqual({ database: true, schema: false, worker: false });
  });
});
