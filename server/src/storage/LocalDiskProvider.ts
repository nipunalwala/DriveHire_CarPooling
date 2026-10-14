import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from '../config/env';
import { AppError } from '../errors/AppError';
import { sniffMime } from './fileSniff';
import type { StorageProvider, StoredFile } from './StorageProvider';

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};
export class LocalDiskProvider implements StorageProvider {
  private readonly root: string;
  constructor(
    root = loadEnv().UPLOAD_DIR,
    private readonly maxBytes = loadEnv().MAX_UPLOAD_MB * 1024 * 1024
  ) {
    this.root = path.resolve(root);
  }
  async save({
    buffer,
    declaredMime
  }: {
    buffer: Buffer;
    originalName: string;
    declaredMime: string;
  }): Promise<StoredFile> {
    if (!buffer.length || buffer.length > this.maxBytes)
      throw new AppError('UPLOAD_TOO_LARGE', 413, 'File exceeds the upload size limit');
    const mime = sniffMime(buffer);
    if (!mime || !extensions[mime] || mime !== declaredMime)
      throw new AppError('INVALID_FILE_TYPE', 400, 'File type is not allowed');
    const key = `${randomUUID()}${extensions[mime]}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, key), buffer, { flag: 'wx', mode: 0o600 });
    return { key, mime, sizeBytes: buffer.length };
  }
  async read(key: string): Promise<Buffer> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i.test(
        key
      )
    )
      throw new AppError('NOT_FOUND', 404, 'File not found');
    try {
      return await readFile(path.join(this.root, key));
    } catch {
      throw new AppError('NOT_FOUND', 404, 'File not found');
    }
  }
  async remove(key: string): Promise<void> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i.test(
        key
      )
    )
      throw new AppError('NOT_FOUND', 404, 'File not found');
    await rm(path.join(this.root, key), { force: true });
  }
}
