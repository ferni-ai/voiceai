/**
 * Routing Observability - Agent-Visible Tool Routing Statistics
 *
 * Provides clear visibility into which routing system handled each request.
 * Helps Ferni understand her own tool calling behavior.
 *
 * Key metrics tracked:
 * - Total tool calls per session
 * - Semantic router auto-executions (LLM bypassed)
 * - JSON workaround executions (LLM used JSON)
 * - Routing efficiency (% handled by semantic router)
 *
 * @module tools/semantic-router/integration/routing-observability
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { RoutingPath } from './turn-processor-integration.js';

const log = createLogger({ module: 'semantic-router:observability' });

// ============================================================================
// TYPES
// ============================================================================

interface RoutingStats {
  /** Total tool calls in this session */
  totalToolCalls: number;

  /** Calls handled by semantic router auto-execute (LLM bypassed) */
  semanticAutoExecute: number;

  /** Calls where semantic router hinted to LLM */
  semanticHint: number;

  /** Calls that fell back to JSON workaround */
  jsonFallback: number;

  /** Pure conversations (no tool needed) */
  conversations: number;

  /** Routing errors */
  errors: number;

  /** Efficiency: % of tool calls handled by semantic router */
  efficiency: number;

  /** Average latency for semantic router (ms) */
  avgSemanticLatencyMs: number;

  /** Tools executed by ID */
  toolsExecuted: Map<string, number>;
}

interface SessionStats {
  sessionId: string;
  userId: string;
  startTime: Date;
  stats: RoutingStats;
  latencies: number[];
}

// ============================================================================
// STATE
// ============================================================================

const sessionStats = new Map<string, SessionStats>();

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Record a routing event for observability
 */
export function recordRoutingPathEvent(
  sessionId: string,
  userId: string,
  path: RoutingPath,
  toolId?: string,
  latencyMs?: number
): void {
  // Get or create session stats
  let session = sessionStats.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      userId,
      startTime: new Date(),
      stats: {
        totalToolCalls: 0,
        semanticAutoExecute: 0,
        semanticHint: 0,
        jsonFallback: 0,
        conversations: 0,
        errors: 0,
        efficiency: 0,
        avgSemanticLatencyMs: 0,
        toolsExecuted: new Map(),
      },
      latencies: [],
    };
    sessionStats.set(sessionId, session);
  }

  // Update stats based on path
  switch (path) {
    case 'semantic_auto_execute':
      session.stats.semanticAutoExecute++;
      session.stats.totalToolCalls++;
      if (latencyMs) session.latencies.push(latencyMs);
      break;
    case 'semantic_hint':
      session.stats.semanticHint++;
      break;
    case 'semantic_confirm':
      session.stats.semanticHint++;
      break;
    case 'semantic_conversation':
      session.stats.conversations++;
      break;
    case 'json_fallback':
      session.stats.jsonFallback++;
      session.stats.totalToolCalls++;
      break;
    case 'error':
      session.stats.errors++;
      break;
  }

  // Track tool usage
  if (toolId) {
    session.stats.toolsExecuted.set(toolId, (session.stats.toolsExecuted.get(toolId) || 0) + 1);
  }

  // Update efficiency
  if (session.stats.totalToolCalls > 0) {
    session.stats.efficiency =
      (session.stats.semanticAutoExecute / session.stats.totalToolCalls) * 100;
  }

  // Update average latency
  if (session.latencies.length > 0) {
    session.stats.avgSemanticLatencyMs =
      session.latencies.reduce((a, b) => a + b, 0) / session.latencies.length;
  }
}

/**
 * Record when JSON workaround successfully executes a tool.
 * Called from tool-call-sanitizer when JSON function call is detected and executed.
 */
export function recordJsonWorkaroundExecution(
  sessionId: string,
  userId: string,
  toolId: string
): void {
  recordRoutingPathEvent(sessionId, userId, 'json_fallback', toolId);

  // Log prominently so we can track JSON workaround usage
  log.info(
    { sessionId, toolId },
    '🔄 JSON WORKAROUND: Tool executed via JSON function calling (not semantic router)'
  );
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get routing stats for a session
 */
export function getSessionRoutingStats(sessionId: string): RoutingStats | null {
  return sessionStats.get(sessionId)?.stats || null;
}

/**
 * Get a human-readable summary of routing for a session.
 * This can be injected into agent context so Ferni understands her behavior.
 */
export function getRoutingSummaryForAgent(sessionId: string): string {
  const session = sessionStats.get(sessionId);
  if (!session) {
    return 'No routing data available for this session.';
  }

  const { stats } = session;

  if (stats.totalToolCalls === 0 && stats.conversations === 0) {
    return 'No tool calls or significant routing events yet.';
  }

  const lines: string[] = [];

  // Overall efficiency
  if (stats.totalToolCalls > 0) {
    lines.push(
      `Tool Routing: ${stats.totalToolCalls} total calls, ${stats.efficiency.toFixed(0)}% handled by semantic router`
    );

    if (stats.semanticAutoExecute > 0) {
      lines.push(
        `  ✅ ${stats.semanticAutoExecute} auto-executed (avg ${stats.avgSemanticLatencyMs.toFixed(0)}ms, LLM bypassed)`
      );
    }

    if (stats.jsonFallback > 0) {
      lines.push(`  🔄 ${stats.jsonFallback} via JSON workaround (LLM used JSON output)`);
    }
  }

  if (stats.semanticHint > 0) {
    lines.push(`  💡 ${stats.semanticHint} hints provided to LLM`);
  }

  if (stats.errors > 0) {
    lines.push(`  ⚠️ ${stats.errors} routing errors`);
  }

  // Top tools
  if (stats.toolsExecuted.size > 0) {
    const topTools = [...stats.toolsExecuted.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]) => `${tool}(${count})`)
      .join(', ');
    lines.push(`Top tools: ${topTools}`);
  }

  return lines.join('\n');
}

/**
 * Log end-of-session routing summary
 */
export function logSessionRoutingSummary(sessionId: string): void {
  const session = sessionStats.get(sessionId);
  if (!session) return;

  const { stats } = session;
  const duration = Date.now() - session.startTime.getTime();

  log.info(
    {
      sessionId,
      durationMs: duration,
      totalToolCalls: stats.totalToolCalls,
      semanticAutoExecute: stats.semanticAutoExecute,
      jsonFallback: stats.jsonFallback,
      conversations: stats.conversations,
      efficiency: `${stats.efficiency.toFixed(1)}%`,
      avgLatencyMs: stats.avgSemanticLatencyMs.toFixed(0),
      errors: stats.errors,
    },
    '📊 SESSION ROUTING SUMMARY'
  );
}

/**
 * Clean up session stats (call on session end)
 */
export function cleanupSessionStats(sessionId: string): void {
  sessionStats.delete(sessionId);
}

// ============================================================================
// AGGREGATE STATS (Cross-Session)
// ============================================================================

interface AggregateStats {
  totalSessions: number;
  totalToolCalls: number;
  totalSemanticAutoExecute: number;
  totalJsonFallback: number;
  avgEfficiency: number;
}

/**
 * Get aggregate routing stats across all active sessions.
 * Useful for monitoring overall semantic router effectiveness.
 */
export function getAggregateRoutingStats(): AggregateStats {
  let totalToolCalls = 0;
  let totalSemanticAutoExecute = 0;
  let totalJsonFallback = 0;

  for (const session of sessionStats.values()) {
    totalToolCalls += session.stats.totalToolCalls;
    totalSemanticAutoExecute += session.stats.semanticAutoExecute;
    totalJsonFallback += session.stats.jsonFallback;
  }

  const avgEfficiency = totalToolCalls > 0 ? (totalSemanticAutoExecute / totalToolCalls) * 100 : 0;

  return {
    totalSessions: sessionStats.size,
    totalToolCalls,
    totalSemanticAutoExecute,
    totalJsonFallback,
    avgEfficiency,
  };
}

/**
 * Log aggregate stats (for ops monitoring)
 */
export function logAggregateRoutingStats(): void {
  const stats = getAggregateRoutingStats();

  log.info(
    {
      activeSessions: stats.totalSessions,
      totalToolCalls: stats.totalToolCalls,
      semanticAutoExecute: stats.totalSemanticAutoExecute,
      jsonFallback: stats.totalJsonFallback,
      avgEfficiency: `${stats.avgEfficiency.toFixed(1)}%`,
    },
    '📊 AGGREGATE ROUTING STATS'
  );
}
