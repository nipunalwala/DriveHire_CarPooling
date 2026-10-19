import { readFileSync } from 'node:fs';
import { createServer as createNetServer, type Server, type Socket } from 'node:net';
import { TLSSocket, createSecureContext, createServer as createTlsServer } from 'node:tls';

// Local SMTP fixture with a real TLS handshake. It is the only server that
// exercises the STARTTLS upgrade and implicit-TLS socket paths of the adapter.
// The committed certificate/key pair is a test-only trust anchor: the CA is
// passed to the adapter explicitly by the tests and never loaded in production.
const fixtures = new URL('./fixtures/tls/', import.meta.url);
export const testSmtpCaPem = readFileSync(new URL('ca.pem', fixtures), 'utf8');
const serverCertPem = readFileSync(new URL('server-cert.pem', fixtures), 'utf8');
const serverKeyPem = readFileSync(new URL('server-key.pem', fixtures), 'utf8');

export interface SmtpFixture {
  port: number;
  commands: string[];
  messages: string[];
  /** STARTTLS command negotiations that led to a TLS session. */
  readonly starttlsUpgrades: number;
  /** Implicit-TLS connections accepted (always 0 for a STARTTLS fixture). */
  readonly implicitConnections: number;
  close(): Promise<void>;
}

export async function startTlsSmtpFixture(mode: 'starttls' | 'implicit'): Promise<SmtpFixture> {
  const commands: string[] = [];
  const messages: string[] = [];
  const context = createSecureContext({ cert: serverCertPem, key: serverKeyPem });
  const sockets = new Set<Socket>();
  let starttlsUpgrades = 0;
  let implicitConnections = 0;

  function attach(socket: Socket, sendGreeting: boolean, secure: boolean): void {
    let buffer = '';
    let inData = false;
    let authenticated = false;
    const dataLines: string[] = [];
    const write = (line: string) => socket.write(`${line}\r\n`);
    if (sendGreeting) write('220 drivehire.test ESMTP');

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\r\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\r\n');
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(dataLines.join('\n'));
            dataLines.length = 0;
            write('250 2.0.0 Ok queued as fixture');
          } else {
            dataLines.push(line);
          }
          continue;
        }
        commands.push(line);
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO')) {
          const caps = ['250-drivehire.test', '250-AUTH PLAIN'];
          if (mode === 'starttls' && !secure) caps.push('250-STARTTLS');
          caps.push('250 8BITMIME');
          socket.write(`${caps.join('\r\n')}\r\n`);
        } else if (upper.startsWith('HELO')) {
          write('250 drivehire.test');
        } else if (upper.startsWith('STARTTLS')) {
          write('220 2.0.0 Ready to start TLS');
          socket.removeListener('data', onData);
          const upgraded = new TLSSocket(socket, { isServer: true, secureContext: context });
          upgraded.on('error', () => {});
          starttlsUpgrades += 1;
          attach(upgraded, false, true);
        } else if (upper.startsWith('AUTH PLAIN')) {
          authenticated = true;
          write('235 2.7.0 Authentication successful');
        } else if (upper.startsWith('MAIL FROM')) {
          if (authenticated) write('250 2.1.0 Sender ok');
          else write('530 5.7.0 Authentication required');
        } else if (upper.startsWith('RCPT TO')) {
          write('250 2.1.5 Recipient ok');
        } else if (upper === 'DATA') {
          inData = true;
          write('354 End data with <CR><LF>.<CR><LF>');
        } else if (upper === 'QUIT') {
          write('221 2.0.0 Bye');
          socket.end();
        } else {
          write('250 2.0.0 Ok');
        }
      }
    };
    socket.on('data', onData);
    socket.on('error', () => {});
  }

  const server: Server =
    mode === 'implicit'
      ? (() => {
          const tlsServer = createTlsServer(
            { cert: serverCertPem, key: serverKeyPem },
            (socket) => {
              implicitConnections += 1;
              attach(socket, true, true);
            },
          );
          tlsServer.on('tlsClientError', () => {});
          return tlsServer;
        })()
      : createNetServer((socket) => attach(socket, true, false));
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SMTP fixture did not bind a port');

  return {
    port: address.port,
    commands,
    messages,
    get starttlsUpgrades() {
      return starttlsUpgrades;
    },
    get implicitConnections() {
      return implicitConnections;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
