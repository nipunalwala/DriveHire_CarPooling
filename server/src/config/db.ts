import knex, { type Knex } from 'knex';
import { loadEnv } from './env';

let instance: Knex | undefined;
export function getDb(): Knex {
  if (!instance) {
    const env = loadEnv();
    instance = knex({
      client: 'pg',
      connection: env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL,
      pool:
        env.NODE_ENV === 'production'
          ? { min: 2, max: 20, acquireTimeoutMillis: 30_000, idleTimeoutMillis: 30_000 }
          : { min: 1, max: 10, acquireTimeoutMillis: 30_000, idleTimeoutMillis: 30_000 }
    });
  }
  return instance;
}
export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = undefined;
  }
}
