import { connect, type Socket } from 'node:net';
import type { ScanAdapter } from '../ports.js';

const MAX_CHUNK = 8192;
const COMMAND_TIMEOUT_MS = 15000;

/**
 * Real ClamAV (clamd) scanner over the INSTREAM protocol. Reads the malware
 * verdict from the daemon; a connection/timeout error is surfaced as a failure
 * so callers must fail closed (a document is never marked CLEAN without a real
 * verdict). No signature database or inference lives in process.
 */
export function createClamAvScan({
  host,
  port,
  timeoutMs = COMMAND_TIMEOUT_MS,
}: {
  host: string;
  port: number;
  timeoutMs?: number;
}): ScanAdapter {
  return {
    scan(input, signal) {
      return new Promise<'CLEAN' | 'REJECTED'>((resolve, reject) => {
        const socket: Socket = connect({ host, port });
        const response: Buffer[] = [];
        let settled = false;
        let sent = false;

        const timer = setTimeout(() => finish(new Error('SCANNER_TIMEOUT')), timeoutMs);
        timer.unref?.();

        function cleanup(): void {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          socket.removeAllListeners();
          socket.destroy();
        }
        function finish(error: Error | null, verdict?: 'CLEAN' | 'REJECTED'): void {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve(verdict as 'CLEAN' | 'REJECTED');
        }
        function onAbort(): void {
          finish(new Error('SCANNER_ABORTED'));
        }
        signal.addEventListener('abort', onAbort, { once: true });

        socket.on('error', (error) => finish(error));
        socket.on('data', (chunk) => response.push(chunk));
        socket.on('close', () => {
          const text = Buffer.concat(response).toString('binary').replace(/\0/g, '').trim();
          if (/^stream: OK$/i.test(text) || /^INSTREAM: OK$/i.test(text) || /\bOK$/.test(text)) {
            finish(null, 'CLEAN');
            return;
          }
          if (/FOUND$/i.test(text)) {
            finish(null, 'REJECTED');
            return;
          }
          finish(new Error(`SCANNER_ERROR:${text.slice(0, 120) || 'no response'}`));
        });

        socket.on('connect', () => {
          socket.write('zINSTREAM\0');
          void (async () => {
            try {
              for await (const chunk of input) {
                if (settled) return;
                if (signal.aborted) {
                  finish(new Error('SCANNER_ABORTED'));
                  return;
                }
                const buffer = Buffer.from(chunk);
                for (let offset = 0; offset < buffer.length; offset += MAX_CHUNK) {
                  const slice = buffer.subarray(offset, offset + MAX_CHUNK);
                  const length = Buffer.alloc(4);
                  length.writeUInt32BE(slice.length, 0);
                  socket.write(length);
                  socket.write(slice);
                }
              }
              if (!settled) {
                socket.write(Buffer.from([0, 0, 0, 0]));
                sent = true;
              }
            } catch (error) {
              finish(error instanceof Error ? error : new Error('SCANNER_STREAM_FAILED'));
            }
          })();
        });
        // `sent` is retained to make the intent explicit for reviewers; the
        // daemon closes the socket after replying to the zero-length terminator.
        void sent;
      });
    },
  };
}
