import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

interface Pools {
  migrationPool: {
    query: (t: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  runtimePool: {
    query: (t: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
}

interface Seed {
  passengerId: string;
  driverUserId: string;
  driverId: string;
  vehicleId: string;
  originId: string;
  destinationId: string;
  quoteId: string;
  bookingId: string;
}

const STARTS = '2030-05-01T10:00:00Z';
const ENDS = '2030-05-01T14:00:00Z';

async function seed(pools: Pools): Promise<Seed> {
  const { migrationPool, runtimePool } = pools;
  const origin = await migrationPool.query(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Pune', 'Maharashtra', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  const destination = await migrationPool.query(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Mumbai', 'Maharashtra', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  const originId = origin.rows[0]?.id as string;
  const destinationId = destination.rows[0]?.id as string;
  const passenger = await runtimePool.query(
    "INSERT INTO users(email, display_name, password_hash) VALUES ('rider3@example.com', 'Rider', 'h') RETURNING id",
  );
  const driverUser = await runtimePool.query(
    "INSERT INTO users(email, display_name, password_hash) VALUES ('wheel3@example.com', 'Wheel', 'h') RETURNING id",
  );
  const passengerId = passenger.rows[0]?.id as string;
  const driverUserId = driverUser.rows[0]?.id as string;
  const driver = await runtimePool.query(
    'INSERT INTO driver_profiles(user_id) VALUES ($1) RETURNING id',
    [driverUserId],
  );
  const driverId = driver.rows[0]?.id as string;
  const vehicle = await runtimePool.query(
    `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
       make, model, year, category, seats, transmission, fuel_type, city_id)
     VALUES ($1, 'enc', 'digest-journey-vehicle-1', 'Make', 'Model', 2021, 'SUV', 5, 'MANUAL', 'DIESEL', $2)
     RETURNING id`,
    [passengerId, originId],
  );
  const vehicleId = vehicle.rows[0]?.id as string;
  const quote = await runtimePool.query(
    `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
       starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
       driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
     VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 100000, 'INR', '2030-04-30T10:00:00Z')
     RETURNING id`,
    [passengerId, vehicleId, driverId, STARTS, ENDS, originId, destinationId],
  );
  const quoteId = quote.rows[0]?.id as string;
  const booking = await runtimePool.query(
    `INSERT INTO bookings(quote_id, passenger_id, vehicle_id, driver_id, service, status,
       starts_at, ends_at, total_minor, currency, expires_at)
     VALUES ($1, $2, $3, $4, 'DRIVER_HIRE', 'PENDING', $5, $6, 100000, 'INR', '2030-04-30T10:00:00Z')
     RETURNING id`,
    [quoteId, passengerId, vehicleId, driverId, STARTS, ENDS],
  );
  const bookingId = booking.rows[0]?.id as string;
  await runtimePool.query(
    `INSERT INTO booking_decisions(booking_id, provider_id, kind, status) VALUES ($1, $2, 'DRIVER', 'PENDING')`,
    [bookingId, driverUserId],
  );
  return {
    passengerId,
    driverUserId,
    driverId,
    vehicleId,
    originId,
    destinationId,
    quoteId,
    bookingId,
  };
}

describe('Milestone02 Task3: booking, carpool and trip schema', () => {
  it('unsupported_modes_rejected', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      await expect(
        pools.runtimePool.query(
          `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
             starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
             driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
           VALUES ($1, 'RENTAL', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 100000, 'INR', '2030-04-30T10:00:00Z')`,
          [s.passengerId, s.vehicleId, s.driverId, STARTS, ENDS, s.originId, s.destinationId],
        ),
      ).rejects.toBeDefined();
      await expect(
        pools.runtimePool.query(
          `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
             pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
           VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 3, 20000, 'INR', 'APPROVAL', 'PUBLISHED')`,
          [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, STARTS, ENDS],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('duplicate_driver_consent_rejected', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      const rows = await pools.runtimePool.query(
        'SELECT kind, status FROM booking_decisions WHERE booking_id=$1',
        [s.bookingId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({ kind: 'DRIVER', status: 'PENDING' });
      await expect(
        pools.runtimePool.query(
          `INSERT INTO booking_decisions(booking_id, provider_id, kind, status) VALUES ($1, $2, 'DRIVER', 'PENDING')`,
          [s.bookingId, s.driverUserId],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('duplicate_live_seat_rejected', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      const carpool = await pools.runtimePool.query(
        `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
           pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
         VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 3, 20000, 'INR', 'INSTANT', 'PUBLISHED')
         RETURNING id`,
        [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, STARTS, ENDS],
      );
      const carpoolId = carpool.rows[0]?.id as string;
      await pools.runtimePool.query(
        `INSERT INTO seat_requests(carpool_id, passenger_id, seats, status, price_per_seat_minor)
         VALUES ($1, $2, 1, 'ACCEPTED', 20000)`,
        [carpoolId, s.passengerId],
      );
      await expect(
        pools.runtimePool.query(
          `INSERT INTO seat_requests(carpool_id, passenger_id, seats, status, price_per_seat_minor)
           VALUES ($1, $2, 1, 'ACCEPTED', 20000)`,
          [carpoolId, s.passengerId],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('trip_parent_xor_and_uniqueness', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      await expect(
        pools.runtimePool.query(
          `INSERT INTO trips(driver_id, vehicle_id, status, starts_at, ends_at) VALUES ($1, $2, 'SCHEDULED', $3, $4)`,
          [s.driverId, s.vehicleId, STARTS, ENDS],
        ),
      ).rejects.toBeDefined();
      const carpool = await pools.runtimePool.query(
        `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
           pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
         VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 3, 20000, 'INR', 'INSTANT', 'PUBLISHED')
         RETURNING id`,
        [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, STARTS, ENDS],
      );
      const carpoolId = carpool.rows[0]?.id as string;
      await expect(
        pools.runtimePool.query(
          `INSERT INTO trips(booking_id, carpool_id, driver_id, vehicle_id, status, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, 'SCHEDULED', $5, $6)`,
          [s.bookingId, carpoolId, s.driverId, s.vehicleId, STARTS, ENDS],
        ),
      ).rejects.toBeDefined();
      await pools.runtimePool.query(
        `INSERT INTO trips(booking_id, driver_id, vehicle_id, status, starts_at, ends_at)
         VALUES ($1, $2, $3, 'SCHEDULED', $4, $5)`,
        [s.bookingId, s.driverId, s.vehicleId, STARTS, ENDS],
      );
      await expect(
        pools.runtimePool.query(
          `INSERT INTO trips(booking_id, driver_id, vehicle_id, status, starts_at, ends_at)
           VALUES ($1, $2, $3, 'SCHEDULED', $4, $5)`,
          [s.bookingId, s.driverId, s.vehicleId, STARTS, ENDS],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('bound_prices_and_capacity', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      await expect(
        pools.runtimePool.query(
          `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
             starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
             driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
           VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, -5, -10, -10, 'INR', '2030-04-30T10:00:00Z')`,
          [s.passengerId, s.vehicleId, s.driverId, STARTS, ENDS, s.originId, s.destinationId],
        ),
      ).rejects.toBeDefined();
      await expect(
        pools.runtimePool.query(
          `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
             pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
           VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 0, 20000, 'INR', 'INSTANT', 'PUBLISHED')`,
          [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, STARTS, ENDS],
        ),
      ).rejects.toBeDefined();
      await expect(
        pools.runtimePool.query(
          `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
             starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
             driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
           VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000001, 100000001, 'INR', '2030-04-30T10:00:00Z')`,
          [s.passengerId, s.vehicleId, s.driverId, STARTS, ENDS, s.originId, s.destinationId],
        ),
      ).rejects.toBeDefined();
    });
  });

  it('quote_total_equals_driver_subtotal', async () => {
    await withTestDatabase(async (pools) => {
      const s = await seed(pools);
      await expect(
        pools.runtimePool.query(
          `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
             starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
             driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
           VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 99999, 'INR', '2030-04-30T10:00:00Z')`,
          [s.passengerId, s.vehicleId, s.driverId, STARTS, ENDS, s.originId, s.destinationId],
        ),
      ).rejects.toBeDefined();
    });
  });
});
