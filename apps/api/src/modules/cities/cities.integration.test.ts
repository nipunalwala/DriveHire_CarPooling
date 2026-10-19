import { loadEnvFile } from 'node:process';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { CitySchema } from '@drivehire/contracts';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { createPrisma } from '../../runtime/prisma.js';
import { requireTestDatabaseUrl } from '../../runtime/test-database.js';
import { withTestDatabase, type DatabaseFixture } from '../../test/database-fixture.js';
import { CURATED_CITIES, provisionCuratedCities } from './reference-data.js';

try {
  loadEnvFile('.env');
} catch {
  /* CI supplies the environment directly. Missing URL fails closed below. */
}

const APP_ORIGIN = 'http://localhost:5173';

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const prisma = createPrisma(databaseUrl);
afterAll(async () => {
  await prisma.$disconnect();
});

const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  APP_ORIGIN,
});

function buildApp() {
  return createApp({
    config,
    logger: createLogger('silent'),
    readiness: async () => ({ database: true, schema: true, worker: true }),
    accounts: { prisma },
  });
}

async function persistedCityIds(fixture: DatabaseFixture): Promise<string[]> {
  const rows = await fixture.migrationPool.query<{ id: string }>(
    'SELECT id FROM cities ORDER BY name',
  );
  return rows.rows.map((row) => row.id);
}

describe('Milestone04 city catalogue: GET /api/v1/cities', () => {
  it('city_catalogue_returns_persisted_curated_cities', async () => {
    await withTestDatabase(async (fixture) => {
      await provisionCuratedCities(fixture.migrationPool);
      const app = buildApp();

      const response = await request(app).get('/api/v1/cities');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: CURATED_CITIES.length,
      });

      const persistedIds = new Set(await persistedCityIds(fixture));
      for (const row of response.body.data as unknown[]) {
        expect(CitySchema.safeParse(row).success).toBe(true);
        expect(persistedIds.has((row as { id: string }).id)).toBe(true);
      }
      for (const row of response.body.data as Array<{ country: string; timezone: string }>) {
        expect(row.country).toBe('IN');
        expect(row.timezone).toBe('Asia/Kolkata');
      }
    });
  }, 60000);

  it('provisioning_is_idempotent_and_keeps_persisted_identities', async () => {
    await withTestDatabase(async (fixture) => {
      const first = await provisionCuratedCities(fixture.migrationPool);
      expect(first.curated).toBe(CURATED_CITIES.length);
      const afterFirst = await persistedCityIds(fixture);

      const second = await provisionCuratedCities(fixture.migrationPool);
      expect(second.curated).toBe(CURATED_CITIES.length);
      const afterSecond = await persistedCityIds(fixture);

      expect(afterSecond).toEqual(afterFirst);
      const count = await fixture.migrationPool.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM cities',
      );
      expect(count.rows[0]?.total).toBe(CURATED_CITIES.length);
    });
  }, 60000);

  it('inactive_city_is_excluded_from_catalogue', async () => {
    await withTestDatabase(async (fixture) => {
      await provisionCuratedCities(fixture.migrationPool);
      const hidden = await fixture.migrationPool.query<{ id: string }>(
        `INSERT INTO cities (name, region, country, timezone, active)
         VALUES ('Retired Hub', 'MH', 'IN', 'Asia/Kolkata', false) RETURNING id`,
      );
      const app = buildApp();

      const response = await request(app).get('/api/v1/cities?pageSize=100');

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(CURATED_CITIES.length);
      const ids = (response.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).not.toContain(hidden.rows[0]?.id);
    });
  }, 60000);

  it('catalogue_paginates_and_rejects_invalid_query', async () => {
    await withTestDatabase(async (fixture) => {
      await provisionCuratedCities(fixture.migrationPool);
      const app = buildApp();

      const first = await request(app).get('/api/v1/cities?page=1&pageSize=10');
      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(10);
      expect(first.body.meta).toEqual({ page: 1, pageSize: 10, total: CURATED_CITIES.length });

      const last = await request(app).get('/api/v1/cities?page=3&pageSize=10');
      expect(last.status).toBe(200);
      expect(last.body.data).toHaveLength(CURATED_CITIES.length - 20);

      const firstIds = new Set((first.body.data as Array<{ id: string }>).map((row) => row.id));
      for (const row of last.body.data as Array<{ id: string }>) {
        expect(firstIds.has(row.id)).toBe(false);
      }

      const invalidPage = await request(app).get('/api/v1/cities?page=0');
      expect(invalidPage.status).toBe(400);
      const unknownQuery = await request(app).get('/api/v1/cities?unexpected=1');
      expect(unknownQuery.status).toBe(400);
    });
  }, 60000);
});
