import pino, { type DestinationStream } from 'pino';

export function createLogger(level: string, destination?: DestinationStream) {
  const options = {
    level,
    redact: {
      paths: [
        'password',
        'token',
        'otp',
        'accessToken',
        'refreshToken',
        'licenseNumber',
        'registrationNumber',
        'databaseUrl',
        'smtp',
        '*.password',
        '*.token',
        '*.otp',
        '*.licenseNumber',
        '*.registrationNumber',
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

export function safeErrorMetadata(error: unknown): { errorType: string } {
  return { errorType: error instanceof Error ? error.constructor.name : 'UnknownError' };
}
