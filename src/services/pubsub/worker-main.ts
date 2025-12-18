/**
 * Ferni Pub/Sub Worker - Main Entry Point
 *
 * This is the main entry point for the Pub/Sub worker Cloud Run service.
 * It initializes Firebase, registers handlers, and starts the HTTP server.
 *
 * @module services/pubsub/worker-main
 */

import { createLogger } from '../../utils/safe-logger.js';
import { startWorkerServer } from './cloud-run-worker.js';

const log = createLogger({ module: 'WorkerMain' });

async function main(): Promise<void> {
  log.info('Starting Ferni Pub/Sub Worker...');

  try {
    // Initialize Firebase
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');

    if (getApps().length === 0) {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        initializeApp();
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({ credential: cert(serviceAccount) });
      } else {
        // Default credentials (works in Cloud Run)
        initializeApp();
      }
      log.info('Firebase initialized');
    }

    // Start the worker server
    await startWorkerServer();

    log.info('Ferni Pub/Sub Worker is running');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to start Pub/Sub Worker');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start
main();
