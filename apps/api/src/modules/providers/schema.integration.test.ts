import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

interface Seed {
  ownerId: string;
  foreignOwnerId: string;
  cityId: string;
  vehicleId: string;
  driverId: string;
}

async function seed(pools: {
  migrationPool: {
    query: (t: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }>;
  };
  runtimePool: {
    query: (t: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }>;
  };
}): Promise<Seed> {
  const { migrationPool, runtimePool } = pools;
  const city = await migrationPool.query(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Pune', 'Maharashtra', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  const cityId = city.rows[0]?.id as string;
  const owner = await runtimePool.query(
    "INSERT INTO users(email, display_name, password_hash) VALUES ('owner2@example.com', 'Owner', 'h') RETURNING id",
  );
  const foreign = await runtimePool.query(
    "INSERT INTO users(email, display_name, password_hash) VALUES ('foreign2@example.com', 'Foreign', 'h') RETURNING id",
  );
  const ownerId = owner.rows[0]?.id as string;
  const foreignOwnerId = foreign.rows[0]?.id as string;
  const driver = await runtimePool.query(
    'INSERT INTO driver_profiles(user_id) VALUES ($1) RETURNING id',
    [ownerId],
  );
  const driverId = driver.rows[0]?.id as string;
  const vehicle = await runtimePool.query(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'enc', 'digest-owner-vehicle-1', 'Make', 'Model', 2020, 'SEDAN', 4, 'MANUAL', 'PETROL', $2)
     RETURNING id`,
    [ownerId, cityId],
  );
  const vehicleId = vehicle.rows[0]?.id as string;
  return { ownerId, foreignOwnerId, cityId, vehicleId, driverId };
}

describe('Milestone02 Task2: qualification and evidence schema', () => {
  it('vehicle_owner_is_immutable', async () => {
    await withTestDatabase(async (pools) => {
      const { ownerId, foreignOwnerId, vehicleId } = await seed(pools);
      await expect(
        pools.runtimePool.query('UPDATE vehicles SET owner_id=$1 WHERE id=$2', [
          foreignOwnerId,
          vehicleId,
        ]),
      ).rejects.toBeDefined();
      const check = await pools.runtimePool.query('SELECT owner_id FROM vehicles WHERE id=$1', [
        vehicleId,
      ]);
      expect(check.rows[0]?.owner_id).toBe(ownerId);
    });
  });

  it('revision_snapshot_is_immutable', async () => {
    await withTestDatabase(async (pools) => {
      const { ownerId, vehicleId } = await seed(pools);
      const req = await pools.runtimePool.query(
        `INSERT INTO verification_requests(vehicle_id, revision, subject_version, submitted_by, submitted_at)
         VALUES ($1, 1, 1, $2, now()) RETURNING id`,
        [vehicleId, ownerId],
      );
      const requestId = req.rows[0]?.id as string;
      await expect(
        pools.runtimePool.query('UPDATE verification_requests SET revision=2 WHERE id=$1', [
          requestId,
        ]),
      ).rejects.toBeDefined();
      await expect(
        pools.runtimePool.query('DELETE FROM verification_requests WHERE id=$1', [requestId]),
      ).rejects.toBeDefined();
    });
  });

  it('foreign_document_subject_rejected', async () => {
    await withTestDatabase(async (pools) => {
      const { ownerId, vehicleId, driverId } = await seed(pools);
      const driverDoc = await pools.runtimePool.query(
        `INSERT INTO documents(uploader_id, driver_id, kind, object_key, content_type, byte_size, sha256)
         VALUES ($1, $2, 'LICENSE', 'obj-driver-1', 'application/pdf', 100, 'a') RETURNING id`,
        [ownerId, driverId],
      );
      const vehicleReq = await pools.runtimePool.query(
        `INSERT INTO verification_requests(vehicle_id, revision, subject_version, submitted_by, submitted_at)
         VALUES ($1, 1, 1, $2, now()) RETURNING id`,
        [vehicleId, ownerId],
      );
      await expect(
        pools.runtimePool.query(
          'INSERT INTO verification_documents(verification_id, document_id) VALUES ($1, $2)',
          [vehicleReq.rows[0]?.id as string, driverDoc.rows[0]?.id as string],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('invalid_capacity_rejected', async () => {
    await withTestDatabase(async (pools) => {
      const { ownerId, cityId } = await seed(pools);
      for (const seats of [1, 13]) {
        await expect(
          pools.runtimePool.query(
            `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
               make, model, year, category, seats, transmission, fuel_type, city_id)
             VALUES ($1, 'enc', $2, 'Make', 'Model', 2020, 'SEDAN', $3, 'MANUAL', 'PETROL', $4)`,
            [ownerId, `digest-cap-${seats}`, seats, cityId],
          ),
        ).rejects.toBeDefined();
      }
    });
  });

  it('personal_vehicle_has_no_rental_columns', async () => {
    await withTestDatabase(async ({ runtimePool }) => {
      const columns = await runtimePool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='vehicles'`,
      );
      const names = columns.rows.map((r) => (r as unknown as Record<string, string>).column_name);
      expect(names).not.toContain('listed');
      expect(names).not.toContain('hourly_rate_minor');
      const tables = await runtimePool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='owner_profiles'`,
      );
      expect(tables.rows).toHaveLength(0);
    });
  });
});
