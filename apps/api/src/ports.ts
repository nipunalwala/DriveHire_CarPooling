export type DomainEvent<TName extends string, TPayload extends Readonly<Record<string, unknown>>> = Readonly<{
  id: string;
  eventType: TName;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: Date;
  payload: TPayload;
}>;
export interface MailAdapter {
  send(
    input: Readonly<{ recipient: string; subject: string; text: string; messageId: string }>,
  ): Promise<{ providerMessageId: string }>;
}
export interface ScanAdapter {
  scan(input: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<'CLEAN' | 'REJECTED'>;
}
export interface StorageAdapter {
  putQuarantined(
    input: AsyncIterable<Uint8Array>,
    contentType: string,
  ): Promise<{ objectKey: string; byteSize: number; sha256: string }>;
  scanRead(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  promoteClean(objectKey: string): Promise<void>;
  authorizedRead(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  retire(objectKey: string): Promise<void>;
  removeOrphan(objectKey: string): Promise<void>;
}
// Concrete adapters and typed business-event payloads arrive in their owning phases.
// There is deliberately no successful no-op mail/scan/event handler.
