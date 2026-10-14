import type { Knex } from 'knex';
import { getDb } from '../config/db';
export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'passenger' | 'driver' | 'owner' | 'admin';
  status: 'pending' | 'active' | 'suspended';
  email_verified_at: Date | null;
  created_at: Date;
};
export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  return getDb()<UserRecord>('users').where({ email }).whereNull('deleted_at').first();
}
export async function findUserById(id: string): Promise<UserRecord | undefined> {
  return getDb()<UserRecord>('users').where({ id }).whereNull('deleted_at').first();
}
export async function registerUser(
  input: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: 'passenger' | 'driver' | 'owner';
  },
  codeHash: string,
  expiresAt: Date
): Promise<UserRecord> {
  return getDb().transaction(async (tx) => {
    const [user] = await tx<UserRecord>('users')
      .insert({
        email: input.email.toLowerCase(),
        password_hash: input.passwordHash,
        full_name: input.fullName,
        role: input.role,
        status: 'pending'
      })
      .returning('*');
    await tx('otp_codes').insert({
      user_id: user!.id,
      purpose: 'verify_email',
      code_hash: codeHash,
      expires_at: expiresAt
    });
    return user!;
  });
}
export async function latestOtp(
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  tx?: Knex.Transaction
) {
  return (tx ?? getDb())('otp_codes')
    .where({ user_id: userId, purpose })
    .whereNull('consumed_at')
    .orderBy('created_at', 'desc')
    .forUpdate()
    .first();
}
export async function setOtpAttempts(
  id: string,
  attempts: number,
  consumedAt?: Date,
  tx?: Knex.Transaction
) {
  const update: { attempts: number; consumed_at?: Date } = { attempts };
  if (consumedAt) update.consumed_at = consumedAt;
  await (tx ?? getDb())('otp_codes').where({ id }).update(update);
}
export async function makeOtp(
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  codeHash: string,
  expiresAt: Date
) {
  await getDb()('otp_codes').insert({
    user_id: userId,
    purpose,
    code_hash: codeHash,
    expires_at: expiresAt
  });
}
export async function verifyUser(userId: string, tx?: Knex.Transaction): Promise<void> {
  const db = tx ?? getDb();
  await db('users')
    .where({ id: userId })
    .update({ status: 'active', email_verified_at: db.fn.now() });
}
export async function getLoginLock(keyHash: string) {
  return getDb()('auth_login_attempts').where({ key_hash: keyHash }).first();
}
export async function recordLoginFailure(keyHash: string, now: Date) {
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  const lockUntil = new Date(now.getTime() + 15 * 60_000);
  await getDb().raw(
    `INSERT INTO auth_login_attempts (key_hash, failures, window_started_at, locked_until) VALUES (?, 1, ?, NULL) ON CONFLICT (key_hash) DO UPDATE SET failures = CASE WHEN auth_login_attempts.window_started_at <= ? THEN 1 ELSE auth_login_attempts.failures + 1 END, window_started_at = CASE WHEN auth_login_attempts.window_started_at <= ? THEN EXCLUDED.window_started_at ELSE auth_login_attempts.window_started_at END, locked_until = CASE WHEN (CASE WHEN auth_login_attempts.window_started_at <= ? THEN 1 ELSE auth_login_attempts.failures + 1 END) >= 5 THEN ?::timestamptz ELSE NULL END`,
    [keyHash, now, cutoff, cutoff, cutoff, lockUntil]
  );
}
export async function clearLoginFailures(keyHash: string) {
  await getDb()('auth_login_attempts').where({ key_hash: keyHash }).del();
}
export async function createRefresh(
  input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
    rotatedFromId?: string;
  },
  tx?: Knex.Transaction
) {
  const [row] = await (tx ?? getDb())('refresh_tokens')
    .insert({
      user_id: input.userId,
      family_id: input.familyId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      user_agent: input.userAgent,
      ip: input.ip,
      rotated_from_id: input.rotatedFromId
    })
    .returning(['id', 'family_id']);
  return row as { id: string; family_id: string };
}
export async function refreshByHash(hash: string, tx?: Knex.Transaction) {
  return (tx ?? getDb())('refresh_tokens').where({ token_hash: hash }).forUpdate().first();
}
export async function revokeRefresh(id: string, tx?: Knex.Transaction) {
  await (tx ?? getDb())('refresh_tokens')
    .where({ id })
    .update({ revoked_at: (tx ?? getDb()).fn.now() });
}
export async function revokeRefreshFamily(familyId: string, tx?: Knex.Transaction) {
  await (tx ?? getDb())('refresh_tokens')
    .where({ family_id: familyId })
    .whereNull('revoked_at')
    .update({ revoked_at: (tx ?? getDb()).fn.now() });
}
export async function revokeAllRefresh(userId: string) {
  await getDb()('refresh_tokens')
    .where({ user_id: userId })
    .whereNull('revoked_at')
    .update({ revoked_at: getDb().fn.now() });
}
export async function updatePassword(userId: string, passwordHash: string) {
  await getDb().transaction(async (tx) => {
    await tx('users').where({ id: userId }).update({ password_hash: passwordHash });
    await tx('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ revoked_at: tx.fn.now() });
  });
}
export async function profileById(id: string) {
  const user = await getDb()('users')
    .select(
      'id',
      'email',
      'phone',
      'full_name',
      'role',
      'status',
      'email_verified_at',
      'avatar_key',
      'created_at'
    )
    .where({ id })
    .whereNull('deleted_at')
    .first();
  if (!user) return undefined;
  const { avatar_key, ...safe } = user;
  return { ...safe, avatarUrl: avatar_key ? '/api/v1/users/me/avatar' : null };
}
export async function updateProfile(
  id: string,
  input: { fullName?: string; phone?: string | null }
) {
  const values: { full_name?: string; phone?: string | null } = {};
  if (input.fullName !== undefined) values.full_name = input.fullName;
  if (input.phone !== undefined) values.phone = input.phone;
  await getDb()('users').where({ id }).update(values);
  return profileById(id);
}
export async function latestOtpCreatedAt(
  userId: string,
  purpose: 'verify_email' | 'reset_password'
) {
  return getDb()('otp_codes')
    .where({ user_id: userId, purpose })
    .orderBy('created_at', 'desc')
    .first('created_at');
}
export async function createPasswordReset(userId: string, tokenHash: string, expiresAt: Date) {
  await getDb()('password_resets').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt
  });
}
export async function passwordResetByHash(tokenHash: string, tx?: Knex.Transaction) {
  return (tx ?? getDb())('password_resets')
    .where({ token_hash: tokenHash })
    .whereNull('consumed_at')
    .forUpdate()
    .first();
}
export async function consumePasswordReset(id: string, tx?: Knex.Transaction) {
  await (tx ?? getDb())('password_resets')
    .where({ id })
    .update({ consumed_at: (tx ?? getDb()).fn.now() });
}
export async function setAvatarKey(id: string, key: string | null) {
  await getDb()('users').where({ id }).update({ avatar_key: key });
}
export async function avatarKey(id: string): Promise<string | undefined> {
  const row = await getDb()('users').where({ id }).whereNull('deleted_at').first('avatar_key');
  return row?.avatar_key ?? undefined;
}
export async function verifyOtpAndActivate(
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  isMatch: (hash: string) => boolean,
  now: Date
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const otp = await latestOtp(userId, purpose, tx);
    if (!otp || new Date(otp.expires_at).getTime() < now.getTime() || Number(otp.attempts) >= 5)
      return false;
    if (!isMatch(otp.code_hash)) {
      const attempts = Number(otp.attempts) + 1;
      await setOtpAttempts(otp.id, attempts, attempts >= 5 ? now : undefined, tx);
      return false;
    }
    await setOtpAttempts(otp.id, Number(otp.attempts), now, tx);
    if (purpose === 'verify_email') await verifyUser(userId, tx);
    return true;
  });
}
export async function rotateRefreshTransaction(input: {
  tokenHash: string;
  nextTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip: string;
}): Promise<{ error: 'UNAUTHENTICATED' | 'REFRESH_REUSE' } | { user: UserRecord }> {
  return getDb().transaction(async (tx) => {
    const old = await refreshByHash(input.tokenHash, tx);
    if (!old) return { error: 'UNAUTHENTICATED' };
    if (old.revoked_at) {
      await revokeRefreshFamily(old.family_id, tx);
      return { error: 'REFRESH_REUSE' };
    }
    if (new Date(old.expires_at).getTime() <= Date.now()) {
      await revokeRefresh(old.id, tx);
      return { error: 'UNAUTHENTICATED' };
    }
    const user = await tx<UserRecord>('users')
      .where({ id: old.user_id })
      .whereNull('deleted_at')
      .first();
    if (!user || user.status !== 'active') return { error: 'UNAUTHENTICATED' };
    await revokeRefresh(old.id, tx);
    await createRefresh(
      {
        userId: user.id,
        familyId: old.family_id,
        tokenHash: input.nextTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ip: input.ip,
        rotatedFromId: old.id
      },
      tx
    );
    return { user };
  });
}
export async function consumeResetAndUpdatePassword(
  tokenHash: string,
  passwordHash: string,
  now: Date
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const reset = await passwordResetByHash(tokenHash, tx);
    if (!reset || new Date(reset.expires_at).getTime() < now.getTime()) return false;
    await consumePasswordReset(reset.id, tx);
    await tx('users').where({ id: reset.user_id }).update({ password_hash: passwordHash });
    await tx('refresh_tokens')
      .where({ user_id: reset.user_id })
      .whereNull('revoked_at')
      .update({ revoked_at: tx.fn.now() });
    return true;
  });
}
