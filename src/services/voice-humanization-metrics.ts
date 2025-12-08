/**
 * Voice Humanization Metrics Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Collects and aggregates metrics for all voice humanization features:
 * - Preemptive caching hit rates
 * - Turn prediction accuracy
 * - Laughter detection frequency
 * - Latency measurements
 * - Feature usage statistics
 *
 * @module VoiceHumanizationMetrics
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VoiceHumanizationMetrics' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Single metric event
 */
export interface MetricEvent {
  timestamp: number;
  sessionId: string;
  feature: string;
  event: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metrics for a feature
 */
export interface FeatureMetrics {
  feature: string;
  totalEvents: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastUpdated: number;
}

/**
 * Preemptive cache metrics
 */
export interface CacheMetrics {
  totalAttempts: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgHitLatencyMs: number;
  avgMissLatencyMs: number;
  intentBreakdown: Record<string, { hits: number; misses: number }>;
  latencySavingsMs: number;
}

/**
 * Turn prediction metrics
 */
export interface TurnPredictionMetrics {
  totalPredictions: number;
  correctPredictions: number;
  falseTakeTurns: number;
  missedTurns: number;
  accuracy: number;
  avgConfidence: number;
  avgSilenceAtPrediction: number;
}

/**
 * Laughter detection metrics
 */
export interface LaughterMetrics {
  totalDetections: number;
  confirmedLaughter: number;
  falsePositives: number;
  precision: number;
  avgConfidence: number;
  typeBreakdown: Record<string, number>;
}

/**
 * Overall dashboard data
 */
export interface DashboardData {
  sessionCount: number;
  activeSessionCount: number;
  cache: CacheMetrics;
  turnPrediction: TurnPredictionMetrics;
  laughter: LaughterMetrics;
  featureUsage: Record<string, { enabled: number; triggered: number }>;
  latencyPercentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  lastUpdated: number;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

interface MetricsStore {
  events: MetricEvent[];
  sessions: Set<string>;
  activeSessions: Set<string>;
  cacheAttempts: Array<{ hit: boolean; intent: string; latencyMs: number; timestamp: number }>;
  turnPredictions: Array<{
    predicted: boolean;
    actual: boolean;
    confidence: number;
    silenceMs: number;
    timestamp: number;
  }>;
  laughterDetections: Array<{
    detected: boolean;
    confirmed: boolean;
    confidence: number;
    type: string;
    timestamp: number;
  }>;
  latencies: number[];
  featureUsage: Map<string, { enabled: number; triggered: number }>;
}

const store: MetricsStore = {
  events: [],
  sessions: new Set(),
  activeSessions: new Set(),
  cacheAttempts: [],
  turnPredictions: [],
  laughterDetections: [],
  latencies: [],
  featureUsage: new Map(),
};

// Max events to keep in memory
const MAX_EVENTS = 10000;
const MAX_CACHE_ATTEMPTS = 1000;
const MAX_LATENCIES = 1000;

// ============================================================================
// METRIC RECORDING
// ============================================================================

/**
 * Record a generic metric event
 */
export function recordMetric(
  sessionId: string,
  feature: string,
  event: string,
  value?: number,
  metadata?: Record<string, unknown>
): void {
  const metricEvent: MetricEvent = {
    timestamp: Date.now(),
    sessionId,
    feature,
    event,
    value,
    metadata,
  };

  store.events.push(metricEvent);
  if (store.events.length > MAX_EVENTS) {
    store.events.shift();
  }

  store.sessions.add(sessionId);

  log.debug({ feature, event, value }, '📊 Metric recorded');
}

/**
 * Record session start
 */
export function recordSessionStart(sessionId: string): void {
  store.sessions.add(sessionId);
  store.activeSessions.add(sessionId);
  recordMetric(sessionId, 'session', 'start');
}

/**
 * Record session end
 */
export function recordSessionEnd(sessionId: string): void {
  store.activeSessions.delete(sessionId);
  recordMetric(sessionId, 'session', 'end');
}

/**
 * Record cache attempt
 */
export function recordCacheAttempt(
  sessionId: string,
  hit: boolean,
  intent: string,
  latencyMs: number
): void {
  store.cacheAttempts.push({
    hit,
    intent,
    latencyMs,
    timestamp: Date.now(),
  });

  if (store.cacheAttempts.length > MAX_CACHE_ATTEMPTS) {
    store.cacheAttempts.shift();
  }

  recordMetric(sessionId, 'cache', hit ? 'hit' : 'miss', latencyMs, { intent });
}

/**
 * Record turn prediction
 */
export function recordTurnPrediction(
  sessionId: string,
  predicted: boolean,
  actual: boolean,
  confidence: number,
  silenceMs: number
): void {
  store.turnPredictions.push({
    predicted,
    actual,
    confidence,
    silenceMs,
    timestamp: Date.now(),
  });

  if (store.turnPredictions.length > MAX_CACHE_ATTEMPTS) {
    store.turnPredictions.shift();
  }

  const correct = predicted === actual;
  recordMetric(sessionId, 'turn_prediction', correct ? 'correct' : 'incorrect', confidence, {
    predicted,
    actual,
    silenceMs,
  });
}

/**
 * Record laughter detection
 */
export function recordLaughterDetection(
  sessionId: string,
  detected: boolean,
  confirmed: boolean,
  confidence: number,
  laughType: string
): void {
  store.laughterDetections.push({
    detected,
    confirmed,
    confidence,
    type: laughType,
    timestamp: Date.now(),
  });

  if (store.laughterDetections.length > MAX_CACHE_ATTEMPTS) {
    store.laughterDetections.shift();
  }

  recordMetric(sessionId, 'laughter', detected ? 'detected' : 'none', confidence, {
    confirmed,
    type: laughType,
  });
}

/**
 * Record latency measurement
 */
export function recordLatency(sessionId: string, feature: string, latencyMs: number): void {
  store.latencies.push(latencyMs);
  if (store.latencies.length > MAX_LATENCIES) {
    store.latencies.shift();
  }

  recordMetric(sessionId, feature, 'latency', latencyMs);
}

/**
 * Record feature usage
 */
export function recordFeatureUsage(sessionId: string, feature: string, triggered: boolean): void {
  const current = store.featureUsage.get(feature) || { enabled: 0, triggered: 0 };
  current.enabled++;
  if (triggered) {
    current.triggered++;
  }
  store.featureUsage.set(feature, current);

  recordMetric(sessionId, feature, triggered ? 'triggered' : 'enabled');
}

// ============================================================================
// METRICS AGGREGATION
// ============================================================================

/**
 * Get cache metrics
 */
export function getCacheMetrics(): CacheMetrics {
  const attempts = store.cacheAttempts;
  const hits = attempts.filter((a) => a.hit);
  const misses = attempts.filter((a) => !a.hit);

  // Intent breakdown
  const intentBreakdown: Record<string, { hits: number; misses: number }> = {};
  for (const attempt of attempts) {
    if (!intentBreakdown[attempt.intent]) {
      intentBreakdown[attempt.intent] = { hits: 0, misses: 0 };
    }
    if (attempt.hit) {
      intentBreakdown[attempt.intent].hits++;
    } else {
      intentBreakdown[attempt.intent].misses++;
    }
  }

  const avgHitLatency =
    hits.length > 0 ? hits.reduce((sum, h) => sum + h.latencyMs, 0) / hits.length : 0;
  const avgMissLatency =
    misses.length > 0 ? misses.reduce((sum, m) => sum + m.latencyMs, 0) / misses.length : 0;

  // Estimated latency savings (assume 150ms per hit)
  const latencySavings = hits.length * 150;

  return {
    totalAttempts: attempts.length,
    cacheHits: hits.length,
    cacheMisses: misses.length,
    hitRate: attempts.length > 0 ? hits.length / attempts.length : 0,
    avgHitLatencyMs: avgHitLatency,
    avgMissLatencyMs: avgMissLatency,
    intentBreakdown,
    latencySavingsMs: latencySavings,
  };
}

/**
 * Get turn prediction metrics
 */
export function getTurnPredictionMetrics(): TurnPredictionMetrics {
  const predictions = store.turnPredictions;
  const correct = predictions.filter((p) => p.predicted === p.actual);
  const falseTakeTurns = predictions.filter((p) => p.predicted && !p.actual);
  const missedTurns = predictions.filter((p) => !p.predicted && p.actual);

  const avgConfidence =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
      : 0;
  const avgSilence =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.silenceMs, 0) / predictions.length
      : 0;

  return {
    totalPredictions: predictions.length,
    correctPredictions: correct.length,
    falseTakeTurns: falseTakeTurns.length,
    missedTurns: missedTurns.length,
    accuracy: predictions.length > 0 ? correct.length / predictions.length : 0,
    avgConfidence,
    avgSilenceAtPrediction: avgSilence,
  };
}

/**
 * Get laughter detection metrics
 */
export function getLaughterMetrics(): LaughterMetrics {
  const detections = store.laughterDetections.filter((d) => d.detected);
  const confirmed = detections.filter((d) => d.confirmed);
  const falsePositives = detections.filter((d) => !d.confirmed);

  // Type breakdown
  const typeBreakdown: Record<string, number> = {};
  for (const detection of detections) {
    typeBreakdown[detection.type] = (typeBreakdown[detection.type] || 0) + 1;
  }

  const avgConfidence =
    detections.length > 0
      ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
      : 0;

  return {
    totalDetections: detections.length,
    confirmedLaughter: confirmed.length,
    falsePositives: falsePositives.length,
    precision: detections.length > 0 ? confirmed.length / detections.length : 0,
    avgConfidence,
    typeBreakdown,
  };
}

/**
 * Get latency percentiles
 */
export function getLatencyPercentiles(): { p50: number; p90: number; p95: number; p99: number } {
  if (store.latencies.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }

  const sorted = [...store.latencies].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.floor((sorted.length * p) / 100)] || 0;

  return {
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
  };
}

/**
 * Get full dashboard data
 */
export function getDashboardData(): DashboardData {
  const featureUsage: Record<string, { enabled: number; triggered: number }> = {};
  for (const [feature, usage] of store.featureUsage) {
    featureUsage[feature] = usage;
  }

  return {
    sessionCount: store.sessions.size,
    activeSessionCount: store.activeSessions.size,
    cache: getCacheMetrics(),
    turnPrediction: getTurnPredictionMetrics(),
    laughter: getLaughterMetrics(),
    featureUsage,
    latencyPercentiles: getLatencyPercentiles(),
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// API ENDPOINT DATA
// ============================================================================

/**
 * Get metrics for API endpoint (JSON format)
 */
export function getMetricsJson(): Record<string, unknown> {
  const dashboard = getDashboardData();
  return {
    success: true,
    data: dashboard,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  store.events = [];
  store.sessions.clear();
  store.activeSessions.clear();
  store.cacheAttempts = [];
  store.turnPredictions = [];
  store.laughterDetections = [];
  store.latencies = [];
  store.featureUsage.clear();
  log.info('📊 Metrics reset');
}
