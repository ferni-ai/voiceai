/**
 * Performance Metrics Collection
 *
 * Lightweight performance tracking for voice pipeline hot paths.
 * Collects timing data for monitoring and optimization.
 *
 * @module utils/performance-metrics
 */

import { getLogger } from './safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface MetricSample {
  name: string;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MetricSummary {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

// ============================================================================
// STATE
// ============================================================================

// Rolling window of samples per metric (last 1000)
const metricSamples = new Map<string, MetricSample[]>();
const MAX_SAMPLES = 1000;

// Active timers for tracking in-progress operations
const activeTimers = new Map<string, { startTime: number; metadata?: Record<string, unknown> }>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start timing an operation.
 *
 * @param name - Metric name (e.g., 'turn_processing', 'context_building')
 * @param metadata - Optional metadata to attach to the sample
 * @returns Timer ID to use with stopTimer()
 */
export function startTimer(name: string, metadata?: Record<string, unknown>): string {
  const timerId = `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  activeTimers.set(timerId, { startTime: performance.now(), metadata });
  return timerId;
}

/**
 * Stop a timer and record the sample.
 *
 * @param timerId - Timer ID from startTimer()
 * @returns Duration in milliseconds, or -1 if timer not found
 */
export function stopTimer(timerId: string): number {
  const timer = activeTimers.get(timerId);
  if (!timer) {
    log.warn({ timerId }, 'Timer not found');
    return -1;
  }

  activeTimers.delete(timerId);
  const durationMs = performance.now() - timer.startTime;
  const name = timerId.split('_')[0] ?? timerId;

  recordSample(name, durationMs, timer.metadata);
  return durationMs;
}

/**
 * Record a metric sample directly (for cases where you already have timing).
 *
 * @param name - Metric name
 * @param durationMs - Duration in milliseconds
 * @param metadata - Optional metadata
 */
export function recordSample(
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const samples = metricSamples.get(name) ?? [];

  samples.push({
    name,
    durationMs,
    timestamp: Date.now(),
    metadata,
  });

  // Keep only last MAX_SAMPLES
  if (samples.length > MAX_SAMPLES) {
    samples.shift();
  }

  metricSamples.set(name, samples);
}

/**
 * Time a function execution and record the sample.
 *
 * @param name - Metric name
 * @param fn - Function to execute
 * @param metadata - Optional metadata
 * @returns Function result
 */
export async function timeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const timerId = startTimer(name, metadata);
  try {
    return await fn();
  } finally {
    stopTimer(timerId);
  }
}

/**
 * Synchronous version of timeAsync.
 */
export function timeSync<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
  const timerId = startTimer(name, metadata);
  try {
    return fn();
  } finally {
    stopTimer(timerId);
  }
}

/**
 * Get summary statistics for a metric.
 */
export function getMetricSummary(name: string): MetricSummary | null {
  const samples = metricSamples.get(name);
  if (!samples || samples.length === 0) {
    return null;
  }

  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const count = durations.length;
  const totalMs = durations.reduce((a, b) => a + b, 0);

  return {
    name,
    count,
    totalMs,
    avgMs: totalMs / count,
    minMs: durations[0] ?? 0,
    maxMs: durations[count - 1] ?? 0,
    p50Ms: durations[Math.floor(count * 0.5)] ?? 0,
    p95Ms: durations[Math.floor(count * 0.95)] ?? 0,
    p99Ms: durations[Math.floor(count * 0.99)] ?? 0,
  };
}

/**
 * Get summaries for all tracked metrics.
 */
export function getAllMetricSummaries(): MetricSummary[] {
  const summaries: MetricSummary[] = [];

  for (const name of metricSamples.keys()) {
    const summary = getMetricSummary(name);
    if (summary) {
      summaries.push(summary);
    }
  }

  return summaries.sort((a, b) => b.avgMs - a.avgMs); // Sort by slowest first
}

/**
 * Get raw samples for a metric (for debugging).
 */
export function getMetricSamples(name: string, limit = 100): MetricSample[] {
  const samples = metricSamples.get(name) ?? [];
  return samples.slice(-limit);
}

/**
 * Clear all metrics (for testing).
 */
export function clearAllMetrics(): void {
  metricSamples.clear();
  activeTimers.clear();
}

/**
 * Log a summary of all metrics at the specified level.
 */
export function logMetricsSummary(): void {
  const summaries = getAllMetricSummaries();

  if (summaries.length === 0) {
    log.debug('No performance metrics collected');
    return;
  }

  log.info(
    {
      metrics: summaries.map((s) => ({
        name: s.name,
        count: s.count,
        avgMs: Math.round(s.avgMs),
        p95Ms: Math.round(s.p95Ms),
        p99Ms: Math.round(s.p99Ms),
      })),
    },
    'Performance metrics summary'
  );
}

// ============================================================================
// PREDEFINED METRIC NAMES
// ============================================================================

/**
 * Standard metric names for consistency.
 */
export const METRICS = {
  // Turn processing
  TURN_PROCESSING: 'turn_processing',
  TURN_ANALYSIS: 'turn_analysis',
  CONTEXT_BUILDING: 'context_building',
  HUMANIZATION: 'humanization',

  // Voice pipeline
  RESPONSE_PROCESSING: 'response_processing',
  SSML_TAGGING: 'ssml_tagging',
  EMOTION_PROSODY: 'emotion_prosody',
  DYNAMIC_SPEED: 'dynamic_speed',

  // Memory/RAG
  MEMORY_RETRIEVAL: 'memory_retrieval',
  EMBEDDING_GENERATION: 'embedding_generation',

  // Trust systems
  TRUST_CONTEXT: 'trust_context',
  SPEECH_INSIGHTS: 'speech_insights',

  // Startup
  COLD_START: 'cold_start',
  PERSONA_LOAD: 'persona_load',
  BUNDLE_PRELOAD: 'bundle_preload',
} as const;

export type MetricName = (typeof METRICS)[keyof typeof METRICS];

// ============================================================================
// GC PRESSURE METRICS (For Rust Migration Baseline)
// ============================================================================

/**
 * GC pressure sample - captures heap state at a point in time
 */
export interface GcSample {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

/**
 * GC pressure summary for a tracked operation
 */
export interface GcPressureSummary {
  name: string;
  sampleCount: number;
  avgHeapDeltaBytes: number;
  maxHeapDeltaBytes: number;
  estimatedAllocRateBytesPerSec: number;
  p95HeapDeltaBytes: number;
}

// GC tracking state
const gcSamples = new Map<
  string,
  Array<{ before: GcSample; after: GcSample; durationMs: number }>
>();
const GC_MAX_SAMPLES = 500;

/**
 * Capture current heap state
 */
function captureHeapState(): GcSample {
  const mem = process.memoryUsage();
  return {
    timestamp: performance.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };
}

/**
 * Start tracking GC pressure for an operation.
 * Call gcTrackEnd() when operation completes.
 *
 * @param name - Operation name (e.g., 'audio_frame_processing')
 * @returns Tracker object to pass to gcTrackEnd
 */
export function gcTrackStart(name: string): { name: string; before: GcSample } {
  return { name, before: captureHeapState() };
}

/**
 * End GC pressure tracking and record the delta.
 *
 * @param tracker - Tracker from gcTrackStart
 */
export function gcTrackEnd(tracker: { name: string; before: GcSample }): void {
  const after = captureHeapState();
  const durationMs = after.timestamp - tracker.before.timestamp;

  const samples = gcSamples.get(tracker.name) ?? [];
  samples.push({ before: tracker.before, after, durationMs });

  if (samples.length > GC_MAX_SAMPLES) {
    samples.shift();
  }

  gcSamples.set(tracker.name, samples);
}

/**
 * Convenience function to track GC pressure of an async operation.
 */
export async function gcTrackAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracker = gcTrackStart(name);
  try {
    return await fn();
  } finally {
    gcTrackEnd(tracker);
  }
}

/**
 * Convenience function to track GC pressure of a sync operation.
 */
export function gcTrackSync<T>(name: string, fn: () => T): T {
  const tracker = gcTrackStart(name);
  try {
    return fn();
  } finally {
    gcTrackEnd(tracker);
  }
}

/**
 * Get GC pressure summary for a tracked operation.
 */
export function getGcPressureSummary(name: string): GcPressureSummary | null {
  const samples = gcSamples.get(name);
  if (!samples || samples.length === 0) return null;

  const heapDeltas = samples.map((s) => s.after.heapUsed - s.before.heapUsed).sort((a, b) => a - b);

  // Calculate allocation rate (bytes/sec)
  const totalDuration = samples.reduce((sum, s) => sum + s.durationMs, 0);
  const totalAlloc = heapDeltas.filter((d) => d > 0).reduce((sum, d) => sum + d, 0);
  const allocRate = totalDuration > 0 ? (totalAlloc / totalDuration) * 1000 : 0;

  const count = heapDeltas.length;
  return {
    name,
    sampleCount: count,
    avgHeapDeltaBytes: heapDeltas.reduce((a, b) => a + b, 0) / count,
    maxHeapDeltaBytes: heapDeltas[count - 1] ?? 0,
    estimatedAllocRateBytesPerSec: allocRate,
    p95HeapDeltaBytes: heapDeltas[Math.floor(count * 0.95)] ?? 0,
  };
}

/**
 * Get all GC pressure summaries.
 */
export function getAllGcPressureSummaries(): GcPressureSummary[] {
  const summaries: GcPressureSummary[] = [];
  for (const name of gcSamples.keys()) {
    const summary = getGcPressureSummary(name);
    if (summary) summaries.push(summary);
  }
  return summaries.sort(
    (a, b) => b.estimatedAllocRateBytesPerSec - a.estimatedAllocRateBytesPerSec
  );
}

/**
 * Log GC pressure summary (for debugging/monitoring).
 */
export function logGcPressureSummary(): void {
  const summaries = getAllGcPressureSummaries();
  if (summaries.length === 0) {
    log.debug('No GC pressure metrics collected');
    return;
  }

  log.info(
    {
      gcMetrics: summaries.map((s) => ({
        name: s.name,
        samples: s.sampleCount,
        avgDeltaKB: Math.round(s.avgHeapDeltaBytes / 1024),
        p95DeltaKB: Math.round(s.p95HeapDeltaBytes / 1024),
        allocRateKBps: Math.round(s.estimatedAllocRateBytesPerSec / 1024),
      })),
    },
    'GC pressure summary'
  );
}

/**
 * Clear all GC metrics (for testing).
 */
export function clearGcMetrics(): void {
  gcSamples.clear();
}

/**
 * GC metric names for audio processing baseline.
 */
export const GC_METRICS = {
  // Audio frame processing (20ms frames)
  AUDIO_FRAME_PROCESSING: 'gc_audio_frame_processing',
  AUDIO_INT16_TO_F32: 'gc_audio_int16_to_f32',
  AUDIO_PROSODY_ANALYSIS: 'gc_audio_prosody_analysis',

  // Embedding operations
  EMBEDDING_BATCH: 'gc_embedding_batch',
  EMBEDDING_SIMILARITY: 'gc_embedding_similarity',

  // Memory operations
  MEMORY_SEARCH: 'gc_memory_search',
  MEMORY_DEDUP: 'gc_memory_dedup',
} as const;

export type GcMetricName = (typeof GC_METRICS)[keyof typeof GC_METRICS];
