/**
 * Semantic Router Metrics
 *
 * Collects and reports metrics for semantic routing.
 * Used for analytics, debugging, and optimization.
 *
 * Also feeds learning events to the Unified Intelligence Layer
 * for "Better Than Human" continuous improvement.
 *
 * @module tools/semantic-router/integration/metrics
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'semantic-router:metrics' });

// Lazy import to avoid circular dependencies
import type { LearningEvent } from '../../intelligence/index.js';

let intelligenceLayer: { recordLearning: (event: LearningEvent) => Promise<void> } | null = null;

async function getIntelligenceLayer() {
  if (!intelligenceLayer) {
    try {
      const { getUnifiedIntelligence } = await import('../../intelligence/index.js');
      intelligenceLayer = getUnifiedIntelligence();
    } catch {
      // Intelligence layer not available - that's okay
    }
  }
  return intelligenceLayer;
}

// ============================================================================
// METRIC TYPES
// ============================================================================

export interface RoutingMetric {
  timestamp: Date;
  userId: string;
  sessionId: string;
  userInput: string;
  toolId: string | null;
  confidence: number;
  matchPath: 'pattern' | 'keyword' | 'embedding' | 'combined' | 'none';
  action: 'execute' | 'hint' | 'conversation' | 'error';
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
  error?: string;
}

export interface AggregateMetrics {
  totalRoutes: number;
  successfulRoutes: number;
  bypassedLLM: number;
  hints: number;
  conversations: number;
  errors: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
  toolBreakdown: Record<string, number>;
  matchPathBreakdown: Record<string, number>;
}

// ============================================================================
// METRICS STORAGE (In-memory for now)
// ============================================================================

const MAX_METRICS = 10000; // Keep last 10k metrics in memory
const metrics: RoutingMetric[] = [];

// ============================================================================
// METRIC COLLECTION
// ============================================================================

/**
 * Record a routing metric
 */
export function recordRoutingMetric(metric: Omit<RoutingMetric, 'timestamp'>): void {
  const fullMetric: RoutingMetric = {
    ...metric,
    timestamp: new Date(),
  };

  // Add to in-memory store
  metrics.push(fullMetric);

  // Trim if too many
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }

  // Log for debugging/monitoring
  log.info(
    {
      toolId: metric.toolId,
      confidence: metric.confidence,
      action: metric.action,
      latencyMs: metric.latencyMs,
      cacheHit: metric.cacheHit,
      matchPath: metric.matchPath,
    },
    `Routing: ${metric.action}`
  );
}

/**
 * Record a successful LLM bypass
 */
export function recordLLMBypass(
  userId: string,
  sessionId: string,
  userInput: string,
  toolId: string,
  confidence: number,
  matchPath: string,
  latencyMs: number,
  cacheHit: boolean
): void {
  recordRoutingMetric({
    userId,
    sessionId,
    userInput: userInput.slice(0, 100), // Truncate for storage
    toolId,
    confidence,
    matchPath: matchPath as RoutingMetric['matchPath'],
    action: 'execute',
    latencyMs,
    cacheHit,
    success: true,
  });
}

/**
 * Record a hint added to LLM context
 */
export function recordHintAdded(
  userId: string,
  sessionId: string,
  userInput: string,
  toolId: string,
  confidence: number,
  matchPath: string,
  latencyMs: number
): void {
  recordRoutingMetric({
    userId,
    sessionId,
    userInput: userInput.slice(0, 100),
    toolId,
    confidence,
    matchPath: matchPath as RoutingMetric['matchPath'],
    action: 'hint',
    latencyMs,
    cacheHit: false,
    success: true,
  });
}

/**
 * Record no tool match (pure conversation)
 */
export function recordConversation(
  userId: string,
  sessionId: string,
  userInput: string,
  latencyMs: number
): void {
  recordRoutingMetric({
    userId,
    sessionId,
    userInput: userInput.slice(0, 100),
    toolId: null,
    confidence: 0,
    matchPath: 'none',
    action: 'conversation',
    latencyMs,
    cacheHit: false,
    success: true,
  });
}

/**
 * Record a routing error
 */
export function recordRoutingError(
  userId: string,
  sessionId: string,
  userInput: string,
  error: string,
  latencyMs: number
): void {
  recordRoutingMetric({
    userId,
    sessionId,
    userInput: userInput.slice(0, 100),
    toolId: null,
    confidence: 0,
    matchPath: 'none',
    action: 'error',
    latencyMs,
    cacheHit: false,
    success: false,
    error,
  });
}

// ============================================================================
// LEARNING LOOP CLOSURE (Better Than Human)
// ============================================================================

/**
 * Record a learning event when semantic router was corrected
 *
 * This closes the learning loop - corrections feed into the
 * Unified Intelligence Layer for continuous improvement.
 *
 * @example
 * // Semantic router predicted "spotify_play" but user wanted "apple_music_play"
 * recordLearningEvent({
 *   userId: 'user123',
 *   sessionId: 'session456',
 *   query: 'play some jazz',
 *   predictedTool: 'spotify_play',
 *   actualTool: 'apple_music_play',
 *   confidence: 0.85,
 *   wasCorrection: true,
 * });
 */
export async function recordLearningEvent(event: {
  userId: string;
  sessionId: string;
  query: string;
  predictedTool: string;
  actualTool: string;
  confidence: number;
  wasCorrection: boolean;
  personaId?: string;
}): Promise<void> {
  // Log the learning event
  log.info(
    {
      userId: event.userId,
      wasCorrection: event.wasCorrection,
      predicted: event.predictedTool,
      actual: event.actualTool,
      confidence: event.confidence,
    },
    event.wasCorrection ? '📚 Correction recorded' : '✅ Confirmation recorded'
  );

  // Feed to intelligence layer for cross-session learning
  try {
    const intelligence = await getIntelligenceLayer();
    if (intelligence) {
      await intelligence.recordLearning({
        userId: event.userId,
        sessionId: event.sessionId,
        query: event.query,
        predictedTool: event.predictedTool,
        actualTool: event.actualTool,
        confidence: event.confidence,
        wasCorrection: event.wasCorrection,
        timestamp: new Date(),
        context: event.personaId ? { personaId: event.personaId, timeOfDay: 'unknown' } : undefined,
      });
    }
  } catch (err) {
    log.debug({ error: String(err) }, 'Intelligence layer learning failed (non-critical)');
  }
}

/**
 * Record a successful tool execution (confirmation of prediction)
 */
export async function recordToolSuccess(
  userId: string,
  sessionId: string,
  query: string,
  toolId: string,
  confidence: number,
  personaId?: string
): Promise<void> {
  await recordLearningEvent({
    userId,
    sessionId,
    query,
    predictedTool: toolId,
    actualTool: toolId,
    confidence,
    wasCorrection: false,
    personaId,
  });
}

/**
 * Record a tool correction (user chose different tool)
 */
export async function recordToolCorrection(
  userId: string,
  sessionId: string,
  query: string,
  predictedTool: string,
  actualTool: string,
  confidence: number,
  personaId?: string
): Promise<void> {
  await recordLearningEvent({
    userId,
    sessionId,
    query,
    predictedTool,
    actualTool,
    confidence,
    wasCorrection: true,
    personaId,
  });
}

// ============================================================================
// METRIC RETRIEVAL
// ============================================================================

/**
 * Get recent metrics
 */
export function getRecentMetrics(limit = 100): RoutingMetric[] {
  return metrics.slice(-limit);
}

/**
 * Get aggregate metrics
 */
export function getAggregateMetrics(since?: Date): AggregateMetrics {
  const filtered = since ? metrics.filter((m) => m.timestamp >= since) : metrics;

  if (filtered.length === 0) {
    return {
      totalRoutes: 0,
      successfulRoutes: 0,
      bypassedLLM: 0,
      hints: 0,
      conversations: 0,
      errors: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      cacheHitRate: 0,
      toolBreakdown: {},
      matchPathBreakdown: {},
    };
  }

  const latencies = filtered.map((m) => m.latencyMs).sort((a, b) => a - b);
  const p50Index = Math.floor(latencies.length * 0.5);
  const p95Index = Math.floor(latencies.length * 0.95);

  const toolBreakdown: Record<string, number> = {};
  const matchPathBreakdown: Record<string, number> = {};

  for (const m of filtered) {
    if (m.toolId) {
      toolBreakdown[m.toolId] = (toolBreakdown[m.toolId] || 0) + 1;
    }
    matchPathBreakdown[m.matchPath] = (matchPathBreakdown[m.matchPath] || 0) + 1;
  }

  const cacheHits = filtered.filter((m) => m.cacheHit).length;

  return {
    totalRoutes: filtered.length,
    successfulRoutes: filtered.filter((m) => m.success).length,
    bypassedLLM: filtered.filter((m) => m.action === 'execute').length,
    hints: filtered.filter((m) => m.action === 'hint').length,
    conversations: filtered.filter((m) => m.action === 'conversation').length,
    errors: filtered.filter((m) => m.action === 'error').length,
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p50LatencyMs: latencies[p50Index] || 0,
    p95LatencyMs: latencies[p95Index] || 0,
    cacheHitRate: cacheHits / filtered.length,
    toolBreakdown,
    matchPathBreakdown,
  };
}

/**
 * Get metrics for a specific user
 */
export function getUserMetrics(userId: string, limit = 100): RoutingMetric[] {
  return metrics.filter((m) => m.userId === userId).slice(-limit);
}

/**
 * Get metrics for a specific tool
 */
export function getToolMetrics(toolId: string, limit = 100): RoutingMetric[] {
  return metrics.filter((m) => m.toolId === toolId).slice(-limit);
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics(): void {
  metrics.length = 0;
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

/**
 * Get data for a metrics dashboard
 */
export function getDashboardData(): {
  aggregate: AggregateMetrics;
  recent: RoutingMetric[];
  hourly: Array<{ hour: number; count: number; avgLatency: number }>;
} {
  const aggregate = getAggregateMetrics();
  const recent = getRecentMetrics(20);

  // Group by hour
  const hourlyMap = new Map<number, { count: number; totalLatency: number }>();
  const now = new Date();

  for (const m of metrics) {
    const hoursAgo = Math.floor((now.getTime() - m.timestamp.getTime()) / (1000 * 60 * 60));
    if (hoursAgo < 24) {
      const existing = hourlyMap.get(hoursAgo) || { count: 0, totalLatency: 0 };
      hourlyMap.set(hoursAgo, {
        count: existing.count + 1,
        totalLatency: existing.totalLatency + m.latencyMs,
      });
    }
  }

  const hourly: Array<{ hour: number; count: number; avgLatency: number }> = [];
  for (let h = 0; h < 24; h++) {
    const data = hourlyMap.get(h);
    hourly.push({
      hour: h,
      count: data?.count || 0,
      avgLatency: data ? Math.round(data.totalLatency / data.count) : 0,
    });
  }

  return { aggregate, recent, hourly };
}
