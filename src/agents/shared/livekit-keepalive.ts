/**
 * LiveKit Connection Keep-Alive
 *
 * Prevents LiveKit WebSocket connections from going stale on Cloud Run.
 * Cloud Run keeps containers alive based on HTTP health checks, but the
 * LiveKit WebSocket can disconnect due to inactivity.
 *
 * This module:
 * 1. Sends periodic pings to keep the connection alive
 * 2. Monitors connection state
 * 3. Forces container restart when connection dies (so Cloud Run spins up fresh)
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'livekit-keepalive' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// How often to check/ping LiveKit connection
const KEEPALIVE_INTERVAL_MS = 30_000; // 30 seconds

// How long to wait before considering connection dead
const CONNECTION_TIMEOUT_MS = 60_000; // 60 seconds

// Max time a worker can be idle before we force restart
// NOTE: Reduced from 5 minutes to 90 seconds per VOICE-AGENT-AUDIT.md issue #4
// Dead connections were serving 5 minutes of failed calls before recovery
const MAX_IDLE_TIME_MS = 90 * 1000; // 90 seconds

// ============================================================================
// STATE
// ============================================================================

let lastJobDispatchTime = Date.now();
let lastPingTime = Date.now();
let connectionAlive = true;
let keepaliveInterval: NodeJS.Timeout | null = null;
let workerRef: { running: boolean } | null = null;

// ============================================================================
// CONNECTION MONITORING
// ============================================================================

/**
 * Record that a job was dispatched (agent joined a room)
 */
export function recordJobDispatch(): void {
  lastJobDispatchTime = Date.now();
  lastPingTime = Date.now();
  connectionAlive = true;
  log.debug('Job dispatch recorded');
}

/**
 * Record that we received a ping/pong from LiveKit
 */
export function recordPing(): void {
  lastPingTime = Date.now();
  connectionAlive = true;
}

/**
 * Check if the connection is considered alive
 */
export function isConnectionAlive(): boolean {
  const timeSinceLastPing = Date.now() - lastPingTime;
  return connectionAlive && timeSinceLastPing < CONNECTION_TIMEOUT_MS;
}

/**
 * Get connection health status
 */
export function getConnectionStatus(): {
  alive: boolean;
  timeSinceLastJob: number;
  timeSinceLastPing: number;
  idleTime: number;
} {
  const now = Date.now();
  return {
    alive: isConnectionAlive(),
    timeSinceLastJob: now - lastJobDispatchTime,
    timeSinceLastPing: now - lastPingTime,
    idleTime: now - Math.max(lastJobDispatchTime, lastPingTime),
  };
}

// ============================================================================
// KEEP-ALIVE LOGIC
// ============================================================================

/**
 * Check connection health and take action if dead
 */
function checkConnectionHealth(): void {
  const status = getConnectionStatus();

  // If idle too long, the LiveKit WebSocket is probably dead
  // Force a container restart by exiting - Cloud Run will spin up a fresh one
  if (status.idleTime > MAX_IDLE_TIME_MS) {
    log.warn(
      {
        idleTimeMs: status.idleTime,
        timeSinceLastJob: status.timeSinceLastJob,
        timeSinceLastPing: status.timeSinceLastPing,
        action: 'Forcing container restart to recover LiveKit connection',
      },
      'LiveKit worker connection is dead. Container passes health checks but cannot receive room dispatches.'
    );

    // Mark connection as dead
    connectionAlive = false;

    // Force exit - Cloud Run will restart us with a fresh LiveKit connection
    // This is better than serving 502s to users
    process.exit(0);
  }

  // Log health status periodically
  if (status.idleTime > KEEPALIVE_INTERVAL_MS * 2) {
    log.debug(
      {
        alive: status.alive,
        idleSeconds: Math.floor(status.idleTime / 1000),
        maxIdleSeconds: Math.floor(MAX_IDLE_TIME_MS / 1000),
      },
      'LiveKit connection idle'
    );
  }
}

/**
 * Start the keep-alive monitor
 */
export function startKeepalive(worker?: { running: boolean }): void {
  if (keepaliveInterval) {
    log.debug('Keep-alive already running');
    return;
  }

  workerRef = worker || null;
  lastJobDispatchTime = Date.now();
  lastPingTime = Date.now();
  connectionAlive = true;

  keepaliveInterval = setInterval(() => {
    // If worker explicitly stopped, don't check
    if (workerRef && !workerRef.running) {
      return;
    }

    checkConnectionHealth();
  }, KEEPALIVE_INTERVAL_MS);

  // Don't prevent process exit
  keepaliveInterval.unref();

  log.info(
    {
      intervalMs: KEEPALIVE_INTERVAL_MS,
      maxIdleMs: MAX_IDLE_TIME_MS,
    },
    'LiveKit keep-alive monitor started'
  );
}

/**
 * Stop the keep-alive monitor
 */
export function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    log.debug('Keep-alive monitor stopped');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordJobDispatch,
  recordPing,
  isConnectionAlive,
  getConnectionStatus,
  startKeepalive,
  stopKeepalive,
};
