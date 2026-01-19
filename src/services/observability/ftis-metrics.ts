/**
 * FTIS Observability Metrics
 *
 * Provides metrics and health endpoints for the Ferni Tool Intelligence System.
 * Integrates with the existing observability infrastructure.
 *
 * Endpoints:
 * - GET /api/ftis/health - Health status and configuration
 * - GET /api/ftis/metrics - Prometheus-style metrics
 * - GET /api/ftis/stats - Detailed statistics
 *
 * @module services/observability/ftis-metrics
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getHealthStatus,
  getAccuracyMetrics,
  getSafetyConfig,
  isFTISOnlyModeEnabled,
} from '../../tools/intelligence/ftis-safety.js';
import { getMappingStats } from '../../tools/semantic-router/domain-bridge.js';

const log = createLogger({ module: 'ftis-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface FTISHealthResponse {
  status: 'healthy' | 'degraded' | 'critical';
  mode: 'ftis_only' | 'hybrid' | 'legacy';
  config: {
    ftisOnlyMode: boolean;
    routingTimeoutMs: number;
    confidenceFloor: number;
    accuracyAlertThreshold: number;
  };
  metrics: {
    accuracy: number;
    totalDecisions: number;
    successfulExecutions: number;
    failedExecutions: number;
    userCorrections: number;
  };
  coverage: {
    semanticMappings: number;
    domainTools: number;
    categories: number;
  };
  recommendations: string[];
  timestamp: string;
}

export interface FTISMetricsResponse {
  /** Prometheus-style metrics */
  metrics: string;
}

export interface FTISStatsResponse {
  routing: {
    totalDecisions: number;
    successRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  tools: {
    totalMappings: number;
    mostUsed: Array<{ toolId: string; count: number }>;
    leastUsed: Array<{ toolId: string; count: number }>;
    failureRates: Array<{ toolId: string; rate: number }>;
  };
  personas: {
    distribution: Record<string, number>;
    handoffRate: number;
  };
  period: {
    start: string;
    end: string;
    durationHours: number;
  };
}

// ============================================================================
// METRICS TRACKING STATE
// ============================================================================

interface MetricsState {
  routingLatencies: number[];
  toolUsage: Map<string, number>;
  toolFailures: Map<string, number>;
  personaUsage: Map<string, number>;
  handoffCount: number;
  periodStart: Date;
}

let metricsState: MetricsState = {
  routingLatencies: [],
  toolUsage: new Map(),
  toolFailures: new Map(),
  personaUsage: new Map(),
  handoffCount: 0,
  periodStart: new Date(),
};

// ============================================================================
// METRICS RECORDING
// ============================================================================

/**
 * Record a routing decision for metrics tracking.
 */
export function recordRoutingDecision(params: {
  toolId: string;
  latencyMs: number;
  success: boolean;
  personaId: string;
  wasHandoff: boolean;
}): void {
  // Record latency
  metricsState.routingLatencies.push(params.latencyMs);
  if (metricsState.routingLatencies.length > 10000) {
    metricsState.routingLatencies = metricsState.routingLatencies.slice(-5000);
  }

  // Record tool usage
  const currentUsage = metricsState.toolUsage.get(params.toolId) || 0;
  metricsState.toolUsage.set(params.toolId, currentUsage + 1);

  // Record failures
  if (!params.success) {
    const currentFailures = metricsState.toolFailures.get(params.toolId) || 0;
    metricsState.toolFailures.set(params.toolId, currentFailures + 1);
  }

  // Record persona usage
  const currentPersonaUsage = metricsState.personaUsage.get(params.personaId) || 0;
  metricsState.personaUsage.set(params.personaId, currentPersonaUsage + 1);

  // Record handoffs
  if (params.wasHandoff) {
    metricsState.handoffCount++;
  }
}

/**
 * Reset metrics for a new period.
 */
export function resetMetricsPeriod(): void {
  metricsState = {
    routingLatencies: [],
    toolUsage: new Map(),
    toolFailures: new Map(),
    personaUsage: new Map(),
    handoffCount: 0,
    periodStart: new Date(),
  };
}

// ============================================================================
// HEALTH ENDPOINT
// ============================================================================

/**
 * Get FTIS health status.
 */
export function getFTISHealth(): FTISHealthResponse {
  const safetyHealth = getHealthStatus();
  const accuracyMetrics = getAccuracyMetrics();
  const safetyConfig = getSafetyConfig();
  const mappingStats = getMappingStats();

  // Determine mode
  let mode: 'ftis_only' | 'hybrid' | 'legacy' = 'legacy';
  if (isFTISOnlyModeEnabled()) {
    mode = 'ftis_only';
  } else if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    mode = 'hybrid';
  }

  return {
    status: safetyHealth.status,
    mode,
    config: {
      ftisOnlyMode: safetyConfig.ftisOnlyMode,
      routingTimeoutMs: safetyConfig.routingTimeoutMs,
      confidenceFloor: safetyConfig.confidenceFloor,
      accuracyAlertThreshold: safetyConfig.accuracyAlertThreshold,
    },
    metrics: {
      accuracy: accuracyMetrics.accuracy,
      totalDecisions: accuracyMetrics.totalDecisions,
      successfulExecutions: accuracyMetrics.successfulExecutions,
      failedExecutions: accuracyMetrics.failedExecutions,
      userCorrections: accuracyMetrics.userCorrections,
    },
    coverage: {
      semanticMappings: mappingStats.totalMappings,
      domainTools: mappingStats.uniqueDomainTools,
      categories: mappingStats.categories,
    },
    recommendations: safetyHealth.recommendations,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// PROMETHEUS METRICS ENDPOINT
// ============================================================================

/**
 * Get Prometheus-style metrics.
 */
export function getFTISPrometheusMetrics(): FTISMetricsResponse {
  const accuracyMetrics = getAccuracyMetrics();
  const mappingStats = getMappingStats();
  const latencies = metricsState.routingLatencies;

  // Calculate percentiles
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  const lines: string[] = [
    '# HELP ftis_routing_decisions_total Total number of FTIS routing decisions',
    '# TYPE ftis_routing_decisions_total counter',
    `ftis_routing_decisions_total ${accuracyMetrics.totalDecisions}`,
    '',
    '# HELP ftis_routing_success_total Successful FTIS routing decisions',
    '# TYPE ftis_routing_success_total counter',
    `ftis_routing_success_total ${accuracyMetrics.successfulExecutions}`,
    '',
    '# HELP ftis_routing_failure_total Failed FTIS routing decisions',
    '# TYPE ftis_routing_failure_total counter',
    `ftis_routing_failure_total ${accuracyMetrics.failedExecutions}`,
    '',
    '# HELP ftis_accuracy_rate Current FTIS accuracy rate',
    '# TYPE ftis_accuracy_rate gauge',
    `ftis_accuracy_rate ${accuracyMetrics.accuracy.toFixed(4)}`,
    '',
    '# HELP ftis_routing_latency_ms Routing latency in milliseconds',
    '# TYPE ftis_routing_latency_ms summary',
    `ftis_routing_latency_ms{quantile="0.5"} ${p50}`,
    `ftis_routing_latency_ms{quantile="0.95"} ${p95}`,
    `ftis_routing_latency_ms{quantile="0.99"} ${p99}`,
    '',
    '# HELP ftis_semantic_mappings_total Total semantic tool mappings',
    '# TYPE ftis_semantic_mappings_total gauge',
    `ftis_semantic_mappings_total ${mappingStats.totalMappings}`,
    '',
    '# HELP ftis_only_mode_enabled Whether FTIS-only mode is enabled',
    '# TYPE ftis_only_mode_enabled gauge',
    `ftis_only_mode_enabled ${isFTISOnlyModeEnabled() ? 1 : 0}`,
    '',
    '# HELP ftis_alert_state Whether FTIS is in alert state',
    '# TYPE ftis_alert_state gauge',
    `ftis_alert_state ${accuracyMetrics.isAlertState ? 1 : 0}`,
  ];

  return {
    metrics: lines.join('\n'),
  };
}

// ============================================================================
// DETAILED STATS ENDPOINT
// ============================================================================

/**
 * Get detailed FTIS statistics.
 */
export function getFTISStats(): FTISStatsResponse {
  const accuracyMetrics = getAccuracyMetrics();
  const latencies = metricsState.routingLatencies;

  // Calculate latency stats
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

  // Calculate tool usage rankings
  const toolUsageArray = Array.from(metricsState.toolUsage.entries())
    .map(([toolId, count]) => ({ toolId, count }))
    .sort((a, b) => b.count - a.count);

  // Calculate failure rates
  const failureRates = Array.from(metricsState.toolUsage.entries())
    .map(([toolId, usage]) => {
      const failures = metricsState.toolFailures.get(toolId) || 0;
      return {
        toolId,
        rate: usage > 0 ? failures / usage : 0,
      };
    })
    .filter((r) => r.rate > 0)
    .sort((a, b) => b.rate - a.rate);

  // Calculate persona distribution
  const personaDistribution: Record<string, number> = {};
  for (const [personaId, count] of metricsState.personaUsage) {
    personaDistribution[personaId] = count;
  }

  const totalPersonaUsage = Array.from(metricsState.personaUsage.values()).reduce(
    (a, b) => a + b,
    0
  );

  return {
    routing: {
      totalDecisions: accuracyMetrics.totalDecisions,
      successRate: accuracyMetrics.accuracy,
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
      p99LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
    },
    tools: {
      totalMappings: getMappingStats().totalMappings,
      mostUsed: toolUsageArray.slice(0, 10),
      leastUsed: toolUsageArray.slice(-10).reverse(),
      failureRates: failureRates.slice(0, 10),
    },
    personas: {
      distribution: personaDistribution,
      handoffRate:
        totalPersonaUsage > 0 ? metricsState.handoffCount / totalPersonaUsage : 0,
    },
    period: {
      start: metricsState.periodStart.toISOString(),
      end: new Date().toISOString(),
      durationHours:
        (Date.now() - metricsState.periodStart.getTime()) / (1000 * 60 * 60),
    },
  };
}

// ============================================================================
// EXPRESS ROUTE HANDLER
// ============================================================================

/**
 * Register FTIS routes on an Express app.
 */
export function registerFTISRoutes(app: {
  get: (path: string, handler: (req: unknown, res: { json: (data: unknown) => void; type: (t: string) => { send: (s: string) => void } }) => void) => void;
}): void {
  // Health endpoint
  app.get('/api/ftis/health', (_, res) => {
    const health = getFTISHealth();
    res.json(health);
  });

  // Prometheus metrics endpoint
  app.get('/api/ftis/metrics', (_, res) => {
    const metrics = getFTISPrometheusMetrics();
    res.type('text/plain').send(metrics.metrics);
  });

  // Detailed stats endpoint
  app.get('/api/ftis/stats', (_, res) => {
    const stats = getFTISStats();
    res.json(stats);
  });

  log.info('Registered FTIS observability routes');
}
