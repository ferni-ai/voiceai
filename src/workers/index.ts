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

/* eslint-disable no-restricted-imports -- Workers need direct service imports */

export * from './analytics-worker.js';
export * from './base-worker.js';
export * from './trust-worker.js';
export * from './embedding-worker.js';
export * from './summarization-worker.js';
export * from './audio-analysis-pool.js';
export * from './predictions-worker.js';
// NOTE: OutreachWorker is exported but NOT started with other workers.
// It's a Cloud Run JOB (batch processor) that runs on a schedule,
// not a persistent event-driven worker. See outreach-worker.ts for usage.
export * from './outreach-worker.js';

import { createLogger } from '../utils/safe-logger.js';
import { resilienceMetrics } from '../services/observability/resilience-metrics.js';
import { getAnalyticsWorker, startAnalyticsWorker } from './analytics-worker.js';
import { getTrustWorker, startTrustWorker } from './trust-worker.js';
import { getEmbeddingWorker, startEmbeddingWorker } from './embedding-worker.js';
import { getSummarizationWorker, startSummarizationWorker } from './summarization-worker.js';
import { initializeAudioAnalysisPool, shutdownAudioAnalysisPool } from './audio-analysis-pool.js';
import {
  getPredictionsWorker,
  startPredictionsWorker,
  stopPredictionsWorker,
} from './predictions-worker.js';

const log = createLogger({ module: 'Workers' });

// ============================================================================
// WORKER MANAGEMENT
// ============================================================================

let workersStarted = false;
let workersStarting = false; // Prevents race condition during startup

/** Default timeout for worker startup (30 seconds) */
const WORKER_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Create a timeout promise that rejects after the specified duration.
 * Returns the timer ID alongside the promise so it can be cleared.
 */
function createTimeout(
  ms: number,
  operation: string
): { promise: Promise<never>; timerId: ReturnType<typeof setTimeout> } {
  let timerId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`${operation} timeout after ${ms}ms`));
    }, ms);
  });
  return { promise, timerId: timerId! };
}

/**
 * Start all background workers with timeout protection.
 * Call this during application startup for local worker processing.
 *
 * @param timeoutMs - Maximum time to wait for workers to start (default: 30s)
 * @throws Error if workers fail to start within timeout
 */
export async function startAllWorkers(timeoutMs = WORKER_STARTUP_TIMEOUT_MS): Promise<void> {
  if (workersStarted) {
    log.debug('Workers already started');
    return;
  }

  // Prevent race condition: check if startup is already in progress
  if (workersStarting) {
    log.debug('Workers startup already in progress');
    return;
  }
  workersStarting = true;

  log.info({ timeoutMs }, 'Starting background workers');
  const start = Date.now();

  try {
    // Start all event-based workers in parallel WITH TIMEOUT
    const timeout = createTimeout(timeoutMs, 'Worker startup');
    try {
      await Promise.race([
        Promise.all([
          startTrustWorker(),
          startAnalyticsWorker(),
          startEmbeddingWorker(),
          startSummarizationWorker(),
          startPredictionsWorker(),
        ]),
        timeout.promise,
      ]);
    } finally {
      clearTimeout(timeout.timerId);
    }

    // Initialize audio analysis worker pool (uses worker_threads)
    // This is non-critical, wrapped in try/catch
    try {
      initializeAudioAnalysisPool();
      log.info('Audio analysis worker pool initialized');
    } catch (audioPoolError) {
      // Non-critical - fallback to main thread analysis
      log.debug(
        { error: String(audioPoolError) },
        'Audio analysis pool init skipped (non-critical)'
      );
    }

    // eslint-disable-next-line require-atomic-updates -- Variables only modified in this function
    workersStarted = true;
    // eslint-disable-next-line require-atomic-updates -- Variables only modified in this function
    workersStarting = false;
    const elapsed = Date.now() - start;
    log.info({ elapsedMs: elapsed }, 'Background workers started');

    // Record successful startup metrics
    resilienceMetrics.recordWorkerEvent('all-workers', 'startup', elapsed, true);
  } catch (error) {
    // eslint-disable-next-line require-atomic-updates -- Variables only modified in this function
    workersStarting = false;
    const elapsed = Date.now() - start;
    const isTimeout = String(error).includes('timeout');

    // Record failure metrics
    resilienceMetrics.recordWorkerEvent(
      'all-workers',
      isTimeout ? 'timeout' : 'error',
      elapsed,
      false,
      String(error)
    );

    log.error({ error: String(error), elapsedMs: elapsed }, 'Worker startup failed');
    throw error; // Re-throw to signal startup failure to caller
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
    stopPredictionsWorker(),
    shutdownAudioAnalysisPool(),
  ]);

  // eslint-disable-next-line require-atomic-updates -- Variables only modified in this function
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
    predictions: getPredictionsWorker().getStats(),
    embedding: getEmbeddingWorker().getStats(),
    summarization: getSummarizationWorker().getStats(),
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

/**
 * Run as standalone predictions worker (for separate Cloud Run service).
 *
 * Usage:
 * ```bash
 * WORKER_TYPE=predictions node dist/workers/index.js
 * ```
 */
export async function runStandalonePredictionsWorker(): Promise<void> {
  log.info('Starting standalone predictions worker');

  await startPredictionsWorker();
  const worker = getPredictionsWorker();

  // Handle shutdown
  process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down');
    void worker.stop().then(() => process.exit(0));
  });

  log.info('Predictions worker running');
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
      case 'predictions':
        await runStandalonePredictionsWorker();
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
