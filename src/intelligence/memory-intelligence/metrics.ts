/**
 * Memory Intelligence Metrics
 *
 * Observability for the Memory Intelligence system.
 * Tracks timing decisions, surfacing rates, learning feedback, and response quality.
 *
 * @module intelligence/memory-intelligence/metrics
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryIntelMetrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface TimingDecisionMetric {
  /** Decision timestamp */
  timestamp: Date;
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId?: string;
  /** Whether memory was surfaced */
  shouldSurface: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Reason for decision */
  reason: string;
  /** Trigger type if surfaced */
  triggerType?: string;
  /** Processing time (ms) */
  processingTimeMs: number;
}

export interface SurfacingMetric {
  /** Surfacing timestamp */
  timestamp: Date;
  /** User ID */
  userId: string;
  /** Memory IDs surfaced */
  memoryIds: string[];
  /** Persona used for phrasing */
  persona: string;
  /** Phrasing warmth level */
  warmthLevel: number;
}

export interface ResponseMetric {
  /** Response timestamp */
  timestamp: Date;
  /** User ID */
  userId: string;
  /** How user responded to surfaced memory */
  responseType: 'engaged' | 'deflected' | 'neutral' | 'acknowledged' | 'expanded' | 'redirected';
  /** Memory IDs that were responded to */
  memoryIds: string[];
  /** Time between surfacing and response (ms) */
  responseTimeMs?: number;
}

export interface MemoryIntelligenceMetrics {
  /** Timing decisions */
  timing: {
    totalDecisions: number;
    surfaceDecisions: number;
    blockDecisions: number;
    averageConfidence: number;
    averageProcessingTimeMs: number;
    decisionsByReason: Record<string, number>;
    decisionsByTrigger: Record<string, number>;
  };
  /** Surfacing metrics */
  surfacing: {
    totalSurfacings: number;
    memoriesSurfaced: number;
    uniqueMemoriesSurfaced: number;
    surfacingsByPersona: Record<string, number>;
    averageWarmthLevel: number;
  };
  /** Response metrics */
  responses: {
    totalResponses: number;
    responseDistribution: Record<string, number>;
    engagementRate: number;
    deflectionRate: number;
    averageResponseTimeMs: number;
  };
  /** Session-level */
  sessions: {
    activeSessions: number;
    totalSessionsTracked: number;
    averageSurfacingsPerSession: number;
  };
}

// ============================================================================
// STATE
// ============================================================================

const state = {
  // Recent metrics for rolling window (last 1 hour)
  timingDecisions: [] as TimingDecisionMetric[],
  surfacings: [] as SurfacingMetric[],
  responses: [] as ResponseMetric[],

  // Aggregated counters
  totalDecisions: 0,
  totalSurfacings: 0,
  totalResponses: 0,
  activeSessions: new Set<string>(),
  allSessionIds: new Set<string>(),
  uniqueMemoriesSurfaced: new Set<string>(),

  // Rolling window duration (1 hour)
  windowMs: 60 * 60 * 1000,
};

// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================

/**
 * Record a timing decision
 */
export function recordTimingDecision(metric: Omit<TimingDecisionMetric, 'timestamp'>): void {
  const fullMetric: TimingDecisionMetric = {
    ...metric,
    timestamp: new Date(),
  };

  state.timingDecisions.push(fullMetric);
  state.totalDecisions++;

  if (metric.sessionId) {
    state.activeSessions.add(metric.sessionId);
    state.allSessionIds.add(metric.sessionId);
  }

  // Cleanup old entries
  pruneOldEntries();

  log.debug(
    {
      userId: metric.userId,
      shouldSurface: metric.shouldSurface,
      confidence: metric.confidence,
      reason: metric.reason,
    },
    'Timing decision recorded'
  );
}

/**
 * Record a memory surfacing event
 */
export function recordSurfacing(metric: Omit<SurfacingMetric, 'timestamp'>): void {
  const fullMetric: SurfacingMetric = {
    ...metric,
    timestamp: new Date(),
  };

  state.surfacings.push(fullMetric);
  state.totalSurfacings++;

  for (const memoryId of metric.memoryIds) {
    state.uniqueMemoriesSurfaced.add(memoryId);
  }

  pruneOldEntries();

  log.debug(
    {
      userId: metric.userId,
      memoryCount: metric.memoryIds.length,
      persona: metric.persona,
      warmthLevel: metric.warmthLevel,
    },
    'Surfacing recorded'
  );
}

/**
 * Record a user response to surfaced memory
 */
export function recordResponse(metric: Omit<ResponseMetric, 'timestamp'>): void {
  const fullMetric: ResponseMetric = {
    ...metric,
    timestamp: new Date(),
  };

  state.responses.push(fullMetric);
  state.totalResponses++;

  pruneOldEntries();

  log.debug(
    {
      userId: metric.userId,
      responseType: metric.responseType,
      memoryCount: metric.memoryIds.length,
    },
    'Response recorded'
  );
}

/**
 * Mark a session as ended
 */
export function markSessionEnded(sessionId: string): void {
  state.activeSessions.delete(sessionId);
}

// ============================================================================
// METRICS RETRIEVAL
// ============================================================================

/**
 * Get current Memory Intelligence metrics
 */
export function getMetrics(): MemoryIntelligenceMetrics {
  pruneOldEntries();

  const recentDecisions = state.timingDecisions;
  const recentSurfacings = state.surfacings;
  const recentResponses = state.responses;

  // Calculate timing metrics
  const surfaceDecisions = recentDecisions.filter((d) => d.shouldSurface).length;
  const blockDecisions = recentDecisions.filter((d) => !d.shouldSurface).length;
  const avgConfidence =
    recentDecisions.length > 0
      ? recentDecisions.reduce((sum, d) => sum + d.confidence, 0) / recentDecisions.length
      : 0;
  const avgProcessingTime =
    recentDecisions.length > 0
      ? recentDecisions.reduce((sum, d) => sum + d.processingTimeMs, 0) / recentDecisions.length
      : 0;

  const decisionsByReason: Record<string, number> = {};
  const decisionsByTrigger: Record<string, number> = {};
  for (const d of recentDecisions) {
    decisionsByReason[d.reason] = (decisionsByReason[d.reason] || 0) + 1;
    if (d.triggerType) {
      decisionsByTrigger[d.triggerType] = (decisionsByTrigger[d.triggerType] || 0) + 1;
    }
  }

  // Calculate surfacing metrics
  const memoriesSurfacedCount = recentSurfacings.reduce((sum, s) => sum + s.memoryIds.length, 0);
  const surfacingsByPersona: Record<string, number> = {};
  let totalWarmth = 0;
  for (const s of recentSurfacings) {
    surfacingsByPersona[s.persona] = (surfacingsByPersona[s.persona] || 0) + 1;
    totalWarmth += s.warmthLevel;
  }
  const avgWarmth = recentSurfacings.length > 0 ? totalWarmth / recentSurfacings.length : 0;

  // Calculate response metrics
  const responseDistribution: Record<string, number> = {};
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  for (const r of recentResponses) {
    responseDistribution[r.responseType] = (responseDistribution[r.responseType] || 0) + 1;
    if (r.responseTimeMs !== undefined) {
      totalResponseTime += r.responseTimeMs;
      responseTimeCount++;
    }
  }

  const engagedResponses = (responseDistribution['engaged'] || 0) + (responseDistribution['expanded'] || 0);
  const deflectedResponses = (responseDistribution['deflected'] || 0) + (responseDistribution['redirected'] || 0);
  const engagementRate = recentResponses.length > 0 ? engagedResponses / recentResponses.length : 0;
  const deflectionRate = recentResponses.length > 0 ? deflectedResponses / recentResponses.length : 0;
  const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;

  // Calculate session metrics
  const avgSurfacingsPerSession =
    state.allSessionIds.size > 0 ? state.totalSurfacings / state.allSessionIds.size : 0;

  return {
    timing: {
      totalDecisions: recentDecisions.length,
      surfaceDecisions,
      blockDecisions,
      averageConfidence: avgConfidence,
      averageProcessingTimeMs: avgProcessingTime,
      decisionsByReason,
      decisionsByTrigger,
    },
    surfacing: {
      totalSurfacings: recentSurfacings.length,
      memoriesSurfaced: memoriesSurfacedCount,
      uniqueMemoriesSurfaced: state.uniqueMemoriesSurfaced.size,
      surfacingsByPersona,
      averageWarmthLevel: avgWarmth,
    },
    responses: {
      totalResponses: recentResponses.length,
      responseDistribution,
      engagementRate,
      deflectionRate,
      averageResponseTimeMs: avgResponseTime,
    },
    sessions: {
      activeSessions: state.activeSessions.size,
      totalSessionsTracked: state.allSessionIds.size,
      averageSurfacingsPerSession: avgSurfacingsPerSession,
    },
  };
}

/**
 * Get summary string for logging
 */
export function getMetricsSummary(): string {
  const m = getMetrics();
  return [
    `Memory Intelligence Metrics (last hour):`,
    `  Timing: ${m.timing.totalDecisions} decisions (${m.timing.surfaceDecisions} surface, ${m.timing.blockDecisions} block)`,
    `  Confidence: avg ${(m.timing.averageConfidence * 100).toFixed(1)}%`,
    `  Surfacing: ${m.surfacing.totalSurfacings} events, ${m.surfacing.memoriesSurfaced} memories`,
    `  Responses: ${m.responses.totalResponses} tracked, ${(m.responses.engagementRate * 100).toFixed(1)}% engagement`,
    `  Sessions: ${m.sessions.activeSessions} active, ${m.sessions.totalSessionsTracked} total`,
  ].join('\n');
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  state.timingDecisions = [];
  state.surfacings = [];
  state.responses = [];
  state.totalDecisions = 0;
  state.totalSurfacings = 0;
  state.totalResponses = 0;
  state.activeSessions.clear();
  state.allSessionIds.clear();
  state.uniqueMemoriesSurfaced.clear();
}

// ============================================================================
// HELPERS
// ============================================================================

function pruneOldEntries(): void {
  const cutoff = Date.now() - state.windowMs;

  state.timingDecisions = state.timingDecisions.filter((d) => d.timestamp.getTime() > cutoff);
  state.surfacings = state.surfacings.filter((s) => s.timestamp.getTime() > cutoff);
  state.responses = state.responses.filter((r) => r.timestamp.getTime() > cutoff);
}
