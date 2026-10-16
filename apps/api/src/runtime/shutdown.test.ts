import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { drainServer } from './shutdown.js';

it('drains an in-flight response before closing its resources', async () => {
  let release!: () => void;
  let signalReceived!: () => void;
  const received = new Promise<void>((resolve) => {
    signalReceived = resolve;
  });
  // Start on a random local port; no external network dependency.
  const server = createServer((_req, res) => {
    release = () => {
      res.end('finished');
    };
    signalReceived();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const response = new Promise<string>((resolve, reject) => {
    get(`http://127.0.0.1:${address.port}`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += String(chunk);
      });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  await received;
  let resourcesClosed = false;
  const draining = drainServer(
    server,
    async () => {
      resourcesClosed = true;
    },
    1000,
  );
  expect(resourcesClosed).toBe(false);
  release();
  expect(await response).toBe('finished');
  await draining;
  expect(resourcesClosed).toBe(true);
});
