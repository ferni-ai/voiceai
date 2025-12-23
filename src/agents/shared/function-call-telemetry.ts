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

const log = createLogger({ module: 'function-call-telemetry' });

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
 */
export function logJsonExecuted(
  sessionId: string,
  fn: string,
  success: boolean,
  durationMs: number,
  error?: string
): void {
  const session = getSession(sessionId);
  session.events.push({
    type: 'json_executed',
    timestamp: Date.now(),
    sessionId,
    fn,
    success,
    metadata: { durationMs, error },
  });

  if (success) {
    log.info({ sessionId, fn, durationMs }, '✅ SUCCESS: JSON function call executed');
  } else {
    log.error({ sessionId, fn, durationMs, error }, '❌ FAILED: JSON function call failed');
  }
}

/**
 * Log that tool call leakage was detected.
 */
export function logLeakageDetected(
  sessionId: string,
  pattern: string,
  suggestedTool: string | null,
  responsePreview: string
): void {
  const session = getSession(sessionId);
  session.leakageCount++;
  session.events.push({
    type: 'leakage_detected',
    timestamp: Date.now(),
    sessionId,
    fn: suggestedTool || undefined,
    metadata: { pattern, responsePreview },
  });

  log.warn(
    { sessionId, pattern, suggestedTool, responsePreview: responsePreview.slice(0, 80) },
    '🚨 LEAKAGE: Gemini spoke instead of calling tool'
  );
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
  });

  if (success) {
    log.debug({ sessionId, fn }, '✅ Native function call executed');
  } else {
    log.warn({ sessionId, fn }, '⚠️ Native function call may have failed');
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
