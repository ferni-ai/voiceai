/**
 * Speech Pipeline Metrics & Observability
 *
 * Provides metrics collection and observability for the speech pipeline:
 * - Latency tracking for analysis operations
 * - Quality metrics for emotion detection
 * - Usage metrics for session management
 * - Performance tracking over time
 *
 * @module speech/metrics
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'SpeechMetrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface LatencyMetrics {
  /** Average analysis latency in ms */
  avgAnalysisLatencyMs: number;
  /** P50 latency in ms */
  p50LatencyMs: number;
  /** P95 latency in ms */
  p95LatencyMs: number;
  /** P99 latency in ms */
  p99LatencyMs: number;
  /** Maximum latency in ms */
  maxLatencyMs: number;
  /** Total number of samples */
  sampleCount: number;
}

export interface QualityMetrics {
  /** Average emotion detection confidence (0-1) */
  avgEmotionConfidence: number;
  /** Percentage of analyses with high confidence (>0.7) */
  highConfidenceRate: number;
  /** Backchannel timing accuracy (0-1) */
  backchannelAccuracy: number;
  /** Turn prediction accuracy (0-1) */
  turnPredictionAccuracy: number;
  /** Number of quality samples */
  sampleCount: number;
}

export interface UsageMetrics {
  /** Number of currently active sessions */
  activeSessionCount: number;
  /** Total sessions created */
  totalSessionsCreated: number;
  /** Total sessions cleaned up successfully */
  totalSessionsCleaned: number;
  /** Cleanup failure count */
  cleanupFailures: number;
  /** Average session duration in seconds */
  avgSessionDurationSec: number;
  /** Longest session duration in seconds */
  maxSessionDurationSec: number;
}

export interface OperationMetrics {
  /** Operation name */
  operation: string;
  /** Number of invocations */
  invocations: number;
  /** Number of successes */
  successes: number;
  /** Number of failures */
  failures: number;
  /** Average duration in ms */
  avgDurationMs: number;
  /** Last invocation timestamp */
  lastInvoked: number;
}

export interface SpeechPipelineMetrics {
  /** Latency metrics */
  latency: LatencyMetrics;
  /** Quality metrics */
  quality: QualityMetrics;
  /** Usage metrics */
  usage: UsageMetrics;
  /** Per-operation metrics */
  operations: Map<string, OperationMetrics>;
  /** Metrics collection start time */
  startTime: number;
  /** Last reset time */
  lastReset: number;
}

export interface MetricsSnapshot {
  /** Timestamp of snapshot */
  timestamp: number;
  /** Uptime in seconds */
  uptimeSec: number;
  /** All metrics */
  metrics: Omit<SpeechPipelineMetrics, 'operations'> & {
    operations: Record<string, OperationMetrics>;
  };
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class SpeechMetricsCollector {
  private latencySamples: number[] = [];
  private emotionConfidenceSamples: number[] = [];
  private backchannelResults: boolean[] = [];
  private turnPredictionResults: boolean[] = [];

  private sessionStarts: Map<string, number> = new Map();
  private sessionDurations: number[] = [];

  private operations: Map<string, OperationMetrics> = new Map();

  private totalSessionsCreated = 0;
  private totalSessionsCleaned = 0;
  private cleanupFailures = 0;

  private readonly startTime = Date.now();
  private lastReset = Date.now();

  private readonly maxSamples = 1000;

  /**
   * Record a latency sample
   */
  recordLatency(operationName: string, latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.maxSamples) {
      this.latencySamples.shift();
    }

    this.recordOperation(operationName, latencyMs, true);
  }

  /**
   * Record an emotion detection result
   */
  recordEmotionDetection(confidence: number): void {
    this.emotionConfidenceSamples.push(confidence);
    if (this.emotionConfidenceSamples.length > this.maxSamples) {
      this.emotionConfidenceSamples.shift();
    }
  }

  /**
   * Record a backchannel timing result
   * @param wasTimely - True if backchannel was well-timed
   */
  recordBackchannelResult(wasTimely: boolean): void {
    this.backchannelResults.push(wasTimely);
    if (this.backchannelResults.length > this.maxSamples) {
      this.backchannelResults.shift();
    }
  }

  /**
   * Record a turn prediction result
   * @param wasCorrect - True if prediction was correct
   */
  recordTurnPrediction(wasCorrect: boolean): void {
    this.turnPredictionResults.push(wasCorrect);
    if (this.turnPredictionResults.length > this.maxSamples) {
      this.turnPredictionResults.shift();
    }
  }

  /**
   * Record session start
   */
  recordSessionStart(sessionId: string): void {
    this.sessionStarts.set(sessionId, Date.now());
    this.totalSessionsCreated++;
  }

  /**
   * Record session end
   */
  recordSessionEnd(sessionId: string, success: boolean): void {
    const startTime = this.sessionStarts.get(sessionId);
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000;
      this.sessionDurations.push(duration);
      if (this.sessionDurations.length > 100) {
        this.sessionDurations.shift();
      }
      this.sessionStarts.delete(sessionId);
    }

    if (success) {
      this.totalSessionsCleaned++;
    } else {
      this.cleanupFailures++;
    }
  }

  /**
   * Record an operation execution
   */
  recordOperation(name: string, durationMs: number, success: boolean): void {
    let op = this.operations.get(name);
    if (!op) {
      op = {
        operation: name,
        invocations: 0,
        successes: 0,
        failures: 0,
        avgDurationMs: 0,
        lastInvoked: 0,
      };
      this.operations.set(name, op);
    }

    op.invocations++;
    if (success) {
      op.successes++;
    } else {
      op.failures++;
    }

    // Update average duration
    op.avgDurationMs =
      (op.avgDurationMs * (op.invocations - 1) + durationMs) / op.invocations;
    op.lastInvoked = Date.now();
  }

  /**
   * Get latency metrics
   */
  getLatencyMetrics(): LatencyMetrics {
    if (this.latencySamples.length === 0) {
      return {
        avgAnalysisLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        maxLatencyMs: 0,
        sampleCount: 0,
      };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

    return {
      avgAnalysisLatencyMs: Math.round(avg * 100) / 100,
      p50LatencyMs: this.percentile(sorted, 50),
      p95LatencyMs: this.percentile(sorted, 95),
      p99LatencyMs: this.percentile(sorted, 99),
      maxLatencyMs: Math.max(...sorted),
      sampleCount: sorted.length,
    };
  }

  /**
   * Get quality metrics
   */
  getQualityMetrics(): QualityMetrics {
    const avgConfidence =
      this.emotionConfidenceSamples.length > 0
        ? this.emotionConfidenceSamples.reduce((a, b) => a + b, 0) /
          this.emotionConfidenceSamples.length
        : 0;

    const highConfidenceRate =
      this.emotionConfidenceSamples.length > 0
        ? this.emotionConfidenceSamples.filter((c) => c > 0.7).length /
          this.emotionConfidenceSamples.length
        : 0;

    const backchannelAccuracy =
      this.backchannelResults.length > 0
        ? this.backchannelResults.filter(Boolean).length / this.backchannelResults.length
        : 0;

    const turnPredictionAccuracy =
      this.turnPredictionResults.length > 0
        ? this.turnPredictionResults.filter(Boolean).length /
          this.turnPredictionResults.length
        : 0;

    return {
      avgEmotionConfidence: Math.round(avgConfidence * 1000) / 1000,
      highConfidenceRate: Math.round(highConfidenceRate * 1000) / 1000,
      backchannelAccuracy: Math.round(backchannelAccuracy * 1000) / 1000,
      turnPredictionAccuracy: Math.round(turnPredictionAccuracy * 1000) / 1000,
      sampleCount: this.emotionConfidenceSamples.length,
    };
  }

  /**
   * Get usage metrics
   */
  getUsageMetrics(): UsageMetrics {
    const avgDuration =
      this.sessionDurations.length > 0
        ? this.sessionDurations.reduce((a, b) => a + b, 0) / this.sessionDurations.length
        : 0;

    const maxDuration =
      this.sessionDurations.length > 0 ? Math.max(...this.sessionDurations) : 0;

    return {
      activeSessionCount: this.sessionStarts.size,
      totalSessionsCreated: this.totalSessionsCreated,
      totalSessionsCleaned: this.totalSessionsCleaned,
      cleanupFailures: this.cleanupFailures,
      avgSessionDurationSec: Math.round(avgDuration * 10) / 10,
      maxSessionDurationSec: Math.round(maxDuration * 10) / 10,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): SpeechPipelineMetrics {
    return {
      latency: this.getLatencyMetrics(),
      quality: this.getQualityMetrics(),
      usage: this.getUsageMetrics(),
      operations: new Map(this.operations),
      startTime: this.startTime,
      lastReset: this.lastReset,
    };
  }

  /**
   * Get a JSON-serializable snapshot of all metrics
   */
  getSnapshot(): MetricsSnapshot {
    const metrics = this.getAllMetrics();

    return {
      timestamp: Date.now(),
      uptimeSec: Math.round((Date.now() - this.startTime) / 1000),
      metrics: {
        ...metrics,
        operations: Object.fromEntries(metrics.operations),
      },
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.latencySamples = [];
    this.emotionConfidenceSamples = [];
    this.backchannelResults = [];
    this.turnPredictionResults = [];
    this.sessionDurations = [];
    this.operations.clear();

    this.totalSessionsCreated = 0;
    this.totalSessionsCleaned = 0;
    this.cleanupFailures = 0;

    // Keep session starts for active sessions
    this.lastReset = Date.now();

    log.info('📊 Speech metrics reset');
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const globalMetrics = new SpeechMetricsCollector();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record a latency sample for an operation
 */
export function recordLatency(operation: string, latencyMs: number): void {
  globalMetrics.recordLatency(operation, latencyMs);
}

/**
 * Record an emotion detection confidence score
 */
export function recordEmotionConfidence(confidence: number): void {
  globalMetrics.recordEmotionDetection(confidence);
}

/**
 * Record whether a backchannel was well-timed
 */
export function recordBackchannelTiming(wasTimely: boolean): void {
  globalMetrics.recordBackchannelResult(wasTimely);
}

/**
 * Record whether a turn prediction was correct
 */
export function recordTurnPredictionAccuracy(wasCorrect: boolean): void {
  globalMetrics.recordTurnPrediction(wasCorrect);
}

/**
 * Record a session start
 */
export function recordSessionStart(sessionId: string): void {
  globalMetrics.recordSessionStart(sessionId);
}

/**
 * Record a session end
 */
export function recordSessionEnd(sessionId: string, success = true): void {
  globalMetrics.recordSessionEnd(sessionId, success);
}

/**
 * Record an operation execution
 */
export function recordOperation(name: string, durationMs: number, success = true): void {
  globalMetrics.recordOperation(name, durationMs, success);
}

/**
 * Get current latency metrics
 */
export function getLatencyMetrics(): LatencyMetrics {
  return globalMetrics.getLatencyMetrics();
}

/**
 * Get current quality metrics
 */
export function getQualityMetrics(): QualityMetrics {
  return globalMetrics.getQualityMetrics();
}

/**
 * Get current usage metrics
 */
export function getUsageMetrics(): UsageMetrics {
  return globalMetrics.getUsageMetrics();
}

/**
 * Get all speech pipeline metrics
 */
export function getSpeechMetrics(): SpeechPipelineMetrics {
  return globalMetrics.getAllMetrics();
}

/**
 * Get a JSON-serializable snapshot of all metrics
 */
export function getSpeechMetricsSnapshot(): MetricsSnapshot {
  return globalMetrics.getSnapshot();
}

/**
 * Reset all metrics
 */
export function resetSpeechMetrics(): void {
  globalMetrics.reset();
}

/**
 * Create a timing wrapper for measuring operation duration
 *
 * @example
 * ```typescript
 * const result = await withTiming('humanListening.analyze', async () => {
 *   return await pipeline.analyze(context);
 * });
 * ```
 */
export async function withTiming<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordLatency(operationName, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    globalMetrics.recordOperation(operationName, duration, false);
    throw error;
  }
}

/**
 * Create a sync timing wrapper
 */
export function withTimingSync<T>(operationName: string, fn: () => T): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    recordLatency(operationName, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    globalMetrics.recordOperation(operationName, duration, false);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordLatency,
  recordEmotionConfidence,
  recordBackchannelTiming,
  recordTurnPredictionAccuracy,
  recordSessionStart,
  recordSessionEnd,
  recordOperation,
  getLatencyMetrics,
  getQualityMetrics,
  getUsageMetrics,
  getSpeechMetrics,
  getSpeechMetricsSnapshot,
  resetSpeechMetrics,
  withTiming,
  withTimingSync,
};
