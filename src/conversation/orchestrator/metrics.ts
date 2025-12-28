/**
 * Orchestrator Metrics & Analytics
 *
 * Tracks performance, feature application rates, and provides insights
 * for monitoring and optimization.
 *
 * Metrics tracked:
 * - Phase timing (analysis, intelligence, humanization, output)
 * - Feature application rates
 * - Confidence distributions
 * - Error rates
 * - Cache hit rates
 *
 * @module @ferni/conversation/orchestrator/metrics
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'OrchestratorMetrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface PhaseMetrics {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface FeatureMetrics {
  applied: number;
  skipped: number;
  errors: number;
  applicationRate: number;
}

export interface OrchestratorMetrics {
  // Session info
  sessionId: string;
  personaId: string;
  startTime: number;
  lastUpdate: number;

  // Overall stats
  totalOrchestrations: number;
  totalErrors: number;
  errorRate: number;

  // Phase timing
  phases: {
    analysis: PhaseMetrics;
    intelligence: PhaseMetrics;
    humanization: PhaseMetrics;
    output: PhaseMetrics;
    total: PhaseMetrics;
  };

  // Feature stats
  features: Record<string, FeatureMetrics>;

  // Confidence stats
  confidence: {
    analysis: { sum: number; count: number; avg: number };
    intelligence: { sum: number; count: number; avg: number };
    overall: { sum: number; count: number; avg: number };
  };

  // Cache stats
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

export interface MetricsSnapshot {
  timestamp: number;
  metrics: OrchestratorMetrics;
  recentTimings: Array<{
    turn: number;
    timing: Record<string, number>;
  }>;
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class MetricsCollector {
  private metrics: OrchestratorMetrics;
  private timingHistory: number[][] = []; // [[analysis, intelligence, humanization, output, total], ...]
  private readonly maxHistorySize = 100;

  constructor(sessionId: string, personaId: string) {
    this.metrics = this.createEmptyMetrics(sessionId, personaId);
  }

  private createEmptyMetrics(sessionId: string, personaId: string): OrchestratorMetrics {
    const emptyPhaseMetrics = (): PhaseMetrics => ({
      count: 0,
      totalMs: 0,
      minMs: Infinity,
      maxMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    });

    return {
      sessionId,
      personaId,
      startTime: Date.now(),
      lastUpdate: Date.now(),

      totalOrchestrations: 0,
      totalErrors: 0,
      errorRate: 0,

      phases: {
        analysis: emptyPhaseMetrics(),
        intelligence: emptyPhaseMetrics(),
        humanization: emptyPhaseMetrics(),
        output: emptyPhaseMetrics(),
        total: emptyPhaseMetrics(),
      },

      features: {},

      confidence: {
        analysis: { sum: 0, count: 0, avg: 0 },
        intelligence: { sum: 0, count: 0, avg: 0 },
        overall: { sum: 0, count: 0, avg: 0 },
      },

      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
      },
    };
  }

  // ==========================================================================
  // RECORDING METHODS
  // ==========================================================================

  /**
   * Record timing for an orchestration
   */
  recordTiming(timing: {
    analysis: number;
    intelligence: number;
    humanization: number;
    output: number;
    total: number;
  }): void {
    this.metrics.totalOrchestrations++;
    this.metrics.lastUpdate = Date.now();

    // Update phase metrics
    this.updatePhaseMetrics('analysis', timing.analysis);
    this.updatePhaseMetrics('intelligence', timing.intelligence);
    this.updatePhaseMetrics('humanization', timing.humanization);
    this.updatePhaseMetrics('output', timing.output);
    this.updatePhaseMetrics('total', timing.total);

    // Store in history for percentile calculations
    this.timingHistory.push([
      timing.analysis,
      timing.intelligence,
      timing.humanization,
      timing.output,
      timing.total,
    ]);

    if (this.timingHistory.length > this.maxHistorySize) {
      this.timingHistory.shift();
    }

    // Recalculate percentiles periodically
    if (this.metrics.totalOrchestrations % 10 === 0) {
      this.recalculatePercentiles();
    }
  }

  private updatePhaseMetrics(phase: keyof OrchestratorMetrics['phases'], ms: number): void {
    const metrics = this.metrics.phases[phase];
    metrics.count++;
    metrics.totalMs += ms;
    metrics.minMs = Math.min(metrics.minMs, ms);
    metrics.maxMs = Math.max(metrics.maxMs, ms);
    metrics.avgMs = metrics.totalMs / metrics.count;
  }

  private recalculatePercentiles(): void {
    if (this.timingHistory.length === 0) return;

    const phaseIndexMap: Record<keyof OrchestratorMetrics['phases'], number> = {
      analysis: 0,
      intelligence: 1,
      humanization: 2,
      output: 3,
      total: 4,
    };

    for (const [phase, index] of Object.entries(phaseIndexMap)) {
      const values = this.timingHistory.map((t) => t[index]).sort((a, b) => a - b);
      const metrics = this.metrics.phases[phase as keyof OrchestratorMetrics['phases']];

      metrics.p50Ms = this.percentile(values, 50);
      metrics.p95Ms = this.percentile(values, 95);
      metrics.p99Ms = this.percentile(values, 99);
    }
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Record feature application
   */
  recordFeature(featureName: string, applied: boolean, error?: boolean): void {
    if (!this.metrics.features[featureName]) {
      this.metrics.features[featureName] = {
        applied: 0,
        skipped: 0,
        errors: 0,
        applicationRate: 0,
      };
    }

    const feature = this.metrics.features[featureName];

    if (error) {
      feature.errors++;
    } else if (applied) {
      feature.applied++;
    } else {
      feature.skipped++;
    }

    const total = feature.applied + feature.skipped;
    feature.applicationRate = total > 0 ? feature.applied / total : 0;
  }

  /**
   * Record multiple features at once
   */
  recordFeatures(appliedFeatures: string[], skippedFeatures?: Array<{ name: string }>): void {
    for (const feature of appliedFeatures) {
      this.recordFeature(feature, true);
    }

    if (skippedFeatures) {
      for (const { name } of skippedFeatures) {
        this.recordFeature(name, false);
      }
    }
  }

  /**
   * Record an error
   */
  recordError(phase?: string): void {
    this.metrics.totalErrors++;
    this.metrics.errorRate = this.metrics.totalErrors / this.metrics.totalOrchestrations;

    if (phase) {
      this.recordFeature(`error_${phase}`, false, true);
    }
  }

  /**
   * Record confidence scores
   */
  recordConfidence(scores: { analysis: number; intelligence: number; overall: number }): void {
    this.updateConfidence('analysis', scores.analysis);
    this.updateConfidence('intelligence', scores.intelligence);
    this.updateConfidence('overall', scores.overall);
  }

  private updateConfidence(type: 'analysis' | 'intelligence' | 'overall', value: number): void {
    const conf = this.metrics.confidence[type];
    conf.sum += value;
    conf.count++;
    conf.avg = conf.sum / conf.count;
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit: boolean): void {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }

    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = total > 0 ? this.metrics.cache.hits / total : 0;
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Get current metrics
   */
  getMetrics(): OrchestratorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get a snapshot with recent history
   */
  getSnapshot(): MetricsSnapshot {
    return {
      timestamp: Date.now(),
      metrics: this.getMetrics(),
      recentTimings: this.timingHistory.slice(-10).map((t, i) => ({
        turn: this.metrics.totalOrchestrations - (10 - i),
        timing: {
          analysis: t[0],
          intelligence: t[1],
          humanization: t[2],
          output: t[3],
          total: t[4],
        },
      })),
    };
  }

  /**
   * Get summary for logging
   */
  getSummary(): {
    totalOrchestrations: number;
    avgTotalMs: number;
    p95TotalMs: number;
    errorRate: number;
    topFeatures: Array<{ name: string; rate: number }>;
    avgConfidence: number;
  } {
    const topFeatures = Object.entries(this.metrics.features)
      .filter(([, f]) => f.applied > 0)
      .sort((a, b) => b[1].applied - a[1].applied)
      .slice(0, 5)
      .map(([name, f]) => ({ name, rate: f.applicationRate }));

    return {
      totalOrchestrations: this.metrics.totalOrchestrations,
      avgTotalMs: this.metrics.phases.total.avgMs,
      p95TotalMs: this.metrics.phases.total.p95Ms,
      errorRate: this.metrics.errorRate,
      topFeatures,
      avgConfidence: this.metrics.confidence.overall.avg,
    };
  }

  /**
   * Check if orchestration is slow
   */
  isSlowOrchestration(totalMs: number): boolean {
    // Consider slow if > 2x average or > 200ms absolute
    return totalMs > Math.max(this.metrics.phases.total.avgMs * 2, 200);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics(this.metrics.sessionId, this.metrics.personaId);
    this.timingHistory = [];
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const collectors = new Map<string, MetricsCollector>();

/**
 * Get or create metrics collector for a session
 */
export function getMetricsCollector(sessionId: string, personaId = 'unknown'): MetricsCollector {
  if (!collectors.has(sessionId)) {
    collectors.set(sessionId, new MetricsCollector(sessionId, personaId));
  }
  return collectors.get(sessionId)!;
}

/**
 * Reset metrics for a session
 */
export function resetMetrics(sessionId: string): void {
  const collector = collectors.get(sessionId);
  if (collector) {
    collector.reset();
    collectors.delete(sessionId);
  }
}

/**
 * Reset all metrics
 */
export function resetAllMetrics(): void {
  collectors.clear();
}

/**
 * Get aggregated metrics across all sessions
 */
export function getAggregatedMetrics(): {
  activeSessions: number;
  totalOrchestrations: number;
  avgTotalMs: number;
  errorRate: number;
  featureRates: Record<string, number>;
} {
  let totalOrchestrations = 0;
  let totalMs = 0;
  let totalErrors = 0;
  const featureCounts: Record<string, { applied: number; total: number }> = {};

  for (const collector of collectors.values()) {
    const metrics = collector.getMetrics();
    totalOrchestrations += metrics.totalOrchestrations;
    totalMs += metrics.phases.total.totalMs;
    totalErrors += metrics.totalErrors;

    for (const [name, feature] of Object.entries(metrics.features)) {
      if (!featureCounts[name]) {
        featureCounts[name] = { applied: 0, total: 0 };
      }
      featureCounts[name].applied += feature.applied;
      featureCounts[name].total += feature.applied + feature.skipped;
    }
  }

  const featureRates: Record<string, number> = {};
  for (const [name, counts] of Object.entries(featureCounts)) {
    featureRates[name] = counts.total > 0 ? counts.applied / counts.total : 0;
  }

  return {
    activeSessions: collectors.size,
    totalOrchestrations,
    avgTotalMs: totalOrchestrations > 0 ? totalMs / totalOrchestrations : 0,
    errorRate: totalOrchestrations > 0 ? totalErrors / totalOrchestrations : 0,
    featureRates,
  };
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Log metrics summary at info level
 */
export function logMetricsSummary(sessionId: string): void {
  const collector = collectors.get(sessionId);
  if (!collector) return;

  const summary = collector.getSummary();
  log.info(
    {
      sessionId,
      orchestrations: summary.totalOrchestrations,
      avgMs: Math.round(summary.avgTotalMs),
      p95Ms: Math.round(summary.p95TotalMs),
      errorRate: (summary.errorRate * 100).toFixed(1) + '%',
      topFeatures: summary.topFeatures.map((f) => `${f.name}:${(f.rate * 100).toFixed(0)}%`),
    },
    '📊 Orchestrator metrics summary'
  );
}

/**
 * Log slow orchestration warning
 */
export function logSlowOrchestration(
  sessionId: string,
  timing: Record<string, number>,
  turn: number
): void {
  const collector = collectors.get(sessionId);
  const isActuallySlow = collector?.isSlowOrchestration(timing.total) ?? timing.total > 200;

  if (isActuallySlow) {
    log.warn(
      {
        sessionId,
        turn,
        totalMs: timing.total,
        breakdown: timing,
      },
      '🐌 Slow orchestration detected'
    );
  }
}

export type { MetricsCollector };
