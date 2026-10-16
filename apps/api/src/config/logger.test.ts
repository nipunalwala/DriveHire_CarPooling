import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, safeErrorMetadata } from './logger.js';

describe('log privacy', () => {
  it('redacts credentials and request bodies while retaining request correlation', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const logger = createLogger('info', stream);
    logger.info(
      {
        requestId: 'req-12345',
        password: 'password-secret',
        token: 'token-secret',
        otp: 'otp-secret',
        licenseNumber: 'license-secret',
        req: {
          headers: { authorization: 'Bearer access-secret', cookie: 'refresh-secret' },
          body: { nested: 'body-secret' },
        },
      },
      'request',
    );
    expect(output).toContain('req-12345');
    for (const secret of [
      'password-secret',
      'token-secret',
      'otp-secret',
      'license-secret',
      'access-secret',
      'refresh-secret',
      'body-secret',
    ])
      expect(output).not.toContain(secret);
  });
  it('does not put arbitrary dependency error messages into logs', () => {
    expect(safeErrorMetadata(new Error('postgresql://admin:password@host/db'))).toEqual({
      errorType: 'Error',
    });
  });
});
