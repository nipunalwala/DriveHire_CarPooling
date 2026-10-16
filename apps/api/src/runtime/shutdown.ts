import type { Server } from 'node:http';

export async function drainServer(
  server: Server,
  closeResources: () => Promise<void>,
  timeoutMs = 30000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => {
        server.closeAllConnections();
      }, timeoutMs);
      timeout.unref();
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeIdleConnections();
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    await closeResources();
  }
}
