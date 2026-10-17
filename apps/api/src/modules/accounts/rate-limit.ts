import { createHmac } from 'node:crypto';
import type { PrismaClient } from '../../generated/client/client.js';

// Durable, bounded fixed-window rate limiting over the existing
// `rate_limit_buckets` table. Counters are shared across replicas through
// PostgreSQL; keys are HMAC'd with the configured pepper so raw addresses or
// IPs never reach storage. The window is derived from the clock, so buckets are
// self-expiring and an opportunistic bounded delete keeps the table small.

export interface RateLimitBudget {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, budget: RateLimitBudget): Promise<RateLimitResult>;
}

const CLEANUP_EVERY = 64;
const CLEANUP_BATCH = 100;

export function createRateLimiter({
  prisma,
  pepper,
}: {
  prisma: PrismaClient;
  pepper: string;
}): RateLimiter {
  let calls = 0;

  function keyHash(value: string): string {
    return createHmac('sha256', pepper).update(`rate:${value}`).digest('hex');
  }

  return {
    async consume(key, budget) {
      const windowMs = budget.windowSeconds * 1000;
      const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
      const expiresAt = new Date(windowStart.getTime() + windowMs);
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        INSERT INTO rate_limit_buckets (key_hash, window_start, count, expires_at)
        VALUES (${keyHash(key)}, ${windowStart}, 1, ${expiresAt})
        ON CONFLICT (key_hash, window_start)
        DO UPDATE SET count = rate_limit_buckets.count + 1
        RETURNING count
      `;
      calls += 1;
      if (calls % CLEANUP_EVERY === 0) {
        // Bounded opportunistic cleanup; never unbounded DELETE.
        await prisma.$executeRaw`
          DELETE FROM rate_limit_buckets WHERE ctid IN (
            SELECT ctid FROM rate_limit_buckets WHERE expires_at < now() LIMIT ${CLEANUP_BATCH}
          )`;
      }
      const count = Number(rows[0]?.count ?? 1);
      if (count > budget.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
