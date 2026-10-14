import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../config/env';
export type AccessClaims = {
  sub: string;
  role: 'passenger' | 'driver' | 'owner' | 'admin';
  status: 'pending' | 'active' | 'suspended';
  exp: number;
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function signature(value: string): string {
  return createHmac('sha256', loadEnv().JWT_ACCESS_SECRET).update(value).digest('base64url');
}
export function createAccessToken(claims: Omit<AccessClaims, 'exp'>, now = Date.now()): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ ...claims, exp: Math.floor(now / 1000) + 900 });
  const message = `${header}.${payload}`;
  return `${message}.${signature(message)}`;
}
export function readAccessToken(token: string, now = Date.now()): AccessClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return undefined;
  const message = `${parts[0]}.${parts[1]}`;
  const actual = Buffer.from(parts[2]);
  const expected = Buffer.from(signature(message));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as AccessClaims;
    return claims.exp > Math.floor(now / 1000) ? claims : undefined;
  } catch {
    return undefined;
  }
}
