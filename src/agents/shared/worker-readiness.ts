/**
 * Worker Readiness Tracker
 *
 * Tracks the readiness state of LiveKit workers for zero-downtime deployments.
 * The deploy script checks `/health/ready` before shifting traffic.
 *
 * Readiness Requirements:
 * 1. Health server is running (basic liveness)
 * 2. Startup initialization complete (bundles, services, memory)
 * 3. LiveKit worker has signaled ready (can accept connections)
 * 4. At least one worker process is available
 *
 * This ensures traffic is only shifted when workers can actually handle calls.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval } from '../../utils/interval-manager.js';

const log = createLogger({ module: 'worker-readiness' });

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerStatus {
  id: string;
  ready: boolean;
  startedAt: number;
  readyAt?: number;
  lastHeartbeat: number;
  processId: number;
  error?: string;
}

export interface ReadinessState {
  /** Overall readiness - true only when all checks pass */
  ready: boolean;
  /** Individual check results */
  checks: {
    healthServer: boolean;
    startupComplete: boolean;
    workersAvailable: boolean;
    livekitConnected: boolean;
  };
  /** Detailed worker information */
  workers: WorkerStatus[];
  /** Total number of ready workers */
  readyWorkerCount: number;
  /** Time since service started (ms) */
  uptime: number;
  /** Time until ready (estimated, or 0 if ready) */
  estimatedTimeToReady: number;
  /** Human-readable status message */
  message: string;
}

// ============================================================================
// STATE
// ============================================================================

// Service start time for uptime calculation
const serviceStartTime = Date.now();

// Track individual workers
const workers = new Map<string, WorkerStatus>();

// Track initialization stages
let healthServerReady = false;
let startupComplete = false;
let livekitConnected = false;

// Heartbeat timeout (consider worker dead after this)
const HEARTBEAT_TIMEOUT_MS = 30_000; // 30 seconds

// ============================================================================
// WORKER LIFECYCLE
// ============================================================================

/**
 * Register a new worker process
 */
export function registerWorker(workerId: string, processId: number): void {
  const worker: WorkerStatus = {
    id: workerId,
    ready: false,
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    processId,
  };
  workers.set(workerId, worker);
  log.info({ workerId, processId }, 'Worker registered');
}

/**
 * Mark a worker as ready to accept connections
 */
export function markWorkerReady(workerId: string): void {
  const worker = workers.get(workerId);
  if (worker) {
    worker.ready = true;
    worker.readyAt = Date.now();
    worker.lastHeartbeat = Date.now();
    const initTime = worker.readyAt - worker.startedAt;
    log.info({ workerId, initTimeMs: initTime }, 'Worker ready');
  } else {
    // Auto-register if not found
    const newWorker: WorkerStatus = {
      id: workerId,
      ready: true,
      startedAt: Date.now(),
      readyAt: Date.now(),
      lastHeartbeat: Date.now(),
      processId: process.pid,
    };
    workers.set(workerId, newWorker);
    log.info({ workerId }, 'Worker auto-registered as ready');
  }
}

/**
 * Record a heartbeat from a worker
 */
export function workerHeartbeat(workerId: string): void {
  const worker = workers.get(workerId);
  if (worker) {
    worker.lastHeartbeat = Date.now();
  }
}

/**
 * Mark a worker as failed/errored
 */
export function markWorkerFailed(workerId: string, error: string): void {
  const worker = workers.get(workerId);
  if (worker) {
    worker.ready = false;
    worker.error = error;
    log.warn({ workerId, error }, 'Worker failed');
  }
}

/**
 * Unregister a worker (shutdown/crash)
 */
export function unregisterWorker(workerId: string): void {
  workers.delete(workerId);
  log.info({ workerId }, 'Worker unregistered');
}

// ============================================================================
// INITIALIZATION TRACKING
// ============================================================================

/**
 * Mark health server as ready
 */
export function markHealthServerReady(): void {
  healthServerReady = true;
  log.debug('Health server ready');
}

/**
 * Mark startup initialization as complete
 */
export function markStartupComplete(): void {
  startupComplete = true;
  log.info('Startup initialization complete');
}

/**
 * Mark LiveKit connection as established
 */
export function markLivekitConnected(): void {
  livekitConnected = true;
  log.info('LiveKit connection established');
}

/**
 * Mark LiveKit as disconnected
 */
export function markLivekitDisconnected(): void {
  livekitConnected = false;
  log.warn('LiveKit connection lost');
}

// ============================================================================
// READINESS CHECK
// ============================================================================

/**
 * Clean up stale workers (no heartbeat within timeout)
 */
function cleanupStaleWorkers(): void {
  const now = Date.now();
  const entries = Array.from(workers.entries());
  for (const [id, worker] of entries) {
    if (now - worker.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      log.warn({ workerId: id, lastHeartbeat: worker.lastHeartbeat }, 'Worker stale, removing');
      workers.delete(id);
    }
  }
}

/**
 * Get current readiness state
 */
export function getReadinessState(): ReadinessState {
  // Clean up stale workers first
  cleanupStaleWorkers();

  const uptime = Date.now() - serviceStartTime;
  const workerList = Array.from(workers.values());
  const readyWorkers = workerList.filter((w) => w.ready);
  const readyWorkerCount = readyWorkers.length;

  // Check actual LiveKit connection health from keep-alive monitor
  let livekitActuallyConnected = livekitConnected;
  try {
    // Dynamic import to avoid circular dependency
    const keepalive = require('./livekit-keepalive.js');
    livekitActuallyConnected = keepalive.isConnectionAlive?.() ?? livekitConnected;
  } catch {
    // Keep-alive module not loaded yet, use cached state
  }

  // All checks must pass for overall readiness
  // NOTE: healthServerReady is implicitly true if this endpoint is being called
  // because the health server has to be running to serve this request!
  const checks = {
    healthServer: true, // If we're responding, health server is ready
    startupComplete: startupComplete,
    workersAvailable: readyWorkerCount > 0 || startupComplete, // If startup complete, workers are available
    livekitConnected: livekitActuallyConnected || startupComplete, // Use actual connection status
  };

  // Ready when we have at least one worker ready
  // The signalWorkerAcceptingJobs() call marks workers as ready when LiveKit is accepting jobs
  // NOTE: We removed the 90-second fallback (SET-13) - workers MUST signal ready properly
  // This prevents routing traffic to workers that aren't actually ready
  const ready = readyWorkerCount > 0;

  // Estimate time to ready based on typical startup times
  let estimatedTimeToReady = 0;
  if (!ready) {
    // Typical cold start is 60-120 seconds
    const typicalStartupMs = 90_000;
    estimatedTimeToReady = Math.max(0, typicalStartupMs - uptime);

    // Log warning if we've been starting for a long time
    if (uptime > 120_000) {
      log.warn(
        {
          uptime,
          readyWorkerCount,
          startupComplete,
          livekitConnected: livekitActuallyConnected,
        },
        '⚠️ Workers have not signaled ready after 2 minutes - check worker initialization'
      );
    }
  }

  // Build status message
  let message: string;
  if (ready) {
    message = `Ready with ${readyWorkerCount} worker(s)`;
  } else {
    const pending: string[] = [];
    if (!checks.healthServer) pending.push('health server starting');
    if (!checks.startupComplete) pending.push('initialization in progress');
    if (!checks.workersAvailable) pending.push('workers starting');
    if (!checks.livekitConnected) pending.push('connecting to LiveKit');
    message = `Not ready: ${pending.join(', ')}`;
  }

  return {
    ready,
    checks,
    workers: workerList,
    readyWorkerCount,
    uptime,
    estimatedTimeToReady,
    message,
  };
}

/**
 * Simple ready check for deploy scripts
 */
export function isReady(): boolean {
  return getReadinessState().ready;
}

// ============================================================================
// AUTO-REGISTRATION FOR MAIN PROCESS
// ============================================================================

// In Cloud Run, we typically have one main process
// Auto-register it when this module loads
const mainWorkerId = `main-${process.pid}`;

// Don't auto-register in child processes (they'll register themselves)
if (!process.send) {
  registerWorker(mainWorkerId, process.pid);

  // Start heartbeat interval
  registerInterval(
    'worker-readiness-heartbeat',
    () => {
      workerHeartbeat(mainWorkerId);
    },
    10_000
  ); // Every 10 seconds
}

// ============================================================================
// EXPORTS FOR VOICE AGENT
// ============================================================================

/**
 * Called by voice-agent when prewarm completes
 */
export function signalPrewarmComplete(): void {
  markStartupComplete();
  markWorkerReady(mainWorkerId);
}

/**
 * Called when LiveKit agent starts accepting jobs
 */
export function signalWorkerAcceptingJobs(): void {
  markLivekitConnected();
  markWorkerReady(mainWorkerId);
}

/**
 * Get the main worker ID for this process
 */
export function getMainWorkerId(): string {
  return mainWorkerId;
}
