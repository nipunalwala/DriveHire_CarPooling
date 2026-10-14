import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://drivehire:drivehire@localhost:5432/drivehire_dev'),
  TEST_DATABASE_URL: z
    .string()
    .default('postgres://drivehire:drivehire@localhost:5432/drivehire_test'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-only-secret-change-this-to-32-characters'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(5).default(5),
  MAIL_MODE: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('DriveHire <no-reply@example.com>'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_FULL_NAME: z.string().min(2).default('DriveHire Administrator')
});
export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`
    );
  if (
    parsed.data.NODE_ENV === 'production' &&
    (!process.env.DATABASE_URL ||
      !parsed.data.COOKIE_SECURE ||
      parsed.data.JWT_ACCESS_SECRET.startsWith('dev-only') ||
      !parsed.data.CORS_ORIGINS.trim())
  ) {
    throw new Error(
      'Production requires DATABASE_URL, COOKIE_SECURE=true, a non-development JWT_ACCESS_SECRET, and CORS_ORIGINS'
    );
  }
  cached = parsed.data;
  return cached;
}
export function resetEnvForTests(): void {
  cached = undefined;
}
