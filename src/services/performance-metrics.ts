/**
 * Performance Metrics Service
 *
 * Centralized observability for critical path performance.
 * Tracks latency, hit rates, and throughput for key operations.
 *
 * Metrics collected:
 * - Turn processing time (p50, p95, p99)
 * - Context injection timing (per builder)
 * - Embedding cache hit rate
 * - Trust system latency
 * - Memory retrieval time
 * - Startup time phases
 *
 * @module services/performance-metrics
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'PerformanceMetrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface TimingMetric {
  name: string;
  durationMs: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface PercentileStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  evictions: number;
}

export interface ContextInjectionMetrics {
  builder: string;
  avgDurationMs: number;
  callCount: number;
  errorCount: number;
  lastDurationMs: number;
}

export interface TurnProcessingMetrics {
  totalTime: PercentileStats;
  phases: Record<string, PercentileStats>;
  contextInjections: ContextInjectionMetrics[];
}

export interface StartupMetrics {
  totalTimeMs: number;
  phases: Array<{ name: string; durationMs: number }>;
  timestamp: Date;
}

// ============================================================================
// TIMING WINDOW
// ============================================================================

const WINDOW_SIZE = 1000; // Keep last 1000 samples
const PHASE_NAMES = [
  'message_analysis',
  'conversation_state',
  'emotional_state',
  'context_injections',
  'advanced_humanization',
  'response_processing',
  'llm_call',
] as const;

type PhaseName = (typeof PHASE_NAMES)[number];

// ============================================================================
// METRICS STORE
// ============================================================================

class MetricsStore {
  private turnTimings: number[] = [];
  private phaseTimings = new Map<PhaseName, number[]>();
  private contextInjectionTimings = new Map<string, number[]>();
  private contextInjectionErrors = new Map<string, number>();
  private cacheStats = new Map<string, { hits: number; misses: number; evictions: number }>();
  private startupMetrics: StartupMetrics | null = null;
  private memoryRetrievalTimings: number[] = [];
  private trustSystemTimings: number[] = [];

  // Bounds for Maps with dynamic keys to prevent unbounded memory growth
  private static readonly MAX_CONTEXT_BUILDERS = 200; // Max unique builder names tracked
  private static readonly MAX_CACHE_NAMES = 100; // Max unique cache names tracked

  constructor() {
    // Initialize phase timing arrays
    for (const phase of PHASE_NAMES) {
      this.phaseTimings.set(phase, []);
    }
  }

  /**
   * Enforce bounds on a Map by evicting oldest entries (FIFO order)
   */
  private enforceMapBounds<K, V>(map: Map<K, V>, maxSize: number): void {
    if (map.size > maxSize) {
      const keysToDelete = Array.from(map.keys()).slice(0, map.size - maxSize);
      for (const key of keysToDelete) {
        map.delete(key);
      }
    }
  }

  // ---- Turn Processing ----

  recordTurnTiming(durationMs: number): void {
    this.turnTimings.push(durationMs);
    if (this.turnTimings.length > WINDOW_SIZE) {
      this.turnTimings.shift();
    }
  }

  recordPhaseTiming(phase: PhaseName, durationMs: number): void {
    const timings = this.phaseTimings.get(phase);
    if (timings) {
      timings.push(durationMs);
      if (timings.length > WINDOW_SIZE) {
        timings.shift();
      }
    }
  }

  getTurnStats(): PercentileStats {
    return this.calculatePercentiles(this.turnTimings);
  }

  getPhaseStats(): Record<PhaseName, PercentileStats> {
    const result = {} as Record<PhaseName, PercentileStats>;
    for (const phase of PHASE_NAMES) {
      result[phase] = this.calculatePercentiles(this.phaseTimings.get(phase) || []);
    }
    return result;
  }

  // ---- Context Injections ----

  recordContextInjectionTiming(builder: string, durationMs: number): void {
    let timings = this.contextInjectionTimings.get(builder);
    if (!timings) {
      timings = [];
      this.contextInjectionTimings.set(builder, timings);
      // Enforce bounds on Map when adding new builder
      this.enforceMapBounds(this.contextInjectionTimings, MetricsStore.MAX_CONTEXT_BUILDERS);
    }
    timings.push(durationMs);
    if (timings.length > WINDOW_SIZE) {
      timings.shift();
    }
  }

  recordContextInjectionError(builder: string): void {
    const count = this.contextInjectionErrors.get(builder) || 0;
    this.contextInjectionErrors.set(builder, count + 1);
    // Enforce bounds on Map when adding new builder
    this.enforceMapBounds(this.contextInjectionErrors, MetricsStore.MAX_CONTEXT_BUILDERS);
  }

  getContextInjectionMetrics(): ContextInjectionMetrics[] {
    const metrics: ContextInjectionMetrics[] = [];
    for (const [builder, timings] of this.contextInjectionTimings) {
      if (timings.length === 0) continue;
      metrics.push({
        builder,
        avgDurationMs: timings.reduce((a, b) => a + b, 0) / timings.length,
        callCount: timings.length,
        errorCount: this.contextInjectionErrors.get(builder) || 0,
        lastDurationMs: timings[timings.length - 1],
      });
    }
    return metrics.sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  }

  // ---- Cache Metrics ----

  recordCacheHit(cacheName: string): void {
    const isNewEntry = !this.cacheStats.has(cacheName);
    const stats = this.cacheStats.get(cacheName) || { hits: 0, misses: 0, evictions: 0 };
    stats.hits++;
    this.cacheStats.set(cacheName, stats);
    if (isNewEntry) {
      this.enforceMapBounds(this.cacheStats, MetricsStore.MAX_CACHE_NAMES);
    }
  }

  recordCacheMiss(cacheName: string): void {
    const isNewEntry = !this.cacheStats.has(cacheName);
    const stats = this.cacheStats.get(cacheName) || { hits: 0, misses: 0, evictions: 0 };
    stats.misses++;
    this.cacheStats.set(cacheName, stats);
    if (isNewEntry) {
      this.enforceMapBounds(this.cacheStats, MetricsStore.MAX_CACHE_NAMES);
    }
  }

  recordCacheEviction(cacheName: string): void {
    const isNewEntry = !this.cacheStats.has(cacheName);
    const stats = this.cacheStats.get(cacheName) || { hits: 0, misses: 0, evictions: 0 };
    stats.evictions++;
    this.cacheStats.set(cacheName, stats);
    if (isNewEntry) {
      this.enforceMapBounds(this.cacheStats, MetricsStore.MAX_CACHE_NAMES);
    }
  }

  getCacheMetrics(cacheName: string): CacheMetrics | null {
    const stats = this.cacheStats.get(cacheName);
    if (!stats) return null;
    const total = stats.hits + stats.misses;
    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: total > 0 ? stats.hits / total : 0,
      size: 0, // Will be updated by cache
      maxSize: 0,
      evictions: stats.evictions,
    };
  }

  getAllCacheMetrics(): Map<string, CacheMetrics> {
    const result = new Map<string, CacheMetrics>();
    for (const name of this.cacheStats.keys()) {
      const metrics = this.getCacheMetrics(name);
      if (metrics) result.set(name, metrics);
    }
    return result;
  }

  // ---- Memory & Trust ----

  recordMemoryRetrievalTiming(durationMs: number): void {
    this.memoryRetrievalTimings.push(durationMs);
    if (this.memoryRetrievalTimings.length > WINDOW_SIZE) {
      this.memoryRetrievalTimings.shift();
    }
  }

  recordTrustSystemTiming(durationMs: number): void {
    this.trustSystemTimings.push(durationMs);
    if (this.trustSystemTimings.length > WINDOW_SIZE) {
      this.trustSystemTimings.shift();
    }
  }

  getMemoryRetrievalStats(): PercentileStats {
    return this.calculatePercentiles(this.memoryRetrievalTimings);
  }

  getTrustSystemStats(): PercentileStats {
    return this.calculatePercentiles(this.trustSystemTimings);
  }

  // ---- Startup ----

  recordStartup(phases: Array<{ name: string; durationMs: number }>): void {
    const totalTimeMs = phases.reduce((sum, p) => sum + p.durationMs, 0);
    this.startupMetrics = {
      totalTimeMs,
      phases,
      timestamp: new Date(),
    };
    log.info({ totalTimeMs, phases: phases.length }, 'Startup metrics recorded');
  }

  getStartupMetrics(): StartupMetrics | null {
    return this.startupMetrics;
  }

  // ---- Utilities ----

  private calculatePercentiles(values: number[]): PercentileStats {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      p50: sorted[Math.floor(count * 0.5)],
      p90: sorted[Math.floor(count * 0.9)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  // ---- Full Report ----

  getFullReport(): {
    turn: PercentileStats;
    phases: Record<PhaseName, PercentileStats>;
    contextInjections: ContextInjectionMetrics[];
    caches: Record<string, CacheMetrics>;
    memory: PercentileStats;
    trust: PercentileStats;
    startup: StartupMetrics | null;
  } {
    const caches: Record<string, CacheMetrics> = {};
    for (const [name, metrics] of this.getAllCacheMetrics()) {
      caches[name] = metrics;
    }

    return {
      turn: this.getTurnStats(),
      phases: this.getPhaseStats(),
      contextInjections: this.getContextInjectionMetrics(),
      caches,
      memory: this.getMemoryRetrievalStats(),
      trust: this.getTrustSystemStats(),
      startup: this.startupMetrics,
    };
  }

  // ---- Reset ----

  reset(): void {
    this.turnTimings = [];
    for (const phase of PHASE_NAMES) {
      this.phaseTimings.set(phase, []);
    }
    this.contextInjectionTimings.clear();
    this.contextInjectionErrors.clear();
    this.cacheStats.clear();
    this.memoryRetrievalTimings = [];
    this.trustSystemTimings = [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let metricsStore: MetricsStore | null = null;

function getMetricsStore(): MetricsStore {
  if (!metricsStore) {
    metricsStore = new MetricsStore();
  }
  return metricsStore;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record a turn processing duration
 */
export function recordTurnTiming(durationMs: number): void {
  getMetricsStore().recordTurnTiming(durationMs);
}

/**
 * Record a phase timing within turn processing
 */
export function recordPhaseTiming(phase: string, durationMs: number): void {
  if (PHASE_NAMES.includes(phase as PhaseName)) {
    getMetricsStore().recordPhaseTiming(phase as PhaseName, durationMs);
  }
}

/**
 * Record context injection timing
 */
export function recordContextInjectionTiming(builder: string, durationMs: number): void {
  getMetricsStore().recordContextInjectionTiming(builder, durationMs);
}

/**
 * Record context injection error
 */
export function recordContextInjectionError(builder: string): void {
  getMetricsStore().recordContextInjectionError(builder);
}

/**
 * Record a cache hit
 */
export function recordCacheHit(cacheName: string): void {
  getMetricsStore().recordCacheHit(cacheName);
}

/**
 * Record a cache miss
 */
export function recordCacheMiss(cacheName: string): void {
  getMetricsStore().recordCacheMiss(cacheName);
}

/**
 * Record a cache eviction
 */
export function recordCacheEviction(cacheName: string): void {
  getMetricsStore().recordCacheEviction(cacheName);
}

/**
 * Record memory retrieval timing
 */
export function recordMemoryRetrievalTiming(durationMs: number): void {
  getMetricsStore().recordMemoryRetrievalTiming(durationMs);
}

/**
 * Record trust system timing
 */
export function recordTrustSystemTiming(durationMs: number): void {
  getMetricsStore().recordTrustSystemTiming(durationMs);
}

/**
 * Record startup phases
 */
export function recordStartupMetrics(phases: Array<{ name: string; durationMs: number }>): void {
  getMetricsStore().recordStartup(phases);
}

/**
 * Get full performance report
 */
export function getPerformanceReport() {
  return getMetricsStore().getFullReport();
}

/**
 * Get turn processing stats
 */
export function getTurnStats(): PercentileStats {
  return getMetricsStore().getTurnStats();
}

/**
 * Get cache metrics for a specific cache
 */
export function getCacheMetrics(cacheName: string): CacheMetrics | null {
  return getMetricsStore().getCacheMetrics(cacheName);
}

/**
 * Get context injection metrics
 */
export function getContextInjectionMetrics(): ContextInjectionMetrics[] {
  return getMetricsStore().getContextInjectionMetrics();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  getMetricsStore().reset();
}

// ============================================================================
// TIMING HELPER
// ============================================================================

/**
 * Time an async operation and record metrics
 */
export async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>,
  recordFn: (name: string, durationMs: number) => void = recordContextInjectionTiming
): Promise<T> {
  const start = Date.now();
  try {
    const result = await operation();
    recordFn(name, Date.now() - start);
    return result;
  } catch (error) {
    recordFn(name, Date.now() - start);
    throw error;
  }
}

/**
 * Create a timer for manual timing control
 */
export function createTimer(): { stop: () => number } {
  const start = Date.now();
  return {
    stop: () => Date.now() - start,
  };
}

// ============================================================================
// LOGGING
// ============================================================================

let logIntervalId: NodeJS.Timeout | null = null;

/**
 * Start periodic metrics logging
 */
export function startMetricsLogging(intervalMs = 60_000): void {
  if (logIntervalId) {
    clearInterval(logIntervalId);
  }

  logIntervalId = setInterval(() => {
    const report = getPerformanceReport();

    // Only log if we have data
    if (report.turn.count > 0) {
      log.info(
        {
          turnProcessing: {
            p50: report.turn.p50.toFixed(0),
            p95: report.turn.p95.toFixed(0),
            p99: report.turn.p99.toFixed(0),
            count: report.turn.count,
          },
          slowestInjections: report.contextInjections.slice(0, 3).map((i) => ({
            name: i.builder,
            avg: i.avgDurationMs.toFixed(0),
          })),
          caches: Object.entries(report.caches).map(([name, c]) => ({
            name,
            hitRate: `${(c.hitRate * 100).toFixed(1)}%`,
          })),
        },
        '📊 Performance metrics'
      );
    }
  }, intervalMs);
}

/**
 * Stop periodic metrics logging
 */
export function stopMetricsLogging(): void {
  if (logIntervalId) {
    clearInterval(logIntervalId);
    logIntervalId = null;
  }
}

export default {
  recordTurnTiming,
  recordPhaseTiming,
  recordContextInjectionTiming,
  recordContextInjectionError,
  recordCacheHit,
  recordCacheMiss,
  recordCacheEviction,
  recordMemoryRetrievalTiming,
  recordTrustSystemTiming,
  recordStartupMetrics,
  getPerformanceReport,
  getTurnStats,
  getCacheMetrics,
  getContextInjectionMetrics,
  resetMetrics,
  timeOperation,
  createTimer,
  startMetricsLogging,
  stopMetricsLogging,
};

// ============================================================================
// RE-EXPORTS FROM AGENTS LAYER (for API layer access)
// ============================================================================
// These re-exports allow the API layer (Level 100) to access agent performance
// metrics through the services layer (Level 60), avoiding direct imports from
// agents/ which would violate the clean architecture.

// Voice agent turn profiling
export {
  getGlobalPerformanceSummary,
  PERFORMANCE_THRESHOLDS,
} from './performance/turn-profiler.js';

// Tool response caching metrics
export { getToolCacheMetrics } from './performance/tool-response-cache.js';

// Speculative TTS metrics
export { getSpeculativeTTSMetrics } from './performance/speculative-tts.js';

// Tool execution reliability (retries, circuit breakers)
export { getReliabilityDashboard } from './performance/tool-execution-reliability.js';
