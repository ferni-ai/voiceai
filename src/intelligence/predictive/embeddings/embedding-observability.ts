/**
 * Embedding Intelligence Observability
 *
 * Tracks metrics and effectiveness of embedding-powered predictions.
 *
 * METRICS TRACKED:
 * - Embedding generation counts and latencies
 * - Prediction accuracy (when outcomes are recorded)
 * - Capability usage frequency
 * - Hydration and persistence stats
 * - Intervention recommendation success rates
 *
 * @module intelligence/predictive/embeddings/embedding-observability
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'EmbeddingObservability' });

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingMetrics {
  // Embedding generation
  embeddingsGenerated: number;
  embeddingLatencyMs: number[];
  embeddingErrors: number;

  // Capability usage
  semanticAvoidanceChecks: number;
  trajectoryPredictions: number;
  breakthroughAssessments: number;
  trajectoryAnalyses: number;
  interventionRecommendations: number;
  ripplePredictions: number;
  communityInsights: number;

  // Effectiveness (when outcomes recorded)
  trajectoryPredictionsCorrect: number;
  trajectoryPredictionsIncorrect: number;
  interventionsSuccessful: number;
  interventionsFailed: number;
  breakthroughsDetected: number;
  avoidanceApproachesDetected: number;

  // Persistence
  hydrationsPerformed: number;
  flushesPerformed: number;
  persistenceErrors: number;

  // Session stats
  sessionsTracked: number;
  turnsProcessed: number;
}

export interface CapabilityHealth {
  capability: string;
  status: 'healthy' | 'degraded' | 'error';
  lastUsed: number;
  errorRate: number;
  avgLatencyMs: number;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

const metrics: EmbeddingMetrics = {
  embeddingsGenerated: 0,
  embeddingLatencyMs: [],
  embeddingErrors: 0,

  semanticAvoidanceChecks: 0,
  trajectoryPredictions: 0,
  breakthroughAssessments: 0,
  trajectoryAnalyses: 0,
  interventionRecommendations: 0,
  ripplePredictions: 0,
  communityInsights: 0,

  trajectoryPredictionsCorrect: 0,
  trajectoryPredictionsIncorrect: 0,
  interventionsSuccessful: 0,
  interventionsFailed: 0,
  breakthroughsDetected: 0,
  avoidanceApproachesDetected: 0,

  hydrationsPerformed: 0,
  flushesPerformed: 0,
  persistenceErrors: 0,

  sessionsTracked: 0,
  turnsProcessed: 0,
};

// Track last usage per capability
const lastUsage: Record<string, number> = {};
const errorCounts: Record<string, number> = {};
const latencies: Record<string, number[]> = {};

// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================

/**
 * Record embedding generation
 */
export function recordEmbeddingGeneration(latencyMs: number, success: boolean): void {
  if (success) {
    metrics.embeddingsGenerated++;
    metrics.embeddingLatencyMs.push(latencyMs);
    // Keep only last 100 latencies
    if (metrics.embeddingLatencyMs.length > 100) {
      metrics.embeddingLatencyMs.shift();
    }
  } else {
    metrics.embeddingErrors++;
  }
}

/**
 * Record capability usage
 */
export function recordCapabilityUsage(
  capability:
    | 'semantic_avoidance'
    | 'trajectory_patterns'
    | 'breakthrough'
    | 'conversation_trajectory'
    | 'intervention'
    | 'ripple'
    | 'community',
  latencyMs?: number,
  error?: boolean
): void {
  lastUsage[capability] = Date.now();

  if (error) {
    errorCounts[capability] = (errorCounts[capability] || 0) + 1;
  }

  if (latencyMs !== undefined) {
    if (!latencies[capability]) latencies[capability] = [];
    latencies[capability].push(latencyMs);
    if (latencies[capability].length > 50) {
      latencies[capability].shift();
    }
  }

  // Update specific counters
  switch (capability) {
    case 'semantic_avoidance':
      metrics.semanticAvoidanceChecks++;
      break;
    case 'trajectory_patterns':
      metrics.trajectoryPredictions++;
      break;
    case 'breakthrough':
      metrics.breakthroughAssessments++;
      break;
    case 'conversation_trajectory':
      metrics.trajectoryAnalyses++;
      break;
    case 'intervention':
      metrics.interventionRecommendations++;
      break;
    case 'ripple':
      metrics.ripplePredictions++;
      break;
    case 'community':
      metrics.communityInsights++;
      break;
  }
}

/**
 * Record prediction outcome (for accuracy tracking)
 */
export function recordPredictionOutcome(
  type: 'trajectory' | 'intervention' | 'breakthrough' | 'avoidance',
  success: boolean
): void {
  switch (type) {
    case 'trajectory':
      if (success) metrics.trajectoryPredictionsCorrect++;
      else metrics.trajectoryPredictionsIncorrect++;
      break;
    case 'intervention':
      if (success) metrics.interventionsSuccessful++;
      else metrics.interventionsFailed++;
      break;
    case 'breakthrough':
      if (success) metrics.breakthroughsDetected++;
      break;
    case 'avoidance':
      metrics.avoidanceApproachesDetected++;
      break;
  }
}

/**
 * Record persistence operation
 */
export function recordPersistence(operation: 'hydration' | 'flush', success: boolean): void {
  if (operation === 'hydration') {
    if (success) metrics.hydrationsPerformed++;
    else metrics.persistenceErrors++;
  } else {
    if (success) metrics.flushesPerformed++;
    else metrics.persistenceErrors++;
  }
}

/**
 * Record session tracking
 */
export function recordSession(): void {
  metrics.sessionsTracked++;
}

/**
 * Record turn processing
 */
export function recordTurn(): void {
  metrics.turnsProcessed++;
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get current metrics
 */
export function getMetrics(): EmbeddingMetrics {
  return { ...metrics };
}

/**
 * Get metrics summary for logging/monitoring
 */
export function getMetricsSummary(): {
  embeddingStats: {
    total: number;
    avgLatencyMs: number;
    errorRate: number;
  };
  capabilityUsage: Record<string, number>;
  effectiveness: {
    trajectoryAccuracy: number;
    interventionSuccessRate: number;
  };
  persistence: {
    hydrations: number;
    flushes: number;
    errors: number;
  };
} {
  const avgLatency =
    metrics.embeddingLatencyMs.length > 0
      ? metrics.embeddingLatencyMs.reduce((a, b) => a + b, 0) / metrics.embeddingLatencyMs.length
      : 0;

  const trajectoryTotal =
    metrics.trajectoryPredictionsCorrect + metrics.trajectoryPredictionsIncorrect;
  const interventionTotal = metrics.interventionsSuccessful + metrics.interventionsFailed;

  return {
    embeddingStats: {
      total: metrics.embeddingsGenerated,
      avgLatencyMs: Math.round(avgLatency),
      errorRate:
        metrics.embeddingsGenerated > 0
          ? metrics.embeddingErrors / (metrics.embeddingsGenerated + metrics.embeddingErrors)
          : 0,
    },
    capabilityUsage: {
      semanticAvoidance: metrics.semanticAvoidanceChecks,
      trajectoryPatterns: metrics.trajectoryPredictions,
      breakthrough: metrics.breakthroughAssessments,
      conversationTrajectory: metrics.trajectoryAnalyses,
      intervention: metrics.interventionRecommendations,
      ripple: metrics.ripplePredictions,
      community: metrics.communityInsights,
    },
    effectiveness: {
      trajectoryAccuracy:
        trajectoryTotal > 0 ? metrics.trajectoryPredictionsCorrect / trajectoryTotal : 0,
      interventionSuccessRate:
        interventionTotal > 0 ? metrics.interventionsSuccessful / interventionTotal : 0,
    },
    persistence: {
      hydrations: metrics.hydrationsPerformed,
      flushes: metrics.flushesPerformed,
      errors: metrics.persistenceErrors,
    },
  };
}

/**
 * Get health status per capability
 */
export function getCapabilityHealth(): CapabilityHealth[] {
  const capabilities = [
    'semantic_avoidance',
    'trajectory_patterns',
    'breakthrough',
    'conversation_trajectory',
    'intervention',
    'ripple',
    'community',
  ];

  return capabilities.map((cap) => {
    const errors = errorCounts[cap] || 0;
    const usage = getUsageCount(cap);
    const errorRate = usage > 0 ? errors / usage : 0;
    const avgLatency = latencies[cap]
      ? latencies[cap].reduce((a, b) => a + b, 0) / latencies[cap].length
      : 0;

    let status: 'healthy' | 'degraded' | 'error' = 'healthy';
    if (errorRate > 0.3) status = 'error';
    else if (errorRate > 0.1) status = 'degraded';

    return {
      capability: cap,
      status,
      lastUsed: lastUsage[cap] || 0,
      errorRate,
      avgLatencyMs: Math.round(avgLatency),
    };
  });
}

function getUsageCount(capability: string): number {
  switch (capability) {
    case 'semantic_avoidance':
      return metrics.semanticAvoidanceChecks;
    case 'trajectory_patterns':
      return metrics.trajectoryPredictions;
    case 'breakthrough':
      return metrics.breakthroughAssessments;
    case 'conversation_trajectory':
      return metrics.trajectoryAnalyses;
    case 'intervention':
      return metrics.interventionRecommendations;
    case 'ripple':
      return metrics.ripplePredictions;
    case 'community':
      return metrics.communityInsights;
    default:
      return 0;
  }
}

/**
 * Reset metrics (for testing or new period)
 */
export function resetMetrics(): void {
  Object.keys(metrics).forEach((key) => {
    const k = key as keyof EmbeddingMetrics;
    if (Array.isArray(metrics[k])) {
      (metrics[k] as number[]).length = 0;
    } else {
      (metrics[k] as number) = 0;
    }
  });

  Object.keys(lastUsage).forEach((k) => delete lastUsage[k]);
  Object.keys(errorCounts).forEach((k) => delete errorCounts[k]);
  Object.keys(latencies).forEach((k) => delete latencies[k]);

  log.debug('📊 Embedding metrics reset');
}

/**
 * Log metrics summary (call periodically or on session end)
 */
export function logMetricsSummary(): void {
  const summary = getMetricsSummary();

  log.info(
    {
      embeddings: summary.embeddingStats,
      usage: summary.capabilityUsage,
      effectiveness: summary.effectiveness,
      persistence: summary.persistence,
    },
    '📊 Embedding Intelligence Metrics'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const embeddingObservability = {
  // Recording
  recordEmbeddingGeneration,
  recordCapabilityUsage,
  recordPredictionOutcome,
  recordPersistence,
  recordSession,
  recordTurn,

  // Retrieval
  getMetrics,
  getMetricsSummary,
  getCapabilityHealth,

  // Management
  resetMetrics,
  logMetricsSummary,
};

export default embeddingObservability;
