/**
 * Critical Function Monitor
 *
 * Tracks critical operations that impact user experience:
 * - Handoffs (persona transfers)
 * - Voice switching (TTS voice changes)
 * - Music playback (play/pause/stop)
 * - Frontend data publishing (UI sync)
 * - Tool execution (user-requested actions)
 *
 * Alerts loudly when these fail to help debugging.
 *
 * @module voice-agent/critical-function-monitor
 */

import { voice } from '@livekit/agents';

// ============================================================================
// TYPES
// ============================================================================

type CriticalFunctionCategory =
  | 'handoff'
  | 'voice_switch'
  | 'music'
  | 'frontend_publish'
  | 'tool_execution'
  | 'session_init'
  | 'memory_operation';

type CriticalFunctionStatus = 'started' | 'success' | 'failed' | 'timeout' | 'retrying';

interface CriticalFunctionEvent {
  category: CriticalFunctionCategory;
  operation: string;
  status: CriticalFunctionStatus;
  timestamp: number;
  durationMs?: number;
  details?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
}

interface CriticalFunctionStats {
  total: number;
  success: number;
  failed: number;
  timeout: number;
  avgDurationMs: number;
  lastFailure?: CriticalFunctionEvent;
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionCriticalState {
  events: CriticalFunctionEvent[];
  activeOperations: Map<string, { startTime: number; category: CriticalFunctionCategory }>;
  stats: Map<CriticalFunctionCategory, CriticalFunctionStats>;
}

const sessionStates = new Map<string, SessionCriticalState>();

function getSessionState(sessionId: string): SessionCriticalState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      events: [],
      activeOperations: new Map(),
      stats: new Map(),
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

const SEVERITY_EMOJI: Record<CriticalFunctionStatus, string> = {
  started: '🚀',
  success: '✅',
  failed: '🚨',
  timeout: '⏱️',
  retrying: '🔄',
};

const CATEGORY_EMOJI: Record<CriticalFunctionCategory, string> = {
  handoff: '🔄',
  voice_switch: '🎙️',
  music: '🎵',
  frontend_publish: '📤',
  tool_execution: '🔧',
  session_init: '🏁',
  memory_operation: '🧠',
};

function logCriticalEvent(event: CriticalFunctionEvent): void {
  const sevEmoji = SEVERITY_EMOJI[event.status];
  const catEmoji = CATEGORY_EMOJI[event.category];
  const duration = event.durationMs ? ` (${event.durationMs}ms)` : '';
  const retry = event.retryCount ? ` [retry ${event.retryCount}]` : '';

  if (event.status === 'failed' || event.status === 'timeout') {
    // LOUD alert for failures
    process.stderr.write(`\n${'🚨'.repeat(25)}\n`);
    process.stderr.write(
      `${sevEmoji} [CRITICAL ${event.category.toUpperCase()}] ${event.operation} ${event.status.toUpperCase()}!\n`
    );
    process.stderr.write(`   ${catEmoji} Category: ${event.category}\n`);
    if (event.error) {
      process.stderr.write(`   ❌ Error: ${event.error}\n`);
    }
    if (event.details) {
      process.stderr.write(`   📋 Details: ${JSON.stringify(event.details)}\n`);
    }
    process.stderr.write(
      `   🕐 Timestamp: ${new Date(event.timestamp).toISOString()}${duration}\n`
    );
    process.stderr.write(`${'🚨'.repeat(25)}\n\n`);
  } else if (event.status === 'retrying') {
    process.stderr.write(
      `${sevEmoji} [CRITICAL] ${event.operation} ${event.status}${retry}${duration}\n`
    );
  } else if (event.status === 'success') {
    process.stderr.write(
      `${sevEmoji} [CRITICAL] ${catEmoji} ${event.operation} completed${duration}\n`
    );
  } else {
    process.stderr.write(`${sevEmoji} [CRITICAL] ${catEmoji} ${event.operation} started\n`);
  }
}

// ============================================================================
// TRACKING API
// ============================================================================

/**
 * Start tracking a critical operation
 */
export function startCriticalOperation(
  sessionId: string,
  category: CriticalFunctionCategory,
  operation: string,
  details?: Record<string, unknown>
): string {
  const state = getSessionState(sessionId);
  const operationId = `${category}-${operation}-${Date.now()}`;

  state.activeOperations.set(operationId, {
    startTime: Date.now(),
    category,
  });

  const event: CriticalFunctionEvent = {
    category,
    operation,
    status: 'started',
    timestamp: Date.now(),
    details,
  };

  state.events.push(event);
  logCriticalEvent(event);

  // Keep only last 100 events
  if (state.events.length > 100) {
    state.events = state.events.slice(-100);
  }

  return operationId;
}

/**
 * Complete a critical operation successfully
 */
export function completeCriticalOperation(
  sessionId: string,
  operationId: string,
  details?: Record<string, unknown>
): void {
  const state = getSessionState(sessionId);
  const activeOp = state.activeOperations.get(operationId);

  if (!activeOp) {
    process.stderr.write(`⚠️ [CRITICAL] Unknown operation completed: ${operationId}\n`);
    return;
  }

  const durationMs = Date.now() - activeOp.startTime;
  state.activeOperations.delete(operationId);

  const event: CriticalFunctionEvent = {
    category: activeOp.category,
    operation: operationId.split('-').slice(1, -1).join('-'),
    status: 'success',
    timestamp: Date.now(),
    durationMs,
    details,
  };

  state.events.push(event);
  updateStats(state, activeOp.category, 'success', durationMs);
  logCriticalEvent(event);
}

/**
 * Mark a critical operation as failed
 */
export function failCriticalOperation(
  sessionId: string,
  operationId: string,
  error: string,
  details?: Record<string, unknown>
): void {
  const state = getSessionState(sessionId);
  const activeOp = state.activeOperations.get(operationId);

  if (!activeOp) {
    // Operation may have already been recorded differently - still log the failure
    process.stderr.write(`\n${'🚨'.repeat(25)}\n`);
    process.stderr.write(`🚨 [CRITICAL FAILURE] ${operationId}\n`);
    process.stderr.write(`   ❌ Error: ${error}\n`);
    if (details) {
      process.stderr.write(`   📋 Details: ${JSON.stringify(details)}\n`);
    }
    process.stderr.write(`${'🚨'.repeat(25)}\n\n`);
    return;
  }

  const durationMs = Date.now() - activeOp.startTime;
  state.activeOperations.delete(operationId);

  const event: CriticalFunctionEvent = {
    category: activeOp.category,
    operation: operationId.split('-').slice(1, -1).join('-'),
    status: 'failed',
    timestamp: Date.now(),
    durationMs,
    error,
    details,
  };

  state.events.push(event);
  updateStats(state, activeOp.category, 'failed', durationMs, event);
  logCriticalEvent(event);
}

/**
 * Record a retry attempt
 */
export function retryCriticalOperation(
  sessionId: string,
  operationId: string,
  retryCount: number,
  reason: string
): void {
  const state = getSessionState(sessionId);
  const activeOp = state.activeOperations.get(operationId);

  if (!activeOp) return;

  const event: CriticalFunctionEvent = {
    category: activeOp.category,
    operation: operationId.split('-').slice(1, -1).join('-'),
    status: 'retrying',
    timestamp: Date.now(),
    retryCount,
    details: { reason },
  };

  state.events.push(event);
  logCriticalEvent(event);
}

/**
 * Mark operation as timed out
 */
export function timeoutCriticalOperation(
  sessionId: string,
  operationId: string,
  timeoutMs: number,
  details?: Record<string, unknown>
): void {
  const state = getSessionState(sessionId);
  const activeOp = state.activeOperations.get(operationId);

  if (!activeOp) return;

  state.activeOperations.delete(operationId);

  const event: CriticalFunctionEvent = {
    category: activeOp.category,
    operation: operationId.split('-').slice(1, -1).join('-'),
    status: 'timeout',
    timestamp: Date.now(),
    durationMs: timeoutMs,
    error: `Operation timed out after ${timeoutMs}ms`,
    details,
  };

  state.events.push(event);
  updateStats(state, activeOp.category, 'timeout', timeoutMs, event);
  logCriticalEvent(event);
}

// ============================================================================
// STATS HELPERS
// ============================================================================

function updateStats(
  state: SessionCriticalState,
  category: CriticalFunctionCategory,
  result: 'success' | 'failed' | 'timeout',
  durationMs: number,
  failureEvent?: CriticalFunctionEvent
): void {
  let stats = state.stats.get(category);
  if (!stats) {
    stats = {
      total: 0,
      success: 0,
      failed: 0,
      timeout: 0,
      avgDurationMs: 0,
    };
    state.stats.set(category, stats);
  }

  stats.total++;
  stats[result]++;
  stats.avgDurationMs = (stats.avgDurationMs * (stats.total - 1) + durationMs) / stats.total;

  if (failureEvent) {
    stats.lastFailure = failureEvent;
  }
}

/**
 * Get stats for a session
 */
export function getCriticalStats(
  sessionId: string
): Map<CriticalFunctionCategory, CriticalFunctionStats> {
  return getSessionState(sessionId).stats;
}

/**
 * Print session stats summary
 */
export function printCriticalStatsSummary(sessionId: string): void {
  const state = getSessionState(sessionId);

  process.stderr.write(`\n${'📊'.repeat(20)}\n`);
  process.stderr.write(`📊 CRITICAL FUNCTION STATS - Session ${sessionId.slice(0, 8)}...\n`);
  process.stderr.write(`${'─'.repeat(60)}\n`);

  if (state.stats.size === 0) {
    process.stderr.write(`   No critical operations recorded yet.\n`);
  }

  for (const [category, stats] of state.stats) {
    const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0';
    const emoji = CATEGORY_EMOJI[category];

    process.stderr.write(`${emoji} ${category.toUpperCase()}\n`);
    process.stderr.write(
      `   Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Timeout: ${stats.timeout}\n`
    );
    process.stderr.write(
      `   Success Rate: ${successRate}% | Avg Duration: ${stats.avgDurationMs.toFixed(0)}ms\n`
    );

    if (stats.lastFailure) {
      process.stderr.write(
        `   Last Failure: ${stats.lastFailure.operation} - ${stats.lastFailure.error}\n`
      );
    }
    process.stderr.write(`\n`);
  }

  process.stderr.write(`${'📊'.repeat(20)}\n\n`);
}

// ============================================================================
// QUICK TRACKING HELPERS
// ============================================================================

/**
 * Track a handoff operation
 */
export function trackHandoff(
  sessionId: string,
  fromAgent: string,
  toAgent: string
): {
  complete: () => void;
  fail: (error: string) => void;
  retry: (count: number, reason: string) => void;
} {
  const opId = startCriticalOperation(sessionId, 'handoff', `${fromAgent}→${toAgent}`, {
    fromAgent,
    toAgent,
  });

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, { fromAgent, toAgent }),
    retry: (count: number, reason: string) =>
      retryCriticalOperation(sessionId, opId, count, reason),
  };
}

/**
 * Track a voice switch operation
 */
export function trackVoiceSwitch(
  sessionId: string,
  personaId: string,
  voiceId: string
): {
  complete: () => void;
  fail: (error: string) => void;
  retry: (count: number, reason: string) => void;
} {
  const opId = startCriticalOperation(sessionId, 'voice_switch', personaId, { personaId, voiceId });

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, { personaId, voiceId }),
    retry: (count: number, reason: string) =>
      retryCriticalOperation(sessionId, opId, count, reason),
  };
}

/**
 * Track a music operation
 */
export function trackMusicOperation(
  sessionId: string,
  operation: 'play' | 'pause' | 'stop' | 'resume' | 'search',
  details?: Record<string, unknown>
): { complete: () => void; fail: (error: string) => void } {
  const opId = startCriticalOperation(sessionId, 'music', `music_${operation}`, details);

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, details),
  };
}

/**
 * Track a frontend publish operation
 */
export function trackFrontendPublish(
  sessionId: string,
  messageType: string,
  details?: Record<string, unknown>
): { complete: () => void; fail: (error: string) => void } {
  const opId = startCriticalOperation(sessionId, 'frontend_publish', messageType, details);

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, details),
  };
}

/**
 * Track a tool execution
 */
export function trackToolExecution(
  sessionId: string,
  toolName: string,
  params?: Record<string, unknown>
): { complete: (result?: string) => void; fail: (error: string) => void } {
  const opId = startCriticalOperation(sessionId, 'tool_execution', toolName, params);

  return {
    complete: (result?: string) =>
      completeCriticalOperation(
        sessionId,
        opId,
        result ? { result: result.slice(0, 100) } : undefined
      ),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, params),
  };
}

/**
 * Track session initialization
 */
export function trackSessionInit(
  sessionId: string,
  step: string,
  details?: Record<string, unknown>
): { complete: () => void; fail: (error: string) => void } {
  const opId = startCriticalOperation(sessionId, 'session_init', step, details);

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, details),
  };
}

/**
 * Track memory operations
 */
export function trackMemoryOperation(
  sessionId: string,
  operation: 'save' | 'load' | 'recall' | 'forget',
  details?: Record<string, unknown>
): { complete: () => void; fail: (error: string) => void } {
  const opId = startCriticalOperation(
    sessionId,
    'memory_operation',
    `memory_${operation}`,
    details
  );

  return {
    complete: () => completeCriticalOperation(sessionId, opId),
    fail: (error: string) => failCriticalOperation(sessionId, opId, error, details),
  };
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Clean up session state
 */
export function cleanupSession(sessionId: string): void {
  // Print final stats before cleanup
  printCriticalStatsSummary(sessionId);
  sessionStates.delete(sessionId);
}

// ============================================================================
// INTEGRATION WITH AGENT SESSION
// ============================================================================

/**
 * Set up critical function monitoring on an AgentSession
 */
export function setupCriticalFunctionMonitoring(
  sessionId: string,
  session: voice.AgentSession<unknown>
): () => void {
  // Track tool executions via FunctionToolsExecuted event
  const toolHandler = (event: unknown) => {
    const toolInfo = event as {
      name?: string;
      toolName?: string;
      error?: unknown;
      tools?: Array<{ name?: string; error?: unknown }>;
    };

    // Extract tool names and check for errors
    const tools = toolInfo.tools || [toolInfo];
    for (const tool of tools) {
      const toolName = tool.name || toolInfo.name || toolInfo.toolName || 'unknown';
      const tracker = trackToolExecution(sessionId, toolName);

      if (tool.error) {
        tracker.fail(String(tool.error));
      } else {
        tracker.complete();
      }
    }
  };

  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, toolHandler);

  // Return cleanup function
  return () => {
    // Session event listeners are cleaned up with the session
    cleanupSession(sessionId);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const criticalMonitor = {
  start: startCriticalOperation,
  complete: completeCriticalOperation,
  fail: failCriticalOperation,
  retry: retryCriticalOperation,
  timeout: timeoutCriticalOperation,
  getStats: getCriticalStats,
  printStats: printCriticalStatsSummary,
  cleanup: cleanupSession,
  setup: setupCriticalFunctionMonitoring,
  // Quick trackers
  trackHandoff,
  trackVoiceSwitch,
  trackMusicOperation,
  trackFrontendPublish,
  trackToolExecution,
  trackSessionInit,
  trackMemoryOperation,
};

export default criticalMonitor;
