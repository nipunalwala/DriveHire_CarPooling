import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { probeReadiness, updateHeartbeat } from './database.js';
import { withTestDatabase } from '../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const DEFERRED_TABLES = [
  'owner_profiles',
  'rental_listings',
  'rental_bookings',
  'reviews',
  'review_moderation',
  'notifications',
  'notification_channels',
  'reports',
  'complaints',
];

describe('Milestone02 Task5: migration reproducibility and real readiness', () => {
  it('migrated_without_worker_ready503', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: true,
        worker: false,
      });
    });
  });

  it('running_worker_ready200_then_stale503', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      await updateHeartbeat(runtimePool, 'integration-worker');
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: true,
        worker: true,
      });
      await runtimePool.query(
        `UPDATE job_leases SET heartbeat_at = now() - interval '10 minutes', lease_until = now() - interval '1 minute'
         WHERE name = 'worker-heartbeat'`,
      );
      expect(await probeReadiness(runtimePool)).toEqual({
        database: true,
        schema: true,
        worker: false,
      });
    });
  });

  it('no_deferred_entities', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const catalog = await runtimePool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      const names = new Set(catalog.rows.map((r) => r.tablename));
      for (const deferred of DEFERRED_TABLES) {
        expect(names.has(deferred)).toBe(false);
      }
      expect(names.has('users')).toBe(true);
      expect(names.has('job_leases')).toBe(true);
      expect(names.has('_prisma_migrations')).toBe(true);
    });
  });
});
