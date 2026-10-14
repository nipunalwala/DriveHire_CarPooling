import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env';
import { logger } from '../config/logger';

export type Mail = { to: string; subject: string; text: string; html?: string };
export interface Mailer {
  send(message: Mail): Promise<void>;
}
export class SmtpMailer implements Mailer {
  private transporter?: Transporter;
  async send(message: Mail): Promise<void> {
    const env = loadEnv();
    if (env.MAIL_MODE === 'console') {
      logger.info(
        { recipientDomain: message.to.split('@')[1], subject: message.subject },
        'Development email queued'
      );
      return;
    }
    this.transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
    await this.transporter.sendMail({ from: env.MAIL_FROM, ...message });
  }
}
