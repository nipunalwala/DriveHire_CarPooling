import { z } from 'zod';

export const HealthResponseSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({ status: z.enum(['ok', 'unavailable']) }),
});

export const ApiErrorSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
    requestId: z.string().min(1).max(80),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;
export type ApiSuccess<T> = { success: true; data: T };
export type PageMeta = { page: number; pageSize: number; total: number };

export const UserRoleSchema = z.enum(['PASSENGER', 'DRIVER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export * from './auth.js';
export * from './cities.js';
export * from './providers.js';
export * from './bookings.js';
export * from './carpools.js';
