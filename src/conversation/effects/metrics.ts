/**
 * Effect Metrics
 *
 * Observability for the humanization effects system.
 * Tracks effect firing rates, latencies, and outcomes.
 *
 * @module @ferni/conversation/effects/metrics
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EffectMetrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface EffectMetricEvent {
  effectId: string;
  capability: string;
  outcome: 'applied' | 'skipped' | 'error';
  reason?: string;
  latencyMs: number;
  turnNumber: number;
  personaId: string;
  sessionId: string;
}

export interface EffectMetricsSummary {
  totalEffectsApplied: number;
  totalEffectsSkipped: number;
  totalErrors: number;
  effectCounts: Record<string, number>;
  skipReasons: Record<string, number>;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class EffectMetricsCollector {
  private events: EffectMetricEvent[] = [];
  private maxEvents = 10000; // Keep last 10k events

  /**
   * Record an effect application/skip event
   */
  record(event: EffectMetricEvent): void {
    this.events.push(event);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log for observability
    log.debug(
      {
        effectId: event.effectId,
        outcome: event.outcome,
        latencyMs: event.latencyMs,
      },
      `Effect ${event.outcome}: ${event.effectId}`
    );
  }

  /**
   * Record that an effect was successfully applied
   */
  recordApplied(
    effectId: string,
    capability: string,
    latencyMs: number,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ): void {
    this.record({
      effectId,
      capability,
      outcome: 'applied',
      latencyMs,
      ...context,
    });
  }

  /**
   * Record that an effect was skipped
   */
  recordSkipped(
    effectId: string,
    capability: string,
    reason: string,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ): void {
    this.record({
      effectId,
      capability,
      outcome: 'skipped',
      reason,
      latencyMs: 0,
      ...context,
    });
  }

  /**
   * Record an effect error
   */
  recordError(
    effectId: string,
    capability: string,
    error: string,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ): void {
    this.record({
      effectId,
      capability,
      outcome: 'error',
      reason: error,
      latencyMs: 0,
      ...context,
    });

    log.warn({ effectId, error }, 'Effect error recorded');
  }

  /**
   * Get metrics summary
   */
  getSummary(windowMinutes = 60): EffectMetricsSummary {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    // Note: events don't have timestamps, so we use all events for now
    const recentEvents = this.events;

    const applied = recentEvents.filter((e) => e.outcome === 'applied');
    const skipped = recentEvents.filter((e) => e.outcome === 'skipped');
    const errors = recentEvents.filter((e) => e.outcome === 'error');

    // Effect counts
    const effectCounts: Record<string, number> = {};
    for (const event of applied) {
      effectCounts[event.effectId] = (effectCounts[event.effectId] || 0) + 1;
    }

    // Skip reasons
    const skipReasons: Record<string, number> = {};
    for (const event of skipped) {
      const reason = event.reason || 'unknown';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    }

    // Latency calculations
    const latencies = applied.map((e) => e.latencyMs).sort((a, b) => a - b);
    const avgLatencyMs =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies[p95Index] || 0;

    return {
      totalEffectsApplied: applied.length,
      totalEffectsSkipped: skipped.length,
      totalErrors: errors.length,
      effectCounts,
      skipReasons,
      avgLatencyMs,
      p95LatencyMs,
    };
  }

  /**
   * Get events for a specific session
   */
  getSessionEvents(sessionId: string): EffectMetricEvent[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Export for Prometheus format
   */
  toPrometheusFormat(): string {
    const summary = this.getSummary();
    const lines: string[] = [];

    // Effect application counter
    lines.push('# HELP ferni_effects_applied_total Total effects applied');
    lines.push('# TYPE ferni_effects_applied_total counter');
    for (const [effectId, count] of Object.entries(summary.effectCounts)) {
      lines.push(`ferni_effects_applied_total{effect="${effectId}"} ${count}`);
    }

    // Skip reasons counter
    lines.push('# HELP ferni_effects_skipped_total Total effects skipped');
    lines.push('# TYPE ferni_effects_skipped_total counter');
    for (const [reason, count] of Object.entries(summary.skipReasons)) {
      lines.push(`ferni_effects_skipped_total{reason="${reason}"} ${count}`);
    }

    // Latency gauge
    lines.push('# HELP ferni_effects_latency_ms Effect latency in milliseconds');
    lines.push('# TYPE ferni_effects_latency_ms gauge');
    lines.push(`ferni_effects_latency_avg_ms ${summary.avgLatencyMs.toFixed(2)}`);
    lines.push(`ferni_effects_latency_p95_ms ${summary.p95LatencyMs.toFixed(2)}`);

    // Totals
    lines.push('# HELP ferni_effects_total Total effect events');
    lines.push('# TYPE ferni_effects_total counter');
    lines.push(`ferni_effects_total{outcome="applied"} ${summary.totalEffectsApplied}`);
    lines.push(`ferni_effects_total{outcome="skipped"} ${summary.totalEffectsSkipped}`);
    lines.push(`ferni_effects_total{outcome="error"} ${summary.totalErrors}`);

    return lines.join('\n');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let metricsCollector: EffectMetricsCollector | null = null;

export function getEffectMetrics(): EffectMetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new EffectMetricsCollector();
  }
  return metricsCollector;
}

export function resetEffectMetrics(): void {
  if (metricsCollector) {
    metricsCollector.clear();
  }
  metricsCollector = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const effectMetrics = {
  recordApplied: (
    effectId: string,
    capability: string,
    latencyMs: number,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ) => getEffectMetrics().recordApplied(effectId, capability, latencyMs, context),

  recordSkipped: (
    effectId: string,
    capability: string,
    reason: string,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ) => getEffectMetrics().recordSkipped(effectId, capability, reason, context),

  recordError: (
    effectId: string,
    capability: string,
    error: string,
    context: { turnNumber: number; personaId: string; sessionId: string }
  ) => getEffectMetrics().recordError(effectId, capability, error, context),

  getSummary: (windowMinutes?: number) => getEffectMetrics().getSummary(windowMinutes),

  toPrometheus: () => getEffectMetrics().toPrometheusFormat(),
};
