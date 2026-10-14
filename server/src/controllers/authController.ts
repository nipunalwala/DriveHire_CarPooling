import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { loadEnv } from '../config/env';
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  logoutEverywhere,
  register,
  resendVerification,
  resetPassword,
  rotateRefresh,
  verifyEmail
} from '../services/authService';
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const strongPassword = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'Use a lowercase letter')
  .regex(/[A-Z]/, 'Use an uppercase letter')
  .regex(/[0-9]/, 'Use a number')
  .regex(/[^A-Za-z0-9]/, 'Use a symbol');
const registerSchema = z
  .object({
    email,
    password: strongPassword,
    fullName: z.string().trim().min(2).max(160),
    role: z.enum(['passenger', 'driver', 'owner'])
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Please check the highlighted fields',
      result.error.flatten()
    );
  return result.data;
}
function refreshCookie(value: string): string {
  const env = loadEnv();
  return `drivehire_refresh=${encodeURIComponent(value)}; Path=/api/v1/auth/refresh; HttpOnly; SameSite=Strict; Max-Age=2592000${env.COOKIE_SECURE ? '; Secure' : ''}`;
}
function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .replace(/^=/, '');
}
export const registerHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(registerSchema, req.body);
    const result = await register(input);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
export const verifyOtpHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(z.object({ email, code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
    res.json({ success: true, data: await verifyEmail(input.email, input.code) });
  } catch (error) {
    next(error);
  }
};
export const resendOtpHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(z.object({ email }).strict(), req.body);
    res.json({ success: true, data: await resendVerification(input.email) });
  } catch (error) {
    next(error);
  }
};
export const loginHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(
      z.object({ email, password: z.string().min(1).max(128) }).strict(),
      req.body
    );
    const result = await login({
      ...input,
      ip: req.ip ?? 'unknown',
      userAgent: req.get('user-agent')
    });
    res.setHeader('Set-Cookie', refreshCookie(result.refreshToken));
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.profile } });
  } catch (error) {
    next(error);
  }
};
export const refreshHandler: RequestHandler = async (req, res, next) => {
  try {
    const raw = readCookie(req.headers.cookie, 'drivehire_refresh') ?? '';
    if (!raw) throw new AppError('UNAUTHENTICATED', 401, 'Refresh session is missing');
    const result = await rotateRefresh(raw, {
      ip: req.ip ?? 'unknown',
      userAgent: req.get('user-agent')
    });
    res.setHeader('Set-Cookie', refreshCookie(result.refreshToken));
    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (error) {
    res.setHeader('Set-Cookie', `${refreshCookie('')}; Max-Age=0`);
    next(error);
  }
};
export const logoutHandler: RequestHandler = async (req, res, next) => {
  try {
    const raw = readCookie(req.headers.cookie, 'drivehire_refresh') ?? '';
    await logout(raw || undefined);
    res.setHeader('Set-Cookie', `${refreshCookie('')}; Max-Age=0`);
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    next(error);
  }
};
export const logoutAllHandler: RequestHandler = async (req, res, next) => {
  try {
    await logoutEverywhere(req.user!.sub);
    res.setHeader('Set-Cookie', `${refreshCookie('')}; Max-Age=0`);
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    next(error);
  }
};
export const forgotPasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(z.object({ email }).strict(), req.body);
    await forgotPassword(input.email);
    res.json({ success: true, data: { accepted: true } });
  } catch (error) {
    next(error);
  }
};
export const resetPasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(
      z.object({ token: z.string().min(24).max(256), newPassword: strongPassword }).strict(),
      req.body
    );
    res.json({ success: true, data: await resetPassword(input.token, input.newPassword) });
  } catch (error) {
    next(error);
  }
};
export const changePasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = parse(
      z
        .object({ currentPassword: z.string().min(1).max(128), newPassword: strongPassword })
        .strict(),
      req.body
    );
    res.json({
      success: true,
      data: await changePassword(req.user!.sub, input.currentPassword, input.newPassword)
    });
  } catch (error) {
    next(error);
  }
};
