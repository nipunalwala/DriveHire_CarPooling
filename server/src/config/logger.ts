import pino from 'pino';
import { loadEnv } from './env';

export const logger = pino({
  level: loadEnv().LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'password_hash',
      'token',
      'refreshToken',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    censor: '[REDACTED]'
  },
  formatters: { level: (label) => ({ level: label }) }
});
