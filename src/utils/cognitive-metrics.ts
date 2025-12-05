/**
 * Cognitive Intelligence Performance Metrics
 *
 * Tracks performance of cognitive processing to ensure
 * it doesn't add latency to voice responses.
 *
 * Key metrics:
 * - Cognitive context building time
 * - Speech adjustment calculation time
 * - User style detection time
 * - Total cognitive overhead
 */

import { getLogger } from './safe-logger.js';

// Lazy import to avoid circular dependencies
let broadcastMetricsFn: ((metrics: {
  avgTotalOverhead: number;
  p95TotalOverhead: number;
  maxTotalOverhead: number;
  under50msPercentage: number;
  under100msPercentage: number;
  samplesCount: number;
}) => void) | null = null;

async function getBroadcastMetrics() {
  if (!broadcastMetricsFn) {
    try {
      const { broadcastMetrics } = await import('../services/cognitive-broadcast.js');
      broadcastMetricsFn = broadcastMetrics;
    } catch {
      // Broadcast not available
    }
  }
  return broadcastMetricsFn;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveMetrics {
  /** Time to build cognitive context (ms) */
  contextBuildTime: number;
  /** Time to calculate speech adjustments (ms) */
  speechAdjustTime: number;
  /** Time to detect user cognitive style (ms) */
  userStyleDetectTime: number;
  /** Time for quirk activation (ms) */
  quirkActivationTime: number;
  /** Time for voice emotion processing (ms) */
  voiceEmotionTime: number;
  /** Total cognitive overhead (ms) */
  totalOverhead: number;
  /** Timestamp */
  timestamp: Date;
}

export interface CognitiveMetricsSummary {
  /** Total samples collected */
  sampleCount: number;
  /** Average total overhead (ms) */
  avgTotalOverhead: number;
  /** 95th percentile total overhead (ms) */
  p95TotalOverhead: number;
  /** Max total overhead (ms) */
  maxTotalOverhead: number;
  /** Average context build time (ms) */
  avgContextBuildTime: number;
  /** Average speech adjust time (ms) */
  avgSpeechAdjustTime: number;
  /** Percentage of calls under 50ms */
  under50msPercentage: number;
  /** Percentage of calls under 100ms */
  under100msPercentage: number;
}

// ============================================================================
// METRICS TRACKER
// ============================================================================

class CognitiveMetricsTracker {
  private metrics: CognitiveMetrics[] = [];
  private maxSamples = 1000;
  private currentMetric: Partial<CognitiveMetrics> = {};
  private startTimes: Map<string, number> = new Map();

  /**
   * Start timing a cognitive operation
   */
  startTiming(operation: keyof Omit<CognitiveMetrics, 'timestamp' | 'totalOverhead'>): void {
    this.startTimes.set(operation, performance.now());
  }

  /**
   * End timing a cognitive operation
   */
  endTiming(operation: keyof Omit<CognitiveMetrics, 'timestamp' | 'totalOverhead'>): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.currentMetric[operation] = duration;
    this.startTimes.delete(operation);

    return duration;
  }

  /**
   * Record the current metrics and reset
   */
  recordMetrics(): CognitiveMetrics {
    const metric: CognitiveMetrics = {
      contextBuildTime: this.currentMetric.contextBuildTime || 0,
      speechAdjustTime: this.currentMetric.speechAdjustTime || 0,
      userStyleDetectTime: this.currentMetric.userStyleDetectTime || 0,
      quirkActivationTime: this.currentMetric.quirkActivationTime || 0,
      voiceEmotionTime: this.currentMetric.voiceEmotionTime || 0,
      totalOverhead: 0,
      timestamp: new Date(),
    };

    // Calculate total overhead
    metric.totalOverhead =
      metric.contextBuildTime +
      metric.speechAdjustTime +
      metric.userStyleDetectTime +
      metric.quirkActivationTime +
      metric.voiceEmotionTime;

    // Store metric
    this.metrics.push(metric);
    if (this.metrics.length > this.maxSamples) {
      this.metrics.shift();
    }

    // Log if overhead is high
    if (metric.totalOverhead > 100) {
      getLogger().warn({
        totalOverhead: metric.totalOverhead,
        contextBuildTime: metric.contextBuildTime,
        speechAdjustTime: metric.speechAdjustTime,
      }, '⚠️ High cognitive overhead detected');
    }

    // Reset current metric
    this.currentMetric = {};

    return metric;
  }

  /**
   * Get metrics summary
   */
  getSummary(): CognitiveMetricsSummary {
    if (this.metrics.length === 0) {
      return {
        sampleCount: 0,
        avgTotalOverhead: 0,
        p95TotalOverhead: 0,
        maxTotalOverhead: 0,
        avgContextBuildTime: 0,
        avgSpeechAdjustTime: 0,
        under50msPercentage: 0,
        under100msPercentage: 0,
      };
    }

    const totalOverheads = this.metrics.map(m => m.totalOverhead).sort((a, b) => a - b);
    const contextTimes = this.metrics.map(m => m.contextBuildTime);
    const speechTimes = this.metrics.map(m => m.speechAdjustTime);

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => sum(arr) / arr.length;
    const p95Index = Math.floor(totalOverheads.length * 0.95);

    return {
      sampleCount: this.metrics.length,
      avgTotalOverhead: avg(totalOverheads),
      p95TotalOverhead: totalOverheads[p95Index] || 0,
      maxTotalOverhead: Math.max(...totalOverheads),
      avgContextBuildTime: avg(contextTimes),
      avgSpeechAdjustTime: avg(speechTimes),
      under50msPercentage: (totalOverheads.filter(t => t < 50).length / totalOverheads.length) * 100,
      under100msPercentage: (totalOverheads.filter(t => t < 100).length / totalOverheads.length) * 100,
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 10): CognitiveMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.metrics = [];
    this.currentMetric = {};
    this.startTimes.clear();
  }

  /**
   * Log metrics summary
   */
  logSummary(): void {
    const summary = this.getSummary();
    
    getLogger().info({
      sampleCount: summary.sampleCount,
      avgOverhead: `${summary.avgTotalOverhead.toFixed(1)}ms`,
      p95Overhead: `${summary.p95TotalOverhead.toFixed(1)}ms`,
      maxOverhead: `${summary.maxTotalOverhead.toFixed(1)}ms`,
      under50ms: `${summary.under50msPercentage.toFixed(1)}%`,
      under100ms: `${summary.under100msPercentage.toFixed(1)}%`,
    }, '🧠 Cognitive Metrics Summary');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const cognitiveMetrics = new CognitiveMetricsTracker();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Time a function and record its duration
 */
export async function timeCognitiveOperation<T>(
  operation: keyof Omit<CognitiveMetrics, 'timestamp' | 'totalOverhead'>,
  fn: () => Promise<T>
): Promise<T> {
  cognitiveMetrics.startTiming(operation);
  try {
    return await fn();
  } finally {
    cognitiveMetrics.endTiming(operation);
  }
}

/**
 * Time a synchronous function
 */
export function timeCognitiveOperationSync<T>(
  operation: keyof Omit<CognitiveMetrics, 'timestamp' | 'totalOverhead'>,
  fn: () => T
): T {
  cognitiveMetrics.startTiming(operation);
  try {
    return fn();
  } finally {
    cognitiveMetrics.endTiming(operation);
  }
}

/**
 * Record metrics for this turn and get summary
 */
export function recordTurnMetrics(): CognitiveMetrics {
  return cognitiveMetrics.recordMetrics();
}

/**
 * Get current cognitive metrics summary
 */
export function getCognitiveMetricsSummary(): CognitiveMetricsSummary {
  return cognitiveMetrics.getSummary();
}

/**
 * Log cognitive metrics periodically (e.g., every 50 turns)
 */
let turnsSinceLog = 0;
const LOG_INTERVAL = 50;
const BROADCAST_INTERVAL = 10;

export function maybeLogMetrics(): void {
  turnsSinceLog++;
  if (turnsSinceLog >= LOG_INTERVAL) {
    cognitiveMetrics.logSummary();
    turnsSinceLog = 0;
  }
}

/**
 * Broadcast metrics to dashboard (every 10 turns)
 */
let turnsSinceBroadcast = 0;

export async function maybeBroadcastMetrics(): Promise<void> {
  turnsSinceBroadcast++;
  if (turnsSinceBroadcast >= BROADCAST_INTERVAL) {
    const broadcast = await getBroadcastMetrics();
    if (broadcast) {
      const summary = cognitiveMetrics.getSummary();
      broadcast({
        avgTotalOverhead: summary.avgTotalOverhead,
        p95TotalOverhead: summary.p95TotalOverhead,
        maxTotalOverhead: summary.maxTotalOverhead,
        under50msPercentage: summary.under50msPercentage,
        under100msPercentage: summary.under100msPercentage,
        samplesCount: summary.sampleCount,
      });
    }
    turnsSinceBroadcast = 0;
  }
}

export default {
  cognitiveMetrics,
  timeCognitiveOperation,
  timeCognitiveOperationSync,
  recordTurnMetrics,
  getCognitiveMetricsSummary,
  maybeLogMetrics,
  maybeBroadcastMetrics,
};

