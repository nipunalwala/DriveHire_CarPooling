import { createConnection } from 'node:net';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
function conversation(port, send, expected) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: 5000 });
    socket.once('connect', () => {
      if (send) socket.write(send);
    });
    socket.once('data', (data) => {
      socket.destroy();
      if (data.toString().includes(expected)) resolve();
      else reject(new Error(`Unexpected response from local service on port ${port}`));
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Local service timeout on port ${port}`));
    });
    socket.once('error', reject);
  });
}
await conversation(11025, '', '220');
await conversation(13310, 'zPING\0', 'PONG');
const mailpit = await fetch('http://127.0.0.1:18025/api/v1/info', {
  signal: AbortSignal.timeout(5000),
});
if (!mailpit.ok) throw new Error('Mailpit HTTP interface is unavailable');
console.log('Dedicated test Mailpit SMTP/HTTP and ClamAV PING responded successfully.');
