import type { Logger } from 'pino';
import type { Config } from '../../config/env.js';
import type { MailAdapter } from '../../ports.js';
import type { PrismaClient } from '../../generated/client/client.js';
import { authEmailAad, decryptOutboxSecret, type AuthEmailSecret } from './outbox-crypto.js';

// Durable authentication-email worker. Jobs are claimed under a bounded lease
// with SKIP LOCKED, decrypted and sent outside any row lock, and only marked
// processed after the SMTP server accepts the message. Failures back off with
// bounded exponential growth and dead-letter after a fixed attempt budget, so a
// transient outage leaves an honest pending row instead of a silent success.
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_SECONDS = 3600;

interface ClaimedJob {
  id: string;
  eventType: string;
  aggregateId: string;
  sensitivePayloadCiphertext: string | null;
  attempts: number;
}

export interface AuthEmailDelivery {
  deliverAuthEmails(signal: AbortSignal): Promise<void>;
}

export function createAuthEmailDelivery({
  prisma,
  config,
  mail,
  logger,
}: {
  prisma: PrismaClient;
  config: Config;
  mail: MailAdapter;
  logger?: Logger;
}): AuthEmailDelivery {
  const key = config.authOutboxKey;

  async function claim(): Promise<ClaimedJob[]> {
    return prisma.$queryRaw<ClaimedJob[]>`
      UPDATE outbox_events SET
        attempts = attempts + 1,
        lease_until = now() + interval '30 seconds'
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE processed_at IS NULL AND dead_letter_at IS NULL
          AND available_at <= now()
          AND (lease_until IS NULL OR lease_until < now())
        ORDER BY available_at, occurred_at
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      )
      RETURNING id, event_type AS "eventType", aggregate_id AS "aggregateId",
        sensitive_payload_ciphertext AS "sensitivePayloadCiphertext", attempts
    `;
  }

  function messageFor(
    eventType: string,
    secret: AuthEmailSecret,
  ): { subject: string; text: string } {
    if (eventType === 'AUTH_VERIFY_EMAIL') {
      return {
        subject: 'Verify your DriveHire account',
        text: `Your DriveHire verification code is ${secret.secret}. It expires in 10 minutes.`,
      };
    }
    if (eventType === 'AUTH_RESET_PASSWORD') {
      return {
        subject: 'Reset your DriveHire password',
        text: `Use this one-use link within 15 minutes to reset your password: ${config.appOrigin}/reset-password?token=${secret.secret}`,
      };
    }
    throw new Error('Unsupported authentication email event type');
  }

  function safeErrorCode(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code)) return code;
    }
    return 'DELIVERY_FAILURE';
  }

  async function fail(job: ClaimedJob, errorCode: string): Promise<void> {
    if (job.attempts >= MAX_ATTEMPTS) {
      await prisma.$executeRaw`
        UPDATE outbox_events SET dead_letter_at = now(), lease_until = NULL, last_error_code = ${errorCode}
        WHERE id = ${job.id}`;
      return;
    }
    const backoffSeconds = Math.min(15 * 2 ** (job.attempts - 1), MAX_BACKOFF_SECONDS);
    const availableAt = new Date(Date.now() + backoffSeconds * 1000);
    await prisma.$executeRaw`
      UPDATE outbox_events SET available_at = ${availableAt}, lease_until = NULL, last_error_code = ${errorCode}
      WHERE id = ${job.id}`;
  }

  async function deliverOne(job: ClaimedJob): Promise<void> {
    let secret: AuthEmailSecret;
    try {
      if (!job.sensitivePayloadCiphertext) throw new Error('Missing outbox ciphertext');
      secret = decryptOutboxSecret(
        key,
        authEmailAad(job.eventType, job.aggregateId),
        job.sensitivePayloadCiphertext,
      );
    } catch {
      await fail(job, 'DECRYPTION_FAILED');
      logger?.warn(
        { eventType: job.eventType, errorCode: 'DECRYPTION_FAILED' },
        'Auth email undecryptable',
      );
      return;
    }
    try {
      const message = messageFor(job.eventType, secret);
      await mail.send({
        recipient: secret.recipient,
        subject: message.subject,
        text: message.text,
        messageId: job.id,
      });
      await prisma.$executeRaw`
        UPDATE outbox_events SET processed_at = now(), lease_until = NULL, last_error_code = NULL
        WHERE id = ${job.id}`;
      logger?.info({ eventType: job.eventType }, 'Auth email delivered');
    } catch (error) {
      const errorCode = safeErrorCode(error);
      await fail(job, errorCode);
      logger?.warn({ eventType: job.eventType, errorCode }, 'Auth email delivery failed');
    }
  }

  return {
    async deliverAuthEmails(signal) {
      while (!signal.aborted) {
        const jobs = await claim();
        if (jobs.length === 0) return;
        for (const job of jobs) {
          if (signal.aborted) return;
          await deliverOne(job);
        }
      }
    },
  };
}
