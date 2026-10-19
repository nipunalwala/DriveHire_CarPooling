// Private-evidence validation: magic-byte allowlist (JPEG/PNG/WebP/PDF),
// bounded image decode/re-encode through libvips (sharp) and canonical content
// types. Everything runs on an in-memory buffer already bounded by the 5 MiB
// upload limit; no external IO.

import sharp from 'sharp';

export type EvidenceType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
type ImageEvidenceType = Exclude<EvidenceType, 'application/pdf'>;

export const ALLOWED_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/**
 * Bounded decode budget: an image whose declared geometry exceeds this many
 * pixels is refused before libvips allocates a full raster, defeating
 * decompression bombs while still accepting normal phone/document photos.
 */
export const MAX_PRIVATE_IMAGE_PIXELS = 30_000_000;

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

/**
 * Fully decode the image and re-encode only the pixel raster in the same
 * container format. Sharp drops all metadata unless explicitly preserved, so
 * EXIF/GPS/XMP/ICC probe data, embedded payloads and polyglot trailers after the
 * image stream are discarded. `failOn: 'warning'` plus `limitInputPixels` reject
 * truncated/corrupt images and decompression bombs instead of storing them.
 */
async function reencodeImage(bytes: Buffer, type: ImageEvidenceType): Promise<Buffer> {
  const pipeline = sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: MAX_PRIVATE_IMAGE_PIXELS,
    animated: false,
  })
    // Bake EXIF orientation into the pixels before metadata is stripped so a
    // phone photo does not silently end up sideways.
    .rotate();
  try {
    if (type === 'image/jpeg') return await pipeline.jpeg().toBuffer();
    if (type === 'image/png') return await pipeline.png().toBuffer();
    return await pipeline.webp().toBuffer();
  } catch {
    throw new EvidenceTypeError('Image could not be decoded');
  }
}

export interface SanitizedEvidence {
  bytes: Buffer;
  contentType: EvidenceType;
}

/**
 * Validate declared vs. real magic type and return canonical bytes: images are
 * decoded and re-encoded (metadata-stripped); PDFs are passed through untouched
 * for the real scanner to inspect. Throws `EvidenceTypeError` (mapped to 415) on
 * any mismatch, disallowed type, corrupt image or decompression bomb.
 */
export async function sanitizeEvidence(
  declaredContentType: string,
  bytes: Buffer,
): Promise<SanitizedEvidence> {
  const detected = detectEvidenceType(bytes);
  if (!detected) throw new EvidenceTypeError();
  const declared = normalizeDeclared(declaredContentType);
  if (declared && declared !== detected)
    throw new EvidenceTypeError('File content does not match its declared type');
  if (detected === 'application/pdf') return { bytes, contentType: detected };
  return { bytes: await reencodeImage(bytes, detected), contentType: detected };
}
