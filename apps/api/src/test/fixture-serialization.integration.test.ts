import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from './database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cross-process fixture serialization evidence. Concurrent `withTestDatabase`
 * operations must not interleave their TRUNCATE/reset with another callback's
 * data, nor must a throwing callback leave the serialization lock held.
 */
describe('fixture serialization mutex', () => {
  it('concurrent_fixture_callbacks_do_not_overlap_or_reset_each_others_data', async () => {
    let active = 0;
    let maxActive = 0;

    const run = (label: string, marker: string) =>
      withTestDatabase(async ({ runtimePool }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const email = `fixture-${label}-${marker}@example.com`;
        await runtimePool.query(
          `INSERT INTO users(email, display_name, password_hash, email_verified_at)
           VALUES ($1, $2, 'fixture-hash', now())`,
          [email, `Fixture ${label}`],
        );
        // Hold the callback open so a concurrent fixture reset would truncate
        // this row mid-flight if the fixtures were not serialized.
        await delay(600);
        const present = await runtimePool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM users WHERE email = $1',
          [email],
        );
        active -= 1;
        return Number(present.rows[0]?.count ?? '0');
      });

    const [first, second] = await Promise.all([run('a', randomUUID()), run('b', randomUUID())]);

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(maxActive).toBe(1);
  }, 120000);

  it('fixture_callback_failure_releases_the_serialization_lock', async () => {
    await expect(
      withTestDatabase(async () => {
        throw new Error('fixture callback failure');
      }),
    ).rejects.toThrow('fixture callback failure');

    const result = await withTestDatabase(async ({ runtimePool }) => {
      const query = await runtimePool.query<{ ok: number }>('SELECT 1 AS ok');
      return query.rows[0]?.ok;
    });
    expect(result).toBe(1);
  }, 120000);
});
