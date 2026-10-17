import { z } from 'zod';

// Account/auth contracts. Every schema is hand-mapped to the active OpenAPI
// (docs/api/openapi.json): RegisterInput, LoginInput, OtpInput, EmailInput,
// ResetInput, ProfileInput, User, Session, TokenResult, Ack, PageMeta.

export const RegisterInputSchema = z.strictObject({
  displayName: z.string().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});
export const LoginInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export const OtpInputSchema = z.strictObject({
  email: z.email().max(254),
  code: z
    .string()
    .min(6)
    .max(6)
    .regex(/^[0-9]{6}$/),
});
export const EmailInputSchema = z.strictObject({
  email: z.email().max(254),
});
export const ResetInputSchema = z.strictObject({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(128),
});
export const ProfileInputSchema = z
  .strictObject({
    displayName: z.string().min(1).max(80).optional(),
    phone: z
      .string()
      .min(1)
      .max(16)
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .optional(),
  })
  .refine((value) => Object.keys(value).length >= 1, {
    message: 'At least one profile field is required',
  });
// Active OpenAPI RoleInput allows only the self-grantable DRIVER value; ADMIN is
// operator-granted and ownership is an object relationship, not a role.
export const RoleInputSchema = z.strictObject({ role: z.literal('DRIVER') });

export const UserSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().min(1).max(80),
  email: z.string().min(1).max(254),
  emailVerified: z.boolean(),
  phone: z
    .string()
    .min(1)
    .max(16)
    .regex(/^\+[1-9][0-9]{7,14}$/)
    .optional(),
  roles: z.array(z.enum(['PASSENGER', 'DRIVER', 'ADMIN'])).max(4),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  createdAt: z.iso.datetime(),
});
export const SessionSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  current: z.boolean(),
});
export const TokenResultSchema = z.strictObject({
  accessToken: z.string().min(1).max(4096),
  expiresIn: z.literal(900),
  user: UserSchema,
});
export const AckSchema = z.strictObject({ acknowledged: z.boolean() });
export const PageMetaSchema = z.strictObject({
  page: z.number().int().min(1).max(2147483647),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0).max(2147483647),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type OtpInput = z.infer<typeof OtpInputSchema>;
export type EmailInput = z.infer<typeof EmailInputSchema>;
export type ResetInput = z.infer<typeof ResetInputSchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export type RoleInput = z.infer<typeof RoleInputSchema>;
export type UserDto = z.infer<typeof UserSchema>;
export type SessionDto = z.infer<typeof SessionSchema>;
export type TokenResultDto = z.infer<typeof TokenResultSchema>;
export type AckDto = z.infer<typeof AckSchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
/** List-envelope shape for every paginated collection response. */
export type Page<T> = { success: true; data: T[]; meta: PageMeta };
