import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import {
  buildApp,
  auth,
  login,
  seedAccount,
  seedCity,
  seedApprovedDriver,
  seedApprovedVehicle,
  prisma,
} from './test-fixtures.js';
import { createAdminService } from '../admin/service.js';
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

async function join(fixture: DatabaseFixture, app: ReturnType<typeof buildApp>, id: string) {
  const token = await passenger(fixture, app, 'lifecycle-pax');
  const result = await auth(app, token)
    .post(`/api/v1/carpools/${id}/seat-requests`)
    .set('Idempotency-Key', randomUUID())
    .send({ seats: 1 });
  expect(result.status).toBe(201);
  return { token, seat: result.body.data };
}
async function assertReleased(fixture: DatabaseFixture, id: string, status: string) {
  expect(
    (
      await fixture.runtimePool.query('SELECT status,confirmed_seats FROM carpools WHERE id=$1', [
        id,
      ])
    ).rows[0],
  ).toEqual({ status, confirmed_seats: 0 });
  expect(
    (
      await fixture.runtimePool.query(
        'SELECT count(*)::int AS n FROM resource_reservations WHERE carpool_id=$1 AND released_at IS NULL',
        [id],
      )
    ).rows[0].n,
  ).toBe(0);
  expect((await capacity(fixture, id)).confirmed_seats).toBe(0);
}
async function start(
  fixture: DatabaseFixture,
  app: ReturnType<typeof buildApp>,
  token: string,
  ride: { id: string; tripId: string },
) {
  await fixture.runtimePool.query(
    "UPDATE carpools SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '2 hours' WHERE id=$1",
    [ride.id],
  );
  await fixture.runtimePool.query(
    "UPDATE trips SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '2 hours' WHERE carpool_id=$1",
    [ride.id],
  );
  const trip = await auth(app, token).get(`/api/v1/trips/${ride.tripId}`);
  const result = await auth(app, token)
    .post(`/api/v1/trips/${ride.tripId}/transitions`)
    .send({ toStatus: 'STARTED', version: trip.body.data.version });
  expect(result.status).toBe(200);
  return result.body.data;
}
it('whole_cancel_terminalizes_seats_and_releases_once', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture, 3);
    await join(fixture, app, ride.id);
    const current = await auth(app, token).get(`/api/v1/carpools/${ride.id}`);
    const cancel = () =>
      auth(app, token)
        .post(`/api/v1/carpools/${ride.id}/cancel`)
        .send({ version: current.body.data.version, reason: 'Journey is no longer taking place' });
    expect((await cancel()).status).toBe(200);
    expect((await cancel()).status).toBe(200);
    await assertReleased(fixture, ride.id, 'CANCELLED');
    expect(
      (
        await fixture.runtimePool.query('SELECT status FROM seat_requests WHERE carpool_id=$1', [
          ride.id,
        ])
      ).rows[0].status,
    ).toBe('CANCELLED');
  }));
it('failed_trip_preserves_accepted_history_and_syncs_parent', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture);
    const participant = await join(fixture, app, ride.id);
    const active = await start(fixture, app, token, ride);
    const failed = await auth(app, token).post(`/api/v1/trips/${ride.tripId}/transitions`).send({
      toStatus: 'FAILED',
      version: active.version,
      reason: 'Vehicle developed a mechanical problem',
    });
    expect(failed.status).toBe(200);
    expect(
      (await fixture.runtimePool.query('SELECT status FROM carpools WHERE id=$1', [ride.id]))
        .rows[0].status,
    ).toBe('FAILED');
    expect(
      (
        await fixture.runtimePool.query('SELECT status FROM seat_requests WHERE id=$1', [
          participant.seat.id,
        ])
      ).rows[0].status,
    ).toBe('ACCEPTED');
    expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
  }));
it('suspending_host_cancels_unstarted_ride_immediately', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, hostId } = await published(fixture);
    await join(fixture, app, ride.id);
    const adminId = await seedAccount(fixture, 'lifecycle-admin@example.com', [
      'PASSENGER',
      'ADMIN',
    ]);
    const admin = createAdminService({ prisma });
    await admin.suspendUser(
      { userId: adminId, sessionId: randomUUID(), roles: ['ADMIN'] },
      hostId,
      { reason: 'Account suspended after administrator investigation' },
      { requestId: 'carpool-suspend-test' },
    );
    await assertReleased(fixture, ride.id, 'CANCELLED');
  }));

it('worker_expiry_replays_once_and_terminalizes_accepted_seats', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride } = await published(fixture);
    await join(fixture, app, ride.id);
    await fixture.runtimePool.query(
      "UPDATE carpools SET starts_at=now()-interval '31 minutes',ends_at=now()+interval '1 hour' WHERE id=$1",
      [ride.id],
    );
    await fixture.runtimePool.query(
      "UPDATE trips SET starts_at=now()-interval '31 minutes',ends_at=now()+interval '1 hour' WHERE carpool_id=$1",
      [ride.id],
    );
    const { expireBookings } = await import('../bookings/jobs.js');
    expect(await expireBookings(new Date(), prisma)).toBe(1);
    expect(await expireBookings(new Date(), prisma)).toBe(0);
    await assertReleased(fixture, ride.id, 'EXPIRED');
    expect(
      (
        await fixture.runtimePool.query('SELECT status FROM seat_requests WHERE carpool_id=$1', [
          ride.id,
        ])
      ).rows[0].status,
    ).toBe('EXPIRED');
    expect(
      (
        await fixture.runtimePool.query(
          "SELECT count(*)::int AS n FROM trip_status_history WHERE trip_id=$1 AND to_status='EXPIRED'",
          [ride.tripId],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it('worker_cancels_invalid_unstarted_qualification', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, hostId } = await published(fixture);
    await join(fixture, app, ride.id);
    await fixture.runtimePool.query(
      'UPDATE driver_profiles SET license_expires_on=current_date-1 WHERE user_id=$1',
      [hostId],
    );
    const { expireBookings } = await import('../bookings/jobs.js');
    expect(await expireBookings(new Date(), prisma)).toBe(1);
    await assertReleased(fixture, ride.id, 'CANCELLED');
  }));
it('worker_flags_active_overdue_carpool_without_releasing_physical_use', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture);
    await join(fixture, app, ride.id);
    await start(fixture, app, token, ride);
    await fixture.runtimePool.query(
      "UPDATE trips SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 minute' WHERE carpool_id=$1",
      [ride.id],
    );
    const { expireBookings } = await import('../bookings/jobs.js');
    await expireBookings(new Date(), prisma);
    await expireBookings(new Date(), prisma);
    const trip = (
      await fixture.runtimePool.query(
        'SELECT status,incident_flag FROM trips WHERE carpool_id=$1',
        [ride.id],
      )
    ).rows[0];
    expect(trip).toEqual({ status: 'STARTED', incident_flag: true });
    expect(
      (
        await fixture.runtimePool.query(
          'SELECT count(*)::int AS n FROM resource_reservations WHERE carpool_id=$1 AND released_at IS NULL',
          [ride.id],
        )
      ).rows[0].n,
    ).toBe(2);
    expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
  }));

it('administrator_carpool_reads_validate_date_and_status_filters', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride } = await published(fixture);
    await seedAccount(fixture, 'operations-admin@example.com', ['PASSENGER', 'ADMIN']);
    const adminToken = await login(app, 'operations-admin@example.com');
    const result = await auth(app, adminToken)
      .get('/api/v1/admin/carpools')
      .query({
        status: 'PUBLISHED',
        from: new Date(Date.now() - 86400000).toISOString(),
        to: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(result.status).toBe(200);
    expect(result.body.meta.total).toBe(1);
    expect(result.body.data[0].id).toBe(ride.id);
    expect(
      (await auth(app, adminToken).get('/api/v1/admin/carpools').query({ status: 'PENDING' }))
        .status,
    ).toBe(400);
    expect(
      (
        await auth(app, adminToken)
          .get('/api/v1/admin/carpools')
          .query({ from: '2026-10-20T00:00:00Z', to: '2026-10-19T00:00:00Z' })
      ).status,
    ).toBe(400);
  }));
it('host_roster_exposes_display_names_without_contact_or_evidence', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture);
    const participant = await join(fixture, app, ride.id);
    const roster = await auth(app, token).get(`/api/v1/carpools/${ride.id}/seat-requests`);
    expect(roster.status).toBe(200);
    expect(roster.body.data[0]).toMatchObject({
      id: participant.seat.id,
      passengerDisplayName: 'Booking Test User',
      status: 'ACCEPTED',
    });
    expect(Object.keys(roster.body.data[0]).sort()).toEqual(
      [
        'id',
        'carpoolId',
        'passengerId',
        'seats',
        'status',
        'version',
        'pricePerSeatMinor',
        'passengerDisplayName',
      ].sort(),
    );
    expect(
      (await auth(app, participant.token).get(`/api/v1/carpools/${ride.id}/seat-requests`)).status,
    ).toBe(404);
  }));

it('private_draft_remains_private_after_cancellation', async () =>
  withTestDatabase(async (fixture) => {
    const { app, token, input } = await setup(fixture);
    const draft = await auth(app, token).post('/api/v1/carpools').send(input);
    expect(draft.status).toBe(201);
    const cancel = await auth(app, token)
      .post(`/api/v1/carpools/${draft.body.data.id}/cancel`)
      .send({ version: draft.body.data.version, reason: 'Draft was never offered publicly' });
    expect(cancel.status).toBe(200);
    const outsider = await passenger(fixture, app, 'draft-outsider');
    expect((await auth(app, outsider).get(`/api/v1/carpools/${draft.body.data.id}`)).status).toBe(
      404,
    );
    expect((await auth(app, token).get(`/api/v1/carpools/${draft.body.data.id}`)).status).toBe(200);
  }));

it('host_can_cancel_unstarted_ride_after_passenger_cutoff', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture);
    await join(fixture, app, ride.id);
    await fixture.runtimePool.query(
      "UPDATE carpools SET starts_at=now()+interval '10 minutes' WHERE id=$1",
      [ride.id],
    );
    await fixture.runtimePool.query(
      "UPDATE trips SET starts_at=now()+interval '10 minutes' WHERE carpool_id=$1",
      [ride.id],
    );
    const current = await auth(app, token).get(`/api/v1/carpools/${ride.id}`);
    expect(
      (
        await auth(app, token).post(`/api/v1/carpools/${ride.id}/cancel`).send({
          version: current.body.data.version,
          reason: 'Host cannot safely operate this journey',
        })
      ).status,
    ).toBe(200);
    await assertReleased(fixture, ride.id, 'CANCELLED');
  }));

async function waitForLockedTransactions(fixture: DatabaseFixture, minimum: number) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = await fixture.runtimePool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock'",
    );
    if (result.rows[0]!.n >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error(`Expected ${minimum} real PostgreSQL lock waiters`);
}
async function moveRideWindow(fixture: DatabaseFixture, id: string, minutesAgo: number) {
  await fixture.runtimePool.query(
    `BEGIN; UPDATE carpools SET starts_at=now()-interval '${minutesAgo} minutes',ends_at=now()+interval '2 hours' WHERE id='${id}'; UPDATE trips SET starts_at=now()-interval '${minutesAgo} minutes',ends_at=now()+interval '2 hours' WHERE carpool_id='${id}'; UPDATE resource_reservations SET starts_at=now()-interval '${minutesAgo} minutes',ends_at=now()+interval '2 hours' WHERE carpool_id='${id}'; COMMIT`,
  );
}
it('review_join_vs_start_has_only_legal_persisted_outcome', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token, hostId } = await published(fixture, 3);
    const pax = await passenger(fixture, app, 'start-racer');
    await moveRideWindow(fixture, ride.id, 5);
    const trip = await auth(app, token).get(`/api/v1/trips/${ride.tripId}`),
      blocker = await fixture.migrationPool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [hostId]);
    let starting: Promise<Awaited<ReturnType<ReturnType<typeof auth>['post']>>> | undefined;
    let joining: Promise<Awaited<ReturnType<ReturnType<typeof auth>['post']>>> | undefined;
    try {
      starting = auth(app, token)
        .post(`/api/v1/trips/${ride.tripId}/transitions`)
        .send({ toStatus: 'STARTED', version: trip.body.data.version })
        .then((result) => result);
      await waitForLockedTransactions(fixture, 1);
      joining = auth(app, pax)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 1 })
        .then((result) => result);
      await waitForLockedTransactions(fixture, 2);
    } finally {
      await blocker.query('COMMIT');
      blocker.release();
    }
    const [started, joined] = await Promise.all([starting!, joining!]);
    expect(started.status).toBe(200);
    expect(joined.status).toBe(409);
    expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(0);
    expect(
      (await fixture.runtimePool.query('SELECT status FROM trips WHERE id=$1', [ride.tripId]))
        .rows[0].status,
    ).toBe('STARTED');
    expect(
      (
        await fixture.runtimePool.query(
          'SELECT count(*)::int AS n FROM resource_reservations WHERE carpool_id=$1 AND released_at IS NULL',
          [ride.id],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await fixture.runtimePool.query(
          "SELECT count(*)::int AS n FROM trip_status_history WHERE trip_id=$1 AND to_status='STARTED'",
          [ride.tripId],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it('review_join_vs_expiry_terminalizes_once_without_new_seats', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, hostId } = await published(fixture, 3);
    await join(fixture, app, ride.id);
    const pax = await passenger(fixture, app, 'expiry-racer');
    await moveRideWindow(fixture, ride.id, 31);
    const blocker = await fixture.migrationPool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [hostId]);
    const { expireBookings } = await import('../bookings/jobs.js');
    let expiring: Promise<number> | undefined;
    let joining: Promise<Awaited<ReturnType<ReturnType<typeof auth>['post']>>> | undefined;
    try {
      expiring = expireBookings(new Date(), prisma);
      await waitForLockedTransactions(fixture, 1);
      joining = auth(app, pax)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 1 })
        .then((result) => result);
      await waitForLockedTransactions(fixture, 2);
    } finally {
      await blocker.query('COMMIT');
      blocker.release();
    }
    const [expired, joined] = await Promise.all([expiring!, joining!]);
    expect(expired).toBe(1);
    expect(joined.status).toBe(409);
    await assertReleased(fixture, ride.id, 'EXPIRED');
    expect(
      (
        await fixture.runtimePool.query('SELECT status FROM seat_requests WHERE carpool_id=$1', [
          ride.id,
        ])
      ).rows.map((row) => row.status),
    ).toEqual(['EXPIRED']);
    expect(
      (
        await fixture.runtimePool.query(
          "SELECT count(*)::int AS n FROM trip_status_history WHERE trip_id=$1 AND to_status='EXPIRED'",
          [ride.tripId],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it('review_suspension_rediscovers_passenger_joined_after_initial_graph', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, hostId } = await published(fixture, 3);
    const pax = await passenger(fixture, app, 'suspension-racer');
    const adminId = '00000000-0000-4000-8000-000000000001';
    await fixture.runtimePool.query(
      "INSERT INTO users(id,email,display_name,password_hash,email_verified_at) VALUES ($1,'graph-admin@example.com','Graph Admin','test-only',now())",
      [adminId],
    );
    await fixture.runtimePool.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'ADMIN')", [
      adminId,
    ]);
    const blocker = await fixture.migrationPool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [adminId]);
    const admin = createAdminService({ prisma });
    const suspended = admin.suspendUser(
      { userId: adminId, sessionId: randomUUID(), roles: ['ADMIN'] },
      hostId,
      { reason: 'Suspended after a verified safety investigation' },
      { requestId: 'review-suspension-graph' },
    );
    try {
      await waitForLockedTransactions(fixture, 1);
      const joined = await auth(app, pax)
        .post(`/api/v1/carpools/${ride.id}/seat-requests`)
        .set('Idempotency-Key', randomUUID())
        .send({ seats: 1 });
      expect(joined.status).toBe(201);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
    } finally {
      await blocker.query('COMMIT');
      blocker.release();
    }
    await suspended;
    await assertReleased(fixture, ride.id, 'CANCELLED');
    expect(
      (
        await fixture.runtimePool.query('SELECT status FROM seat_requests WHERE carpool_id=$1', [
          ride.id,
        ])
      ).rows.map((row) => row.status),
    ).toEqual(['CANCELLED']);
    expect(
      (
        await fixture.runtimePool.query(
          "SELECT count(*)::int AS n FROM audit_logs WHERE subject_id=$1 AND action='CARPOOL_CANCELLED'",
          [ride.id],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it('review_whole_cancel_child_update_failure_rolls_back_every_write', async () =>
  withTestDatabase(async (fixture) => {
    const { app, ride, token } = await published(fixture, 3);
    await join(fixture, app, ride.id);
    const current = await auth(app, token).get(`/api/v1/carpools/${ride.id}`);
    await fixture.migrationPool.query(
      "CREATE FUNCTION test_reject_carpool_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='CANCELLED' THEN RAISE EXCEPTION 'injected trip child update failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_carpool_cancel BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION test_reject_carpool_cancel()",
    );
    const cancel = () =>
      auth(app, token).post(`/api/v1/carpools/${ride.id}/cancel`).send({
        version: current.body.data.version,
        reason: 'Cancelling the complete hosted journey',
      });
    try {
      expect((await cancel()).status).toBe(500);
      expect((await capacity(fixture, ride.id)).confirmed_seats).toBe(1);
      expect(
        (await fixture.runtimePool.query('SELECT status FROM carpools WHERE id=$1', [ride.id]))
          .rows[0].status,
      ).toBe('PUBLISHED');
      expect(
        (await fixture.runtimePool.query('SELECT status FROM trips WHERE id=$1', [ride.tripId]))
          .rows[0].status,
      ).toBe('ASSIGNED');
      expect(
        (
          await fixture.runtimePool.query(
            'SELECT count(*)::int AS n FROM resource_reservations WHERE carpool_id=$1 AND released_at IS NULL',
            [ride.id],
          )
        ).rows[0].n,
      ).toBe(2);
      expect(
        (
          await fixture.runtimePool.query(
            "SELECT count(*)::int AS n FROM audit_logs WHERE subject_id=$1 AND action='CARPOOL_CANCELLED'",
            [ride.id],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await fixture.runtimePool.query(
            "SELECT count(*)::int AS n FROM trip_status_history WHERE trip_id=$1 AND to_status='CANCELLED'",
            [ride.tripId],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await fixture.migrationPool.query(
        'DROP TRIGGER test_reject_carpool_cancel ON trips; DROP FUNCTION test_reject_carpool_cancel()',
      );
    }
    expect((await cancel()).status).toBe(200);
    await assertReleased(fixture, ride.id, 'CANCELLED');
  }));
