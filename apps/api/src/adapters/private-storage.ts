import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '../ports.js';

/** Maximum accepted private-evidence size (5 MiB); mirrored by a DB CHECK. */
export const MAX_PRIVATE_EVIDENCE_BYTES = 5 * 1024 * 1024;

/**
 * Local private-disk storage adapter. Files live outside any static/public root
 * and are addressed only by an opaque random key. New uploads land in
 * `quarantine/` and become readable only after `promoteClean` moves them to
 * `clean/`; the public/content endpoint never serves quarantine.
 */
export function createPrivateStorage({ root }: { root: string }): StorageAdapter & {
  cleanPath(objectKey: string): string;
  quarantinePath(objectKey: string): string;
} {
  const base = resolve(root);
  const quarantineDir = join(base, 'quarantine');
  const cleanDir = join(base, 'clean');
  let ensured: Promise<void> | undefined;

  async function ensureDirs(): Promise<void> {
    ensured ??= (async () => {
      await mkdir(quarantineDir, { recursive: true });
      await mkdir(cleanDir, { recursive: true });
    })();
    return ensured;
  }

  function keyPath(section: 'quarantine' | 'clean', objectKey: string): string {
    if (!/^[a-f0-9]{16,128}$/.test(objectKey)) {
      throw new Error('Invalid private storage key');
    }
    return join(section === 'clean' ? cleanDir : quarantineDir, objectKey);
  }

  async function collect(
    input: AsyncIterable<Uint8Array>,
    maxBytes = MAX_PRIVATE_EVIDENCE_BYTES,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return {
    cleanPath(objectKey) {
      return keyPath('clean', objectKey);
    },
    quarantinePath(objectKey) {
      return keyPath('quarantine', objectKey);
    },
    async putQuarantined(input, _contentType) {
      await ensureDirs();
      const bytes = await collect(input);
      if (bytes.byteLength === 0) throw new Error('EMPTY_UPLOAD');
      const objectKey = randomBytes(24).toString('hex');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await writeFile(keyPath('quarantine', objectKey), bytes, { flag: 'wx' });
      return { objectKey, byteSize: bytes.byteLength, sha256 };
    },
    async scanRead(objectKey) {
      await ensureDirs();
      return createReadStream(keyPath('quarantine', objectKey));
    },
    async promoteClean(objectKey) {
      await ensureDirs();
      await rename(keyPath('quarantine', objectKey), keyPath('clean', objectKey));
    },
    async authorizedRead(objectKey) {
      await ensureDirs();
      // Only promoted (CLEAN) objects are readable; quarantine throws ENOENT.
      return createReadStream(keyPath('clean', objectKey));
    },
    async retire(objectKey) {
      await ensureDirs();
      await Promise.all([
        unlink(keyPath('clean', objectKey)).catch(() => {}),
        unlink(keyPath('quarantine', objectKey)).catch(() => {}),
      ]);
    },
    async removeOrphan(objectKey) {
      await ensureDirs();
      await unlink(keyPath('quarantine', objectKey)).catch(() => {});
    },
  };
}

/** Read an async iterable/stream fully into a Buffer (bounded by callers). */
export async function readAll(input: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Convert a Buffer to an async iterable accepted by StorageAdapter/ScanAdapter. */
export function toAsyncIterable(bytes: Buffer): AsyncIterable<Uint8Array> {
  return Readable.from(bytes) as unknown as AsyncIterable<Uint8Array>;
}
