import {
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import { loadEnv } from '../config/env';
import { AppError } from '../errors/AppError';
import { createAccessToken } from '../lib/accessToken';
import { hashPassword, verifyPassword } from '../lib/password';
import { SmtpMailer } from '../mail/mailer';
import { domainEvents } from '../events/eventBus';
import {
  avatarKey,
  clearLoginFailures,
  consumeResetAndUpdatePassword,
  createPasswordReset,
  createRefresh,
  findUserByEmail,
  findUserById,
  getLoginLock,
  latestOtpCreatedAt,
  makeOtp,
  profileById,
  recordLoginFailure,
  refreshByHash,
  registerUser,
  revokeAllRefresh,
  revokeRefresh,
  rotateRefreshTransaction,
  setAvatarKey,
  updatePassword,
  updateProfile,
  verifyOtpAndActivate
} from '../repositories/authRepository';
import { LocalDiskProvider } from '../storage/LocalDiskProvider';
type PublicRole = 'passenger' | 'driver' | 'owner';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function otpDigest(code: string): string {
  return createHmac('sha256', loadEnv().JWT_ACCESS_SECRET).update(`otp:${code}`).digest('hex');
}
function safeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
const mailer = new SmtpMailer();
async function sendOtp(
  user: { email: string; full_name: string },
  code: string,
  subject: string
): Promise<void> {
  await mailer.send({
    to: user.email,
    subject,
    text: `Hello ${user.full_name}, your DriveHire verification code is ${code}. It expires in 10 minutes.`
  });
}
export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  role: PublicRole;
}) {
  if (await findUserByEmail(input.email))
    throw new AppError('EMAIL_IN_USE', 409, 'An account with this email already exists');
  const passwordHash = await hashPassword(input.password);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const user = await registerUser(
    { email: input.email, passwordHash, fullName: input.fullName, role: input.role },
    otpDigest(code),
    new Date(Date.now() + 10 * 60_000)
  );
  await sendOtp(user, code, 'Verify your DriveHire email');
  await domainEvents.emit({
    name: 'user.registered',
    occurredAt: new Date().toISOString(),
    aggregateId: user.id,
    payload: { role: user.role }
  });
  return { user: await profileById(user.id), verificationRequired: true };
}
export async function verifyEmail(email: string, code: string) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'pending')
    throw new AppError('INVALID_OTP', 400, 'That code is invalid or has expired');
  const verified = await verifyOtpAndActivate(
    user.id,
    'verify_email',
    (hash) => safeEqualHex(hash, otpDigest(code)),
    new Date()
  );
  if (!verified) throw new AppError('INVALID_OTP', 400, 'That code is invalid or has expired');
  await domainEvents.emit({
    name: 'user.verified',
    occurredAt: new Date().toISOString(),
    aggregateId: user.id,
    payload: {}
  });
  return { verified: true };
}
export async function resendVerification(email: string) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'pending') return { accepted: true };
  const prior = await latestOtpCreatedAt(user.id, 'verify_email');
  if (prior && Date.now() - new Date(prior.created_at).getTime() < 60_000)
    return { accepted: true };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await makeOtp(user.id, 'verify_email', otpDigest(code), new Date(Date.now() + 10 * 60_000));
  await sendOtp(user, code, 'Your DriveHire verification code');
  return { accepted: true };
}
function access(user: {
  id: string;
  role: 'passenger' | 'driver' | 'owner' | 'admin';
  status: 'pending' | 'active' | 'suspended';
}) {
  return createAccessToken({ sub: user.id, role: user.role, status: user.status });
}
export async function login(input: {
  email: string;
  password: string;
  ip: string;
  userAgent?: string;
}) {
  const key = digest(`${input.email.trim().toLowerCase()}|${input.ip}`);
  const lock = await getLoginLock(key);
  if (lock?.locked_until && new Date(lock.locked_until).getTime() > Date.now())
    throw new AppError(
      'ACCOUNT_LOCKED',
      423,
      'Too many sign-in attempts. Try again in 15 minutes.'
    );
  const user = await findUserByEmail(input.email);
  const matches = user ? await verifyPassword(input.password, user.password_hash) : false;
  if (!user || !matches) {
    await recordLoginFailure(key, new Date());
    throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
  }
  await clearLoginFailures(key);
  if (user.status === 'suspended')
    throw new AppError('ACCOUNT_SUSPENDED', 403, 'This account is suspended');
  if (user.status !== 'active')
    throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Verify your email before signing in');
  const raw = randomBytes(32).toString('base64url');
  const created = await createRefresh({
    userId: user.id,
    familyId: randomUUID(),
    tokenHash: digest(raw),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    userAgent: input.userAgent,
    ip: input.ip
  });
  return {
    accessToken: access(user),
    refreshToken: raw,
    profile: await profileById(user.id),
    refreshId: created.id
  };
}
export async function rotateRefresh(raw: string, metadata: { ip: string; userAgent?: string }) {
  const next = randomBytes(32).toString('base64url');
  const outcome = await rotateRefreshTransaction({
    tokenHash: digest(raw),
    nextTokenHash: digest(next),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    userAgent: metadata.userAgent,
    ip: metadata.ip
  });
  if ('error' in outcome)
    throw new AppError(
      outcome.error,
      401,
      outcome.error === 'REFRESH_REUSE'
        ? 'Refresh session has expired'
        : 'Refresh session is invalid'
    );
  return { accessToken: access(outcome.user), refreshToken: next };
}
export async function logout(raw?: string) {
  if (!raw) return;
  if (raw) {
    const token = await refreshByHash(digest(raw));
    if (token) await revokeRefresh(token.id);
  }
}
export async function logoutEverywhere(userId: string) {
  await revokeAllRefresh(userId);
}
export async function forgotPassword(email: string) {
  const user = await findUserByEmail(email);
  if (user && user.status === 'active') {
    const token = randomBytes(32).toString('base64url');
    await createPasswordReset(user.id, digest(token), new Date(Date.now() + 30 * 60_000));
    try {
      await mailer.send({
        to: user.email,
        subject: 'Reset your DriveHire password',
        text: `Use this one-time reset code: ${token}`
      });
    } catch {
      /* Keep response identical when the mail provider is unavailable. */
    }
  }
  return { accepted: true };
}
export async function resetPassword(token: string, newPassword: string) {
  const updated = await consumeResetAndUpdatePassword(
    digest(token),
    await hashPassword(newPassword),
    new Date()
  );
  if (!updated)
    throw new AppError('INVALID_RESET_TOKEN', 400, 'The password reset link is invalid or expired');
  return { reset: true };
}
export async function currentProfile(userId: string) {
  const user = await profileById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'Account not found');
  return user;
}
export async function editProfile(
  userId: string,
  input: { fullName?: string; phone?: string | null }
) {
  return updateProfile(userId, input);
}
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user || !(await verifyPassword(currentPassword, user.password_hash)))
    throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect');
  await updatePassword(userId, await hashPassword(newPassword));
  return { changed: true };
}
const storage = new LocalDiskProvider();
export async function saveAvatar(
  userId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string }
) {
  const previous = await avatarKey(userId);
  const stored = await storage.save({
    buffer: file.buffer,
    originalName: file.originalname,
    declaredMime: file.mimetype
  });
  await setAvatarKey(userId, stored.key);
  if (previous) await storage.remove(previous);
  return { avatarUrl: '/api/v1/users/me/avatar' };
}
export async function readAvatar(userId: string) {
  const key = await avatarKey(userId);
  if (!key) throw new AppError('NOT_FOUND', 404, 'Profile image not found');
  const buffer = await storage.read(key);
  return {
    buffer,
    mime: key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  };
}
