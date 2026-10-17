import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { Config } from '../config/env.js';
import type { MailAdapter } from '../ports.js';

// Minimal, dependency-free SMTP client. It is the only external IO the
// authentication-mail worker performs: no SDK, no hidden retry, no fake
// success. Transport is plaintext local SMTP (Mailpit), implicit TLS or
// STARTTLS; credentials are supplied privately by configuration.
const RESPONSE_TIMEOUT_MS = 10_000;
const CLIENT_NAME = 'drivehire.local';

export class SmtpError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
  }
}

interface MailMessage {
  recipient: string;
  subject: string;
  text: string;
  messageId: string;
}

class SmtpSession {
  private buffer = '';
  private pendingLines: string[] = [];
  private responses: string[] = [];
  private waiters: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private failure: Error | undefined;
  private readonly onData: (chunk: Buffer) => void;
  private readonly onError: () => void;
  private readonly onClose: () => void;

  constructor(private readonly socket: Socket) {
    this.onData = (chunk) => this.consume(chunk);
    this.onError = () => this.abort(new SmtpError('SMTP_SOCKET', 'SMTP connection failed'));
    this.onClose = () => this.abort(new SmtpError('SMTP_CLOSED', 'SMTP connection closed'));
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  /** Detach listeners before the raw socket is wrapped by TLS. */
  detach(): void {
    this.socket.removeListener('data', this.onData);
    this.socket.removeListener('error', this.onError);
    this.socket.removeListener('close', this.onClose);
  }

  async greeting(): Promise<void> {
    const response = await this.next();
    if (Number(response.slice(0, 3)) !== 220) {
      throw new SmtpError('SMTP_GREETING', 'SMTP server did not greet');
    }
  }

  async command(command: string): Promise<string> {
    if (this.failure) throw this.failure;
    this.socket.write(`${command}\r\n`);
    const response = await this.next();
    const code = Number(response.slice(0, 3));
    if (code >= 400) {
      throw new SmtpError(`SMTP_${code}`, `SMTP rejected ${command.split(' ')[0] ?? 'command'}`);
    }
    return response;
  }

  close(): void {
    this.detach();
    this.socket.destroy();
  }

  private next(): Promise<string> {
    if (this.responses.length > 0) return Promise.resolve(this.responses.shift() as string);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.abort(new SmtpError('SMTP_TIMEOUT', 'SMTP response timed out'));
      }, RESPONSE_TIMEOUT_MS);
      this.waiters.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
    });
  }

  private consume(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let index = this.buffer.indexOf('\n');
    while (index !== -1) {
      const raw = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      this.pendingLines.push(line);
      if (/^\d{3} /.test(line)) {
        const response = this.pendingLines.join('\n');
        this.pendingLines = [];
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(response);
        else this.responses.push(response);
      }
      index = this.buffer.indexOf('\n');
    }
  }

  private abort(error: Error): void {
    this.failure = error;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }
}

function openSocket(config: Config): Promise<Socket> {
  const { host, port, tls } = config.smtp;
  return new Promise((resolve, reject) => {
    const fail = () => reject(new SmtpError('SMTP_CONNECT', 'SMTP connection failed'));
    if (tls === 'implicit') {
      const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true }, () =>
        resolve(socket),
      );
      socket.setTimeout(RESPONSE_TIMEOUT_MS, () => socket.destroy());
      socket.once('error', fail);
      return;
    }
    const socket = netConnect({ host, port }, () => resolve(socket));
    socket.setTimeout(RESPONSE_TIMEOUT_MS, () => socket.destroy());
    socket.once('error', fail);
  });
}

function upgradeToTls(socket: Socket, host: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const secure = tlsConnect({ socket, servername: host, rejectUnauthorized: true }, () =>
      resolve(secure),
    );
    secure.once('error', () => reject(new SmtpError('SMTP_TLS', 'SMTP TLS negotiation failed')));
  });
}

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeSubject(value: string): string {
  const sanitized = sanitize(value);
  return /^[\x20-\x7e]*$/.test(sanitized)
    ? sanitized
    : `=?UTF-8?B?${Buffer.from(sanitized, 'utf8').toString('base64')}?=`;
}

function dotStuff(text: string): string {
  return text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function buildMessage(config: Config, message: MailMessage): string {
  const headers = [
    `From: ${sanitize(config.smtp.from)}`,
    `To: ${sanitize(message.recipient)}`,
    `Subject: ${encodeSubject(message.subject)}`,
    `Message-ID: <${sanitize(message.messageId)}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    'Date: ' + new Date().toUTCString(),
  ];
  return `${headers.join('\r\n')}\r\n\r\n${dotStuff(message.text)}`;
}

async function sendSmtp(
  config: Config,
  message: MailMessage,
): Promise<{ providerMessageId: string }> {
  let socket = await openSocket(config);
  let session = new SmtpSession(socket);
  try {
    await session.greeting();
    await session.command(`EHLO ${CLIENT_NAME}`);
    if (config.smtp.tls === 'starttls') {
      await session.command('STARTTLS');
      session.detach();
      socket = await upgradeToTls(socket, config.smtp.host);
      session = new SmtpSession(socket);
      await session.command(`EHLO ${CLIENT_NAME}`);
    }
    if (config.smtp.user) {
      const token = Buffer.from(`\0${config.smtp.user}\0${config.smtp.password ?? ''}`).toString(
        'base64',
      );
      await session.command(`AUTH PLAIN ${token}`);
    }
    await session.command(`MAIL FROM:<${sanitize(config.smtp.from)}>`);
    await session.command(`RCPT TO:<${sanitize(message.recipient)}>`);
    await session.command('DATA');
    const accepted = await session.command(`${buildMessage(config, message)}\r\n.`);
    await session.command('QUIT');
    const queued = /queued as ([A-Za-z0-9._<>@-]+)/.exec(accepted)?.[1];
    return { providerMessageId: queued ?? message.messageId };
  } finally {
    session.close();
  }
}

export function createSmtpMail(config: Config): MailAdapter {
  return {
    send(input) {
      return sendSmtp(config, {
        recipient: input.recipient,
        subject: input.subject,
        text: input.text,
        messageId: input.messageId,
      });
    },
  };
}
