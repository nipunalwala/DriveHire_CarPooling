import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDiskProvider } from '../src/storage/LocalDiskProvider';
import { AppError } from '../src/errors/AppError';

const directories: string[] = [];
async function provider(): Promise<LocalDiskProvider> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'drivehire-'));
  directories.push(dir);
  return new LocalDiskProvider(dir, 1024);
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe('local storage', () => {
  it('stores a randomized private file after verifying magic bytes', async () => {
    const storage = await provider();
    const buffer = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from('image')
    ]);
    const file = await storage.save({
      buffer,
      originalName: 'avatar.png',
      declaredMime: 'image/png'
    });
    expect(file.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i
    );
    expect(await storage.read(file.key)).toEqual(buffer);
  });
  it('rejects a spoofed MIME and an oversized file', async () => {
    const storage = await provider();
    await expect(
      storage.save({
        buffer: Buffer.from('%PDF-1.4'),
        originalName: 'bad.png',
        declaredMime: 'image/png'
      })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      storage.save({
        buffer: Buffer.alloc(1025),
        originalName: 'big.pdf',
        declaredMime: 'application/pdf'
      })
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
  });
  it('prevents path traversal on file reads', async () => {
    const storage = await provider();
    await expect(storage.read('../secret')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
