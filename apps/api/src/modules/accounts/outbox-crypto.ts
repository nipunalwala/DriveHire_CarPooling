import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Authenticated encryption for the single sensitive value carried by an
// authentication outbox job (the recipient plus the raw OTP/reset secret). The
// safe `payload` column keeps only typed IDs; the secret never travels in the
// payload, logs or database plaintext.
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface AuthEmailSecret {
  recipient: string;
  secret: string;
}

/** Additional authenticated data binds ciphertext to its event identity. */
export function authEmailAad(eventType: string, aggregateId: string): string {
  return `${eventType}:${aggregateId}`;
}

export function encryptOutboxSecret(key: Buffer, aad: string, value: AuthEmailSecret): string {
  if (key.length !== 32) throw new Error('Outbox encryption key must be 32 bytes');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function decryptOutboxSecret(key: Buffer, aad: string, encoded: string): AuthEmailSecret {
  if (key.length !== 32) throw new Error('Outbox encryption key must be 32 bytes');
  const raw = Buffer.from(encoded, 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Outbox ciphertext is too short');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(plaintext) as AuthEmailSecret;
  if (typeof parsed.recipient !== 'string' || typeof parsed.secret !== 'string') {
    throw new Error('Outbox secret payload is malformed');
  }
  return parsed;
}
