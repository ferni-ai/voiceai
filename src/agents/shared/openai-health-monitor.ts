/**
 * OpenAI Realtime Health Monitor
 *
 * BETTER THAN HUMAN: Proactively monitors OpenAI WebSocket connection health
 * and detects stale connections before they cause user-facing failures.
 *
 * Features:
 * 1. Passive tracking of request success/failure
 * 2. Active ping/pong during idle periods
 * 3. Connection state tracking per session
 * 4. Proactive reconnection when connection appears stale
 * 5. Exponential backoff for reconnection attempts
 * 6. Circuit breaker pattern to prevent hammering failed service
 * 7. Integration with generate-reply-gateway for health status
 * 8. Observability metrics for dashboard
 *
 * @module agents/shared/openai-health-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';
import { markSessionNotReady } from './generate-reply-gateway.js';

const log = createLogger({ module: 'OpenAIHealth' });

// ============================================================================
// CIRCUIT ALERTING INTEGRATION (lazy loaded to avoid circular deps)
// ============================================================================

let alertingModule: typeof import('../../services/self-healing/circuit-alerting.js') | null = null;

async function loadAlertingModule() {
  if (!alertingModule) {
    try {
      alertingModule = await import('../../services/self-healing/circuit-alerting.js');
    } catch (err) {
      log.warn({ error: String(err) }, 'Circuit alerting module not available');
    }
  }
  return alertingModule;
}

/**
 * Notify circuit alerting system of state changes.
 * Mapped from our CircuitState to the alerting module's CircuitState.
 */
async function notifyCircuitStateChange(
  oldState: CircuitState,
  newState: CircuitState,
  details?: { failures?: number; lastError?: string; successRate?: string }
): Promise<void> {
  const alerting = await loadAlertingModule();
  if (!alerting) return;

  // Map our circuit states to the alerting module's expected states
  const mapState = (s: CircuitState): 'closed' | 'open' | 'half_open' => {
    if (s === 'half-open') return 'half_open';
    return s as 'closed' | 'open';
  };

  await alerting.handleCircuitStateChange(
    'openai-realtime',
    mapState(oldState),
    mapState(newState),
    details
  );
}

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
  lastPingAt?: number;
  lastPongAt?: number;
  /** Average response time over last 5 health checks */
  avgResponseTimeMs?: number;
  /** Whether we've triggered a reconnection attempt */
  reconnectionTriggered: boolean;
  /** Number of successful pings */
  pingSuccessCount: number;
  /** Number of failed pings */
  pingFailureCount: number;
  // BETTER THAN HUMAN: Exponential backoff tracking
  /** Number of reconnection attempts */
  reconnectionAttempts: number;
  /** Timestamp of last reconnection attempt */
  lastReconnectionAttemptAt?: number;
  /** Timestamp when next reconnection is allowed */
  nextReconnectionAllowedAt?: number;
}

// ============================================================================
// CIRCUIT BREAKER STATE (Global - affects all sessions)
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt?: number;
  openedAt?: number;
  halfOpenAttempts: number;
}

/** Callback function to perform a ping (provided by agent-setup) */
export type PingCallback = () => Promise<boolean>;

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How often to check connection health during idle periods (ms) */
const HEALTH_CHECK_INTERVAL_MS = 15_000; // Every 15 seconds

/** If no activity in this time, consider doing a health ping (ms) */
const IDLE_THRESHOLD_MS = 20_000; // 20 seconds of no activity

/** If no successful request in this time, consider connection stale (ms) */
const STALE_THRESHOLD_MS = 30_000; // 30 seconds

/** Number of consecutive failures before marking unhealthy */
const FAILURE_THRESHOLD = 2;

/** Recent response times to track for averaging */
const RESPONSE_TIME_HISTORY_SIZE = 5;

/** Timeout for ping operations (ms) */
const PING_TIMEOUT_MS = 5000;

// ============================================================================
// EXPONENTIAL BACKOFF CONFIGURATION
// ============================================================================

/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 1000; // 1 second

/** Maximum backoff delay (ms) */
const BACKOFF_MAX_MS = 30_000; // 30 seconds

/** Backoff multiplier (delay = base * multiplier^attempts) */
const BACKOFF_MULTIPLIER = 2;

/** Add jitter to prevent thundering herd (±percentage) */
const BACKOFF_JITTER_PERCENT = 0.2; // ±20%

/** Maximum reconnection attempts before giving up */
const MAX_RECONNECTION_ATTEMPTS = 5;

// ============================================================================
// CIRCUIT BREAKER CONFIGURATION
// ============================================================================

/** Number of failures before opening circuit */
const CIRCUIT_FAILURE_THRESHOLD = 5;

/** Time circuit stays open before trying half-open (ms) */
const CIRCUIT_OPEN_DURATION_MS = 30_000; // 30 seconds

/** Number of successful requests in half-open to close circuit */
const CIRCUIT_HALF_OPEN_SUCCESS_THRESHOLD = 2;

// ============================================================================
// STATE
// ============================================================================

const connectionHealth = new Map<string, ConnectionHealth>();
const healthCheckIntervals = new Map<string, ReturnType<typeof setInterval>>();
const responseTimeHistory = new Map<string, number[]>();
const pingCallbacks = new Map<string, PingCallback>();

// TTL for orphaned sessions (1 hour) - sessions with no activity are cleaned up
const SESSION_TTL_MS = 60 * 60 * 1000;

// Periodic cleanup interval (10 minutes)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// Track cleanup interval for shutdown
let orphanCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Global circuit breaker state (affects all OpenAI connections)
const circuitBreaker: CircuitBreakerState = {
  state: 'closed',
  failureCount: 0,
  halfOpenAttempts: 0,
};

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
    pingSuccessCount: 0,
    pingFailureCount: 0,
    reconnectionAttempts: 0,
  });
  responseTimeHistory.set(sessionId, []);

  log.info({ sessionId }, '🏥 [HEALTH] Started OpenAI connection health monitoring');

  // Start periodic health check interval
  const interval = setInterval(() => {
    void performIdleHealthCheck(sessionId);
  }, HEALTH_CHECK_INTERVAL_MS);
  healthCheckIntervals.set(sessionId, interval);
}

/**
 * Register a ping callback for active health checks.
 * Call this after session is fully initialized.
 *
 * The callback should attempt a minimal LLM request and return true if successful.
 */
export function registerPingCallback(sessionId: string, callback: PingCallback): void {
  pingCallbacks.set(sessionId, callback);
  log.debug({ sessionId }, '🏥 [HEALTH] Ping callback registered');
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
  pingCallbacks.delete(sessionId);

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
 * Now includes exponential backoff and circuit breaker checks.
 * Returns true if reconnection is allowed.
 */
export function shouldAttemptReconnection(sessionId: string): boolean {
  const health = connectionHealth.get(sessionId);
  if (!health) return false;

  // Don't reconnect if healthy
  if (health.isHealthy) return false;

  // Don't reconnect if we already triggered one (in-flight)
  if (health.reconnectionTriggered) return false;

  // CIRCUIT BREAKER: Check if circuit is open
  if (circuitBreaker.state === 'open') {
    const timeSinceOpened = Date.now() - (circuitBreaker.openedAt || 0);
    if (timeSinceOpened < CIRCUIT_OPEN_DURATION_MS) {
      log.debug(
        { sessionId, circuitState: 'open', timeRemainingMs: CIRCUIT_OPEN_DURATION_MS - timeSinceOpened },
        '🔌 [CIRCUIT] Circuit is OPEN - blocking reconnection'
      );
      return false;
    }
    // Circuit has been open long enough, transition to half-open
    circuitBreaker.state = 'half-open';
    circuitBreaker.halfOpenAttempts = 0;
    log.info({ sessionId }, '🔌 [CIRCUIT] Circuit transitioning to HALF-OPEN');
  }

  // EXPONENTIAL BACKOFF: Check if enough time has passed
  if (health.nextReconnectionAllowedAt && Date.now() < health.nextReconnectionAllowedAt) {
    const waitTimeMs = health.nextReconnectionAllowedAt - Date.now();
    log.debug(
      { sessionId, waitTimeMs, attempts: health.reconnectionAttempts },
      '⏳ [BACKOFF] Reconnection blocked - waiting for backoff'
    );
    return false;
  }

  // MAX ATTEMPTS: Check if we've exceeded the limit
  if (health.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
    log.warn(
      { sessionId, attempts: health.reconnectionAttempts },
      '🛑 [BACKOFF] Max reconnection attempts reached - giving up'
    );
    return false;
  }

  // All checks passed - record this attempt and allow reconnection
  health.reconnectionAttempts++;
  health.lastReconnectionAttemptAt = Date.now();
  health.reconnectionTriggered = true;

  // Calculate next allowed time with exponential backoff + jitter
  const baseDelay = BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, health.reconnectionAttempts - 1);
  const cappedDelay = Math.min(baseDelay, BACKOFF_MAX_MS);
  const jitter = cappedDelay * BACKOFF_JITTER_PERCENT * (Math.random() * 2 - 1);
  const nextDelay = Math.round(cappedDelay + jitter);
  health.nextReconnectionAllowedAt = Date.now() + nextDelay;

  log.info(
    {
      sessionId,
      attempt: health.reconnectionAttempts,
      maxAttempts: MAX_RECONNECTION_ATTEMPTS,
      nextBackoffMs: nextDelay,
      circuitState: circuitBreaker.state,
    },
    '🏥 [HEALTH] Allowing reconnection attempt with backoff'
  );

  return true;
}

/**
 * Reset reconnection state after successful reconnection.
 * Resets backoff counter and updates circuit breaker.
 */
export function clearReconnectionFlag(sessionId: string): void {
  const health = connectionHealth.get(sessionId);
  if (health) {
    health.reconnectionTriggered = false;
    health.isHealthy = true;
    health.consecutiveFailures = 0;
    // Reset backoff on success
    health.reconnectionAttempts = 0;
    health.nextReconnectionAllowedAt = undefined;
  }

  // Update circuit breaker on success
  recordCircuitSuccess();
}

/**
 * Record a failed reconnection attempt.
 * Updates circuit breaker state.
 */
export function recordReconnectionFailure(sessionId: string): void {
  const health = connectionHealth.get(sessionId);
  if (health) {
    health.reconnectionTriggered = false; // Allow future attempts
  }

  // Update circuit breaker on failure
  recordCircuitFailure();
}

// ============================================================================
// EXPONENTIAL BACKOFF HELPERS
// ============================================================================

/**
 * Get the current backoff state for a session.
 */
export function getBackoffState(sessionId: string): {
  attempts: number;
  maxAttempts: number;
  nextAllowedAt?: number;
  isBlocked: boolean;
} {
  const health = connectionHealth.get(sessionId);
  if (!health) {
    return { attempts: 0, maxAttempts: MAX_RECONNECTION_ATTEMPTS, isBlocked: false };
  }

  const isBlocked =
    health.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS ||
    (health.nextReconnectionAllowedAt !== undefined && Date.now() < health.nextReconnectionAllowedAt);

  return {
    attempts: health.reconnectionAttempts,
    maxAttempts: MAX_RECONNECTION_ATTEMPTS,
    nextAllowedAt: health.nextReconnectionAllowedAt,
    isBlocked,
  };
}

/**
 * Reset backoff state for a session (use after manual intervention).
 */
export function resetBackoff(sessionId: string): void {
  const health = connectionHealth.get(sessionId);
  if (health) {
    health.reconnectionAttempts = 0;
    health.nextReconnectionAllowedAt = undefined;
    log.info({ sessionId }, '⏳ [BACKOFF] Backoff state reset');
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Get current circuit breaker state.
 */
export function getCircuitState(): CircuitBreakerState {
  // Check if we should auto-transition from open to half-open
  if (circuitBreaker.state === 'open' && circuitBreaker.openedAt) {
    const timeSinceOpened = Date.now() - circuitBreaker.openedAt;
    if (timeSinceOpened >= CIRCUIT_OPEN_DURATION_MS) {
      circuitBreaker.state = 'half-open';
      circuitBreaker.halfOpenAttempts = 0;
    }
  }
  return { ...circuitBreaker };
}

/**
 * Record a successful request for circuit breaker.
 */
function recordCircuitSuccess(): void {
  const oldState = circuitBreaker.state;

  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.halfOpenAttempts++;
    if (circuitBreaker.halfOpenAttempts >= CIRCUIT_HALF_OPEN_SUCCESS_THRESHOLD) {
      // Enough successes - close the circuit
      circuitBreaker.state = 'closed';
      circuitBreaker.failureCount = 0;
      circuitBreaker.openedAt = undefined;
      circuitBreaker.halfOpenAttempts = 0;
      log.info({}, '🔌 [CIRCUIT] Circuit CLOSED after successful half-open attempts');

      // Send alert for state change
      void notifyCircuitStateChange(oldState, 'closed', {
        successRate: '100%',
      });
    }
  } else if (circuitBreaker.state === 'closed') {
    // Reset failure count on success
    circuitBreaker.failureCount = 0;
  }
}

/**
 * Record a failed request for circuit breaker.
 */
function recordCircuitFailure(): void {
  const oldState = circuitBreaker.state;

  circuitBreaker.failureCount++;
  circuitBreaker.lastFailureAt = Date.now();

  if (circuitBreaker.state === 'half-open') {
    // Failure in half-open - immediately re-open
    circuitBreaker.state = 'open';
    circuitBreaker.openedAt = Date.now();
    circuitBreaker.halfOpenAttempts = 0;
    log.warn({}, '🔌 [CIRCUIT] Circuit re-OPENED after half-open failure');

    // Send alert for state change
    void notifyCircuitStateChange(oldState, 'open', {
      failures: circuitBreaker.failureCount,
      lastError: 'Half-open test failed',
    });
  } else if (circuitBreaker.state === 'closed') {
    if (circuitBreaker.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      // Too many failures - open the circuit
      circuitBreaker.state = 'open';
      circuitBreaker.openedAt = Date.now();
      log.warn(
        { failureCount: circuitBreaker.failureCount },
        '🔌 [CIRCUIT] Circuit OPENED after threshold failures'
      );

      // Send alert for state change (CRITICAL)
      void notifyCircuitStateChange(oldState, 'open', {
        failures: circuitBreaker.failureCount,
        lastError: `Failure threshold (${CIRCUIT_FAILURE_THRESHOLD}) exceeded`,
      });
    }
  }
}

/**
 * Manually reset the circuit breaker (for admin intervention).
 */
export function resetCircuitBreaker(): void {
  circuitBreaker.state = 'closed';
  circuitBreaker.failureCount = 0;
  circuitBreaker.openedAt = undefined;
  circuitBreaker.halfOpenAttempts = 0;
  log.info({}, '🔌 [CIRCUIT] Circuit breaker manually reset');
}

// ============================================================================
// ACTIVE PING/PONG
// ============================================================================

/**
 * Perform a health check during idle periods.
 * Only pings if there's been no activity recently.
 */
async function performIdleHealthCheck(sessionId: string): Promise<void> {
  const health = connectionHealth.get(sessionId);
  if (!health) return;

  health.lastCheckAt = Date.now();

  // Check if we've been idle long enough to warrant a ping
  const lastActivity = Math.max(
    health.lastSuccessfulRequestAt || 0,
    health.lastFailedRequestAt || 0,
    health.lastPongAt || 0
  );

  const timeSinceActivity = Date.now() - lastActivity;

  // Skip ping if there's been recent activity
  if (lastActivity > 0 && timeSinceActivity < IDLE_THRESHOLD_MS) {
    log.debug(
      { sessionId, timeSinceActivityMs: timeSinceActivity },
      '🏥 [HEALTH] Skipping ping - recent activity detected'
    );
    return;
  }

  // Check if connection appears stale
  if (lastActivity > 0 && timeSinceActivity > STALE_THRESHOLD_MS) {
    log.warn(
      { sessionId, timeSinceActivityMs: timeSinceActivity },
      '🏥 [HEALTH] Connection appears stale during idle check'
    );
    health.isHealthy = false;
  }

  // Try to ping if we have a callback
  const pingCallback = pingCallbacks.get(sessionId);
  if (pingCallback) {
    await performPing(sessionId, pingCallback);
  }
}

/**
 * Perform an active ping to check connection health.
 */
async function performPing(sessionId: string, pingCallback: PingCallback): Promise<boolean> {
  const health = connectionHealth.get(sessionId);
  if (!health) return false;

  health.lastPingAt = Date.now();

  try {
    // Race ping against timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Ping timeout')), PING_TIMEOUT_MS);
    });

    const pingPromise = pingCallback();
    const success = await Promise.race([pingPromise, timeoutPromise]);

    if (success) {
      health.lastPongAt = Date.now();
      health.pingSuccessCount++;
      health.isHealthy = true;
      health.consecutiveFailures = 0;

      const pingLatency = health.lastPongAt - health.lastPingAt;
      log.debug(
        { sessionId, pingLatencyMs: pingLatency, pingSuccessCount: health.pingSuccessCount },
        '🏥 [HEALTH] Ping successful'
      );
      return true;
    } else {
      health.pingFailureCount++;
      log.warn(
        { sessionId, pingFailureCount: health.pingFailureCount },
        '🏥 [HEALTH] Ping returned false'
      );
      return false;
    }
  } catch (err) {
    health.pingFailureCount++;
    health.consecutiveFailures++;

    log.warn(
      { sessionId, error: String(err), pingFailureCount: health.pingFailureCount },
      '🏥 [HEALTH] Ping failed'
    );

    // Mark unhealthy after threshold failures
    if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
      health.isHealthy = false;
      log.warn({ sessionId }, '🏥 [HEALTH] Marking unhealthy after ping failures');
    }

    return false;
  }
}

// ============================================================================
// DIAGNOSTICS & OBSERVABILITY
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
  totalPingSuccess: number;
  totalPingFailure: number;
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

  // Calculate total pings
  const totalPingSuccess = all.reduce((sum, h) => sum + h.pingSuccessCount, 0);
  const totalPingFailure = all.reduce((sum, h) => sum + h.pingFailureCount, 0);

  return {
    totalSessions: all.length,
    healthySessions: healthy,
    unhealthySessions: all.length - healthy,
    staleSessions: stale,
    avgResponseTimeMs: Math.round(overallAvg),
    totalPingSuccess,
    totalPingFailure,
  };
}

/**
 * Get detailed health metrics for observability dashboard.
 */
export function getObservabilityMetrics(): {
  openai: {
    connections: {
      total: number;
      healthy: number;
      unhealthy: number;
      stale: number;
    };
    latency: {
      avgResponseTimeMs: number;
      p50ResponseTimeMs: number;
      p95ResponseTimeMs: number;
    };
    pings: {
      success: number;
      failure: number;
      successRate: number;
    };
    circuitBreaker: CircuitBreakerState;
    sessions: Array<{
      sessionId: string;
      isHealthy: boolean;
      consecutiveFailures: number;
      lastActivityMs: number;
      avgResponseTimeMs?: number;
      reconnectionAttempts: number;
    }>;
  };
} {
  const all = Array.from(connectionHealth.values());
  const now = Date.now();

  // Calculate latency percentiles from all response time histories
  const allResponseTimes: number[] = [];
  for (const history of responseTimeHistory.values()) {
    allResponseTimes.push(...history);
  }
  allResponseTimes.sort((a, b) => a - b);

  const p50 = allResponseTimes.length > 0
    ? allResponseTimes[Math.floor(allResponseTimes.length * 0.5)]
    : 0;
  const p95 = allResponseTimes.length > 0
    ? allResponseTimes[Math.floor(allResponseTimes.length * 0.95)]
    : 0;
  const avg = allResponseTimes.length > 0
    ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
    : 0;

  // Calculate ping stats
  const totalPingSuccess = all.reduce((sum, h) => sum + h.pingSuccessCount, 0);
  const totalPingFailure = all.reduce((sum, h) => sum + h.pingFailureCount, 0);
  const totalPings = totalPingSuccess + totalPingFailure;
  const successRate = totalPings > 0 ? totalPingSuccess / totalPings : 1;

  // Build session details
  const sessions = all.map((h) => {
    const lastActivity = Math.max(
      h.lastSuccessfulRequestAt || 0,
      h.lastFailedRequestAt || 0,
      h.lastPongAt || 0
    );
    return {
      sessionId: h.sessionId,
      isHealthy: h.isHealthy,
      consecutiveFailures: h.consecutiveFailures,
      lastActivityMs: lastActivity > 0 ? now - lastActivity : -1,
      avgResponseTimeMs: h.avgResponseTimeMs,
      reconnectionAttempts: h.reconnectionAttempts,
    };
  });

  return {
    openai: {
      connections: {
        total: all.length,
        healthy: all.filter((h) => h.isHealthy).length,
        unhealthy: all.filter((h) => !h.isHealthy).length,
        stale: all.filter(
          (h) => h.lastSuccessfulRequestAt && now - h.lastSuccessfulRequestAt > STALE_THRESHOLD_MS
        ).length,
      },
      latency: {
        avgResponseTimeMs: Math.round(avg),
        p50ResponseTimeMs: Math.round(p50),
        p95ResponseTimeMs: Math.round(p95),
      },
      pings: {
        success: totalPingSuccess,
        failure: totalPingFailure,
        successRate: Math.round(successRate * 100) / 100,
      },
      circuitBreaker: getCircuitState(),
      sessions,
    },
  };
}

// ============================================================================
// PROMETHEUS METRICS EXPORT
// ============================================================================

/**
 * Export metrics in Prometheus text format for Grafana dashboards.
 *
 * Metrics exported:
 * - openai_realtime_connections_total: Total connections by state
 * - openai_realtime_latency_ms: Response time percentiles
 * - openai_realtime_pings_total: Ping success/failure counts
 * - openai_realtime_circuit_state: Circuit breaker state (0=closed, 1=open, 2=half-open)
 * - openai_realtime_reconnection_attempts_total: Reconnection attempts
 */
export function exportPrometheusMetrics(): string {
  const metrics = getObservabilityMetrics();
  const cb = metrics.openai.circuitBreaker;
  const conn = metrics.openai.connections;
  const lat = metrics.openai.latency;
  const pings = metrics.openai.pings;

  // Map circuit state to numeric value
  const circuitStateValue = cb.state === 'closed' ? 0 : cb.state === 'open' ? 1 : 2;

  // Calculate total reconnection attempts across all sessions
  const totalReconnectionAttempts = metrics.openai.sessions.reduce(
    (sum, s) => sum + s.reconnectionAttempts,
    0
  );

  return [
    `# HELP openai_realtime_connections_total Number of OpenAI Realtime connections`,
    `# TYPE openai_realtime_connections_total gauge`,
    `openai_realtime_connections_total{state="total"} ${conn.total}`,
    `openai_realtime_connections_total{state="healthy"} ${conn.healthy}`,
    `openai_realtime_connections_total{state="unhealthy"} ${conn.unhealthy}`,
    `openai_realtime_connections_total{state="stale"} ${conn.stale}`,
    ``,
    `# HELP openai_realtime_latency_ms Response latency in milliseconds`,
    `# TYPE openai_realtime_latency_ms gauge`,
    `openai_realtime_latency_ms{quantile="0.5"} ${lat.p50ResponseTimeMs}`,
    `openai_realtime_latency_ms{quantile="0.95"} ${lat.p95ResponseTimeMs}`,
    `openai_realtime_latency_ms{quantile="avg"} ${lat.avgResponseTimeMs}`,
    ``,
    `# HELP openai_realtime_pings_total Total ping operations by result`,
    `# TYPE openai_realtime_pings_total counter`,
    `openai_realtime_pings_total{result="success"} ${pings.success}`,
    `openai_realtime_pings_total{result="failure"} ${pings.failure}`,
    ``,
    `# HELP openai_realtime_ping_success_rate Ping success rate (0-1)`,
    `# TYPE openai_realtime_ping_success_rate gauge`,
    `openai_realtime_ping_success_rate ${pings.successRate}`,
    ``,
    `# HELP openai_realtime_circuit_state Circuit breaker state (0=closed, 1=open, 2=half-open)`,
    `# TYPE openai_realtime_circuit_state gauge`,
    `openai_realtime_circuit_state ${circuitStateValue}`,
    ``,
    `# HELP openai_realtime_circuit_failures_total Total circuit breaker failures`,
    `# TYPE openai_realtime_circuit_failures_total counter`,
    `openai_realtime_circuit_failures_total ${cb.failureCount}`,
    ``,
    `# HELP openai_realtime_reconnection_attempts_total Total reconnection attempts`,
    `# TYPE openai_realtime_reconnection_attempts_total counter`,
    `openai_realtime_reconnection_attempts_total ${totalReconnectionAttempts}`,
  ].join('\n');
}

// ============================================================================
// ORPHAN CLEANUP (Prevent unbounded Map growth)
// ============================================================================

/**
 * Clean up sessions that haven't had any activity within TTL.
 * This prevents memory leaks from sessions that exit without calling stopHealthMonitoring.
 */
export function cleanupOrphanedSessions(): number {
  const now = Date.now();
  const orphanedSessions: string[] = [];

  for (const [sessionId, health] of connectionHealth.entries()) {
    // Get the most recent activity timestamp
    const lastActivity = Math.max(
      health.lastSuccessfulRequestAt || 0,
      health.lastFailedRequestAt || 0,
      health.lastPongAt || 0,
      health.lastCheckAt || 0
    );

    // If no activity ever recorded, use a fallback
    const activityAge = lastActivity > 0 ? now - lastActivity : SESSION_TTL_MS + 1;

    if (activityAge > SESSION_TTL_MS) {
      orphanedSessions.push(sessionId);
    }
  }

  if (orphanedSessions.length > 0) {
    log.warn(
      { count: orphanedSessions.length, sessions: orphanedSessions.slice(0, 5) },
      '🏥 [HEALTH] Cleaning up orphaned sessions'
    );
  }

  for (const sessionId of orphanedSessions) {
    stopHealthMonitoring(sessionId);
  }

  return orphanedSessions.length;
}

/**
 * Start periodic orphan cleanup (call once at startup).
 */
export function startOrphanCleanup(): void {
  if (orphanCleanupInterval) {
    log.debug('🏥 [HEALTH] Orphan cleanup already running');
    return;
  }

  orphanCleanupInterval = setInterval(() => {
    try {
      cleanupOrphanedSessions();
    } catch (err) {
      log.warn({ error: String(err) }, '🏥 [HEALTH] Orphan cleanup failed');
    }
  }, CLEANUP_INTERVAL_MS);

  log.info('🏥 [HEALTH] Started orphan cleanup interval');
}

/**
 * Stop periodic orphan cleanup.
 */
export function stopOrphanCleanup(): void {
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
    log.debug('🏥 [HEALTH] Stopped orphan cleanup interval');
  }
}

/**
 * Clear all state (for testing or complete shutdown).
 */
export function clearAllState(): void {
  // Stop orphan cleanup
  stopOrphanCleanup();

  // Clear all intervals
  for (const [sessionId, interval] of healthCheckIntervals.entries()) {
    clearInterval(interval);
  }

  // Clear all maps
  connectionHealth.clear();
  healthCheckIntervals.clear();
  responseTimeHistory.clear();
  pingCallbacks.clear();

  // Reset circuit breaker
  circuitBreaker.state = 'closed';
  circuitBreaker.failureCount = 0;
  circuitBreaker.halfOpenAttempts = 0;
  circuitBreaker.lastFailureAt = undefined;
  circuitBreaker.openedAt = undefined;

  log.info('🏥 [HEALTH] Cleared all health monitor state');
}

export default {
  startHealthMonitoring,
  stopHealthMonitoring,
  registerPingCallback,
  recordSuccessfulRequest,
  recordFailedRequest,
  isConnectionHealthy,
  getConnectionHealthStats,
  getAllHealthStats,
  shouldAttemptReconnection,
  clearReconnectionFlag,
  recordReconnectionFailure,
  getBackoffState,
  resetBackoff,
  getCircuitState,
  resetCircuitBreaker,
  getHealthSummary,
  getObservabilityMetrics,
  exportPrometheusMetrics,
  cleanupOrphanedSessions,
  startOrphanCleanup,
  stopOrphanCleanup,
  clearAllState,
};
