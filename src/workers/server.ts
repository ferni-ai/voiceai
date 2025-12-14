/**
 * Worker Server
 *
 * HTTP server wrapper for background workers running as Cloud Run services.
 * Provides health checks and graceful shutdown handling.
 *
 * Usage:
 *   WORKER_TYPE=trust node dist/workers/server.js
 *   WORKER_TYPE=analytics node dist/workers/server.js
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  startTrustWorker,
  startAnalyticsWorker,
  getTrustWorker,
  getAnalyticsWorker,
  startAllWorkers,
  stopAllWorkers,
} from './index.js';

const log = createLogger({ module: 'WorkerServer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.PORT || '8080', 10);
const WORKER_TYPE = process.env.WORKER_TYPE || 'all';

// ============================================================================
// HEALTH CHECK SERVER
// ============================================================================

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  worker: string;
  stats?: {
    messagesReceived: number;
    messagesProcessed: number;
    messagesFailed: number;
    averageProcessingMs: number;
    lastProcessedAt: number | null;
  };
  uptime: number;
}

let startTime: number;
let workerStarted = false;

function getHealthResponse(): HealthResponse {
  let stats;

  try {
    if (WORKER_TYPE === 'trust') {
      stats = getTrustWorker().getStats();
    } else if (WORKER_TYPE === 'analytics') {
      stats = getAnalyticsWorker().getStats();
    } else {
      // Combined stats for 'all' mode
      const trustStats = getTrustWorker().getStats();
      const analyticsStats = getAnalyticsWorker().getStats();
      stats = {
        messagesReceived: trustStats.messagesReceived + analyticsStats.messagesReceived,
        messagesProcessed: trustStats.messagesProcessed + analyticsStats.messagesProcessed,
        messagesFailed: trustStats.messagesFailed + analyticsStats.messagesFailed,
        averageProcessingMs:
          (trustStats.averageProcessingMs + analyticsStats.averageProcessingMs) / 2,
        lastProcessedAt:
          Math.max(trustStats.lastProcessedAt || 0, analyticsStats.lastProcessedAt || 0) || null,
      };
    }
  } catch {
    // Worker not started yet
  }

  return {
    status: workerStarted ? 'healthy' : 'unhealthy',
    worker: WORKER_TYPE,
    stats,
    uptime: Date.now() - startTime,
  };
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/';

  if (url === '/health' || url === '/healthz') {
    const health = getHealthResponse();
    res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  if (url === '/ready' || url === '/readyz') {
    if (workerStarted) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false }));
    }
    return;
  }

  if (url === '/stats') {
    const health = getHealthResponse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health.stats || {}));
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  startTime = Date.now();

  log.info({ workerType: WORKER_TYPE, port: PORT }, 'Starting worker server');

  // Create HTTP server for health checks
  const server = createServer(handleRequest);

  // Start HTTP server
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      log.info({ port: PORT }, 'Health check server listening');
      resolve();
    });
  });

  // Start the appropriate worker
  try {
    switch (WORKER_TYPE) {
      case 'trust':
        await startTrustWorker();
        log.info('Trust worker started');
        break;

      case 'analytics':
        await startAnalyticsWorker();
        log.info('Analytics worker started');
        break;

      case 'all':
      default:
        await startAllWorkers();
        log.info('All workers started');
        break;
    }

    workerStarted = true;
    log.info({ workerType: WORKER_TYPE, startupMs: Date.now() - startTime }, 'Worker ready');
  } catch (error) {
    log.error({ error: String(error) }, 'Worker startup failed');
    process.exit(1);
  }

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Received shutdown signal');

    // Stop accepting new connections
    server.close();

    // Stop workers
    await stopAllWorkers();

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', async () => shutdown('SIGTERM'));
  process.on('SIGINT', async () => shutdown('SIGINT'));

  // Keep alive
  log.info('Worker server running. Press Ctrl+C to stop.');
}

// Run
main().catch((error) => {
  log.error({ error: String(error) }, 'Fatal error');
  process.exit(1);
});
