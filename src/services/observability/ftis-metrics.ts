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

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getHealthStatus,
  getAccuracyMetrics,
  getSafetyConfig,
  isFTISOnlyModeEnabled,
} from '../../tools/intelligence/ftis-safety.js';
import { getMappingStats } from '../../tools/semantic-router/domain-bridge.js';
import { isFTISV2OnlyMode } from '../../agents/processors/ftis-v2-integration.js';
// BTH Injection tracking imports
import type { InjectionFeedback } from '../../intelligence/feedback/injection-tracker.js';

const log = createLogger({ module: 'ftis-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface FTISHealthResponse {
  status: 'healthy' | 'degraded' | 'critical';
  mode: 'ftis_only' | 'ftis_v2_only' | 'hybrid' | 'legacy';
  config: {
    ftisOnlyMode: boolean;
    ftisV2OnlyMode: boolean;
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
  /** FTIS V2 specific metrics - only populated when FTIS V2 is enabled */
  ftisV2?: {
    directExecutionCount: number;
    directExecutionRate: number;
    avgDirectLatencyMs: number;
    p95DirectLatencyMs: number;
    jsonWorkaroundBypassCount: number;
    fallbackRate: number;
    successRate: number;
    executionsByCategory: Record<string, number>;
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
// FTIS V2 SPECIFIC METRICS STATE
// Tracks direct execution, JSON workaround bypass, and fallbacks
// ============================================================================

interface FTISV2MetricsState {
  /** Total direct executions via FTIS V2 classification */
  directExecutionCount: number;
  /** Latencies for direct executions (ms) */
  directExecutionLatencies: number[];
  /** Times JSON workaround was bypassed because FTIS V2 mode was active */
  jsonWorkaroundBypassCount: number;
  /** Times FTIS V2 fell back to LLM (low confidence) */
  fallbackToLLMCount: number;
  /** Executions by tool category */
  executionsByCategory: Map<string, number>;
  /** Failed direct executions */
  failedDirectExecutions: number;
  /** When metrics started collecting */
  periodStart: Date;
}

let ftisV2MetricsState: FTISV2MetricsState = {
  directExecutionCount: 0,
  directExecutionLatencies: [],
  jsonWorkaroundBypassCount: 0,
  fallbackToLLMCount: 0,
  executionsByCategory: new Map(),
  failedDirectExecutions: 0,
  periodStart: new Date(),
};

// ============================================================================
// BTH INJECTION METRICS STATE
// Phase 1 of BTH Communication System Overhaul - Track injection effectiveness
// ============================================================================

interface InjectionMetricsState {
  /** Total injections delivered to LLM */
  totalDelivered: number;
  /** Injections where LLM response aligned (above threshold) */
  alignedCount: number;
  /** User positive reactions after aligned injections */
  positiveReactionCount: number;
  /** User negative reactions */
  negativeReactionCount: number;
  /** User neutral reactions */
  neutralReactionCount: number;
  /** Context bloat: how many were generated but not delivered */
  generatedCount: number;
  /** Running sum of alignment scores for average calculation */
  alignmentScoreSum: number;
  /** Per-category hit rates */
  categoryDelivered: Map<string, number>;
  categoryAligned: Map<string, number>;
  /** Per-builder metrics for ROI calculation */
  builderDelivered: Map<string, number>;
  builderAligned: Map<string, number>;
  builderPositive: Map<string, number>;
  builderNegative: Map<string, number>;
  /** When metrics started collecting */
  periodStart: Date;
}

let injectionMetricsState: InjectionMetricsState = {
  totalDelivered: 0,
  alignedCount: 0,
  positiveReactionCount: 0,
  negativeReactionCount: 0,
  neutralReactionCount: 0,
  generatedCount: 0,
  alignmentScoreSum: 0,
  categoryDelivered: new Map(),
  categoryAligned: new Map(),
  builderDelivered: new Map(),
  builderAligned: new Map(),
  builderPositive: new Map(),
  builderNegative: new Map(),
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
  
  ftisV2MetricsState = {
    directExecutionCount: 0,
    directExecutionLatencies: [],
    jsonWorkaroundBypassCount: 0,
    fallbackToLLMCount: 0,
    executionsByCategory: new Map(),
    failedDirectExecutions: 0,
    periodStart: new Date(),
  };

  // Reset BTH injection metrics
  injectionMetricsState = {
    totalDelivered: 0,
    alignedCount: 0,
    positiveReactionCount: 0,
    negativeReactionCount: 0,
    neutralReactionCount: 0,
    generatedCount: 0,
    alignmentScoreSum: 0,
    categoryDelivered: new Map(),
    categoryAligned: new Map(),
    builderDelivered: new Map(),
    builderAligned: new Map(),
    builderPositive: new Map(),
    builderNegative: new Map(),
    periodStart: new Date(),
  };
}

// ============================================================================
// FTIS V2 METRICS RECORDING
// ============================================================================

/**
 * Record a direct execution via FTIS V2.
 * Called when FTIS V2 classification triggers direct tool execution.
 */
export function recordFTISV2DirectExecution(params: {
  category: string;
  latencyMs: number;
  success: boolean;
}): void {
  ftisV2MetricsState.directExecutionCount++;
  ftisV2MetricsState.directExecutionLatencies.push(params.latencyMs);
  
  // Keep latencies array bounded
  if (ftisV2MetricsState.directExecutionLatencies.length > 10000) {
    ftisV2MetricsState.directExecutionLatencies = 
      ftisV2MetricsState.directExecutionLatencies.slice(-5000);
  }
  
  // Track by category
  const currentCount = ftisV2MetricsState.executionsByCategory.get(params.category) || 0;
  ftisV2MetricsState.executionsByCategory.set(params.category, currentCount + 1);
  
  if (!params.success) {
    ftisV2MetricsState.failedDirectExecutions++;
  }
  
  log.debug(
    { 
      category: params.category, 
      latencyMs: params.latencyMs, 
      success: params.success,
      totalDirectExecutions: ftisV2MetricsState.directExecutionCount,
    },
    'FTIS V2 direct execution recorded'
  );
}

/**
 * Record when JSON workaround was bypassed due to FTIS V2 mode.
 * Called from transform-stream.ts when FTIS V2 mode short-circuits.
 */
export function recordFTISV2JsonBypass(): void {
  ftisV2MetricsState.jsonWorkaroundBypassCount++;
}

/**
 * Record when FTIS V2 fell back to LLM due to low confidence.
 */
export function recordFTISV2FallbackToLLM(): void {
  ftisV2MetricsState.fallbackToLLMCount++;
}

/**
 * Get FTIS V2 specific metrics.
 */
export function getFTISV2Metrics(): {
  enabled: boolean;
  directExecutionCount: number;
  directExecutionRate: number;
  avgDirectLatencyMs: number;
  p95DirectLatencyMs: number;
  jsonWorkaroundBypassCount: number;
  fallbackToLLMCount: number;
  fallbackRate: number;
  failedDirectExecutions: number;
  successRate: number;
  executionsByCategory: Record<string, number>;
  periodStart: string;
} {
  const latencies = ftisV2MetricsState.directExecutionLatencies;
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const totalAttempts = ftisV2MetricsState.directExecutionCount + 
                       ftisV2MetricsState.fallbackToLLMCount;
  
  return {
    enabled: isFTISV2OnlyMode(),
    directExecutionCount: ftisV2MetricsState.directExecutionCount,
    directExecutionRate: totalAttempts > 0 
      ? ftisV2MetricsState.directExecutionCount / totalAttempts 
      : 0,
    avgDirectLatencyMs: latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    p95DirectLatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
    jsonWorkaroundBypassCount: ftisV2MetricsState.jsonWorkaroundBypassCount,
    fallbackToLLMCount: ftisV2MetricsState.fallbackToLLMCount,
    fallbackRate: totalAttempts > 0 
      ? ftisV2MetricsState.fallbackToLLMCount / totalAttempts 
      : 0,
    failedDirectExecutions: ftisV2MetricsState.failedDirectExecutions,
    successRate: ftisV2MetricsState.directExecutionCount > 0
      ? (ftisV2MetricsState.directExecutionCount - ftisV2MetricsState.failedDirectExecutions) / 
        ftisV2MetricsState.directExecutionCount
      : 0,
    executionsByCategory: Object.fromEntries(ftisV2MetricsState.executionsByCategory),
    periodStart: ftisV2MetricsState.periodStart.toISOString(),
  };
}

// ============================================================================
// BTH INJECTION METRICS RECORDING
// Phase 1 of BTH Communication System Overhaul - Track injection effectiveness
// ============================================================================

/**
 * Record injection feedback from session end.
 * Called by the session cleanup flow to aggregate feedback into observability metrics.
 */
export function recordInjectionFeedback(feedback: InjectionFeedback): void {
  const state = injectionMetricsState;

  // Core counts
  state.totalDelivered++;
  if (feedback.wasUsedInResponse) {
    state.alignedCount++;
  }
  state.alignmentScoreSum += feedback.responseAlignment;

  // User reaction
  switch (feedback.userReaction) {
    case 'positive':
      state.positiveReactionCount++;
      break;
    case 'negative':
      state.negativeReactionCount++;
      break;
    case 'neutral':
      state.neutralReactionCount++;
      break;
  }

  // Category metrics
  const category = feedback.category || 'unknown';
  state.categoryDelivered.set(category, (state.categoryDelivered.get(category) || 0) + 1);
  if (feedback.wasUsedInResponse) {
    state.categoryAligned.set(category, (state.categoryAligned.get(category) || 0) + 1);
  }

  // Builder metrics
  const builder = feedback.builderName || 'unknown';
  state.builderDelivered.set(builder, (state.builderDelivered.get(builder) || 0) + 1);
  if (feedback.wasUsedInResponse) {
    state.builderAligned.set(builder, (state.builderAligned.get(builder) || 0) + 1);
  }
  if (feedback.userReaction === 'positive') {
    state.builderPositive.set(builder, (state.builderPositive.get(builder) || 0) + 1);
  } else if (feedback.userReaction === 'negative') {
    state.builderNegative.set(builder, (state.builderNegative.get(builder) || 0) + 1);
  }
}

/**
 * Record context bloat - how many injections were generated but filtered out.
 * Called from injection-filter.ts when filtering happens.
 */
export function recordInjectionBloat(generatedCount: number, deliveredCount: number): void {
  injectionMetricsState.generatedCount += generatedCount;
  // Note: totalDelivered is incremented by recordInjectionFeedback

  log.debug(
    {
      generated: generatedCount,
      delivered: deliveredCount,
      filtered: generatedCount - deliveredCount,
      bloatRatio: generatedCount > 0 ? ((generatedCount - deliveredCount) / generatedCount).toFixed(2) : '0',
    },
    'BTH Injection bloat recorded'
  );
}

/**
 * Get BTH injection effectiveness metrics.
 */
export function getInjectionMetrics(): {
  enabled: boolean;
  totalDelivered: number;
  alignedCount: number;
  hitRate: number;
  avgAlignmentScore: number;
  positiveReactionCount: number;
  negativeReactionCount: number;
  neutralReactionCount: number;
  positiveReactionRate: number;
  generatedCount: number;
  bloatRatio: number;
  categoryHitRates: Record<string, { delivered: number; aligned: number; hitRate: number }>;
  builderROI: Record<string, { delivered: number; aligned: number; positive: number; negative: number; roiScore: number }>;
  periodStart: string;
} {
  const state = injectionMetricsState;
  const totalReactions = state.positiveReactionCount + state.negativeReactionCount + state.neutralReactionCount;

  // Calculate category hit rates
  const categoryHitRates: Record<string, { delivered: number; aligned: number; hitRate: number }> = {};
  for (const [category, delivered] of state.categoryDelivered) {
    const aligned = state.categoryAligned.get(category) || 0;
    categoryHitRates[category] = {
      delivered,
      aligned,
      hitRate: delivered > 0 ? aligned / delivered : 0,
    };
  }

  // Calculate builder ROI scores
  const builderROI: Record<string, { delivered: number; aligned: number; positive: number; negative: number; roiScore: number }> = {};
  for (const [builder, delivered] of state.builderDelivered) {
    const aligned = state.builderAligned.get(builder) || 0;
    const positive = state.builderPositive.get(builder) || 0;
    const negative = state.builderNegative.get(builder) || 0;

    // ROI = (alignment rate * 50) + (positive rate * 30) - (negative rate * 20)
    const alignmentRate = delivered > 0 ? aligned / delivered : 0;
    const totalBuilderReactions = positive + negative;
    const positiveRate = totalBuilderReactions > 0 ? positive / totalBuilderReactions : 0;
    const negativeRate = totalBuilderReactions > 0 ? negative / totalBuilderReactions : 0;
    const roiScore = Math.max(0, Math.min(100, Math.round(
      alignmentRate * 50 + positiveRate * 30 - negativeRate * 20
    )));

    builderROI[builder] = { delivered, aligned, positive, negative, roiScore };
  }

  return {
    enabled: true, // BTH injection tracking is always enabled
    totalDelivered: state.totalDelivered,
    alignedCount: state.alignedCount,
    hitRate: state.totalDelivered > 0 ? state.alignedCount / state.totalDelivered : 0,
    avgAlignmentScore: state.totalDelivered > 0
      ? state.alignmentScoreSum / state.totalDelivered
      : 0,
    positiveReactionCount: state.positiveReactionCount,
    negativeReactionCount: state.negativeReactionCount,
    neutralReactionCount: state.neutralReactionCount,
    positiveReactionRate: totalReactions > 0 ? state.positiveReactionCount / totalReactions : 0,
    generatedCount: state.generatedCount,
    bloatRatio: state.generatedCount > 0
      ? (state.generatedCount - state.totalDelivered) / state.generatedCount
      : 0,
    categoryHitRates,
    builderROI,
    periodStart: state.periodStart.toISOString(),
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
  const ftisV2Active = isFTISV2OnlyMode();

  // Determine mode
  let mode: 'ftis_only' | 'ftis_v2_only' | 'hybrid' | 'legacy' = 'legacy';
  if (ftisV2Active) {
    mode = 'ftis_v2_only';
  } else if (isFTISOnlyModeEnabled()) {
    mode = 'ftis_only';
  } else if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    mode = 'hybrid';
  }

  // Build base response
  const response: FTISHealthResponse = {
    status: safetyHealth.status,
    mode,
    config: {
      ftisOnlyMode: safetyConfig.ftisOnlyMode,
      ftisV2OnlyMode: ftisV2Active,
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

  // Add FTIS V2 specific metrics when enabled
  if (ftisV2Active) {
    const v2Metrics = getFTISV2Metrics();
    response.ftisV2 = {
      directExecutionCount: v2Metrics.directExecutionCount,
      directExecutionRate: v2Metrics.directExecutionRate,
      avgDirectLatencyMs: v2Metrics.avgDirectLatencyMs,
      p95DirectLatencyMs: v2Metrics.p95DirectLatencyMs,
      jsonWorkaroundBypassCount: v2Metrics.jsonWorkaroundBypassCount,
      fallbackRate: v2Metrics.fallbackRate,
      successRate: v2Metrics.successRate,
      executionsByCategory: v2Metrics.executionsByCategory,
    };
  }

  return response;
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
  const ftisV2Active = isFTISV2OnlyMode();
  const v2Metrics = getFTISV2Metrics();

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
    '# HELP ftis_v2_only_mode_enabled Whether FTIS V2 only mode is enabled',
    '# TYPE ftis_v2_only_mode_enabled gauge',
    `ftis_v2_only_mode_enabled ${ftisV2Active ? 1 : 0}`,
    '',
    '# HELP ftis_alert_state Whether FTIS is in alert state',
    '# TYPE ftis_alert_state gauge',
    `ftis_alert_state ${accuracyMetrics.isAlertState ? 1 : 0}`,
  ];

  // Add FTIS V2 specific metrics when enabled
  if (ftisV2Active) {
    lines.push(
      '',
      '# HELP ftis_v2_direct_executions_total Total FTIS V2 direct tool executions',
      '# TYPE ftis_v2_direct_executions_total counter',
      `ftis_v2_direct_executions_total ${v2Metrics.directExecutionCount}`,
      '',
      '# HELP ftis_v2_direct_execution_rate Rate of direct executions vs total attempts',
      '# TYPE ftis_v2_direct_execution_rate gauge',
      `ftis_v2_direct_execution_rate ${v2Metrics.directExecutionRate.toFixed(4)}`,
      '',
      '# HELP ftis_v2_avg_latency_ms Average FTIS V2 direct execution latency',
      '# TYPE ftis_v2_avg_latency_ms gauge',
      `ftis_v2_avg_latency_ms ${v2Metrics.avgDirectLatencyMs}`,
      '',
      '# HELP ftis_v2_p95_latency_ms P95 FTIS V2 direct execution latency',
      '# TYPE ftis_v2_p95_latency_ms gauge',
      `ftis_v2_p95_latency_ms ${v2Metrics.p95DirectLatencyMs}`,
      '',
      '# HELP ftis_v2_json_bypass_total Times JSON workaround was bypassed',
      '# TYPE ftis_v2_json_bypass_total counter',
      `ftis_v2_json_bypass_total ${v2Metrics.jsonWorkaroundBypassCount}`,
      '',
      '# HELP ftis_v2_fallback_rate Rate of fallbacks to LLM (low confidence)',
      '# TYPE ftis_v2_fallback_rate gauge',
      `ftis_v2_fallback_rate ${v2Metrics.fallbackRate.toFixed(4)}`,
      '',
      '# HELP ftis_v2_success_rate Success rate of direct executions',
      '# TYPE ftis_v2_success_rate gauge',
      `ftis_v2_success_rate ${v2Metrics.successRate.toFixed(4)}`,
    );
  }

  // Add BTH Injection metrics (Phase 1 Communication System Overhaul)
  const injectionMetrics = getInjectionMetrics();
  lines.push(
    '',
    '# BTH INJECTION TRACKING METRICS (Communication System Phase 1)',
    '',
    '# HELP bth_injection_delivered_total Total context injections delivered to LLM',
    '# TYPE bth_injection_delivered_total counter',
    `bth_injection_delivered_total ${injectionMetrics.totalDelivered}`,
    '',
    '# HELP bth_injection_aligned_total Injections that influenced LLM response',
    '# TYPE bth_injection_aligned_total counter',
    `bth_injection_aligned_total ${injectionMetrics.alignedCount}`,
    '',
    '# HELP bth_injection_hit_rate Rate of injections that influenced response',
    '# TYPE bth_injection_hit_rate gauge',
    `bth_injection_hit_rate ${injectionMetrics.hitRate.toFixed(4)}`,
    '',
    '# HELP bth_injection_avg_alignment Average semantic alignment score (0-1)',
    '# TYPE bth_injection_avg_alignment gauge',
    `bth_injection_avg_alignment ${injectionMetrics.avgAlignmentScore.toFixed(4)}`,
    '',
    '# HELP bth_injection_positive_reactions_total User positive reactions after injection',
    '# TYPE bth_injection_positive_reactions_total counter',
    `bth_injection_positive_reactions_total ${injectionMetrics.positiveReactionCount}`,
    '',
    '# HELP bth_injection_negative_reactions_total User negative reactions after injection',
    '# TYPE bth_injection_negative_reactions_total counter',
    `bth_injection_negative_reactions_total ${injectionMetrics.negativeReactionCount}`,
    '',
    '# HELP bth_injection_positive_rate Positive reaction rate',
    '# TYPE bth_injection_positive_rate gauge',
    `bth_injection_positive_rate ${injectionMetrics.positiveReactionRate.toFixed(4)}`,
    '',
    '# HELP bth_injection_generated_total Total injections generated (before filtering)',
    '# TYPE bth_injection_generated_total counter',
    `bth_injection_generated_total ${injectionMetrics.generatedCount}`,
    '',
    '# HELP bth_injection_bloat_ratio Ratio of generated that were filtered out',
    '# TYPE bth_injection_bloat_ratio gauge',
    `bth_injection_bloat_ratio ${injectionMetrics.bloatRatio.toFixed(4)}`,
  );

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
// RAW HTTP ROUTE HANDLER (for UI Server)
// ============================================================================

/**
 * Handle FTIS routes for raw HTTP servers (UI Server pattern).
 *
 * Endpoints:
 * - GET /api/ftis/health - Full health status with recommendations
 * - GET /api/ftis/metrics - Prometheus-format metrics for Grafana
 * - GET /api/ftis/stats - Detailed routing/tool/persona statistics
 *
 * @returns true if handled, false if route doesn't match
 */
export async function handleFTISRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/ftis routes
  if (!pathname.startsWith('/api/ftis')) {
    return false;
  }

  // Only GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  // Health endpoint
  if (pathname === '/api/ftis/health') {
    const health = getFTISHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return true;
  }

  // Prometheus metrics endpoint
  if (pathname === '/api/ftis/metrics') {
    const metrics = getFTISPrometheusMetrics();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(metrics.metrics);
    return true;
  }

  // Detailed stats endpoint
  if (pathname === '/api/ftis/stats') {
    const stats = getFTISStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return true;
  }

  // Unknown /api/ftis/* route
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
  return true;
}

// ============================================================================
// EXPRESS ROUTE HANDLER (legacy)
// ============================================================================

/**
 * Register FTIS routes on an Express app.
 * @deprecated Use handleFTISRoutes for raw HTTP servers
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
