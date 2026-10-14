import { createApp } from './api/app';
import { closeDb } from './config/db';
import { loadEnv } from './config/env';
import { logger } from './config/logger';

const env = loadEnv();
const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  const timeout = setTimeout(() => {
    logger.error('Shutdown timed out');
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close(async (error) => {
    if (error) logger.error({ errorName: error.name }, 'HTTP server shutdown failed');
    await closeDb();
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
}
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reasonType: typeof reason }, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});
