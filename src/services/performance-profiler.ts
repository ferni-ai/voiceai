/**
 * Performance Profiler
 * 
 * Monitors and optimizes voice response latency.
 * Target: < 200ms end-to-end response time.
 * 
 * Key metrics:
 * - Time to First Token (TTFT)
 * - Time to First Audio (TTFA)  
 * - Total Response Time (TRT)
 * - LLM API latency
 * - TTS latency
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface TimingMark {
  name: string;
  timestamp: number;
  duration?: number;
}

interface PerformanceTrace {
  traceId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  marks: TimingMark[];
  metadata: Record<string, unknown>;
}

interface PerformanceStats {
  count: number;
  mean: number;
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
}

interface LatencyReport {
  period: string;
  totalRequests: number;
  timeToFirstToken: PerformanceStats;
  timeToFirstAudio: PerformanceStats;
  totalResponseTime: PerformanceStats;
  llmLatency: PerformanceStats;
  ttsLatency: PerformanceStats;
  sttLatency: PerformanceStats;
  slowRequests: Array<{
    traceId: string;
    totalTime: number;
    breakdown: Record<string, number>;
  }>;
}

// ============================================================================
// PERFORMANCE PROFILER
// ============================================================================

class PerformanceProfiler {
  private traces = new Map<string, PerformanceTrace>();
  private completedTraces: PerformanceTrace[] = [];
  private readonly maxStoredTraces = 1000;
  private readonly slowThresholdMs = 500;

  /**
   * Start a new performance trace
   */
  startTrace(traceId: string, sessionId: string, metadata: Record<string, unknown> = {}): void {
    const trace: PerformanceTrace = {
      traceId,
      sessionId,
      startTime: performance.now(),
      marks: [],
      metadata,
    };
    this.traces.set(traceId, trace);

    getLogger().debug({ traceId, sessionId }, 'Performance trace started');
  }

  /**
   * Add a timing mark to an active trace
   */
  mark(traceId: string, name: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      getLogger().warn({ traceId, name }, 'Attempted to mark non-existent trace');
      return;
    }

    const timestamp = performance.now();
    const duration = timestamp - trace.startTime;

    trace.marks.push({ name, timestamp, duration });

    getLogger().debug({ traceId, name, durationMs: duration.toFixed(2) }, 'Performance mark');
  }

  /**
   * End a trace and store results
   */
  endTrace(traceId: string): PerformanceTrace | null {
    const trace = this.traces.get(traceId);
    if (!trace) {
      getLogger().warn({ traceId }, 'Attempted to end non-existent trace');
      return null;
    }

    trace.endTime = performance.now();
    const totalTime = trace.endTime - trace.startTime;

    this.traces.delete(traceId);
    this.completedTraces.push(trace);

    // Keep only recent traces
    if (this.completedTraces.length > this.maxStoredTraces) {
      this.completedTraces.shift();
    }

    // Log slow requests
    if (totalTime > this.slowThresholdMs) {
      getLogger().warn({
        traceId,
        totalTimeMs: totalTime.toFixed(2),
        marks: trace.marks.map(m => ({ name: m.name, ms: m.duration?.toFixed(2) })),
      }, 'Slow request detected');
    } else {
      getLogger().debug({
        traceId,
        totalTimeMs: totalTime.toFixed(2),
      }, 'Performance trace completed');
    }

    return trace;
  }

  /**
   * Get timing between two marks
   */
  getInterval(traceId: string, startMark: string, endMark: string): number | null {
    const trace = this.traces.get(traceId) || 
                  this.completedTraces.find(t => t.traceId === traceId);
    if (!trace) return null;

    const start = trace.marks.find(m => m.name === startMark);
    const end = trace.marks.find(m => m.name === endMark);

    if (!start || !end) return null;

    return end.timestamp - start.timestamp;
  }

  /**
   * Calculate statistics for an array of values
   */
  private calculateStats(values: number[]): PerformanceStats {
    if (values.length === 0) {
      return { count: 0, mean: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      mean: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  }

  /**
   * Generate a latency report for a time period
   */
  generateReport(periodMs: number = 300000): LatencyReport {
    const cutoff = performance.now() - periodMs;
    const recentTraces = this.completedTraces.filter(t => t.endTime && t.endTime > cutoff);

    // Extract timing metrics
    const ttftValues: number[] = [];
    const ttfaValues: number[] = [];
    const trtValues: number[] = [];
    const llmValues: number[] = [];
    const ttsValues: number[] = [];
    const sttValues: number[] = [];
    const slowRequests: LatencyReport['slowRequests'] = [];

    for (const trace of recentTraces) {
      const totalTime = (trace.endTime ?? 0) - trace.startTime;
      trtValues.push(totalTime);

      // Extract specific metrics if marks exist
      const markMap = new Map(trace.marks.map(m => [m.name, m]));

      // Time to First Token (when LLM starts responding)
      const ttft = markMap.get('llm_first_token')?.duration;
      if (ttft !== undefined) ttftValues.push(ttft);

      // Time to First Audio (when audio playback begins)
      const ttfa = markMap.get('audio_start')?.duration;
      if (ttfa !== undefined) ttfaValues.push(ttfa);

      // LLM latency
      const llmStart = markMap.get('llm_start')?.timestamp;
      const llmEnd = markMap.get('llm_end')?.timestamp;
      if (llmStart !== undefined && llmEnd !== undefined) {
        llmValues.push(llmEnd - llmStart);
      }

      // TTS latency
      const ttsStart = markMap.get('tts_start')?.timestamp;
      const ttsEnd = markMap.get('tts_end')?.timestamp;
      if (ttsStart !== undefined && ttsEnd !== undefined) {
        ttsValues.push(ttsEnd - ttsStart);
      }

      // STT latency
      const sttStart = markMap.get('stt_start')?.timestamp;
      const sttEnd = markMap.get('stt_end')?.timestamp;
      if (sttStart !== undefined && sttEnd !== undefined) {
        sttValues.push(sttEnd - sttStart);
      }

      // Track slow requests
      if (totalTime > this.slowThresholdMs) {
        const breakdown: Record<string, number> = {};
        let prevTimestamp = trace.startTime;
        for (const mark of trace.marks) {
          breakdown[mark.name] = mark.timestamp - prevTimestamp;
          prevTimestamp = mark.timestamp;
        }
        slowRequests.push({ traceId: trace.traceId, totalTime, breakdown });
      }
    }

    // Sort slow requests by total time
    slowRequests.sort((a, b) => b.totalTime - a.totalTime);

    return {
      period: `${periodMs / 1000}s`,
      totalRequests: recentTraces.length,
      timeToFirstToken: this.calculateStats(ttftValues),
      timeToFirstAudio: this.calculateStats(ttfaValues),
      totalResponseTime: this.calculateStats(trtValues),
      llmLatency: this.calculateStats(llmValues),
      ttsLatency: this.calculateStats(ttsValues),
      sttLatency: this.calculateStats(sttValues),
      slowRequests: slowRequests.slice(0, 10), // Top 10 slowest
    };
  }

  /**
   * Get optimization suggestions based on metrics
   */
  getOptimizationSuggestions(): string[] {
    const report = this.generateReport();
    const suggestions: string[] = [];

    // Check if we have enough data
    if (report.totalRequests < 10) {
      return ['Insufficient data for optimization suggestions (need 10+ requests)'];
    }

    // TTFT optimization
    if (report.timeToFirstToken.p90 > 100) {
      suggestions.push(
        `High TTFT (p90: ${report.timeToFirstToken.p90.toFixed(0)}ms) - Consider:` +
        '\n  - Using faster LLM models (gpt-4o-mini)' +
        '\n  - Reducing system prompt size' +
        '\n  - Enabling streaming responses'
      );
    }

    // LLM latency
    if (report.llmLatency.p90 > 200) {
      suggestions.push(
        `High LLM latency (p90: ${report.llmLatency.p90.toFixed(0)}ms) - Consider:` +
        '\n  - Reducing max_tokens' +
        '\n  - Using prompt caching' +
        '\n  - Optimizing conversation history size'
      );
    }

    // TTS latency  
    if (report.ttsLatency.p90 > 100) {
      suggestions.push(
        `High TTS latency (p90: ${report.ttsLatency.p90.toFixed(0)}ms) - Consider:` +
        '\n  - Using lower quality TTS for speed' +
        '\n  - Pre-generating common phrases' +
        '\n  - Enabling TTS streaming'
      );
    }

    // STT latency
    if (report.sttLatency.p90 > 150) {
      suggestions.push(
        `High STT latency (p90: ${report.sttLatency.p90.toFixed(0)}ms) - Consider:` +
        '\n  - Using faster STT model' +
        '\n  - Reducing audio buffer size' +
        '\n  - Enabling VAD for quicker end-of-speech detection'
      );
    }

    // Overall response time
    if (report.totalResponseTime.p90 > 400) {
      suggestions.push(
        `High total response time (p90: ${report.totalResponseTime.p90.toFixed(0)}ms) - Review:` +
        '\n  - Slowest requests breakdown in report' +
        '\n  - Network latency to API providers' +
        '\n  - Consider edge deployment'
      );
    }

    if (suggestions.length === 0) {
      suggestions.push('Performance looks good! All metrics within acceptable range.');
    }

    return suggestions;
  }

  /**
   * Clear stored traces
   */
  reset(): void {
    this.traces.clear();
    this.completedTraces = [];
    getLogger().info('Performance profiler reset');
  }
}

// ============================================================================
// SINGLETON & HELPERS
// ============================================================================

export const performanceProfiler = new PerformanceProfiler();

/**
 * Helper to time an async function
 */
export async function withTiming<T>(
  traceId: string,
  markName: string,
  fn: () => Promise<T>
): Promise<T> {
  performanceProfiler.mark(traceId, `${markName}_start`);
  try {
    const result = await fn();
    performanceProfiler.mark(traceId, `${markName}_end`);
    return result;
  } catch (error) {
    performanceProfiler.mark(traceId, `${markName}_error`);
    throw error;
  }
}

/**
 * Decorator for timing class methods
 */
export function Timed(markName: string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      // Look for traceId in args or context
      const traceId = typeof args[0] === 'string' ? args[0] : 'unknown';
      
      performanceProfiler.mark(traceId, `${markName}_start`);
      try {
        const result = await originalMethod.apply(this, args);
        performanceProfiler.mark(traceId, `${markName}_end`);
        return result;
      } catch (error) {
        performanceProfiler.mark(traceId, `${markName}_error`);
        throw error;
      }
    };

    return descriptor;
  };
}

export default performanceProfiler;


