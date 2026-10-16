import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { requireTestDatabaseUrl } from './test-database.js';
import { probeReadiness } from './database.js';
import {
  deployTestMigrations,
  dropTestSchema,
  withTestDatabase,
} from '../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

describe('PostgreSQL foundation and migration-aware readiness', () => {
  it('connects as the nonsuperuser runtime role and confirms btree_gist availability', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const identity = await runtimePool.query<{ superuser: boolean; db: string }>(
        'SELECT usesuper AS superuser, current_database() AS db FROM pg_user WHERE usename=current_user',
      );
      expect(identity.rows[0]).toEqual({ superuser: false, db: 'drivehire_test' });
      const extension = await runtimePool.query(
        "SELECT name FROM pg_available_extensions WHERE name='btree_gist'",
      );
      expect(extension.rows).toEqual([{ name: 'btree_gist' }]);
    });
  });

  it('keeps readiness unavailable before schema exists and worker heartbeat', async () => {
    await withTestDatabase(async ({ migrationPool, runtimePool }) => {
      await dropTestSchema(migrationPool);
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: false,
        worker: false,
      });
      await deployTestMigrations(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: true,
        worker: false,
      });
    });
  });
});
