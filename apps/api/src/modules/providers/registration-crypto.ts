import { createCipheriv, createHash, createDecipheriv, randomBytes } from 'node:crypto';

// Registration/license values are sensitive identifiers. They are stored only
// as an AEAD ciphertext plus a keyed-digest for uniqueness lookups, never in
// plaintext columns or public DTOs.

export function identifierDigest(scope: string, value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${scope}:${normalized}`).digest('hex');
}

export function encryptIdentifier(key: Buffer, aad: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptIdentifier(key: Buffer, aad: string, payload: string): string {
  const raw = Buffer.from(payload, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
