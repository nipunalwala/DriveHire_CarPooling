import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import {
  buildApp,
  auth,
  login,
  seedAccount,
  seedCity,
  seedApprovedDriver,
  seedApprovedVehicle,
} from './test-fixtures.js';
async function setup(fixture: DatabaseFixture) {
  const app = buildApp();
  const origin = await seedCity(fixture, 'Pune');
  const destination = await seedCity(fixture, 'Mumbai');
  const hostId = await seedAccount(fixture, 'carpool-host@example.com', ['PASSENGER', 'DRIVER']);
  await seedApprovedDriver(fixture, {
    userId: hostId,
    cityId: origin.id,
    licenseNumber: 'CP-TEST-1',
  });
  const vehicleId = await seedApprovedVehicle(fixture, {
    ownerId: hostId,
    cityId: origin.id,
    seats: 4,
    registration: 'CP-REG-1',
  });
  const token = await login(app, 'carpool-host@example.com');
  const start = new Date(Date.now() + 3 * 3600000);
  const input = {
    vehicleId,
    originCityId: origin.id,
    destinationCityId: destination.id,
    pickupNote: 'Main entrance',
    dropoffNote: 'Station entrance',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3600000).toISOString(),
    seatsOffered: 3,
    pricePerSeatMinor: 12500,
    joinMode: 'INSTANT',
  };
  return { app, token, input, hostId };
}

async function published(fixture: DatabaseFixture, seats = 1) {
  const base = await setup(fixture);
  const draft = await auth(base.app, base.token)
    .post('/api/v1/carpools')
    .send({ ...base.input, seatsOffered: seats });
  expect(draft.status).toBe(201);
  const ride = await auth(base.app, base.token)
    .post(`/api/v1/carpools/${draft.body.data.id}/publish`)
    .send({ version: draft.body.data.version });
  expect(ride.status).toBe(200);
  return { ...base, ride: ride.body.data };
}
async function passenger(
  fixture: DatabaseFixture,
  app: ReturnType<typeof buildApp>,
  label: string,
) {
  const email = label + '@example.com';
  await seedAccount(fixture, email);
  return login(app, email);
}
async function capacity(fixture: DatabaseFixture, id: string) {
  const ride = (
    await fixture.runtimePool.query(
      'SELECT confirmed_seats,seats_offered FROM carpools WHERE id=$1',
      [id],
    )
  ).rows[0];
  const accepted = (
    await fixture.runtimePool.query(
      "SELECT seats FROM seat_requests WHERE carpool_id=$1 AND status='ACCEPTED'",
      [id],
    )
  ).rows;
  expect(accepted.reduce((n, r) => n + Number(r.seats), 0)).toBe(ride.confirmed_seats);
  return ride;
}

describe('instant carpool seats', () => {
  it('final_seat_race_no_oversell', async () =>
    withTestDatabase(async (fixture) => {
      const { app, ride } = await published(fixture);
      const a = await passenger(fixture, app, 'seat-a'),
        b = await passenger(fixture, app, 'seat-b');
      const responses = await Promise.all(
        [a, b].map((token) =>
          auth(app, token)
            .post(`/api/v1/carpools/${ride.id}/seat-requests`)
            .set('Idempotency-Key', randomUUID())
            .send({ seats: 1 }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
    }));
  it('replay_is_single_increment_and_hash_mismatch_conflicts', async () =>
    withTestDatabase(async (fixture) => {
      const { app, ride } = await published(fixture, 3);
      const token = await passenger(fixture, app, 'replay-pax'),
        key = randomUUID();
      const join = (seats: number) =>
        auth(app, token)
          .post(`/api/v1/carpools/${ride.id}/seat-requests`)
          .set('Idempotency-Key', key)
          .send({ seats });
      const first = await join(1);
      expect(first.status).toBe(201);
      expect(first.body.data.status).toBe('ACCEPTED');
      const again = await join(1);
      expect([200, 201]).toContain(again.status);
      expect(again.body).toEqual(first.body);
      expect((await join(2)).status).toBe(409);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
      const duplicate = await auth(app, token)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 1 });
      expect(duplicate.status).toBe(409);
    }));
  it('repeat_seat_cancel_decrements_once', async () =>
    withTestDatabase(async (fixture) => {
      const { app, ride } = await published(fixture, 3);
      const token = await passenger(fixture, app, 'cancel-pax');
      const joined = await auth(app, token)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 2 });
      expect(joined.status).toBe(201);
      const cancel = () =>
        auth(app, token)
          .post(`/api/v1/seat-requests/${joined.body.data.id}/cancel`)
          .send({ version: joined.body.data.version, reason: 'Plans changed for this journey' });
      expect((await cancel()).status).toBe(200);
      expect((await cancel()).status).toBe(200);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(0);
    }));
  it('host_cannot_join_own_ride', async () =>
    withTestDatabase(async (fixture) => {
      const { app, ride, token } = await published(fixture);
      expect(
        (
          await auth(app, token)
            .post(`/api/v1/carpools/${ride.id}/seat-requests`)
            .set('Idempotency-Key', randomUUID())
            .send({ seats: 1 })
        ).status,
      ).toBe(403);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(0);
    }));
});

it('join_vs_whole_cancel_has_one_consistent_capacity_outcome', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture);
    const pax = await passenger(fixture, app, 'cancel-racer');
    const [joined, cancelled] = await Promise.all([
      auth(app, pax)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 1 }),
      auth(app, token)
        .post(`/api/v1/carpools/${ride.id}/cancel`)
        .send({ version: ride.version, reason: 'Host is cancelling this journey' }),
    ]);
    const current = await capacity(fixture, ride.id);
    if (cancelled.status === 200) {
      expect(joined.status).toBe(409);
      expect(current.confirmed_seats).toBe(0);
    } else {
      expect(cancelled.status).toBe(409);
      expect(joined.status).toBe(201);
      expect(current.confirmed_seats).toBe(1);
    }
  }));
it('failed_child_insert_rolls_back_count_and_idempotency', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride } = await published(fixture, 3);
    const token = await passenger(fixture, app, 'rollback-pax');
    const key = randomUUID();
    await fixture.migrationPool.query(
      "CREATE FUNCTION test_reject_seat_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected child insert failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_reject_seat_insert BEFORE INSERT ON seat_requests FOR EACH ROW EXECUTE FUNCTION test_reject_seat_insert()",
    );
    try {
      const result = await auth(app, token)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', key)
        .send({ seats: 2 });
      expect(result.status).toBe(500);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(0);
      expect(
        (
          await fixture.runtimePool.query(
            'SELECT count(*)::int AS n FROM idempotency_keys WHERE key=$1',
            [key],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await fixture.migrationPool.query(
        'DROP TRIGGER test_reject_seat_insert ON seat_requests; DROP FUNCTION test_reject_seat_insert()',
      );
    }
    const retry = await auth(app, token)
      .post(`/api/v1/carpools/${ride.id}/seat-requests`)
      .set('Idempotency-Key', key)
      .send({ seats: 2 });
    expect(retry.status).toBe(201);
    expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(2);
  }));
