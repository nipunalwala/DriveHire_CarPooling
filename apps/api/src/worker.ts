import { randomUUID } from 'node:crypto';
import { parseEnv } from './config/env.js';
import { createLogger, safeErrorMetadata } from './config/logger.js';
import { createDatabase, updateHeartbeat } from './runtime/database.js';
import { runWorker } from './runtime/run-worker.js';

const config = parseEnv(process.env);
const logger = createLogger(config.logLevel);
const database = createDatabase(config.databaseUrl);
const owner = randomUUID();
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
try {
  await runWorker({
    signal: controller.signal,
    intervalMs: config.workerPollMs,
    tick: async () => {
      if (!(await updateHeartbeat(database, owner)))
        logger.warn('Worker waiting for Phase02 schema; no jobs processed');
    },
    onError: (error) => {
      logger.error(safeErrorMetadata(error), 'Worker dependency unavailable');
    },
  });
} finally {
  await database.end();
  logger.info('Worker stopped');
}
