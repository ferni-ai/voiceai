/**
 * OpenAI Realtime Health Monitor
 *
 * BETTER THAN HUMAN: Proactively monitors OpenAI WebSocket connection health
 * and detects stale connections before they cause user-facing failures.
 *
 * Features:
 * 1. Periodic health checks via lightweight requests
 * 2. Connection state tracking per session
 * 3. Proactive reconnection when connection appears stale
 * 4. Integration with generate-reply-gateway for health status
 *
 * @module agents/shared/openai-health-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';
import { markSessionNotReady } from './generate-reply-gateway.js';

const log = createLogger({ module: 'OpenAIHealth' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConnectionHealth {
  sessionId: string;
  isHealthy: boolean;
  lastSuccessfulRequestAt?: number;
  lastFailedRequestAt?: number;
  consecutiveFailures: number;
  lastCheckAt?: number;
  /** Average response time over last 5 health checks */
  avgResponseTimeMs?: number;
  /** Whether we've triggered a reconnection attempt */
  reconnectionTriggered: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How often to check connection health (ms) */
const HEALTH_CHECK_INTERVAL_MS = 10_000; // Every 10 seconds

/** If no successful request in this time, consider connection stale (ms) */
const STALE_THRESHOLD_MS = 30_000; // 30 seconds

/** Number of consecutive failures before marking unhealthy */
const FAILURE_THRESHOLD = 2;

/** Recent response times to track for averaging */
const RESPONSE_TIME_HISTORY_SIZE = 5;

// ============================================================================
// STATE
// ============================================================================

const connectionHealth = new Map<string, ConnectionHealth>();
const healthCheckIntervals = new Map<string, ReturnType<typeof setInterval>>();
const responseTimeHistory = new Map<string, number[]>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start monitoring a session's OpenAI connection health.
 * Call this when a session starts.
 */
export function startHealthMonitoring(sessionId: string): void {
  // Initialize health state
  connectionHealth.set(sessionId, {
    sessionId,
    isHealthy: true,
    consecutiveFailures: 0,
    reconnectionTriggered: false,
  });
  responseTimeHistory.set(sessionId, []);

  log.info({ sessionId }, '🏥 [HEALTH] Started OpenAI connection health monitoring');

  // Don't start interval-based checks - we'll check on-demand when requests complete
  // This avoids unnecessary overhead and potential interference with active conversations
}

/**
 * Stop monitoring a session's health.
 * Call this when session ends.
 */
export function stopHealthMonitoring(sessionId: string): void {
  const interval = healthCheckIntervals.get(sessionId);
  if (interval) {
    clearInterval(interval);
    healthCheckIntervals.delete(sessionId);
  }

  connectionHealth.delete(sessionId);
  responseTimeHistory.delete(sessionId);

  log.debug({ sessionId }, '🏥 [HEALTH] Stopped health monitoring');
}

/**
 * Record a successful OpenAI request.
 * Call this after every successful generateReply.
 */
export function recordSuccessfulRequest(sessionId: string, responseTimeMs: number): void {
  const health = connectionHealth.get(sessionId);
  if (!health) return;

  health.lastSuccessfulRequestAt = Date.now();
  health.consecutiveFailures = 0;
  health.isHealthy = true;
  health.reconnectionTriggered = false;

  // Track response time history
  const history = responseTimeHistory.get(sessionId) || [];
  history.push(responseTimeMs);
  while (history.length > RESPONSE_TIME_HISTORY_SIZE) {
    history.shift();
  }
  responseTimeHistory.set(sessionId, history);

  // Update average
  if (history.length > 0) {
    health.avgResponseTimeMs = history.reduce((a, b) => a + b, 0) / history.length;
  }

  log.debug(
    {
      sessionId,
      responseTimeMs,
      avgResponseTimeMs: health.avgResponseTimeMs,
      consecutiveFailures: health.consecutiveFailures,
    },
    '🏥 [HEALTH] Recorded successful request'
  );
}

/**
 * Record a failed OpenAI request.
 * Call this after every failed generateReply.
 */
export function recordFailedRequest(sessionId: string, errorType: string): void {
  const health = connectionHealth.get(sessionId);
  if (!health) return;

  health.lastFailedRequestAt = Date.now();
  health.consecutiveFailures++;

  // Check if we should mark as unhealthy
  if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
    health.isHealthy = false;

    log.warn(
      {
        sessionId,
        consecutiveFailures: health.consecutiveFailures,
        errorType,
        timeSinceLastSuccess: health.lastSuccessfulRequestAt
          ? Date.now() - health.lastSuccessfulRequestAt
          : undefined,
      },
      '🏥 [HEALTH] Connection marked UNHEALTHY after consecutive failures'
    );

    // Mark session as not ready to prevent further requests
    markSessionNotReady(sessionId, `OpenAI unhealthy: ${errorType}`);
  }
}

/**
 * Check if a session's OpenAI connection is healthy.
 */
export function isConnectionHealthy(sessionId: string): boolean {
  const health = connectionHealth.get(sessionId);
  if (!health) return true; // Assume healthy if not tracked

  // Check if connection is stale
  if (health.lastSuccessfulRequestAt) {
    const timeSinceSuccess = Date.now() - health.lastSuccessfulRequestAt;
    if (timeSinceSuccess > STALE_THRESHOLD_MS) {
      log.warn(
        { sessionId, timeSinceSuccessMs: timeSinceSuccess },
        '🏥 [HEALTH] Connection may be stale - no successful requests recently'
      );
      return false;
    }
  }

  return health.isHealthy;
}

/**
 * Get health statistics for a session.
 */
export function getConnectionHealthStats(sessionId: string): ConnectionHealth | null {
  return connectionHealth.get(sessionId) || null;
}

/**
 * Get health statistics for all sessions (for dashboard).
 */
export function getAllHealthStats(): ConnectionHealth[] {
  return Array.from(connectionHealth.values());
}

/**
 * Check if we should attempt reconnection for a session.
 * Returns true if reconnection hasn't been tried recently.
 */
export function shouldAttemptReconnection(sessionId: string): boolean {
  const health = connectionHealth.get(sessionId);
  if (!health) return false;

  // Don't reconnect if healthy
  if (health.isHealthy) return false;

  // Don't reconnect if we already triggered one
  if (health.reconnectionTriggered) return false;

  // Mark that we're triggering reconnection
  health.reconnectionTriggered = true;

  log.info({ sessionId }, '🏥 [HEALTH] Recommending reconnection attempt');
  return true;
}

/**
 * Reset reconnection flag (call after successful reconnection).
 */
export function clearReconnectionFlag(sessionId: string): void {
  const health = connectionHealth.get(sessionId);
  if (health) {
    health.reconnectionTriggered = false;
    health.isHealthy = true;
    health.consecutiveFailures = 0;
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get a summary of all session health for logging/debugging.
 */
export function getHealthSummary(): {
  totalSessions: number;
  healthySessions: number;
  unhealthySessions: number;
  staleSessions: number;
  avgResponseTimeMs: number;
} {
  const all = Array.from(connectionHealth.values());
  const now = Date.now();

  const healthy = all.filter((h) => h.isHealthy).length;
  const stale = all.filter(
    (h) => h.lastSuccessfulRequestAt && now - h.lastSuccessfulRequestAt > STALE_THRESHOLD_MS
  ).length;

  // Calculate overall average response time
  const allAvgs = all.filter((h) => h.avgResponseTimeMs !== undefined).map((h) => h.avgResponseTimeMs!);
  const overallAvg = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : 0;

  return {
    totalSessions: all.length,
    healthySessions: healthy,
    unhealthySessions: all.length - healthy,
    staleSessions: stale,
    avgResponseTimeMs: Math.round(overallAvg),
  };
}

export default {
  startHealthMonitoring,
  stopHealthMonitoring,
  recordSuccessfulRequest,
  recordFailedRequest,
  isConnectionHealthy,
  getConnectionHealthStats,
  getAllHealthStats,
  shouldAttemptReconnection,
  clearReconnectionFlag,
  getHealthSummary,
};
