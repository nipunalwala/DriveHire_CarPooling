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

  it('fresh_and_incremental_migrate_match', async () => {
    await withTestDatabase(async ({ migrationPool, runtimePool }) => {
      await dropTestSchema(migrationPool);
      await deployTestMigrations(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
      const marker = await migrationPool.query(
        "INSERT INTO cities(name, region, country, timezone) VALUES ('Fresh', 'Test', 'IN', 'Asia/Kolkata') RETURNING id",
      );
      const markerId = marker.rows[0]?.id as string;
      const before = await migrationPool.query(
        'SELECT migration_name, checksum FROM _prisma_migrations ORDER BY 1',
      );
      await deployTestMigrations(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
      const after = await migrationPool.query(
        'SELECT migration_name, checksum FROM _prisma_migrations ORDER BY 1',
      );
      expect(after.rows).toEqual(before.rows);
      const kept = await runtimePool.query('SELECT id FROM cities WHERE id = $1', [markerId]);
      expect(kept.rows).toHaveLength(1);
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: true,
        worker: false,
      });
    });
  });
});
