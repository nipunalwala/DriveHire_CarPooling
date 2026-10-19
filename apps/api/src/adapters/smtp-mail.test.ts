import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { startTlsSmtpFixture, testSmtpCaPem } from '../test/tls-smtp-server.js';
import { createSmtpMail, SmtpError } from './smtp-mail.js';

// The adapter's secure transports are the only ones allowed in staging and
// production, so they run against a real local TLS SMTP server. The committed
// test CA is supplied explicitly and is never part of any production config.
const DATABASE_URL =
  'postgresql://drivehire_test_runtime:placeholder@127.0.0.1:55433/drivehire_test';
const APP_ORIGIN = 'http://localhost:5173';
const MESSAGE = {
  recipient: 'rider@example.com',
  subject: 'Verify your DriveHire account',
  text: 'Your DriveHire verification code is 123456.',
  messageId: 'fixture-message-1',
};

function smtpConfig(
  port: number,
  tls: 'none' | 'starttls' | 'implicit',
  options: { ca?: string; auth?: boolean } = {},
) {
  const auth = options.auth ?? true;
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL,
    APP_ORIGIN,
    CORS_ORIGINS: APP_ORIGIN,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_TLS: tls,
    ...(auth ? { SMTP_USER: 'drivehire', SMTP_PASSWORD: 'fixture-secret' } : {}),
    ...(options.ca ? { SMTP_CA: options.ca } : {}),
  });
}

describe('Milestone03 SMTP transports', () => {
  it('starttls_upgrades_authenticates_and_delivers', async () => {
    const fixture = await startTlsSmtpFixture('starttls');
    try {
      const mail = createSmtpMail(smtpConfig(fixture.port, 'starttls', { ca: testSmtpCaPem }));
      await mail.send(MESSAGE);

      // The upgrade actually happened and a second EHLO was issued over TLS.
      expect(fixture.starttlsUpgrades).toBe(1);
      expect(fixture.commands.filter((c) => c.toUpperCase().startsWith('EHLO'))).toHaveLength(2);
      // Credentials are only offered after the session is encrypted.
      const starttlsAt = fixture.commands.indexOf('STARTTLS');
      const authAt = fixture.commands.findIndex((c) => c.toUpperCase().startsWith('AUTH PLAIN'));
      expect(starttlsAt).toBeGreaterThanOrEqual(0);
      expect(authAt).toBeGreaterThan(starttlsAt);
      // The server requires auth before MAIL FROM, so delivery proves AUTH.
      expect(fixture.messages).toHaveLength(1);
      expect(fixture.messages[0]).toContain('To: rider@example.com');
      expect(fixture.messages[0]).toContain('123456');
    } finally {
      await fixture.close();
    }
  });

  it('implicit_tls_authenticates_and_delivers', async () => {
    const fixture = await startTlsSmtpFixture('implicit');
    try {
      const mail = createSmtpMail(smtpConfig(fixture.port, 'implicit', { ca: testSmtpCaPem }));
      await mail.send(MESSAGE);

      expect(fixture.implicitConnections).toBe(1);
      expect(fixture.commands.some((c) => c.toUpperCase().startsWith('AUTH PLAIN'))).toBe(true);
      expect(fixture.messages).toHaveLength(1);
      expect(fixture.messages[0]).toContain('To: rider@example.com');
    } finally {
      await fixture.close();
    }
  });

  it('implicit_tls_rejects_untrusted_certificate_without_delivery', async () => {
    const fixture = await startTlsSmtpFixture('implicit');
    try {
      const mail = createSmtpMail(smtpConfig(fixture.port, 'implicit'));
      await expect(mail.send(MESSAGE)).rejects.toBeInstanceOf(SmtpError);
      expect(fixture.messages).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it('starttls_rejects_when_the_upgrade_handshake_fails', async () => {
    const fixture = await startTlsSmtpFixture('starttls');
    try {
      // No CA supplied: the STARTTLS command succeeds but the TLS handshake on
      // the upgraded socket cannot be verified, so delivery must fail.
      const mail = createSmtpMail(smtpConfig(fixture.port, 'starttls'));
      await expect(mail.send(MESSAGE)).rejects.toBeInstanceOf(SmtpError);
      expect(fixture.messages).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it('transport_connection_failure_is_reported_as_smtp_error', async () => {
    const probe = await startTlsSmtpFixture('starttls');
    const closedPort = probe.port;
    await probe.close();
    const mail = createSmtpMail(smtpConfig(closedPort, 'none'));
    await expect(mail.send(MESSAGE)).rejects.toBeInstanceOf(SmtpError);
  });
});
