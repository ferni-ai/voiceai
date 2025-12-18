/**
 * Turn Performance Profiler
 *
 * Comprehensive profiling for voice conversation turn processing.
 * Tracks all critical path latencies and identifies bottlenecks in real-time.
 *
 * Key Metrics Tracked:
 * - Turn processing total time
 * - Context building breakdown
 * - LLM inference latency
 * - TTS first byte and total time
 * - Memory retrieval time
 * - Embedding generation time
 *
 * @module performance/turn-profiler
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TurnProfiler' });

// ============================================================================
// TYPES
// ============================================================================

export interface TurnTimings {
  /** Timestamp when turn started */
  turnStart: number;
  /** Message analysis complete */
  analysisComplete?: number;
  /** Context building started */
  contextBuildStart?: number;
  /** Context building complete */
  contextBuildComplete?: number;
  /** Memory retrieval complete */
  memoryRetrievalComplete?: number;
  /** Embedding generation time (if any) */
  embeddingComplete?: number;
  /** LLM inference started */
  llmStart?: number;
  /** LLM first token received */
  llmFirstToken?: number;
  /** LLM complete */
  llmComplete?: number;
  /** TTS started */
  ttsStart?: number;
  /** TTS first audio byte */
  ttsFirstByte?: number;
  /** TTS complete */
  ttsComplete?: number;
  /** Audio playback started */
  audioPlaybackStart?: number;
  /** Turn complete */
  turnComplete?: number;
}

export interface TurnMetrics {
  /** Session ID */
  sessionId: string;
  /** Turn number */
  turnNumber: number;
  /** All timestamps */
  timings: TurnTimings;
  /** Calculated latencies */
  latencies: {
    /** Total turn time (ms) */
    totalTurnMs: number;
    /** Time to first audio (user stops speaking → audio starts) */
    timeToFirstAudioMs: number;
    /** Message analysis time */
    analysisMs: number;
    /** Context building time */
    contextBuildingMs: number;
    /** Memory retrieval time */
    memoryRetrievalMs: number;
    /** Embedding generation time */
    embeddingMs: number;
    /** LLM time to first token */
    llmTtftMs: number;
    /** LLM total inference time */
    llmTotalMs: number;
    /** TTS time to first byte */
    ttsTtfbMs: number;
    /** TTS total time */
    ttsTotalMs: number;
  };
  /** Bottleneck identification */
  bottleneck: {
    component: string;
    latencyMs: number;
    percentOfTotal: number;
  };
  /** Performance tier */
  tier: 'excellent' | 'good' | 'acceptable' | 'slow' | 'critical';
}

export interface SessionMetricsSummary {
  sessionId: string;
  totalTurns: number;
  avgTotalTurnMs: number;
  avgTimeToFirstAudioMs: number;
  p50TurnMs: number;
  p95TurnMs: number;
  p99TurnMs: number;
  slowestTurnMs: number;
  fastestTurnMs: number;
  bottleneckDistribution: Record<string, number>;
  tierDistribution: Record<string, number>;
}

// ============================================================================
// PERFORMANCE THRESHOLDS
// ============================================================================

export const PERFORMANCE_THRESHOLDS = {
  /** Excellent: < 300ms total turn time */
  EXCELLENT_TOTAL_MS: 300,
  /** Good: < 500ms total turn time */
  GOOD_TOTAL_MS: 500,
  /** Acceptable: < 800ms total turn time */
  ACCEPTABLE_TOTAL_MS: 800,
  /** Slow: < 1500ms total turn time */
  SLOW_TOTAL_MS: 1500,
  /** Critical: >= 1500ms */

  /** Target time to first audio */
  TARGET_TTFA_MS: 400,

  /** Component thresholds */
  ANALYSIS_MAX_MS: 50,
  CONTEXT_BUILD_MAX_MS: 100,
  MEMORY_RETRIEVAL_MAX_MS: 50,
  EMBEDDING_MAX_MS: 100,
  LLM_TTFT_MAX_MS: 200,
  TTS_TTFB_MAX_MS: 150,
} as const;

// ============================================================================
// TURN PROFILER
// ============================================================================

class TurnProfiler {
  private activeTurns = new Map<string, TurnTimings>();
  private completedMetrics: TurnMetrics[] = [];
  private sessionMetrics = new Map<string, TurnMetrics[]>();
  private maxStoredMetrics = 1000;

  /**
   * Start profiling a turn
   */
  startTurn(sessionId: string, turnNumber: number): void {
    const key = this.getTurnKey(sessionId, turnNumber);
    this.activeTurns.set(key, {
      turnStart: Date.now(),
    });
  }

  /**
   * Mark a timing checkpoint
   */
  mark(
    sessionId: string,
    turnNumber: number,
    checkpoint: keyof Omit<TurnTimings, 'turnStart'>
  ): void {
    const key = this.getTurnKey(sessionId, turnNumber);
    const timings = this.activeTurns.get(key);
    if (timings) {
      timings[checkpoint] = Date.now();
    }
  }

  /**
   * Complete turn profiling and calculate metrics
   */
  completeTurn(sessionId: string, turnNumber: number): TurnMetrics | null {
    const key = this.getTurnKey(sessionId, turnNumber);
    const timings = this.activeTurns.get(key);

    if (!timings) {
      log.warn({ sessionId, turnNumber }, 'No turn timing found');
      return null;
    }

    // Mark completion
    timings.turnComplete = Date.now();

    // Calculate latencies
    const latencies = this.calculateLatencies(timings);

    // Identify bottleneck
    const bottleneck = this.identifyBottleneck(latencies);

    // Determine tier
    const tier = this.determineTier(latencies.totalTurnMs);

    const metrics: TurnMetrics = {
      sessionId,
      turnNumber,
      timings,
      latencies,
      bottleneck,
      tier,
    };

    // Store metrics
    this.storeMetrics(metrics);

    // Clean up
    this.activeTurns.delete(key);

    // Log if slow
    if (tier === 'slow' || tier === 'critical') {
      log.warn(
        {
          sessionId,
          turnNumber,
          totalMs: latencies.totalTurnMs,
          bottleneck: bottleneck.component,
          tier,
        },
        '⚠️ Slow turn detected'
      );
    }

    return metrics;
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): SessionMetricsSummary | null {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics || metrics.length === 0) return null;

    const turnTimes = metrics.map((m) => m.latencies.totalTurnMs);
    const ttfaTimes = metrics.map((m) => m.latencies.timeToFirstAudioMs);

    const sorted = [...turnTimes].sort((a, b) => a - b);

    const bottleneckCounts: Record<string, number> = {};
    const tierCounts: Record<string, number> = {};

    for (const m of metrics) {
      bottleneckCounts[m.bottleneck.component] =
        (bottleneckCounts[m.bottleneck.component] || 0) + 1;
      tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1;
    }

    return {
      sessionId,
      totalTurns: metrics.length,
      avgTotalTurnMs: this.avg(turnTimes),
      avgTimeToFirstAudioMs: this.avg(ttfaTimes),
      p50TurnMs: this.percentile(sorted, 50),
      p95TurnMs: this.percentile(sorted, 95),
      p99TurnMs: this.percentile(sorted, 99),
      slowestTurnMs: sorted[sorted.length - 1] || 0,
      fastestTurnMs: sorted[0] || 0,
      bottleneckDistribution: bottleneckCounts,
      tierDistribution: tierCounts,
    };
  }

  /**
   * Get global metrics summary (all sessions)
   */
  getGlobalSummary(): {
    totalTurns: number;
    avgTurnMs: number;
    avgTtfaMs: number;
    slowTurnPercentage: number;
    topBottlenecks: Array<{ component: string; count: number }>;
  } {
    if (this.completedMetrics.length === 0) {
      return {
        totalTurns: 0,
        avgTurnMs: 0,
        avgTtfaMs: 0,
        slowTurnPercentage: 0,
        topBottlenecks: [],
      };
    }

    const turnTimes = this.completedMetrics.map((m) => m.latencies.totalTurnMs);
    const ttfaTimes = this.completedMetrics.map((m) => m.latencies.timeToFirstAudioMs);
    const slowTurns = this.completedMetrics.filter(
      (m) => m.tier === 'slow' || m.tier === 'critical'
    );

    const bottleneckCounts = new Map<string, number>();
    for (const m of this.completedMetrics) {
      const count = bottleneckCounts.get(m.bottleneck.component) || 0;
      bottleneckCounts.set(m.bottleneck.component, count + 1);
    }

    const topBottlenecks = Array.from(bottleneckCounts.entries())
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalTurns: this.completedMetrics.length,
      avgTurnMs: this.avg(turnTimes),
      avgTtfaMs: this.avg(ttfaTimes),
      slowTurnPercentage: (slowTurns.length / this.completedMetrics.length) * 100,
      topBottlenecks,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getTurnKey(sessionId: string, turnNumber: number): string {
    return `${sessionId}:${turnNumber}`;
  }

  private calculateLatencies(timings: TurnTimings): TurnMetrics['latencies'] {
    const start = timings.turnStart;
    const end = timings.turnComplete || Date.now();

    return {
      totalTurnMs: end - start,
      timeToFirstAudioMs: (timings.audioPlaybackStart || timings.ttsFirstByte || end) - start,
      analysisMs: (timings.analysisComplete || start) - start,
      contextBuildingMs:
        (timings.contextBuildComplete || start) - (timings.contextBuildStart || start),
      memoryRetrievalMs: (timings.memoryRetrievalComplete || start) - start,
      embeddingMs: timings.embeddingComplete ? timings.embeddingComplete - start : 0,
      llmTtftMs: (timings.llmFirstToken || timings.llmStart || start) - (timings.llmStart || start),
      llmTotalMs: (timings.llmComplete || timings.llmStart || start) - (timings.llmStart || start),
      ttsTtfbMs: (timings.ttsFirstByte || timings.ttsStart || start) - (timings.ttsStart || start),
      ttsTotalMs: (timings.ttsComplete || timings.ttsStart || start) - (timings.ttsStart || start),
    };
  }

  private identifyBottleneck(latencies: TurnMetrics['latencies']): TurnMetrics['bottleneck'] {
    const components: Array<{ name: string; ms: number }> = [
      { name: 'analysis', ms: latencies.analysisMs },
      { name: 'context_building', ms: latencies.contextBuildingMs },
      { name: 'memory_retrieval', ms: latencies.memoryRetrievalMs },
      { name: 'embedding', ms: latencies.embeddingMs },
      { name: 'llm_inference', ms: latencies.llmTotalMs },
      { name: 'tts', ms: latencies.ttsTotalMs },
    ];

    // Find the component that took the most time
    const sorted = [...components].sort((a, b) => b.ms - a.ms);
    const top = sorted[0];

    return {
      component: top.name,
      latencyMs: top.ms,
      percentOfTotal: latencies.totalTurnMs > 0 ? (top.ms / latencies.totalTurnMs) * 100 : 0,
    };
  }

  private determineTier(totalMs: number): TurnMetrics['tier'] {
    if (totalMs < PERFORMANCE_THRESHOLDS.EXCELLENT_TOTAL_MS) return 'excellent';
    if (totalMs < PERFORMANCE_THRESHOLDS.GOOD_TOTAL_MS) return 'good';
    if (totalMs < PERFORMANCE_THRESHOLDS.ACCEPTABLE_TOTAL_MS) return 'acceptable';
    if (totalMs < PERFORMANCE_THRESHOLDS.SLOW_TOTAL_MS) return 'slow';
    return 'critical';
  }

  private storeMetrics(metrics: TurnMetrics): void {
    // Store in completed metrics
    this.completedMetrics.push(metrics);

    // Trim if over max
    if (this.completedMetrics.length > this.maxStoredMetrics) {
      this.completedMetrics = this.completedMetrics.slice(-this.maxStoredMetrics);
    }

    // Store in session metrics
    let sessionList = this.sessionMetrics.get(metrics.sessionId);
    if (!sessionList) {
      sessionList = [];
      this.sessionMetrics.set(metrics.sessionId, sessionList);
    }
    sessionList.push(metrics);

    // Trim session metrics
    if (sessionList.length > 100) {
      this.sessionMetrics.set(metrics.sessionId, sessionList.slice(-100));
    }
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.activeTurns.clear();
    this.completedMetrics = [];
    this.sessionMetrics.clear();
  }

  /**
   * Clear session metrics
   */
  clearSession(sessionId: string): void {
    this.sessionMetrics.delete(sessionId);

    // Remove active turns for this session
    Array.from(this.activeTurns.keys()).forEach((key) => {
      if (key.startsWith(sessionId)) {
        this.activeTurns.delete(key);
      }
    });
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let profiler: TurnProfiler | null = null;

export function getTurnProfiler(): TurnProfiler {
  if (!profiler) {
    profiler = new TurnProfiler();
  }
  return profiler;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Start profiling a turn
 */
export function startTurnProfiling(sessionId: string, turnNumber: number): void {
  getTurnProfiler().startTurn(sessionId, turnNumber);
}

/**
 * Mark a checkpoint
 */
export function markTurnCheckpoint(
  sessionId: string,
  turnNumber: number,
  checkpoint: keyof Omit<TurnTimings, 'turnStart'>
): void {
  getTurnProfiler().mark(sessionId, turnNumber, checkpoint);
}

/**
 * Complete profiling and get metrics
 */
export function completeTurnProfiling(sessionId: string, turnNumber: number): TurnMetrics | null {
  return getTurnProfiler().completeTurn(sessionId, turnNumber);
}

/**
 * Get session summary
 */
export function getSessionPerformanceSummary(sessionId: string): SessionMetricsSummary | null {
  return getTurnProfiler().getSessionSummary(sessionId);
}

/**
 * Get global performance summary
 */
export function getGlobalPerformanceSummary(): ReturnType<TurnProfiler['getGlobalSummary']> {
  return getTurnProfiler().getGlobalSummary();
}

/**
 * Clear session profiling data
 */
export function clearSessionProfiling(sessionId: string): void {
  getTurnProfiler().clearSession(sessionId);
}
