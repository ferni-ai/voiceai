/**
 * Routing Analytics Dashboard
 *
 * Tracks routing decisions, accuracy, latency, and patterns.
 * This is essential for understanding and improving the router.
 *
 * NOW WITH OPTIONAL FIRESTORE PERSISTENCE for cross-session analytics!
 *
 * @module tools/semantic-router/analytics/routing-analytics
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DetectedIntent, MatchLayer, RouterAction, SemanticRouterResult } from '../types.js';
import { isPersistenceAvailable, saveRoutingEvent as persistEvent } from '../persistence/index.js';

const log = createLogger({ module: 'semantic-router:analytics' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A routing decision, without the caller's words (Seth, 2026-10-24): the input's length,
 * not the input; the intent's labels, not `specific` (the matched words); the top tool's
 * id and scores, not its extracted args or match reason; the action's type, not its args
 * or question. This buffer feeds getDashboardData().recentEvents and Firestore.
 */
export interface RoutingEvent {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  personaId: string;

  // Input
  inputLength: number;

  // Routing result
  intent: Omit<DetectedIntent, 'specific'>;
  topMatch: { toolId: string; confidence: number; matchedBy: MatchLayer[] } | null;
  matchCount: number;
  actionType: RouterAction['type'];

  // Timing
  totalTimeMs: number;
  layerTimesMs: Record<string, number>;

  // Outcome (filled later)
  outcome?: RoutingOutcome;
}

export interface RoutingOutcome {
  toolExecuted: string | null;
  executionSuccess: boolean;
  userSatisfied?: boolean; // From implicit signals
  corrected?: boolean;
  llmFallbackUsed: boolean;
}

export interface RoutingStats {
  totalRoutes: number;
  autoExecuteCount: number;
  autoExecuteRate: number;
  hintCount: number;
  hintRate: number;
  conversationCount: number;
  conversationRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  accuracyEstimate: number;
  toolUsageDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  hourlyDistribution: Record<number, number>;
}

export interface ToolPerformance {
  toolId: string;
  totalRoutes: number;
  autoExecuteCount: number;
  autoExecuteRate: number;
  avgConfidence: number;
  correctionCount: number;
  correctionRate: number;
  avgLatencyMs: number;
}

// ============================================================================
// IN-MEMORY STORAGE (Replace with time-series DB in production)
// ============================================================================

const events: RoutingEvent[] = [];
const MAX_EVENTS = 100000; // Keep last 100K events in memory

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a routing event. `context.inputText` is read for its length only.
 */
export function recordRoutingEvent(
  result: SemanticRouterResult,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    inputText: string;
  }
): string {
  const eventId = `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const top = result.matches[0];
  const { category, confidence, mood, urgency } = result.intent;
  const event: RoutingEvent = {
    id: eventId,
    timestamp: new Date(),
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    inputLength: context.inputText.length,
    intent: { category, confidence, mood, urgency },
    topMatch: top
      ? { toolId: top.toolId, confidence: top.confidence, matchedBy: [...top.matchedBy] }
      : null,
    matchCount: result.matches.length,
    actionType: result.action.type,
    totalTimeMs: result.metadata.totalTimeMs,
    layerTimesMs: result.metadata.layerTimesMs,
  };

  events.push(event);

  // Evict old events if over limit
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Persist to Firestore (fire-and-forget for performance)
  if (isPersistenceAvailable()) {
    persistEvent({
      id: eventId,
      timestamp: event.timestamp,
      userId: event.userId,
      sessionId: event.sessionId,
      personaId: event.personaId,
      inputLength: event.inputLength,
      intentCategory: String(category),
      actionType: event.actionType,
      toolId: event.topMatch?.toolId,
      confidence: event.topMatch?.confidence,
      matchedBy: event.topMatch?.matchedBy,
      latencyMs: event.totalTimeMs,
    }).catch((err) => {
      // Don't log every error - high volume
      if (Math.random() < 0.01) {
        log.debug({ error: String(err) }, 'Event persist failed (sampled)');
      }
    });
  }

  log.debug(
    {
      eventId,
      action: event.actionType,
      topTool: event.topMatch?.toolId,
      confidence: event.topMatch?.confidence,
      latencyMs: result.metadata.totalTimeMs,
    },
    'Routing event recorded'
  );

  return eventId;
}

/**
 * Update event with outcome: its named fields only, so a field a caller adds (what the
 * tool heard, say) never reaches getRoutingEvents() or the dashboard
 */
export function recordRoutingOutcome(eventId: string, outcome: RoutingOutcome): void {
  const event = events.find((e) => e.id === eventId);
  if (event) {
    const { toolExecuted, executionSuccess, userSatisfied, corrected, llmFallbackUsed } = outcome;
    event.outcome = { toolExecuted, executionSuccess, userSatisfied, corrected, llmFallbackUsed };
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Calculate routing statistics
 */
export function getRoutingStats(options?: {
  userId?: string;
  since?: Date;
  until?: Date;
}): RoutingStats {
  let filtered = [...events];

  if (options?.userId) {
    const userId = options.userId;
    filtered = filtered.filter((e) => e.userId === userId);
  }
  if (options?.since) {
    const since = options.since;
    filtered = filtered.filter((e) => e.timestamp >= since);
  }
  if (options?.until) {
    const until = options.until;
    filtered = filtered.filter((e) => e.timestamp <= until);
  }

  if (filtered.length === 0) {
    return {
      totalRoutes: 0,
      autoExecuteCount: 0,
      autoExecuteRate: 0,
      hintCount: 0,
      hintRate: 0,
      conversationCount: 0,
      conversationRate: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      accuracyEstimate: 0,
      toolUsageDistribution: {},
      categoryDistribution: {},
      hourlyDistribution: {},
    };
  }

  // Action counts
  const autoExecute = filtered.filter((e) => e.actionType === 'execute').length;
  const hint = filtered.filter((e) => e.actionType === 'hint').length;
  const conversation = filtered.filter((e) => e.actionType === 'conversation').length;

  // Latency stats
  const latencies = filtered.map((e) => e.totalTimeMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Accuracy estimate (from outcomes)
  const withOutcome = filtered.filter((e) => e.outcome);
  const accurate = withOutcome.filter(
    (e) => e.outcome?.executionSuccess && !e.outcome?.corrected && !e.outcome?.llmFallbackUsed
  ).length;
  const accuracyEstimate = withOutcome.length > 0 ? accurate / withOutcome.length : 0;

  // Tool usage distribution
  const toolUsage: Record<string, number> = {};
  for (const e of filtered) {
    if (e.topMatch) {
      toolUsage[e.topMatch.toolId] = (toolUsage[e.topMatch.toolId] || 0) + 1;
    }
  }

  // Category distribution
  const categoryDist: Record<string, number> = {};
  for (const e of filtered) {
    const cat = String(e.intent.category);
    categoryDist[cat] = (categoryDist[cat] || 0) + 1;
  }

  // Hourly distribution
  const hourlyDist: Record<number, number> = {};
  for (const e of filtered) {
    const hour = e.timestamp.getHours();
    hourlyDist[hour] = (hourlyDist[hour] || 0) + 1;
  }

  return {
    totalRoutes: filtered.length,
    autoExecuteCount: autoExecute,
    autoExecuteRate: autoExecute / filtered.length,
    hintCount: hint,
    hintRate: hint / filtered.length,
    conversationCount: conversation,
    conversationRate: conversation / filtered.length,
    avgLatencyMs: avgLatency,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    accuracyEstimate,
    toolUsageDistribution: toolUsage,
    categoryDistribution: categoryDist,
    hourlyDistribution: hourlyDist,
  };
}

/**
 * Get performance metrics per tool
 */
export function getToolPerformance(options?: { since?: Date }): ToolPerformance[] {
  let filtered = [...events];

  if (options?.since) {
    const since = options.since;
    filtered = filtered.filter((e) => e.timestamp >= since);
  }

  // Group by tool
  const toolStats = new Map<
    string,
    {
      routes: number;
      autoExecute: number;
      confidences: number[];
      corrections: number;
      latencies: number[];
    }
  >();

  for (const e of filtered) {
    if (!e.topMatch) continue;

    const toolId = e.topMatch.toolId;
    let stats = toolStats.get(toolId);

    if (!stats) {
      stats = { routes: 0, autoExecute: 0, confidences: [], corrections: 0, latencies: [] };
      toolStats.set(toolId, stats);
    }

    stats.routes++;
    stats.confidences.push(e.topMatch.confidence);
    stats.latencies.push(e.totalTimeMs);

    if (e.actionType === 'execute') {
      stats.autoExecute++;
    }

    if (e.outcome?.corrected) {
      stats.corrections++;
    }
  }

  // Convert to performance metrics
  const performance: ToolPerformance[] = [];

  toolStats.forEach((stats, toolId) => {
    performance.push({
      toolId,
      totalRoutes: stats.routes,
      autoExecuteCount: stats.autoExecute,
      autoExecuteRate: stats.routes > 0 ? stats.autoExecute / stats.routes : 0,
      avgConfidence:
        stats.confidences.length > 0
          ? stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length
          : 0,
      correctionCount: stats.corrections,
      correctionRate: stats.routes > 0 ? stats.corrections / stats.routes : 0,
      avgLatencyMs:
        stats.latencies.length > 0
          ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
          : 0,
    });
  });

  // Sort by usage
  performance.sort((a, b) => b.totalRoutes - a.totalRoutes);

  return performance;
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

export interface DashboardData {
  overview: RoutingStats;
  toolPerformance: ToolPerformance[];
  recentEvents: RoutingEvent[];
  alerts: DashboardAlert[];
}

export interface DashboardAlert {
  type: 'warning' | 'error' | 'info';
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

/**
 * Get full dashboard data
 */
export function getDashboardData(): DashboardData {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lastHour = new Date(Date.now() - 60 * 60 * 1000);

  const overview = getRoutingStats({ since: last24h });
  const hourlyStats = getRoutingStats({ since: lastHour });
  const toolPerformance = getToolPerformance({ since: last24h });

  // Generate alerts
  const alerts: DashboardAlert[] = [];

  // High latency alert
  if (overview.p95LatencyMs > 100) {
    alerts.push({
      type: 'warning',
      message: 'P95 latency is above 100ms',
      metric: 'p95LatencyMs',
      value: overview.p95LatencyMs,
      threshold: 100,
    });
  }

  // Low auto-execute rate
  if (overview.totalRoutes > 100 && overview.autoExecuteRate < 0.3) {
    alerts.push({
      type: 'info',
      message: 'Auto-execute rate is below 30% - consider tuning thresholds',
      metric: 'autoExecuteRate',
      value: overview.autoExecuteRate,
      threshold: 0.3,
    });
  }

  // High correction rate
  if (overview.accuracyEstimate < 0.85 && overview.totalRoutes > 50) {
    alerts.push({
      type: 'warning',
      message: 'Accuracy is below 85% - check common mistakes',
      metric: 'accuracyEstimate',
      value: overview.accuracyEstimate,
      threshold: 0.85,
    });
  }

  // Tools with high correction rate
  for (const tool of toolPerformance) {
    if (tool.correctionRate > 0.1 && tool.totalRoutes > 20) {
      alerts.push({
        type: 'warning',
        message: `Tool "${tool.toolId}" has >10% correction rate`,
        metric: 'correctionRate',
        value: tool.correctionRate,
        threshold: 0.1,
      });
    }
  }

  return {
    overview,
    toolPerformance: toolPerformance.slice(0, 20), // Top 20 tools
    recentEvents: events.slice(-50).reverse(), // Last 50 events
    alerts,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Clear all events (for testing)
 */
export function clearRoutingEvents(): void {
  events.length = 0;
}

/**
 * Get raw events (for export)
 */
export function getRoutingEvents(options?: {
  since?: Date;
  until?: Date;
  limit?: number;
}): RoutingEvent[] {
  let filtered = [...events];

  if (options?.since) {
    const since = options.since;
    filtered = filtered.filter((e) => e.timestamp >= since);
  }
  if (options?.until) {
    const until = options.until;
    filtered = filtered.filter((e) => e.timestamp <= until);
  }
  if (options?.limit) {
    filtered = filtered.slice(-options.limit);
  }

  return filtered;
}
