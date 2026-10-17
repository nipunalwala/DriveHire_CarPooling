import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';

const origin = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  APP_ORIGIN: origin,
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_TLS: z.enum(['none', 'starttls', 'implicit']).default('none'),
  MAIL_FROM: z.email().default('no-reply@drivehire.local'),
  SCAN_HOST: z.string().min(1).default('127.0.0.1'),
  SCAN_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  STORAGE_PRIVATE_ROOT: z.string().min(1).default('../../private-storage'),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  AUTH_JWT_SECRET: z.string().optional(),
  AUTH_OUTBOX_KEY: z.string().optional(),
});

export function parseEnv(input: Record<string, string | undefined>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment keys: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const env = parsed.data;
  const corsOrigins = (env.CORS_ORIGINS ?? env.APP_ORIGIN).split(',').map((value) => value.trim());
  if (
    corsOrigins.length === 0 ||
    corsOrigins.some((value) => !origin.safeParse(value).success) ||
    !corsOrigins.includes(env.APP_ORIGIN)
  ) {
    throw new Error('Invalid environment keys: CORS_ORIGINS');
  }
  const secure = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  if (
    secure &&
    (corsOrigins.some((value) => !value.startsWith('https://')) ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      env.SMTP_TLS === 'none' ||
      env.SMTP_HOST === '127.0.0.1' ||
      env.MAIL_FROM.endsWith('.local') ||
      !input.STORAGE_PRIVATE_ROOT ||
      !input.SCAN_HOST)
  ) {
    throw new Error(
      'Staging/production require HTTPS origins and explicit mail, storage and scanner configuration',
    );
  }
  if (
    secure &&
    (!env.AUTH_JWT_SECRET ||
      env.AUTH_JWT_SECRET.length < 32 ||
      env.AUTH_JWT_SECRET.startsWith('replace-locally'))
  ) {
    throw new Error('Invalid environment keys: AUTH_JWT_SECRET');
  }
  if (
    secure &&
    (!env.AUTH_OUTBOX_KEY ||
      env.AUTH_OUTBOX_KEY.length < 32 ||
      env.AUTH_OUTBOX_KEY.startsWith('replace-locally'))
  ) {
    throw new Error('Invalid environment keys: AUTH_OUTBOX_KEY');
  }
  // Development/test fall back to an ephemeral in-process secret; secure
  // environments above reject anything but an explicit durable secret.
  const authJwtSecret: string = env.AUTH_JWT_SECRET ?? randomBytes(32).toString('base64url');
  const authOutboxKey: Buffer = outboxKey(env.AUTH_OUTBOX_KEY);
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    appOrigin: env.APP_ORIGIN,
    corsOrigins,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    logLevel: env.LOG_LEVEL,
    secure,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      tls: env.SMTP_TLS,
      from: env.MAIL_FROM,
    },
    scan: { host: env.SCAN_HOST, port: env.SCAN_PORT },
    storagePrivateRoot: resolve(env.STORAGE_PRIVATE_ROOT),
    workerPollMs: env.WORKER_POLL_MS,
    authJwtSecret,
    authOutboxKey,
  });
}
export type Config = ReturnType<typeof parseEnv>;

/**
 * Derive the 32-byte AEAD key for the authentication outbox. A 32-byte
 * base64url/hex secret is decoded directly; any other explicit value is
 * domain-separated with SHA-256; an absent value yields a process-local random
 * key (development/test only, never shared across processes).
 */
function outboxKey(raw: string | undefined): Buffer {
  if (!raw) return randomBytes(32);
  for (const encoding of ['base64url', 'hex'] as const) {
    const decoded = Buffer.from(raw, encoding);
    if (decoded.length === 32) return decoded;
  }
  return createHash('sha256').update(`drivehire-outbox:${raw}`).digest();
}
