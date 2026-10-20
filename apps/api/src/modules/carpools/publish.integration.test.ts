import request from 'supertest';
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
const holds = async (fixture: DatabaseFixture) =>
  Number(
    (
      await fixture.runtimePool.query(
        'SELECT count(*)::int AS n FROM resource_reservations WHERE released_at IS NULL',
      )
    ).rows[0].n,
  );

describe('owned vehicle carpool publication', () => {
  it('APPROVAL_joinMode422', async () =>
    withTestDatabase(async (fixture) => {
      const { app, token, input } = await setup(fixture);
      const result = await auth(app, token)
        .post('/api/v1/carpools')
        .send({ ...input, joinMode: 'APPROVAL' });
      expect(result.status).toBe(422);
      expect(await holds(fixture)).toBe(0);
    }));
  it('offered_excludes_driver', async () =>
    withTestDatabase(async (fixture) => {
      const { app, token, input } = await setup(fixture);
      const result = await auth(app, token)
        .post('/api/v1/carpools')
        .send({ ...input, seatsOffered: 4 });
      expect(result.status).toBe(422);
      expect(await holds(fixture)).toBe(0);
    }));
  it('foreign_vehicle404', async () =>
    withTestDatabase(async (fixture) => {
      const { app, token, input } = await setup(fixture);
      const foreignId = await seedAccount(fixture, 'foreign-owner@example.com');
      const vehicleId = await seedApprovedVehicle(fixture, {
        ownerId: foreignId,
        cityId: input.originCityId,
        registration: 'FOREIGN-REG',
      });
      expect(
        (
          await auth(app, token)
            .post('/api/v1/carpools')
            .send({ ...input, vehicleId })
        ).status,
      ).toBe(404);
    }));
  it('draft_no_holds_publish_two_holds_and_safe_public_summary', async () =>
    withTestDatabase(async (fixture) => {
      const { app, token, input, hostId } = await setup(fixture);
      const draft = await auth(app, token).post('/api/v1/carpools').send(input);
      expect(draft.status).toBe(201);
      expect(draft.body.data.status).toBe('DRAFT');
      expect(await holds(fixture)).toBe(0);
      expect((await request(app).get(`/api/v1/carpools/${draft.body.data.id}`)).status).toBe(404);
      const published = await auth(app, token)
        .post(`/api/v1/carpools/${draft.body.data.id}/publish`)
        .send({ version: draft.body.data.version });
      expect(published.status).toBe(200);
      expect(published.body.data.status).toBe('PUBLISHED');
      expect(await holds(fixture)).toBe(2);
      const publicRide = await request(app).get(`/api/v1/carpools/${draft.body.data.id}`);
      expect(publicRide.status).toBe(200);
      expect(publicRide.body.data).toMatchObject({
        hostId,
        confirmedSeats: 0,
        availableSeats: 3,
        vehicleSummary: { make: 'Maruti', model: 'Swift', seats: 4 },
      });
      expect(Object.keys(publicRide.body.data).sort()).toEqual(
        [
          'id',
          'hostId',
          'vehicleId',
          'tripId',
          'originCityId',
          'destinationCityId',
          'pickupNote',
          'dropoffNote',
          'startsAt',
          'endsAt',
          'seatsOffered',
          'confirmedSeats',
          'availableSeats',
          'pricePerSeatMinor',
          'currency',
          'joinMode',
          'status',
          'version',
          'hostDisplayName',
          'vehicleSummary',
        ].sort(),
      );
      expect(
        (
          await fixture.runtimePool.query('SELECT status FROM trips WHERE carpool_id=$1', [
            draft.body.data.id,
          ])
        ).rows[0].status,
      ).toBe('ASSIGNED');
      const updated = await request(app)
        .put(`/api/v1/carpools/${draft.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...input, version: published.body.data.version, pricePerSeatMinor: 1 });
      expect(updated.status).toBe(409);
    }));
  it('duplicate_publish_is_conflict_and_keeps_two_holds', async () =>
    withTestDatabase(async (fixture) => {
      const { app, token, input } = await setup(fixture);
      const draft = await auth(app, token).post('/api/v1/carpools').send(input);
      expect(draft.status).toBe(201);
      const results = await Promise.all(
        [1, 2].map(() =>
          auth(app, token)
            .post(`/api/v1/carpools/${draft.body.data.id}/publish`)
            .send({ version: draft.body.data.version }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await holds(fixture)).toBe(2);
    }));
});

it('publish_vs_hire_one_commit', async () =>
  withTestDatabase(async (fixture) => {
    const { app, token, input } = await setup(fixture);
    const hiredUser = await seedAccount(fixture, 'hired-driver@example.com', [
      'PASSENGER',
      'DRIVER',
    ]);
    const hired = await seedApprovedDriver(fixture, {
      userId: hiredUser,
      cityId: input.originCityId,
      licenseNumber: 'HIRED-DRIVER',
    });
    const quote = await auth(app, token).post('/api/v1/booking-quotes').send({
      service: 'DRIVER_HIRE',
      vehicleId: input.vehicleId,
      driverId: hired.driverId,
      originCityId: input.originCityId,
      destinationCityId: input.destinationCityId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      passengers: 1,
    });
    expect(quote.status).toBe(201);
    const draft = await auth(app, token).post('/api/v1/carpools').send(input);
    expect(draft.status).toBe(201);
    const results = await Promise.all([
      auth(app, token)
        .post(`/api/v1/carpools/${draft.body.data.id}/publish`)
        .send({ version: draft.body.data.version }),
      auth(app, token)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', 'carpool-hire-race-key-0001')
        .send({ quoteId: quote.body.data.id }),
    ]);
    expect(results.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await holds(fixture)).toBe(2);
  }));

it('origin_date_DST_range_correct', async () =>
  withTestDatabase(async (fixture) => {
    const { app, token, input } = await setup(fixture);
    const timezone = 'America/New_York';
    await fixture.migrationPool.query('UPDATE cities SET timezone=$2 WHERE id=$1', [
      input.originCityId,
      timezone,
    ]);
    const offset = (instant: Date) =>
      new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' })
        .formatToParts(instant)
        .find((p) => p.type === 'timeZoneName')!
        .value.replace('GMT', '');
    let previous = new Date();
    previous.setUTCHours(12, 0, 0, 0);
    let transition: Date | undefined;
    for (let day = 1; day < 179; day++) {
      const next = new Date(previous.getTime() + 86400000);
      if (offset(previous) !== offset(next)) {
        transition = next;
        break;
      }
      previous = next;
    }
    expect(transition, 'a DST boundary lies within the approved planning horizon').toBeDefined();
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(transition!);
    const oldOffset = offset(previous),
      newOffset = offset(transition!);
    const nextDate = new Date(`${date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const starts = [
      `${date}T00:30:00${oldOffset}`,
      `${date}T23:30:00${newOffset}`,
      `${nextDate.toISOString().slice(0, 10)}T00:30:00${newOffset}`,
    ];
    const published: string[] = [];
    for (const startsAt of starts) {
      const draft = await auth(app, token)
        .post('/api/v1/carpools')
        .send({
          ...input,
          startsAt,
          endsAt: new Date(new Date(startsAt).getTime() + 15 * 60000).toISOString(),
        });
      expect(draft.status).toBe(201);
      const ride = await auth(app, token)
        .post(`/api/v1/carpools/${draft.body.data.id}/publish`)
        .send({ version: draft.body.data.version });
      expect(ride.status).toBe(200);
      published.push(ride.body.data.id);
    }
    const found = await request(app).get('/api/v1/carpools').query({
      originCityId: input.originCityId,
      destinationCityId: input.destinationCityId,
      date,
      seats: 3,
    });
    expect(found.status).toBe(200);
    expect(found.body.meta.total).toBe(2);
    expect(found.body.data.map((ride: { id: string }) => ride.id)).toEqual(published.slice(0, 2));
  }));
