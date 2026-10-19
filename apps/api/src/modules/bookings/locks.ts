import { Prisma, type PrismaClient } from '../../generated/client/client.js';

// Canonical resource-lock order: user rows ordered by UUID, then driver
// profiles, then vehicles. Callers discover the full set first, lock it once,
// then re-read and verify. Never take a resource lock after a write.
export interface ResourceLockSet {
  userIds?: string[];
  driverIds?: string[];
  vehicleIds?: string[];
}

type Db = PrismaClient | Prisma.TransactionClient;

async function lockIds(
  tx: Prisma.TransactionClient,
  table: 'users' | 'driver_profiles' | 'vehicles',
  ids: string[] | undefined,
): Promise<void> {
  const unique = [...new Set(ids ?? [])].sort();
  if (unique.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`,
  );
}

export async function withResourceLocks<T>(
  tx: Prisma.TransactionClient,
  locks: ResourceLockSet,
  run: () => Promise<T>,
): Promise<T> {
  await lockIds(tx, 'users', locks.userIds);
  await lockIds(tx, 'driver_profiles', locks.driverIds);
  await lockIds(tx, 'vehicles', locks.vehicleIds);
  return run();
}

/** PostgreSQL SQLSTATE anywhere in the error chain (Prisma wraps raw errors). */
export function sqlStateOf(error: unknown): string | undefined {
  const known = /^(23P01|23502|23503|23505|23514|40P01|40001|42501)$/;
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== 'object') return undefined;
    const candidate = current as {
      code?: unknown;
      meta?: { code?: unknown; message?: unknown };
      message?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.meta?.code === 'string' && known.test(candidate.meta.code)) {
      return candidate.meta.code;
    }
    if (typeof candidate.code === 'string' && known.test(candidate.code)) {
      return candidate.code;
    }
    for (const text of [candidate.meta?.message, candidate.message]) {
      if (typeof text === 'string') {
        const match = /(23P01|23502|23503|23505|23514|40P01|40001|42501)/.exec(text);
        if (match?.[1]) return match[1];
      }
    }
    current = candidate.cause;
  }
  return undefined;
}

export function isRetryableTransactionError(error: unknown): boolean {
  const state = sqlStateOf(error);
  if (state === '40P01' || state === '40001') return true;
  return (error as { code?: unknown }).code === 'P2034';
}

export function isExclusionViolation(error: unknown): boolean {
  return sqlStateOf(error) === '23P01';
}

export async function withBoundedRetry<T>(
  run: () => Promise<T>,
  onExhausted: () => Error,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
      if (attempt < 2) {
        const delay = 10 + Math.floor(Math.random() * 30) * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  void lastError;
  throw onExhausted();
}

export type { Db };
