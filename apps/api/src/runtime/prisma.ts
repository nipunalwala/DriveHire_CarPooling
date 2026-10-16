import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

/** Runtime Prisma client over an explicit database URL (driver adapter, no DDL). */
export function createPrisma(databaseUrl: string): PrismaClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
  });
  pool.on('error', () => {});
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
