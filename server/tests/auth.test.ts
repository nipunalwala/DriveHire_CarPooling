import { describe, expect, it } from 'vitest';
import { createAccessToken, readAccessToken } from '../src/lib/accessToken';
import { hashPassword, verifyPassword } from '../src/lib/password';
describe('authentication primitives', () => {
  it('hashes passwords with a salted memory-hard digest and verifies them', async () => {
    const hash = await hashPassword('Strong-passphrase-42');
    expect(hash).toMatch(/^scrypt\$32768\$/);
    expect(await verifyPassword('Strong-passphrase-42', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
  it('signs short-lived access tokens and rejects altered or expired tokens', () => {
    const claims = {
      sub: '1bb6f608-8b27-45c3-99b5-49c9939bb105',
      role: 'passenger' as const,
      status: 'active' as const
    };
    const token = createAccessToken(claims, 1_700_000_000_000);
    expect(readAccessToken(token, 1_700_000_001_000)?.sub).toBe(claims.sub);
    expect(readAccessToken(`${token.slice(0, -1)}x`, 1_700_000_001_000)).toBeUndefined();
    expect(readAccessToken(token, 1_700_001_000_000)).toBeUndefined();
  });
});
