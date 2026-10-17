import { randomUUID } from 'node:crypto';
import { createClamAvScan } from './adapters/clamav-scan.js';
import { createPrivateStorage } from './adapters/private-storage.js';
import { createSmtpMail } from './adapters/smtp-mail.js';
import { parseEnv } from './config/env.js';
import { createLogger, safeErrorMetadata } from './config/logger.js';
import { createAuthEmailDelivery } from './modules/accounts/email-jobs.js';
import { createProvidersService } from './modules/providers/service.js';
import { createDatabase, updateHeartbeat } from './runtime/database.js';
import { createPrisma } from './runtime/prisma.js';
import { runWorker } from './runtime/run-worker.js';

const config = parseEnv(process.env);
const logger = createLogger(config.logLevel);
const database = createDatabase(config.databaseUrl);
const prisma = createPrisma(config.databaseUrl);
const mail = createSmtpMail(config);
const delivery = createAuthEmailDelivery({ prisma, config, mail, logger });
const storage = createPrivateStorage({ root: config.storagePrivateRoot });
const scanner = createClamAvScan(config.scan);
const providers = createProvidersService({ prisma, config, storage, scanner });
const owner = randomUUID();
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
try {
  await runWorker({
    signal: controller.signal,
    intervalMs: config.workerPollMs,
    tick: async () => {
      const heartbeat = await updateHeartbeat(database, owner);
      if (!heartbeat) {
        logger.warn('Worker waiting for Phase02 schema; no jobs processed');
        return;
      }
      await delivery.deliverAuthEmails(controller.signal);
      // Private evidence: scan quarantined uploads, reap orphans and expire
      // qualifications. Real handlers only; no scheduled reach can mark an
      // unscanned document CLEAN.
      await providers.scanPendingDocuments(controller.signal);
      await providers.cleanupOrphanUploads();
      await providers.expireQualifications();
    },
    onError: (error) => {
      logger.error(safeErrorMetadata(error), 'Worker dependency unavailable');
    },
  });
} finally {
  await prisma.$disconnect();
  await database.end();
  logger.info('Worker stopped');
}
