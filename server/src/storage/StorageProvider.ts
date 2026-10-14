export type StoredFile = { key: string; mime: string; sizeBytes: number };
export interface StorageProvider {
  save(input: { buffer: Buffer; originalName: string; declaredMime: string }): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
