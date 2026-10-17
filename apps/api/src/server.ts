import { createServer } from 'node:http';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger, safeErrorMetadata } from './config/logger.js';
import { createDatabase, probeReadiness } from './runtime/database.js';
import { createPrisma } from './runtime/prisma.js';
import { drainServer } from './runtime/shutdown.js';

const config = parseEnv(process.env);
const logger = createLogger(config.logLevel);
const database = createDatabase(config.databaseUrl);
const prisma = createPrisma(config.databaseUrl);
const app = createApp({
  config,
  logger,
  readiness: () => probeReadiness(database),
  accounts: { prisma },
});
const server = createServer(app);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('Draining HTTP server');
  try {
    await drainServer(server, async () => {
      await prisma.$disconnect();
      await database.end();
    });
  } catch (error) {
    logger.error(safeErrorMetadata(error), 'Shutdown failed');
    process.exitCode = 1;
  }
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
server.on('error', (error) => {
  logger.error(safeErrorMetadata(error), 'HTTP listener failed');
  void prisma.$disconnect();
  void database.end();
  process.exitCode = 1;
});
server.listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening');
});
