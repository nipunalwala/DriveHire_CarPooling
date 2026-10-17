// Private-evidence validation: magic-byte allowlist (JPEG/PNG/WebP/PDF),
// image metadata stripping and canonical content types. Everything runs on an
// in-memory buffer bounded by the 5 MiB upload limit; no external IO.

export type EvidenceType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const ALLOWED_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export class EvidenceTypeError extends Error {
  constructor(message = 'Unsupported file type') {
    super(message);
    this.name = 'EvidenceTypeError';
  }
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}
function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}
function isPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-';
}

/** Detect the real type from file magic; `null` means not on the allowlist. */
export function detectEvidenceType(bytes: Buffer): EvidenceType | null {
  if (isJpeg(bytes)) return 'image/jpeg';
  if (isPng(bytes)) return 'image/png';
  if (isWebp(bytes)) return 'image/webp';
  if (isPdf(bytes)) return 'application/pdf';
  return null;
}

function normalizeDeclared(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Keep the PNG signature and only drop known metadata chunks. */
function stripPngMetadata(bytes: Buffer): Buffer {
  const signature = bytes.subarray(0, 8);
  const output: Buffer[] = [signature];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length || length > bytes.length) break;
    if (!PNG_METADATA_CHUNKS.has(type)) output.push(bytes.subarray(offset, end));
    if (type === 'IEND') break;
    offset = end;
  }
  return Buffer.concat(output);
}

/** Drop JPEG APPn/COM marker segments up to the entropy-coded scan. */
function stripJpegMetadata(bytes: Buffer): Buffer {
  const output: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] as number;
    if (marker === 0xda) {
      // Start of scan: copy the remainder verbatim (entropy data + EOI).
      output.push(bytes.subarray(offset));
      offset = bytes.length;
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      output.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) break;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (!isApp && marker !== 0xfe) output.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (offset < bytes.length) output.push(bytes.subarray(offset));
  return Buffer.concat(output);
}

/** Drop WebP EXIF/XMP chunks and recompute the RIFF size. */
function stripWebpMetadata(bytes: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const padded = length + (length % 2);
    const end = offset + 8 + padded;
    if (end > bytes.length) break;
    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

export interface SanitizedEvidence {
  bytes: Buffer;
  contentType: EvidenceType;
}

/**
 * Validate declared vs. real magic type and return metadata-stripped bytes.
 * Throws `EvidenceTypeError` (mapped to 415) on any mismatch or disallowed type.
 */
export function sanitizeEvidence(declaredContentType: string, bytes: Buffer): SanitizedEvidence {
  const detected = detectEvidenceType(bytes);
  if (!detected) throw new EvidenceTypeError();
  const declared = normalizeDeclared(declaredContentType);
  if (declared && declared !== detected)
    throw new EvidenceTypeError('File content does not match its declared type');
  if (detected === 'image/png') return { bytes: stripPngMetadata(bytes), contentType: detected };
  if (detected === 'image/jpeg') return { bytes: stripJpegMetadata(bytes), contentType: detected };
  if (detected === 'image/webp') return { bytes: stripWebpMetadata(bytes), contentType: detected };
  return { bytes, contentType: detected };
}
