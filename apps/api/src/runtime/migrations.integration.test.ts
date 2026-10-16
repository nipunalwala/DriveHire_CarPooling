import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../test/database-fixture.js';
import { createPrisma } from './prisma.js';
import { requireTestDatabaseUrl } from './test-database.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

describe('Milestone02 Task1: database harness and identity schema', () => {
  it('migration_guard_refuses_dev_and_query_host_override', () => {
    expect(() =>
      requireTestDatabaseUrl(
        'postgresql://u:p@127.0.0.1:55433/drivehire_test?host=outside.example',
      ),
    ).toThrow();
    expect(() =>
      requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55433/drivehire_dev'),
    ).toThrow();
    expect(() => requireTestDatabaseUrl(undefined)).toThrow();
    expect(requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55433/drivehire_test')).toBe(
      'postgresql://u:p@127.0.0.1:55433/drivehire_test',
    );
  });

  it('identity_schema_has_normalized_unique_email', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      await runtimePool.query(
        "INSERT INTO users(email, display_name, password_hash) VALUES ('case.lower@example.com', 'Case', 'hash-a')",
      );
      await expect(
        runtimePool.query(
          "INSERT INTO users(email, display_name, password_hash) VALUES ('case.lower@example.com', 'Duplicate', 'hash-b')",
        ),
      ).rejects.toBeDefined();
      await expect(
        runtimePool.query(
          "INSERT INTO users(email, display_name, password_hash) VALUES ('Mixed.Case@Example.com', 'Mixed', 'hash-c')",
        ),
      ).rejects.toBeDefined();
      const prisma = createPrisma(requireTestDatabaseUrl(process.env.TEST_DATABASE_URL));
      try {
        const rows = await prisma.$queryRaw<
          Array<{ count: string }>
        >`SELECT COUNT(*)::text AS count FROM users`;
        expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  it('runtime_cannot_create_table', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      await expect(
        runtimePool.query('CREATE TABLE forbidden_runtime_ddl(id int)'),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
