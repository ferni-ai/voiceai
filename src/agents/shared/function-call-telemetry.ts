/**
 * Function Call Telemetry
 *
 * Comprehensive logging and metrics for the JSON function calling system.
 * This module provides visibility into:
 * - Conversation priming events
 * - JSON function call detection and execution
 * - Tool call leakage detection and retry attempts
 * - Hybrid system health metrics
 *
 * USAGE:
 * Import and use the telemetry functions throughout the function calling pipeline.
 * All logs use consistent emoji prefixes for easy filtering:
 *
 * 🎯 PRIMING: - Conversation priming events
 * 🔧 JSON-FC: - JSON function call detection/execution
 * 🚨 LEAKAGE: - Tool call leakage detected
 * 🔄 RETRY:   - Retry attempts
 * 📊 METRICS: - Performance metrics
 * ✅ SUCCESS: - Successful operations
 * ❌ FAILED:  - Failed operations
 *
 * @module agents/shared/function-call-telemetry
 */

import { createLogger } from '../../utils/safe-logger.js';
import { recordToolExecution } from './dev-telemetry.js';
import { getModelProvider } from '../model-provider/index.js';
import {
  recordToolCallSuccess as recordHealthSuccess,
  recordToolCallLeakage as recordHealthLeakage,
} from './session-health-monitor.js';

const log = createLogger({ module: 'function-call-telemetry' });

// Dev mode check for trace integration
const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_TELEMETRY === 'true';

// ============================================================================
// TYPES
// ============================================================================

export interface FunctionCallEvent {
  /** Event type */
  type:
    | 'priming_applied'
    | 'json_detected'
    | 'json_executed'
    | 'leakage_detected'
    | 'retry_triggered'
    | 'native_call'
    | 'fallback_used';
  /** Timestamp */
  timestamp: number;
  /** Session ID (optional) */
  sessionId?: string;
  /** Function name (if applicable) */
  fn?: string;
  /** Success/failure */
  success?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface TelemetrySession {
  /** Session ID */
  sessionId: string;
  /** Session start time */
  startTime: number;
  /** Events in this session */
  events: FunctionCallEvent[];
  /** Priming status */
  primingApplied: boolean;
  /** Count of JSON function calls */
  jsonCallCount: number;
  /** Count of native function calls */
  nativeCallCount: number;
  /** Count of leakage detections */
  leakageCount: number;
  /** Count of retries */
  retryCount: number;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

const sessions = new Map<string, TelemetrySession>();

/**
 * Get or create a telemetry session.
 */
function getSession(sessionId: string): TelemetrySession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      events: [],
      primingApplied: false,
      jsonCallCount: 0,
      nativeCallCount: 0,
      leakageCount: 0,
      retryCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Clear telemetry for a session (call on session end).
 */
export function clearSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Log summary before clearing
    logSessionSummary(sessionId);
    sessions.delete(sessionId);
  }
}

// ============================================================================
// TELEMETRY EVENTS
// ============================================================================

/**
 * Log that conversation priming was applied.
 */
export function logPrimingApplied(sessionId: string, turnsAdded: number, personaId: string): void {
  const session = getSession(sessionId);
  session.primingApplied = true;
  session.events.push({
    type: 'priming_applied',
    timestamp: Date.now(),
    sessionId,
    metadata: { turnsAdded, personaId },
  });

  log.info(
    { sessionId, turnsAdded, personaId },
    '🎯 PRIMING: Conversation priming applied successfully'
  );
}

/**
 * Log that a JSON function call was detected.
 */
export function logJsonDetected(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>
): void {
  const session = getSession(sessionId);
  session.jsonCallCount++;
  session.events.push({
    type: 'json_detected',
    timestamp: Date.now(),
    sessionId,
    fn,
    metadata: { args },
  });

  log.info({ sessionId, fn, args }, '🔧 JSON-FC: JSON function call detected in LLM output');
}

/**
 * Log that a JSON function call was executed.
 *
 * Telemetry layer tracking:
 * - 'json-workaround': JSON intercepted from LLM output and executed
 * - 'semantic-router': Pre-LLM semantic routing
 * - 'direct-router': Ultra-high-confidence pre-LLM routing
 * - 'native-fc': LLM's native function calling
 *
 * @param sessionId - Session identifier
 * @param fn - Function name
 * @param success - Whether execution succeeded
 * @param durationMs - Execution duration
 * @param error - Error message if failed
 * @param turnNumber - Optional turn number for health tracking
 * @param retryCount - Optional retry count for health tracking
 */
export function logJsonExecuted(
  sessionId: string,
  fn: string,
  success: boolean,
  durationMs: number,
  error?: string,
  turnNumber?: number,
  retryCount?: number
): void {
  const session = getSession(sessionId);
  session.events.push({
    type: 'json_executed',
    timestamp: Date.now(),
    sessionId,
    fn,
    success,
    metadata: { durationMs, error, handledBy: 'json-workaround', turnNumber, retryCount },
  });

  if (success) {
    log.info(
      { sessionId, fn, durationMs, handledBy: 'json-workaround' },
      '✅ SUCCESS: JSON function call executed (via json-workaround)'
    );
    // Record success in session health monitor (Jan 2026)
    recordHealthSuccess(sessionId);
  } else {
    log.error(
      { sessionId, fn, durationMs, error, handledBy: 'json-workaround' },
      '❌ FAILED: JSON function call failed'
    );
  }

  // Bridge to dev-telemetry for E2E tracing
  if (isDev) {
    recordToolExecution(sessionId, fn, durationMs, success);
  }

  // Record outcome for health metrics (Jan 2026)
  if (turnNumber !== undefined) {
    recordToolCallOutcome(sessionId, success, false, retryCount ?? 0, turnNumber);
  }
}

/**
 * Log that tool call leakage was detected.
 *
 * @param sessionId - Session identifier
 * @param pattern - Pattern that detected the leakage
 * @param suggestedTool - Tool that should have been called
 * @param responsePreview - Preview of the leaked response
 * @param turnNumber - Optional turn number for health tracking
 */
export function logLeakageDetected(
  sessionId: string,
  pattern: string,
  suggestedTool: string | null,
  responsePreview: string,
  turnNumber?: number
): void {
  const session = getSession(sessionId);
  session.leakageCount++;
  session.events.push({
    type: 'leakage_detected',
    timestamp: Date.now(),
    sessionId,
    fn: suggestedTool || undefined,
    metadata: { pattern, responsePreview, turnNumber },
  });

  log.warn(
    {
      sessionId,
      pattern,
      suggestedTool,
      responsePreview: responsePreview.slice(0, 80),
      turnNumber,
    },
    '🚨 LEAKAGE: Gemini spoke instead of calling tool'
  );

  // Record leakage in session health monitor (Jan 2026)
  recordHealthLeakage(sessionId, suggestedTool || undefined);

  // Record outcome for health metrics (Jan 2026) - leakage counts as failure
  if (turnNumber !== undefined) {
    recordToolCallOutcome(sessionId, false, true, 0, turnNumber);
  }
}

/**
 * Log that a retry was triggered.
 */
export function logRetryTriggered(
  sessionId: string,
  attempt: number,
  suggestedTool: string | null,
  originalMessage: string
): void {
  const session = getSession(sessionId);
  session.retryCount++;
  session.events.push({
    type: 'retry_triggered',
    timestamp: Date.now(),
    sessionId,
    fn: suggestedTool || undefined,
    metadata: { attempt, originalMessage: originalMessage.slice(0, 50) },
  });

  log.info(
    { sessionId, attempt, suggestedTool, originalMessage: originalMessage.slice(0, 50) },
    '🔄 RETRY: Retry triggered for failed tool call'
  );
}

/**
 * Log that a native function call was made (via LiveKit).
 *
 * Native function calling is handled at the LLM protocol level
 * (OpenAI Realtime) or as a backup layer (Gemini with tools passed).
 */
export function logNativeCall(sessionId: string, fn: string, success: boolean): void {
  const session = getSession(sessionId);
  session.nativeCallCount++;
  session.events.push({
    type: 'native_call',
    timestamp: Date.now(),
    sessionId,
    fn,
    success,
    metadata: { handledBy: 'native-fc' },
  });

  if (success) {
    log.info(
      { sessionId, fn, handledBy: 'native-fc', trace: 'E2E_TOOL_SUCCESS' },
      `🔍 E2E TRACE [TOOL] Completed: ${fn} (via native-fc)`
    );
  } else {
    log.warn({ sessionId, fn, handledBy: 'native-fc' }, '⚠️ Native function call may have failed');
  }
}

/**
 * Log that the JSON fallback was used (native call didn't work).
 */
export function logFallbackUsed(sessionId: string, fn: string, reason: string): void {
  const session = getSession(sessionId);
  session.events.push({
    type: 'fallback_used',
    timestamp: Date.now(),
    sessionId,
    fn,
    metadata: { reason },
  });

  log.info({ sessionId, fn, reason }, "🔧 JSON-FC: JSON fallback used (native call didn't work)");
}

// ============================================================================
// METRICS & SUMMARY
// ============================================================================

/**
 * Log session summary metrics.
 */
export function logSessionSummary(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  const durationMs = Date.now() - session.startTime;
  const durationSec = Math.round(durationMs / 1000);

  log.info(
    {
      sessionId,
      durationSec,
      primingApplied: session.primingApplied,
      jsonCallCount: session.jsonCallCount,
      nativeCallCount: session.nativeCallCount,
      leakageCount: session.leakageCount,
      retryCount: session.retryCount,
      totalCalls: session.jsonCallCount + session.nativeCallCount,
      leakageRate:
        session.leakageCount > 0
          ? `${Math.round((session.leakageCount / (session.jsonCallCount + session.nativeCallCount + session.leakageCount)) * 100)}%`
          : '0%',
    },
    '📊 METRICS: Session function calling summary'
  );
}

/**
 * Get current metrics for a session (for debugging/monitoring).
 */
export function getSessionMetrics(sessionId: string): {
  primingApplied: boolean;
  jsonCallCount: number;
  nativeCallCount: number;
  leakageCount: number;
  retryCount: number;
  leakageRate: string;
} | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const totalCalls = session.jsonCallCount + session.nativeCallCount;
  const leakageRate =
    session.leakageCount > 0 && totalCalls > 0
      ? `${Math.round((session.leakageCount / (totalCalls + session.leakageCount)) * 100)}%`
      : '0%';

  return {
    primingApplied: session.primingApplied,
    jsonCallCount: session.jsonCallCount,
    nativeCallCount: session.nativeCallCount,
    leakageCount: session.leakageCount,
    retryCount: session.retryCount,
    leakageRate,
  };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Quick log for when a user message triggers a tool call.
 * Use this at the start of tool call processing.
 */
export function logToolCallStart(sessionId: string, userMessage: string): void {
  log.debug(
    { sessionId, userMessage: userMessage.slice(0, 50) },
    '🎯 Processing user message for potential tool call'
  );
}

/**
 * Quick log for when tool processing is complete.
 * Use this at the end of tool call processing.
 */
export function logToolCallComplete(sessionId: string, toolCalled: string | null): void {
  if (toolCalled) {
    log.debug({ sessionId, toolCalled }, '✅ Tool call complete');
  } else {
    log.debug({ sessionId }, '📝 No tool call triggered (conversational response)');
  }
}

// ============================================================================
// FUNCTION CALL HEALTH METRICS (Jan 2026)
// ============================================================================

/**
 * Function call health metrics for monitoring Gemini reliability.
 *
 * These metrics help diagnose function calling issues:
 * - successRate: High is good (>95%)
 * - leakageRate: Low is good (<5%)
 * - avgRetryCount: Low is good (<0.5)
 * - sessionDecayIndicator: Low is good (<0.2)
 */
export interface FunctionCallHealth {
  /** Percentage of tool calls that executed successfully (0-100) */
  successRate: number;
  /** Percentage of tool calls that leaked (model spoke instead of calling) (0-100) */
  leakageRate: number;
  /** Average retries per tool call attempt (lower is better) */
  avgRetryCount: number;
  /** Session decay indicator: ratio of late-session leakages to early-session (0-1) */
  sessionDecayIndicator: number;
  /** Total tool calls measured */
  totalMeasured: number;
  /** Health status based on metrics */
  status: 'excellent' | 'good' | 'degraded' | 'poor';
  /** Timestamp of metrics calculation */
  calculatedAt: number;
}

/**
 * Rolling window size for health metrics calculation
 */
const HEALTH_WINDOW_SIZE = 100;

/**
 * Rolling window of recent tool call outcomes
 */
interface ToolCallOutcome {
  timestamp: number;
  success: boolean;
  leaked: boolean;
  retryCount: number;
  turnNumber: number;
  sessionId: string;
}

const recentOutcomes: ToolCallOutcome[] = [];

/**
 * Record a tool call outcome for health metrics.
 */
export function recordToolCallOutcome(
  sessionId: string,
  success: boolean,
  leaked: boolean,
  retryCount: number,
  turnNumber: number
): void {
  recentOutcomes.push({
    timestamp: Date.now(),
    success,
    leaked,
    retryCount,
    turnNumber,
    sessionId,
  });

  // Keep window size bounded
  while (recentOutcomes.length > HEALTH_WINDOW_SIZE) {
    recentOutcomes.shift();
  }
}

/**
 * Calculate function call health metrics from recent outcomes.
 *
 * @returns FunctionCallHealth metrics
 */
export function getFunctionCallHealth(): FunctionCallHealth {
  const now = Date.now();

  if (recentOutcomes.length === 0) {
    return {
      successRate: 100,
      leakageRate: 0,
      avgRetryCount: 0,
      sessionDecayIndicator: 0,
      totalMeasured: 0,
      status: 'excellent',
      calculatedAt: now,
    };
  }

  const total = recentOutcomes.length;
  const successes = recentOutcomes.filter((o) => o.success).length;
  const leakages = recentOutcomes.filter((o) => o.leaked).length;
  const totalRetries = recentOutcomes.reduce((sum, o) => sum + o.retryCount, 0);

  // Calculate session decay indicator
  // Compare leakage rate in first half of turns vs second half
  const sortedByTurn = [...recentOutcomes].sort((a, b) => a.turnNumber - b.turnNumber);
  const midpoint = Math.floor(sortedByTurn.length / 2);
  const firstHalf = sortedByTurn.slice(0, midpoint);
  const secondHalf = sortedByTurn.slice(midpoint);

  const firstHalfLeakageRate =
    firstHalf.length > 0 ? firstHalf.filter((o) => o.leaked).length / firstHalf.length : 0;
  const secondHalfLeakageRate =
    secondHalf.length > 0 ? secondHalf.filter((o) => o.leaked).length / secondHalf.length : 0;

  // Decay indicator: how much worse is second half compared to first half
  // 0 = no decay, 1 = massive decay
  const sessionDecayIndicator =
    firstHalfLeakageRate > 0
      ? Math.min(
          1,
          Math.max(0, (secondHalfLeakageRate - firstHalfLeakageRate) / firstHalfLeakageRate)
        )
      : secondHalfLeakageRate > 0
        ? 0.5
        : 0;

  const successRate = (successes / total) * 100;
  const leakageRate = (leakages / total) * 100;
  const avgRetryCount = totalRetries / total;

  // Determine status
  let status: FunctionCallHealth['status'];
  if (successRate >= 98 && leakageRate < 2 && avgRetryCount < 0.1) {
    status = 'excellent';
  } else if (successRate >= 95 && leakageRate < 5 && avgRetryCount < 0.3) {
    status = 'good';
  } else if (successRate >= 85 && leakageRate < 15 && avgRetryCount < 0.7) {
    status = 'degraded';
  } else {
    status = 'poor';
  }

  return {
    successRate: Math.round(successRate * 10) / 10,
    leakageRate: Math.round(leakageRate * 10) / 10,
    avgRetryCount: Math.round(avgRetryCount * 100) / 100,
    sessionDecayIndicator: Math.round(sessionDecayIndicator * 100) / 100,
    totalMeasured: total,
    status,
    calculatedAt: now,
  };
}

/**
 * Reset health metrics (for testing).
 */
export function resetFunctionCallHealth(): void {
  recentOutcomes.length = 0;
}

/**
 * Get health metrics as a dashboard-friendly format.
 */
export function getFunctionCallHealthDashboard(): {
  health: FunctionCallHealth;
  recommendations: string[];
  trends: {
    successTrend: 'improving' | 'stable' | 'declining';
    leakageTrend: 'improving' | 'stable' | 'worsening';
  };
} {
  const health = getFunctionCallHealth();
  const recommendations: string[] = [];

  // Generate recommendations based on metrics
  if (health.leakageRate > 10) {
    recommendations.push(
      'High leakage rate detected. Consider enabling GEMINI_FC_MODE=ANY to force function calling.'
    );
  }
  if (health.avgRetryCount > 0.5) {
    recommendations.push('High retry rate. Verify conversation priming is enabled and working.');
  }
  if (health.sessionDecayIndicator > 0.3) {
    recommendations.push(
      'Session decay detected. Consider implementing session refresh after extended conversations.'
    );
  }
  if (health.successRate < 90) {
    recommendations.push(
      'Low success rate. Check tool definitions and Gemini model configuration.'
    );
  }
  if (health.status === 'poor') {
    recommendations.push(
      'Consider switching to OpenAI Realtime (USE_OPENAI_REALTIME=true) for more reliable function calling.'
    );
  }

  // Simple trend detection (would need historical data for real trends)
  const successTrend: 'improving' | 'stable' | 'declining' =
    health.successRate >= 95 ? 'stable' : health.successRate >= 85 ? 'stable' : 'declining';
  const leakageTrend: 'improving' | 'stable' | 'worsening' =
    health.leakageRate <= 5 ? 'stable' : health.leakageRate <= 10 ? 'stable' : 'worsening';

  return {
    health,
    recommendations,
    trends: {
      successTrend,
      leakageTrend,
    },
  };
}

// ============================================================================
// AGGREGATE METRICS (FOR GEMINI HEALTH ENDPOINT)
// ============================================================================

export interface GeminiHealthMetrics {
  /** Whether Gemini is the active LLM */
  isGemini: boolean;
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Active session count */
  activeSessions: number;
  /** Aggregate metrics across all sessions */
  aggregate: {
    totalToolCalls: number;
    jsonCalls: number;
    nativeCalls: number;
    leakageCount: number;
    retryCount: number;
    leakageRate: number;
    retrySuccessRate: number;
  };
  /** Function call health metrics (Jan 2026) */
  functionCallHealth: FunctionCallHealth;
  /** Recent leakages (last 5) */
  recentLeakages: Array<{
    sessionId: string;
    timestamp: number;
    pattern: string;
    suggestedTool: string | null;
  }>;
  /** Health thresholds */
  thresholds: {
    healthyLeakageRate: number;
    degradedLeakageRate: number;
  };
  /** Recommendation */
  recommendation: string | null;
}

/**
 * Get aggregate Gemini health metrics across all active sessions.
 * Used by the /health/gemini endpoint for monitoring.
 */
export function getGeminiHealthMetrics(): GeminiHealthMetrics {
  // Use provider abstraction to determine if using Gemini
  const provider = getModelProvider();
  const isGemini = provider.id === 'gemini-live';

  // Aggregate metrics across all sessions
  let totalToolCalls = 0;
  let jsonCalls = 0;
  let nativeCalls = 0;
  let leakageCount = 0;
  let retryCount = 0;
  const recentLeakages: GeminiHealthMetrics['recentLeakages'] = [];

  for (const session of sessions.values()) {
    jsonCalls += session.jsonCallCount;
    nativeCalls += session.nativeCallCount;
    leakageCount += session.leakageCount;
    retryCount += session.retryCount;

    // Collect leakage events
    for (const event of session.events) {
      if (event.type === 'leakage_detected') {
        recentLeakages.push({
          sessionId: session.sessionId,
          timestamp: event.timestamp,
          pattern: (event.metadata?.['pattern'] as string) || 'unknown',
          suggestedTool: event.fn || null,
        });
      }
    }
  }

  totalToolCalls = jsonCalls + nativeCalls;

  // Calculate rates
  const denominator = totalToolCalls + leakageCount;
  const leakageRate = denominator > 0 ? leakageCount / denominator : 0;

  // Retry success rate: if retries > 0, check how many leakages we had after
  // (This is approximate - would need more tracking for exact success rate)
  const retrySuccessRate = retryCount > 0 ? Math.max(0, 1 - leakageCount / (retryCount + 1)) : 1;

  // Sort and limit recent leakages
  recentLeakages.sort((a, b) => b.timestamp - a.timestamp);
  const last5Leakages = recentLeakages.slice(0, 5);

  // Thresholds
  const HEALTHY_LEAKAGE = 0.05; // <5% is healthy
  const DEGRADED_LEAKAGE = 0.15; // 5-15% is degraded, >15% is unhealthy

  // Determine status
  let status: 'healthy' | 'degraded' | 'unhealthy';
  let recommendation: string | null = null;

  if (!isGemini) {
    status = 'healthy'; // OpenAI doesn't have leakage issues
    recommendation = null;
  } else if (leakageRate < HEALTHY_LEAKAGE) {
    status = 'healthy';
    recommendation = null;
  } else if (leakageRate < DEGRADED_LEAKAGE) {
    status = 'degraded';
    recommendation =
      'Leakage rate elevated. Consider lowering semantic router auto-execute threshold.';
  } else {
    status = 'unhealthy';
    recommendation =
      'High leakage rate. Consider switching to OpenAI Realtime (USE_OPENAI_REALTIME=true) or investigate Gemini prompt issues.';
  }

  return {
    isGemini,
    status,
    activeSessions: sessions.size,
    aggregate: {
      totalToolCalls,
      jsonCalls,
      nativeCalls,
      leakageCount,
      retryCount,
      leakageRate: Math.round(leakageRate * 100) / 100,
      retrySuccessRate: Math.round(retrySuccessRate * 100) / 100,
    },
    functionCallHealth: getFunctionCallHealth(),
    recentLeakages: last5Leakages,
    thresholds: {
      healthyLeakageRate: HEALTHY_LEAKAGE,
      degradedLeakageRate: DEGRADED_LEAKAGE,
    },
    recommendation,
  };
}
