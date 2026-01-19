/**
 * Session Health Monitor
 *
 * Monitors session health to detect and combat Gemini's function calling
 * degradation over extended conversations ("session state decay").
 *
 * Research (Jan 2026) shows that Gemini's function calling becomes less
 * reliable after extended sessions. This module:
 * 1. Tracks tool call success/failure patterns
 * 2. Detects consecutive leakages (model stuck)
 * 3. Triggers context refresh when health degrades
 *
 * @module agents/shared/session-health-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'session-health-monitor' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionHealth {
  /** Total turn count in this session */
  turnCount: number;
  /** Turn number of last successful tool call */
  lastToolCallTurn: number;
  /** Count of consecutive tool call leakages */
  consecutiveLeakages: number;
  /** Total successful tool calls */
  totalToolCalls: number;
  /** Total tool call leakages */
  totalLeakages: number;
  /** Whether the session should be refreshed */
  shouldRefresh: boolean;
  /** Reason for refresh recommendation */
  refreshReason: string | null;
  /** Timestamp of last health check */
  lastCheckTime: number;
}

export interface HealthMonitorConfig {
  /** Max consecutive leakages before triggering refresh */
  maxConsecutiveLeakages: number;
  /** Max turns without tool call before considering refresh */
  maxTurnsWithoutToolCall: number;
  /** Whether to auto-refresh when thresholds are exceeded */
  autoRefresh: boolean;
  /** Log health metrics periodically */
  logMetrics: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: HealthMonitorConfig = {
  maxConsecutiveLeakages: 3,
  maxTurnsWithoutToolCall: 10,
  autoRefresh: true,
  logMetrics: true,
};

// ============================================================================
// SESSION HEALTH TRACKING
// ============================================================================

/**
 * Session health data (keyed by session ID)
 */
const sessionHealthMap = new Map<string, SessionHealth>();

/**
 * Refresh callbacks (keyed by session ID)
 */
const refreshCallbacks = new Map<string, () => Promise<void>>();

/**
 * Configuration (can be overridden per session)
 */
let globalConfig: HealthMonitorConfig = { ...DEFAULT_CONFIG };

/**
 * Create initial health state for a session
 */
function createInitialHealth(): SessionHealth {
  return {
    turnCount: 0,
    lastToolCallTurn: 0,
    consecutiveLeakages: 0,
    totalToolCalls: 0,
    totalLeakages: 0,
    shouldRefresh: false,
    refreshReason: null,
    lastCheckTime: Date.now(),
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize health monitoring for a session.
 *
 * @param sessionId - Unique session identifier
 * @param refreshCallback - Optional callback to execute when refresh is needed
 */
export function initializeHealthMonitor(
  sessionId: string,
  refreshCallback?: () => Promise<void>
): void {
  sessionHealthMap.set(sessionId, createInitialHealth());

  if (refreshCallback) {
    refreshCallbacks.set(sessionId, refreshCallback);
  }

  log.debug({ sessionId }, '🏥 Session health monitor initialized');
}

/**
 * Record a successful tool call.
 *
 * @param sessionId - Session identifier
 */
export function recordToolCallSuccess(sessionId: string): void {
  const health = sessionHealthMap.get(sessionId);
  if (!health) return;

  health.totalToolCalls++;
  health.lastToolCallTurn = health.turnCount;
  health.consecutiveLeakages = 0; // Reset on success
  health.shouldRefresh = false;
  health.refreshReason = null;

  log.debug(
    { sessionId, totalToolCalls: health.totalToolCalls, turn: health.turnCount },
    '✅ Tool call success recorded'
  );
}

/**
 * Record a tool call leakage (model spoke instead of calling tool).
 *
 * @param sessionId - Session identifier
 * @param toolName - Name of the tool that should have been called
 */
export function recordToolCallLeakage(sessionId: string, toolName?: string): void {
  const health = sessionHealthMap.get(sessionId);
  if (!health) return;

  health.totalLeakages++;
  health.consecutiveLeakages++;

  log.warn(
    {
      sessionId,
      toolName,
      consecutiveLeakages: health.consecutiveLeakages,
      totalLeakages: health.totalLeakages,
      turn: health.turnCount,
    },
    '🚨 Tool call leakage recorded'
  );

  // Check if we should refresh
  checkAndTriggerRefresh(sessionId, health);
}

/**
 * Record a new conversation turn.
 *
 * @param sessionId - Session identifier
 */
export function recordTurn(sessionId: string): void {
  const health = sessionHealthMap.get(sessionId);
  if (!health) return;

  health.turnCount++;
  health.lastCheckTime = Date.now();

  // Check for long gap without tool calls
  const turnsSinceLastToolCall = health.turnCount - health.lastToolCallTurn;
  if (
    turnsSinceLastToolCall >= globalConfig.maxTurnsWithoutToolCall &&
    health.totalToolCalls > 0 // Only if we've had tool calls before
  ) {
    health.shouldRefresh = true;
    health.refreshReason = `No tool calls for ${turnsSinceLastToolCall} turns (possible session decay)`;
    checkAndTriggerRefresh(sessionId, health);
  }

  // Log metrics periodically
  if (globalConfig.logMetrics && health.turnCount % 10 === 0) {
    logHealthMetrics(sessionId, health);
  }
}

/**
 * Get current health status for a session.
 *
 * @param sessionId - Session identifier
 * @returns Current health state or null if not tracked
 */
export function getSessionHealth(sessionId: string): SessionHealth | null {
  return sessionHealthMap.get(sessionId) ?? null;
}

/**
 * Check if session should be refreshed.
 *
 * @param sessionId - Session identifier
 * @returns Whether refresh is recommended
 */
export function shouldRefreshSession(sessionId: string): boolean {
  const health = sessionHealthMap.get(sessionId);
  return health?.shouldRefresh ?? false;
}

/**
 * Get refresh reason if refresh is recommended.
 *
 * @param sessionId - Session identifier
 * @returns Refresh reason or null
 */
export function getRefreshReason(sessionId: string): string | null {
  const health = sessionHealthMap.get(sessionId);
  return health?.refreshReason ?? null;
}

/**
 * Manually trigger a session refresh.
 *
 * @param sessionId - Session identifier
 * @param reason - Reason for manual refresh
 */
export async function triggerRefresh(sessionId: string, reason: string): Promise<boolean> {
  const health = sessionHealthMap.get(sessionId);
  if (!health) return false;

  log.info({ sessionId, reason }, '🔄 Manual session refresh triggered');

  const callback = refreshCallbacks.get(sessionId);
  if (callback) {
    try {
      await callback();
      resetHealthAfterRefresh(sessionId);
      return true;
    } catch (error) {
      log.error({ sessionId, error: String(error) }, '❌ Session refresh failed');
      return false;
    }
  }

  return false;
}

/**
 * Clear health monitoring for a session (cleanup on session end).
 *
 * @param sessionId - Session identifier
 */
export function clearHealthMonitor(sessionId: string): void {
  const health = sessionHealthMap.get(sessionId);

  if (health && globalConfig.logMetrics) {
    logHealthMetrics(sessionId, health, true);
  }

  sessionHealthMap.delete(sessionId);
  refreshCallbacks.delete(sessionId);

  log.debug({ sessionId }, '🏥 Session health monitor cleared');
}

/**
 * Update global configuration.
 *
 * @param config - Partial configuration to merge
 */
export function updateConfig(config: Partial<HealthMonitorConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  log.info({ config: globalConfig }, '⚙️ Health monitor config updated');
}

/**
 * Get current configuration.
 */
export function getConfig(): HealthMonitorConfig {
  return { ...globalConfig };
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Check health thresholds and trigger refresh if needed.
 */
function checkAndTriggerRefresh(sessionId: string, health: SessionHealth): void {
  // Check consecutive leakages threshold
  if (health.consecutiveLeakages >= globalConfig.maxConsecutiveLeakages) {
    health.shouldRefresh = true;
    health.refreshReason = `${health.consecutiveLeakages} consecutive tool call leakages (model stuck)`;
  }

  // Trigger refresh if needed and auto-refresh is enabled
  if (health.shouldRefresh && globalConfig.autoRefresh) {
    const callback = refreshCallbacks.get(sessionId);
    if (callback) {
      log.warn({ sessionId, reason: health.refreshReason }, '🔄 Auto-refreshing session');

      // Fire and forget - don't block
      callback()
        .then(() => {
          resetHealthAfterRefresh(sessionId);
          log.info({ sessionId }, '✅ Session refresh completed');
        })
        .catch((error) => {
          log.error({ sessionId, error: String(error) }, '❌ Session refresh failed');
        });
    }
  }
}

/**
 * Reset health state after a successful refresh.
 */
function resetHealthAfterRefresh(sessionId: string): void {
  const health = sessionHealthMap.get(sessionId);
  if (!health) return;

  health.consecutiveLeakages = 0;
  health.shouldRefresh = false;
  health.refreshReason = null;
  // Keep turn count and totals for metrics

  log.debug({ sessionId }, '🏥 Session health reset after refresh');
}

/**
 * Log health metrics for monitoring.
 */
function logHealthMetrics(sessionId: string, health: SessionHealth, isFinal: boolean = false): void {
  const successRate =
    health.totalToolCalls + health.totalLeakages > 0
      ? (health.totalToolCalls / (health.totalToolCalls + health.totalLeakages)) * 100
      : 100;

  log.info(
    {
      sessionId,
      turnCount: health.turnCount,
      totalToolCalls: health.totalToolCalls,
      totalLeakages: health.totalLeakages,
      consecutiveLeakages: health.consecutiveLeakages,
      successRate: `${successRate.toFixed(1)}%`,
      shouldRefresh: health.shouldRefresh,
      refreshReason: health.refreshReason,
      isFinal,
    },
    isFinal ? '📊 Final session health metrics' : '📊 Session health metrics'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_CONFIG as SESSION_HEALTH_DEFAULT_CONFIG,
};
