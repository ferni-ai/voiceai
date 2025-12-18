/**
 * Background Workers
 *
 * Worker processes for handling async events without blocking the voice agent.
 *
 * Architecture:
 * ```
 * ┌─────────────────┐      AsyncEvents       ┌─────────────────┐
 * │  Voice Agent    │─────────────────────▶  │   TrustWorker   │
 * │  (Cloud Run)    │      (Pub/Sub)         │  (background)   │
 * └─────────────────┘                        └─────────────────┘
 *                                                    │
 *                                            ┌───────┴───────┐
 *                                            ▼               ▼
 *                                     ┌──────────┐    ┌──────────┐
 *                                     │ Firestore│    │ Learning │
 *                                     │  (trust) │    │ (evolve) │
 *                                     └──────────┘    └──────────┘
 * ```
 *
 * Running Workers:
 * - Local development: Workers run in-process via LocalWorker
 * - Production: Workers can run as separate Cloud Run services with Pub/Sub
 */

export * from './analytics-worker.js';
export * from './base-worker.js';
export * from './trust-worker.js';
export * from './embedding-worker.js';
export * from './summarization-worker.js';
export * from './audio-analysis-pool.js';

import { createLogger } from '../utils/safe-logger.js';
import { getAnalyticsWorker, startAnalyticsWorker } from './analytics-worker.js';
import { getTrustWorker, startTrustWorker } from './trust-worker.js';
import { getEmbeddingWorker, startEmbeddingWorker } from './embedding-worker.js';
import { getSummarizationWorker, startSummarizationWorker } from './summarization-worker.js';
import { initializeAudioAnalysisPool, shutdownAudioAnalysisPool } from './audio-analysis-pool.js';

const log = createLogger({ module: 'Workers' });

// ============================================================================
// WORKER MANAGEMENT
// ============================================================================

let workersStarted = false;

/**
 * Start all background workers.
 * Call this during application startup for local worker processing.
 */
export async function startAllWorkers(): Promise<void> {
  if (workersStarted) {
    log.debug('Workers already started');
    return;
  }

  log.info('Starting background workers');
  const start = Date.now();

  try {
    // Start all event-based workers in parallel
    await Promise.all([
      startTrustWorker(),
      startAnalyticsWorker(),
      startEmbeddingWorker(),
      startSummarizationWorker(),
    ]);

    // Initialize audio analysis worker pool (uses worker_threads)
    try {
      await initializeAudioAnalysisPool();
      log.info('Audio analysis worker pool initialized');
    } catch (audioPoolError) {
      // Non-critical - fallback to main thread analysis
      log.debug(
        { error: String(audioPoolError) },
        'Audio analysis pool init skipped (non-critical)'
      );
    }

    workersStarted = true;
    log.info({ elapsedMs: Date.now() - start }, 'Background workers started');
  } catch (error) {
    log.warn({ error: String(error) }, 'Some workers failed to start');
  }
}

/**
 * Stop all background workers gracefully.
 * Call this during application shutdown.
 */
export async function stopAllWorkers(): Promise<void> {
  if (!workersStarted) return;

  log.info('Stopping background workers');

  await Promise.all([
    getTrustWorker().stop(),
    getAnalyticsWorker().stop(),
    getEmbeddingWorker().stop(),
    getSummarizationWorker().stop(),
    shutdownAudioAnalysisPool(),
  ]);

  workersStarted = false;
  log.info('Background workers stopped');
}

/**
 * Get combined stats from all workers.
 */
export function getWorkerStats(): Record<string, unknown> {
  return {
    trust: getTrustWorker().getStats(),
    analytics: getAnalyticsWorker().getStats(),
  };
}

// ============================================================================
// STANDALONE WORKER ENTRY POINTS
// ============================================================================

/**
 * Run as standalone trust worker (for separate Cloud Run service).
 *
 * Usage:
 * ```bash
 * WORKER_TYPE=trust node dist/workers/index.js
 * ```
 */
export async function runStandaloneTrustWorker(): Promise<void> {
  log.info('Starting standalone trust worker');

  const worker = await startTrustWorker();

  // Handle shutdown
  process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down');
    void worker.stop().then(() => process.exit(0));
  });

  log.info('Trust worker running');
}

/**
 * Run as standalone analytics worker (for separate Cloud Run service).
 *
 * Usage:
 * ```bash
 * WORKER_TYPE=analytics node dist/workers/index.js
 * ```
 */
export async function runStandaloneAnalyticsWorker(): Promise<void> {
  log.info('Starting standalone analytics worker');

  const worker = await startAnalyticsWorker();

  // Handle shutdown
  process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down');
    void worker.stop().then(() => process.exit(0));
  });

  log.info('Analytics worker running');
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

// If run directly, start the specified worker type
const workerType = process.env.WORKER_TYPE;
if (workerType && process.argv[1]?.includes('workers')) {
  void (async () => {
    switch (workerType) {
      case 'trust':
        await runStandaloneTrustWorker();
        break;
      case 'analytics':
        await runStandaloneAnalyticsWorker();
        break;
      case 'all':
        await startAllWorkers();
        break;
      default:
        log.error({ workerType }, 'Unknown worker type');
        process.exit(1);
    }
  })();
}
