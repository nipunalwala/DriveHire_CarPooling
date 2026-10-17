import { Pool } from 'pg';
import type { ReadinessState } from '../app.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
    idleTimeoutMillis: 10000,
  });
  // Idle connection errors are logged by the caller without raw connection/error text.
  pool.on('error', () => {});
  return pool;
}

export async function probeReadiness(pool: Pool): Promise<ReadinessState> {
  try {
    const schema = await pool.query<{ ready: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.job_leases') IS NOT NULL AND to_regclass('public._prisma_migrations') IS NOT NULL AS ready",
    );
    if (!schema.rows[0]?.ready) return { database: true, schema: false, worker: false };
    const worker = await pool.query<{ ready: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM job_leases WHERE name = 'worker-heartbeat' AND heartbeat_at > now() - interval '2 minutes' AND lease_until > now()) AS ready",
    );
    return { database: true, schema: true, worker: Boolean(worker.rows[0]?.ready) };
  } catch {
    return { database: false, schema: false, worker: false };
  }
}

export async function updateHeartbeat(pool: Pool, owner: string): Promise<boolean> {
  const result = await pool.query<{ ready: boolean }>(
    "SELECT to_regclass('public.job_leases') IS NOT NULL AS ready",
  );
  if (!result.rows[0]?.ready) return false;
  await pool.query(
    "INSERT INTO job_leases(name, owner, lease_until, heartbeat_at) VALUES ('worker-heartbeat', $1, now() + interval '2 minutes', now()) ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, lease_until = EXCLUDED.lease_until, heartbeat_at = EXCLUDED.heartbeat_at",
    [owner],
  );
  return true;
}
