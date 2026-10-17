import { loadEnvFile } from 'node:process';
import { describe, expect, it } from 'vitest';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

interface Seed {
  passengerId: string;
  driverUserId: string;
  driver2UserId: string;
  driverId: string;
  driver2Id: string;
  vehicleId: string;
  originId: string;
  destinationId: string;
}

const A_START = '2030-06-01T10:00:00Z';
const A_END = '2030-06-01T14:00:00Z';
const B_START = '2030-06-01T13:00:00Z';
const B_END = '2030-06-01T15:00:00Z';
const C_END = '2030-06-01T16:00:00Z';
const REVERSED_END = '2030-06-01T09:00:00Z';

async function seed(f: DatabaseFixture): Promise<Seed> {
  const { migrationPool, runtimePool } = f;
  const origin = await migrationPool.query(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Pune', 'Maharashtra', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  const destination = await migrationPool.query(
    "INSERT INTO cities(name, region, country, timezone) VALUES ('Mumbai', 'Maharashtra', 'IN', 'Asia/Kolkata') RETURNING id",
  );
  const originId = origin.rows[0]?.id as string;
  const destinationId = destination.rows[0]?.id as string;
  const mkUser = (email: string) =>
    runtimePool.query(
      "INSERT INTO users(email, display_name, password_hash) VALUES ($1, 'Test', 'h') RETURNING id",
      [email],
    );
  const passengerId = (await mkUser('cpax4@example.com')).rows[0]?.id as string;
  const driverUserId = (await mkUser('cdrv4@example.com')).rows[0]?.id as string;
  const driver2UserId = (await mkUser('cdrv42@example.com')).rows[0]?.id as string;
  const driverId = (
    await runtimePool.query('INSERT INTO driver_profiles(user_id) VALUES ($1) RETURNING id', [
      driverUserId,
    ])
  ).rows[0]?.id as string;
  const driver2Id = (
    await runtimePool.query('INSERT INTO driver_profiles(user_id) VALUES ($1) RETURNING id', [
      driver2UserId,
    ])
  ).rows[0]?.id as string;
  const vehicleId = (
    await runtimePool.query(
      `INSERT INTO vehicles(owner_id, registration_number_ciphertext, registration_number_digest,
         make, model, year, category, seats, transmission, fuel_type, city_id)
       VALUES ($1, 'enc', 'digest-constraint-vehicle-1', 'Make', 'Model', 2021, 'SUV', 5, 'MANUAL', 'DIESEL', $2)
       RETURNING id`,
      [passengerId, originId],
    )
  ).rows[0]?.id as string;
  return {
    passengerId,
    driverUserId,
    driver2UserId,
    driverId,
    driver2Id,
    vehicleId,
    originId,
    destinationId,
  };
}

async function makeBooking(
  f: DatabaseFixture,
  s: Seed,
  starts: string,
  ends: string,
  driverId: string = s.driverId,
): Promise<string> {
  const quote = await f.runtimePool.query(
    `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
       starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
       driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
     VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 100000, 'INR', '2030-05-30T10:00:00Z')
     RETURNING id`,
    [s.passengerId, s.vehicleId, driverId, starts, ends, s.originId, s.destinationId],
  );
  const booking = await f.runtimePool.query(
    `INSERT INTO bookings(quote_id, passenger_id, vehicle_id, driver_id, service, status,
       starts_at, ends_at, total_minor, currency, expires_at)
     VALUES ($1, $2, $3, $4, 'DRIVER_HIRE', 'PENDING', $5, $6, 100000, 'INR', '2030-05-30T10:00:00Z')
     RETURNING id`,
    [quote.rows[0]?.id as string, s.passengerId, s.vehicleId, driverId, starts, ends],
  );
  return booking.rows[0]?.id as string;
}

async function hold(
  f: DatabaseFixture,
  source: { bookingId?: string; carpoolId?: string; blockId?: string },
  resource: { driverId?: string; vehicleId?: string },
  starts: string,
  ends: string,
): Promise<string> {
  const inserted = await f.runtimePool.query(
    `INSERT INTO resource_reservations(driver_id, vehicle_id, booking_id, carpool_id, availability_block_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      resource.driverId ?? null,
      resource.vehicleId ?? null,
      source.bookingId ?? null,
      source.carpoolId ?? null,
      source.blockId ?? null,
      starts,
      ends,
    ],
  );
  return inserted.rows[0]?.id as string;
}

describe('Milestone02 Task4: SQL resource protections and runtime grants', () => {
  it('same_driver_overlap_rejected_and_adjacency_allowed', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      const bookingA = await makeBooking(f, s, A_START, A_END);
      await hold(f, { bookingId: bookingA }, { driverId: s.driverId }, A_START, A_END);
      const bookingB = await makeBooking(f, s, B_START, B_END);
      const conflictingInsert = hold(
        f,
        { bookingId: bookingB },
        { driverId: s.driverId },
        B_START,
        B_END,
      );
      await expect(conflictingInsert).rejects.toMatchObject({ code: '23P01' });
      const bookingC = await makeBooking(f, s, A_END, C_END);
      const adjacentInsert = hold(
        f,
        { bookingId: bookingC },
        { driverId: s.driverId },
        A_END,
        C_END,
      );
      await expect(adjacentInsert).resolves.toBeDefined();
    });
  });

  it('same_vehicle_overlap_rejected', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      const bookingA = await makeBooking(f, s, A_START, A_END);
      await hold(f, { bookingId: bookingA }, { vehicleId: s.vehicleId }, A_START, A_END);
      const bookingB = await makeBooking(f, s, B_START, B_END, s.driver2Id);
      await expect(
        hold(f, { bookingId: bookingB }, { vehicleId: s.vehicleId }, B_START, B_END),
      ).rejects.toMatchObject({
        code: '23P01',
      });
    });
  });

  it('wrong_source_resource_pair_rejected', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      const bookingA = await makeBooking(f, s, A_START, A_END);
      const client = await f.runtimePool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO resource_reservations(driver_id, booking_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $4)`,
          [s.driver2Id, bookingA, A_START, A_END],
        );
        await expect(client.query('COMMIT')).rejects.toMatchObject({ code: '23503' });
      } finally {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* commit already rolled back on failure */
        }
        client.release();
      }
      const holds = await f.runtimePool.query(
        'SELECT COUNT(*)::text AS n FROM resource_reservations',
      );
      expect(holds.rows[0]?.n).toBe('0');
    });
  });

  it('resource_source_xor_rejected', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      const bookingA = await makeBooking(f, s, A_START, A_END);
      await expect(hold(f, {}, { driverId: s.driverId }, A_START, A_END)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        f.runtimePool.query(
          `INSERT INTO resource_reservations(driver_id, vehicle_id, booking_id, carpool_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $3, $4, $5)`,
          [s.driverId, s.vehicleId, bookingA, A_START, A_END],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        hold(
          f,
          { bookingId: bookingA },
          { driverId: s.driverId, vehicleId: s.vehicleId },
          REVERSED_END,
          A_START,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('seat_sum_and_capacity_guarded', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      await expect(
        f.runtimePool.query(
          `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
             pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
           VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 5, 20000, 'INR', 'INSTANT', 'PUBLISHED')`,
          [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, A_START, A_END],
        ),
      ).rejects.toBeDefined();
      const carpool = await f.runtimePool.query(
        `INSERT INTO carpools(host_id, driver_id, vehicle_id, origin_city_id, destination_city_id,
           pickup_note, dropoff_note, starts_at, ends_at, seats_offered, price_per_seat_minor, currency, join_mode, status)
         VALUES ($1, $2, $3, $4, $5, 'pick', 'drop', $6, $7, 3, 20000, 'INR', 'INSTANT', 'PUBLISHED')
         RETURNING id`,
        [s.passengerId, s.driverId, s.vehicleId, s.originId, s.destinationId, A_START, A_END],
      );
      const carpoolId = carpool.rows[0]?.id as string;
      await expect(
        f.runtimePool.query('UPDATE carpools SET confirmed_seats=999 WHERE id=$1', [carpoolId]),
      ).rejects.toBeDefined();
      const check = await f.runtimePool.query('SELECT confirmed_seats FROM carpools WHERE id=$1', [
        carpoolId,
      ]);
      expect(check.rows[0]?.confirmed_seats).toBe(0);
    });
  });

  it('audit_history_quote_update_denied', async () => {
    await withTestDatabase(async (f) => {
      const s = await seed(f);
      const quoteId = (
        await f.runtimePool.query(
          `INSERT INTO booking_quotes(requester_id, service, vehicle_id, driver_id, vehicle_version, driver_version,
             starts_at, ends_at, origin_city_id, destination_city_id, passengers, billable_hours,
             driver_rate_minor, driver_subtotal_minor, total_minor, currency, expires_at)
           VALUES ($1, 'DRIVER_HIRE', $2, $3, 1, 1, $4, $5, $6, $7, 1, 2, 50000, 100000, 100000, 'INR', '2030-05-30T10:00:00Z')
           RETURNING id`,
          [s.passengerId, s.vehicleId, s.driverId, A_START, A_END, s.originId, s.destinationId],
        )
      ).rows[0]?.id as string;
      await expect(
        f.runtimePool.query('UPDATE booking_quotes SET total_minor=1 WHERE id=$1', [quoteId]),
      ).rejects.toMatchObject({ code: '42501' });
      const auditId = (
        await f.runtimePool.query(
          `INSERT INTO audit_logs(actor_id, actor_type, action, subject_type, subject_id, request_id)
           VALUES ($1, 'USER', 'test.action', 'booking_quotes', $2, 'req-1') RETURNING id`,
          [s.passengerId, quoteId],
        )
      ).rows[0]?.id as string;
      await expect(
        f.runtimePool.query('UPDATE audit_logs SET reason=$1 WHERE id=$2', ['x', auditId]),
      ).rejects.toMatchObject({ code: '42501' });
      const bookingId = await makeBooking(f, s, A_START, A_END);
      const tripId = (
        await f.runtimePool.query(
          `INSERT INTO trips(booking_id, driver_id, vehicle_id, status, starts_at, ends_at)
           VALUES ($1, $2, $3, 'SCHEDULED', $4, $5) RETURNING id`,
          [bookingId, s.driverId, s.vehicleId, A_START, A_END],
        )
      ).rows[0]?.id as string;
      await f.runtimePool.query(
        `INSERT INTO trip_status_history(trip_id, to_status, actor_type, trip_version, request_id)
         VALUES ($1, 'SCHEDULED', 'USER', 1, 'req-1')`,
        [tripId],
      );
      await expect(
        f.runtimePool.query('UPDATE trip_status_history SET reason=$1 WHERE trip_id=$2', [
          'x',
          tripId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
