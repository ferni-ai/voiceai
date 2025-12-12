/**
 * Conversation Humanization Performance Profiling
 *
 * Provides detailed performance profiling for the humanization pipeline.
 * Use this to identify bottlenecks and optimize critical paths.
 *
 * Usage:
 * ```typescript
 * import { ConversationProfiler, getProfiler } from './profiling.js';
 *
 * const profiler = getProfiler('session-123');
 * profiler.startProfiling();
 *
 * // ... run humanization ...
 *
 * const report = profiler.endProfiling();
 * console.log(report.summary);
 * ```
 *
 * @module @ferni/conversation/orchestrator/profiling
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationProfiling' });

// ============================================================================
// TYPES
// ============================================================================

export interface ProfilerConfig {
  /** Enable detailed phase timing */
  enablePhaseTimings: boolean;
  /** Enable feature-level timing */
  enableFeatureTimings: boolean;
  /** Enable memory tracking */
  enableMemoryTracking: boolean;
  /** Threshold (ms) for slow phase warnings */
  slowPhaseThresholdMs: number;
  /** Threshold (ms) for slow total warnings */
  slowTotalThresholdMs: number;
}

export interface PhaseTiming {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  features?: FeatureTiming[];
}

export interface FeatureTiming {
  name: string;
  duration: number;
  applied: boolean;
  skipped?: string;
}

export interface ProfilerSnapshot {
  timestamp: number;
  turnNumber: number;
  phases: PhaseTiming[];
  totalDuration: number;
  memoryUsage?: NodeJS.MemoryUsage;
  appliedFeatures: string[];
  skippedFeatures: string[];
}

export interface ProfilerReport {
  sessionId: string;
  snapshots: ProfilerSnapshot[];
  summary: ProfilerSummary;
  recommendations: string[];
}

export interface ProfilerSummary {
  totalTurns: number;
  avgTotalDuration: number;
  maxTotalDuration: number;
  minTotalDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  phaseBreakdown: Record<string, {
    avgDuration: number;
    maxDuration: number;
    percentOfTotal: number;
  }>;
  slowTurns: number;
  featureStats: Record<string, {
    appliedCount: number;
    avgDuration: number;
  }>;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_PROFILER_CONFIG: ProfilerConfig = {
  enablePhaseTimings: true,
  enableFeatureTimings: true,
  enableMemoryTracking: false, // Can be expensive
  slowPhaseThresholdMs: 50,
  slowTotalThresholdMs: 200,
};

// ============================================================================
// CONVERSATION PROFILER
// ============================================================================

export class ConversationProfiler {
  private sessionId: string;
  private config: ProfilerConfig;
  private snapshots: ProfilerSnapshot[] = [];
  private currentTurn = 0;
  private isProfiling = false;

  // Current turn tracking
  private currentPhases: PhaseTiming[] = [];
  private currentPhase: PhaseTiming | null = null;
  private currentFeatures: FeatureTiming[] = [];
  private turnStartTime = 0;

  constructor(sessionId: string, config: Partial<ProfilerConfig> = {}) {
    this.sessionId = sessionId;
    this.config = { ...DEFAULT_PROFILER_CONFIG, ...config };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start profiling a new session
   */
  startProfiling(): void {
    this.isProfiling = true;
    this.snapshots = [];
    this.currentTurn = 0;

    log.info({ sessionId: this.sessionId }, '📊 Profiling started');
  }

  /**
   * End profiling and generate report
   */
  endProfiling(): ProfilerReport {
    this.isProfiling = false;

    const report = this.generateReport();

    log.info(
      {
        sessionId: this.sessionId,
        turns: report.summary.totalTurns,
        avgDuration: Math.round(report.summary.avgTotalDuration),
      },
      '📊 Profiling ended'
    );

    return report;
  }

  /**
   * Check if profiling is active
   */
  isActive(): boolean {
    return this.isProfiling;
  }

  // ==========================================================================
  // TURN TRACKING
  // ==========================================================================

  /**
   * Start tracking a new turn
   */
  startTurn(): void {
    if (!this.isProfiling) return;

    this.currentTurn++;
    this.turnStartTime = performance.now();
    this.currentPhases = [];
    this.currentPhase = null;
    this.currentFeatures = [];
  }

  /**
   * End tracking the current turn
   */
  endTurn(appliedFeatures: string[], skippedFeatures: string[]): void {
    if (!this.isProfiling) return;

    const totalDuration = performance.now() - this.turnStartTime;

    // Finalize current phase if open
    if (this.currentPhase) {
      this.endPhase();
    }

    const snapshot: ProfilerSnapshot = {
      timestamp: Date.now(),
      turnNumber: this.currentTurn,
      phases: [...this.currentPhases],
      totalDuration,
      appliedFeatures,
      skippedFeatures,
    };

    // Add memory tracking if enabled
    if (this.config.enableMemoryTracking && typeof process !== 'undefined') {
      snapshot.memoryUsage = process.memoryUsage();
    }

    this.snapshots.push(snapshot);

    // Log slow turns
    if (totalDuration > this.config.slowTotalThresholdMs) {
      log.warn(
        {
          turn: this.currentTurn,
          duration: Math.round(totalDuration),
          phases: this.currentPhases.map((p) => ({ name: p.name, duration: Math.round(p.duration) })),
        },
        '🐢 Slow turn detected'
      );
    }
  }

  // ==========================================================================
  // PHASE TRACKING
  // ==========================================================================

  /**
   * Start tracking a phase
   */
  startPhase(name: string): void {
    if (!this.isProfiling || !this.config.enablePhaseTimings) return;

    // Finalize previous phase if open
    if (this.currentPhase) {
      this.endPhase();
    }

    this.currentPhase = {
      name,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      features: [],
    };
  }

  /**
   * End tracking the current phase
   */
  endPhase(): void {
    if (!this.isProfiling || !this.currentPhase) return;

    this.currentPhase.endTime = performance.now();
    this.currentPhase.duration = this.currentPhase.endTime - this.currentPhase.startTime;
    this.currentPhase.features = [...this.currentFeatures];

    // Log slow phases
    if (this.currentPhase.duration > this.config.slowPhaseThresholdMs) {
      log.debug(
        {
          phase: this.currentPhase.name,
          duration: Math.round(this.currentPhase.duration),
        },
        '🐢 Slow phase'
      );
    }

    this.currentPhases.push(this.currentPhase);
    this.currentPhase = null;
    this.currentFeatures = [];
  }

  // ==========================================================================
  // FEATURE TRACKING
  // ==========================================================================

  /**
   * Record a feature timing
   */
  recordFeature(name: string, duration: number, applied: boolean, skipped?: string): void {
    if (!this.isProfiling || !this.config.enableFeatureTimings) return;

    this.currentFeatures.push({
      name,
      duration,
      applied,
      skipped,
    });
  }

  /**
   * Time a feature execution
   */
  async timeFeature<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    this.recordFeature(name, duration, true);

    return { result, duration };
  }

  /**
   * Time a synchronous feature execution
   */
  timeFeatureSync<T>(
    name: string,
    fn: () => T
  ): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    this.recordFeature(name, duration, true);

    return { result, duration };
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Generate a profiling report
   */
  generateReport(): ProfilerReport {
    const summary = this.calculateSummary();
    const recommendations = this.generateRecommendations(summary);

    return {
      sessionId: this.sessionId,
      snapshots: this.snapshots,
      summary,
      recommendations,
    };
  }

  private calculateSummary(): ProfilerSummary {
    if (this.snapshots.length === 0) {
      return {
        totalTurns: 0,
        avgTotalDuration: 0,
        maxTotalDuration: 0,
        minTotalDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        phaseBreakdown: {},
        slowTurns: 0,
        featureStats: {},
      };
    }

    const durations = this.snapshots.map((s) => s.totalDuration).sort((a, b) => a - b);
    const totalTurns = durations.length;

    // Calculate percentiles
    const p50Index = Math.floor(totalTurns * 0.5);
    const p95Index = Math.floor(totalTurns * 0.95);
    const p99Index = Math.floor(totalTurns * 0.99);

    // Calculate phase breakdown
    const phaseBreakdown: Record<string, { durations: number[]; total: number }> = {};

    for (const snapshot of this.snapshots) {
      for (const phase of snapshot.phases) {
        if (!phaseBreakdown[phase.name]) {
          phaseBreakdown[phase.name] = { durations: [], total: 0 };
        }
        phaseBreakdown[phase.name].durations.push(phase.duration);
        phaseBreakdown[phase.name].total += phase.duration;
      }
    }

    const totalDurationSum = durations.reduce((a, b) => a + b, 0);
    const phaseStats: Record<string, { avgDuration: number; maxDuration: number; percentOfTotal: number }> = {};

    for (const [name, data] of Object.entries(phaseBreakdown)) {
      const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      phaseStats[name] = {
        avgDuration,
        maxDuration: Math.max(...data.durations),
        percentOfTotal: (data.total / totalDurationSum) * 100,
      };
    }

    // Calculate feature stats
    const featureStats: Record<string, { appliedCount: number; totalDuration: number }> = {};

    for (const snapshot of this.snapshots) {
      for (const phase of snapshot.phases) {
        for (const feature of phase.features || []) {
          if (feature.applied) {
            if (!featureStats[feature.name]) {
              featureStats[feature.name] = { appliedCount: 0, totalDuration: 0 };
            }
            featureStats[feature.name].appliedCount++;
            featureStats[feature.name].totalDuration += feature.duration;
          }
        }
      }
    }

    const featureStatsFormatted: Record<string, { appliedCount: number; avgDuration: number }> = {};
    for (const [name, stats] of Object.entries(featureStats)) {
      featureStatsFormatted[name] = {
        appliedCount: stats.appliedCount,
        avgDuration: stats.totalDuration / stats.appliedCount,
      };
    }

    return {
      totalTurns,
      avgTotalDuration: totalDurationSum / totalTurns,
      maxTotalDuration: Math.max(...durations),
      minTotalDuration: Math.min(...durations),
      p50Duration: durations[p50Index] || 0,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
      phaseBreakdown: phaseStats,
      slowTurns: durations.filter((d) => d > this.config.slowTotalThresholdMs).length,
      featureStats: featureStatsFormatted,
    };
  }

  private generateRecommendations(summary: ProfilerSummary): string[] {
    const recommendations: string[] = [];

    // Check for slow turns
    if (summary.slowTurns > summary.totalTurns * 0.1) {
      recommendations.push(
        `⚠️ ${summary.slowTurns}/${summary.totalTurns} turns exceeded ${this.config.slowTotalThresholdMs}ms threshold. Consider enabling circuit breakers.`
      );
    }

    // Check for phase imbalance
    for (const [name, stats] of Object.entries(summary.phaseBreakdown)) {
      if (stats.percentOfTotal > 50) {
        recommendations.push(
          `⚠️ Phase "${name}" accounts for ${stats.percentOfTotal.toFixed(1)}% of total time. Consider optimizing or parallelizing.`
        );
      }
      if (stats.maxDuration > stats.avgDuration * 3) {
        recommendations.push(
          `⚠️ Phase "${name}" has high variance (max: ${stats.maxDuration.toFixed(0)}ms, avg: ${stats.avgDuration.toFixed(0)}ms). Consider adding timeout.`
        );
      }
    }

    // Check for slow features
    for (const [name, stats] of Object.entries(summary.featureStats)) {
      if (stats.avgDuration > 20) {
        recommendations.push(
          `⚠️ Feature "${name}" averages ${stats.avgDuration.toFixed(1)}ms. Consider caching or lazy loading.`
        );
      }
    }

    // P95/P50 ratio check
    if (summary.p95Duration > summary.p50Duration * 3) {
      recommendations.push(
        `⚠️ P95 latency (${summary.p95Duration.toFixed(0)}ms) is 3x+ P50 (${summary.p50Duration.toFixed(0)}ms). Investigate outliers.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Performance looks good! No significant issues detected.');
    }

    return recommendations;
  }

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  /**
   * Log the current profiling summary
   */
  logSummary(): void {
    const report = this.generateReport();

    console.log('\n📊 CONVERSATION PROFILING SUMMARY');
    console.log('='.repeat(50));
    console.log(`Session: ${this.sessionId}`);
    console.log(`Total Turns: ${report.summary.totalTurns}`);
    console.log(`Avg Duration: ${report.summary.avgTotalDuration.toFixed(1)}ms`);
    console.log(`P50: ${report.summary.p50Duration.toFixed(1)}ms`);
    console.log(`P95: ${report.summary.p95Duration.toFixed(1)}ms`);
    console.log(`P99: ${report.summary.p99Duration.toFixed(1)}ms`);
    console.log(`Slow Turns: ${report.summary.slowTurns}`);

    console.log('\nPhase Breakdown:');
    for (const [name, stats] of Object.entries(report.summary.phaseBreakdown)) {
      console.log(`  ${name}: ${stats.avgDuration.toFixed(1)}ms avg (${stats.percentOfTotal.toFixed(1)}%)`);
    }

    console.log('\nRecommendations:');
    for (const rec of report.recommendations) {
      console.log(`  ${rec}`);
    }

    console.log('='.repeat(50) + '\n');
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const profilers = new Map<string, ConversationProfiler>();

/**
 * Get or create a profiler for a session
 */
export function getProfiler(sessionId: string, config?: Partial<ProfilerConfig>): ConversationProfiler {
  if (!profilers.has(sessionId)) {
    profilers.set(sessionId, new ConversationProfiler(sessionId, config));
  }
  return profilers.get(sessionId)!;
}

/**
 * Clear a profiler
 */
export function clearProfiler(sessionId: string): void {
  profilers.delete(sessionId);
}

/**
 * Clear all profilers
 */
export function clearAllProfilers(): void {
  profilers.clear();
}

// ============================================================================
// CONVENIENCE: Profile a function
// ============================================================================

/**
 * Profile a function call
 */
export async function profileCall<T>(
  sessionId: string,
  phaseName: string,
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const profiler = getProfiler(sessionId);
  profiler.startPhase(phaseName);

  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  profiler.endPhase();

  return { result, duration };
}

/**
 * Profile multiple phases
 */
export function createPhaseProfiler(sessionId: string): {
  phase: (name: string) => void;
  endPhase: () => void;
  feature: <T>(name: string, fn: () => T) => T;
  asyncFeature: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
} {
  const profiler = getProfiler(sessionId);

  return {
    phase: (name: string) => profiler.startPhase(name),
    endPhase: () => profiler.endPhase(),
    feature: <T>(name: string, fn: () => T) => {
      const { result } = profiler.timeFeatureSync(name, fn);
      return result;
    },
    asyncFeature: async <T>(name: string, fn: () => Promise<T>) => {
      const { result } = await profiler.timeFeature(name, fn);
      return result;
    },
  };
}

// ============================================================================
// SIMPLE ORCHESTRATION PROFILING
// ============================================================================

export interface OrchestratorTiming {
  analysis: number;
  intelligence: number;
  humanization: number;
  output: number;
  total: number;
}

/**
 * Record orchestration timing from the ConversationOrchestrator
 * Simple helper that integrates with the existing profiler
 */
export function profileOrchestration(
  sessionId: string,
  turnNumber: number,
  timing: OrchestratorTiming
): void {
  const profiler = getProfiler(sessionId);

  // Record each phase
  profiler.startPhase('analysis');
  profiler.endPhase();
  (profiler as unknown as { currentPhases: PhaseTiming[] }).currentPhases[0] = {
    name: 'analysis',
    startTime: 0,
    endTime: timing.analysis,
    duration: timing.analysis,
  };

  // Just log the timing for now - full integration can come later
  if (timing.total > 200) {
    log.warn(
      {
        sessionId,
        turnNumber,
        timing,
      },
      '🐢 Slow orchestration detected'
    );
  }
}

