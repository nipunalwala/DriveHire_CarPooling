import 'ts-node/register/transpile-only';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { getDb } from '../src/config/db';
import { hashPassword } from '../src/lib/password';
import { login, register, rotateRefresh, verifyEmail } from '../src/services/authService';
const db = getDb();
function otpHash(code: string) {
  return createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(`otp:${code}`).digest('hex');
}
describe('authentication PostgreSQL workflows', () => {
  beforeAll(async () => {
    await db.migrate.latest({ directory: './migrations', extension: 'ts' });
  });
  beforeEach(async () => {
    await db.raw(
      'TRUNCATE auth_login_attempts, password_resets, refresh_tokens, otp_codes, users CASCADE'
    );
  });
  it('registers, rejects wrong OTPs, locks after five attempts, and verifies the correct OTP', async () => {
    const result = await register({
      email: 'passenger@example.test',
      password: 'Strong-passphrase-42',
      fullName: 'Riya Shah',
      role: 'passenger'
    });
    expect(result.verificationRequired).toBe(true);
    const user = await db('users').where({ email: 'passenger@example.test' }).first();
    await db('otp_codes')
      .where({ user_id: user.id })
      .update({ code_hash: otpHash('123456') });
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(verifyEmail(user.email, '000000')).rejects.toMatchObject({
        code: 'INVALID_OTP'
      });
    await expect(verifyEmail(user.email, '123456')).rejects.toMatchObject({ code: 'INVALID_OTP' });
    expect(Number((await db('otp_codes').where({ user_id: user.id }).first()).attempts)).toBe(5);
    await db('otp_codes')
      .where({ user_id: user.id })
      .update({ attempts: 0, consumed_at: null, expires_at: new Date(Date.now() + 600_000) });
    await expect(verifyEmail(user.email, '123456')).resolves.toEqual({ verified: true });
    expect((await db('users').where({ id: user.id }).first()).status).toBe('active');
  });
  it('rotates refresh tokens and revokes the family when a rotated token is reused', async () => {
    const passwordHash = await hashPassword('Strong-passphrase-42');
    const [user] = await db('users')
      .insert({
        email: 'active@example.test',
        password_hash: passwordHash,
        full_name: 'Dev User',
        role: 'passenger',
        status: 'active',
        email_verified_at: db.fn.now()
      })
      .returning('*');
    const session = await login({
      email: user.email,
      password: 'Strong-passphrase-42',
      ip: '127.0.0.1'
    });
    const rotated = await rotateRefresh(session.refreshToken, { ip: '127.0.0.1' });
    await expect(rotateRefresh(session.refreshToken, { ip: '127.0.0.1' })).rejects.toMatchObject({
      code: 'REFRESH_REUSE'
    });
    const rows = await db('refresh_tokens').where({ user_id: user.id });
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
    await expect(rotateRefresh(rotated.refreshToken, { ip: '127.0.0.1' })).rejects.toMatchObject({
      code: 'REFRESH_REUSE'
    });
  });
  it('locks a bad-password account+IP key after five failures and distinguishes suspended accounts', async () => {
    const passwordHash = await hashPassword('Strong-passphrase-42');
    const [user] = await db('users')
      .insert({
        email: 'suspended@example.test',
        password_hash: passwordHash,
        full_name: 'Suspended User',
        role: 'passenger',
        status: 'suspended',
        email_verified_at: db.fn.now()
      })
      .returning('*');
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        login({ email: user.email, password: 'Wrong-password-42!', ip: '127.0.0.1' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      login({ email: user.email, password: 'Wrong-password-42!', ip: '127.0.0.1' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    await db('auth_login_attempts').del();
    await expect(
      login({ email: user.email, password: 'Strong-passphrase-42', ip: '127.0.0.1' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });
  it('does not reveal password-reset account existence', async () => {
    const { forgotPassword } = await import('../src/services/authService');
    await expect(forgotPassword('not-found@example.test')).resolves.toEqual({ accepted: true });
    const user = await db('users')
      .insert({
        email: 'no-reset@example.test',
        password_hash: await hashPassword('Strong-passphrase-42'),
        full_name: 'No Reset',
        role: 'passenger',
        status: 'active'
      })
      .returning('id');
    await expect(forgotPassword('no-reset@example.test')).resolves.toEqual({ accepted: true });
    const reset = await db('password_resets').where({ user_id: user[0]!.id }).first();
    expect(reset).toBeDefined();
  });
});
