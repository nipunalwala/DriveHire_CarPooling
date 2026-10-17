import type { Readable } from 'node:stream';
import { badRequest } from '../../errors.js';

// Minimal dependency-free multipart/form-data reader for a single bounded
// upload. Parses `multipart/form-data` bodies into text fields and file parts.

export interface MultipartFile {
  field: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartBody {
  fields: Record<string, string>;
  files: MultipartFile[];
}

export const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

export async function readMultipart(
  stream: Readable,
  contentType: string,
  maxBytes = MAX_MULTIPART_BYTES,
): Promise<MultipartBody> {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) throw badRequest('Expected multipart/form-data');
  const delimiter = Buffer.from(`--${boundary}`);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) throw badRequest('Upload exceeds the allowed size');
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks);

  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  let index = body.indexOf(delimiter);
  if (index === -1) throw badRequest('Malformed multipart body');
  index += delimiter.length;
  while (index < body.length) {
    // Skip the CRLF that follows a boundary.
    if (body[index] === 0x0d && body[index + 1] === 0x0a) index += 2;
    if (body.subarray(index, index + 2).equals(Buffer.from('--'))) break;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), index);
    if (headerEnd === -1) throw badRequest('Malformed multipart headers');
    const headerText = body.toString('utf8', index, headerEnd);
    const next = body.indexOf(delimiter, headerEnd + 4);
    if (next === -1) throw badRequest('Malformed multipart part');
    let dataEnd = next;
    if (body[dataEnd - 2] === 0x0d && body[dataEnd - 1] === 0x0a) dataEnd -= 2;
    const data = body.subarray(headerEnd + 4, dataEnd);

    const disposition = /content-disposition:[^\r\n]*/i.exec(headerText)?.[0] ?? '';
    const name = /name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const partType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim();
    if (filename !== undefined) {
      files.push({
        field: name ?? '',
        filename,
        contentType: partType ?? 'application/octet-stream',
        data: Buffer.from(data),
      });
    } else if (name) {
      fields[name] = data.toString('utf8');
    }
    index = next + delimiter.length;
  }
  return { fields, files };
}
