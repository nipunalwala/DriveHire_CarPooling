import { afterAll } from 'vitest';
import { closeDb } from '../src/config/db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://drivehire:drivehire@localhost:5432/drivehire_test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-secret-value-at-least-thirty-two-characters-long';
process.env.CLIENT_URL ??= 'http://localhost:5173';

afterAll(async () => {
  await closeDb();
});
