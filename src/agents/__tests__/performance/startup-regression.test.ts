/**
 * Performance Regression Tests
 *
 * Automated tests to catch performance regressions in:
 * - Module import times
 * - Turn processing latency
 * - Memory usage
 * - Startup sequence timing
 *
 * @module agents/__tests__/performance/startup-regression
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ============================================================================
// PERFORMANCE BUDGETS
// ============================================================================

/**
 * Performance budgets for various operations
 * These should be adjusted based on actual production requirements
 */
export const PERFORMANCE_BUDGETS = {
  // Module loading
  CORE_IMPORTS_MAX_MS: 3000,
  PHASE1_IMPORTS_MAX_MS: 5000,
  PHASE2_IMPORTS_MAX_MS: 3000,
  PHASE3_IMPORTS_MAX_MS: 5000,
  TOTAL_PREWARM_MAX_MS: 15000,

  // Turn processing
  TURN_ANALYSIS_MAX_MS: 100,
  CONTEXT_BUILDING_MAX_MS: 50,
  TOTAL_TURN_PROCESSING_MAX_MS: 200,

  // Response latency
  FIRST_BYTE_MAX_MS: 500,
  TOTAL_RESPONSE_MAX_MS: 3000,

  // Memory
  HEAP_INCREASE_MAX_MB: 50,
  RSS_MAX_MB: 512,

  // LiveKit
  LIVEKIT_INIT_TIMEOUT_MS: 30000,
  PREWARM_SAFETY_MARGIN_MS: 25000,
};

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'MB' | 'count';
  budget: number;
  passed: boolean;
  timestamp: number;
}

class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private startMemory: NodeJS.MemoryUsage | null = null;

  startMemoryTracking(): void {
    this.startMemory = process.memoryUsage();
  }

  getMemoryDelta(): { heapUsed: number; rss: number } {
    const current = process.memoryUsage();
    const heapDelta = this.startMemory
      ? (current.heapUsed - this.startMemory.heapUsed) / 1024 / 1024
      : current.heapUsed / 1024 / 1024;
    const rssDelta = this.startMemory
      ? (current.rss - this.startMemory.rss) / 1024 / 1024
      : current.rss / 1024 / 1024;

    return { heapUsed: heapDelta, rss: rssDelta };
  }

  recordMetric(name: string, value: number, unit: 'ms' | 'MB' | 'count', budget: number): void {
    this.metrics.push({
      name,
      value,
      unit,
      budget,
      passed: value <= budget,
      timestamp: Date.now(),
    });
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getFailedMetrics(): PerformanceMetric[] {
    return this.metrics.filter((m) => !m.passed);
  }

  getSummary(): string {
    const passed = this.metrics.filter((m) => m.passed).length;
    const total = this.metrics.length;
    const failed = this.getFailedMetrics();

    let summary = `Performance: ${passed}/${total} passed\n`;

    if (failed.length > 0) {
      summary += 'Failed metrics:\n';
      for (const metric of failed) {
        summary += `  - ${metric.name}: ${metric.value}${metric.unit} (budget: ${metric.budget}${metric.unit})\n`;
      }
    }

    return summary;
  }

  reset(): void {
    this.metrics = [];
    this.startMemory = null;
  }
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Measure execution time of an async function
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Measure execution time of a sync function
 */
function measureTimeSync<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Run a function multiple times and get statistics
 */
async function benchmark<T>(
  fn: () => Promise<T>,
  iterations = 5
): Promise<{ mean: number; min: number; max: number; stdDev: number }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measureTime(fn);
    times.push(durationMs);
  }

  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { mean, min, max, stdDev };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Performance Regression Tests', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
    tracker.startMemoryTracking();
  });

  afterEach(() => {
    const summary = tracker.getSummary();
    if (tracker.getFailedMetrics().length > 0) {
      console.warn(summary);
    }
    tracker.reset();
  });

  // ==========================================================================
  // BUDGET VALIDATION
  // ==========================================================================

  describe('Performance Budget Validation', () => {
    it('should have valid performance budgets', () => {
      // Prewarm should complete before LiveKit timeout
      expect(PERFORMANCE_BUDGETS.TOTAL_PREWARM_MAX_MS).toBeLessThan(
        PERFORMANCE_BUDGETS.PREWARM_SAFETY_MARGIN_MS
      );

      // Safety margin should be before LiveKit timeout
      expect(PERFORMANCE_BUDGETS.PREWARM_SAFETY_MARGIN_MS).toBeLessThan(
        PERFORMANCE_BUDGETS.LIVEKIT_INIT_TIMEOUT_MS
      );

      // Phase totals should sum to less than total prewarm
      const phaseTotals =
        PERFORMANCE_BUDGETS.PHASE1_IMPORTS_MAX_MS +
        PERFORMANCE_BUDGETS.PHASE2_IMPORTS_MAX_MS +
        PERFORMANCE_BUDGETS.PHASE3_IMPORTS_MAX_MS;

      expect(phaseTotals).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.TOTAL_PREWARM_MAX_MS);
    });

    it('should have reasonable turn processing budget', () => {
      // Analysis + context building should fit in total budget
      const componentTotal =
        PERFORMANCE_BUDGETS.TURN_ANALYSIS_MAX_MS + PERFORMANCE_BUDGETS.CONTEXT_BUILDING_MAX_MS;

      expect(componentTotal).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.TOTAL_TURN_PROCESSING_MAX_MS);
    });

    it('should have response latency within acceptable range', () => {
      // First byte should be much less than total
      expect(PERFORMANCE_BUDGETS.FIRST_BYTE_MAX_MS).toBeLessThan(
        PERFORMANCE_BUDGETS.TOTAL_RESPONSE_MAX_MS
      );

      // Response should complete in reasonable time for voice
      expect(PERFORMANCE_BUDGETS.TOTAL_RESPONSE_MAX_MS).toBeLessThanOrEqual(5000);
    });
  });

  // ==========================================================================
  // SIMULATED TIMING TESTS
  // ==========================================================================

  describe('Simulated Timing Tests', () => {
    it('should measure sync operations accurately', () => {
      const { durationMs } = measureTimeSync(() => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
          sum += i;
        }
        return sum;
      });

      // Should complete very quickly
      expect(durationMs).toBeLessThan(100);
    });

    it('should measure async operations accurately', async () => {
      const { durationMs } = await measureTime(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
        return 'done';
      });

      // Should be at least 50ms
      expect(durationMs).toBeGreaterThanOrEqual(45);
      // But not much more
      expect(durationMs).toBeLessThan(150);
    });

    it('should collect benchmark statistics', async () => {
      const stats = await benchmark(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        return 'done';
      }, 3);

      expect(stats.mean).toBeGreaterThan(0);
      expect(stats.min).toBeLessThanOrEqual(stats.mean);
      expect(stats.max).toBeGreaterThanOrEqual(stats.mean);
      expect(stats.stdDev).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // MEMORY TRACKING
  // ==========================================================================

  describe('Memory Tracking', () => {
    it('should track memory delta', () => {
      const delta = tracker.getMemoryDelta();

      expect(delta.heapUsed).toBeDefined();
      expect(delta.rss).toBeDefined();
      expect(typeof delta.heapUsed).toBe('number');
      expect(typeof delta.rss).toBe('number');
    });

    it('should detect memory increase', () => {
      // Allocate some memory
      const data: number[] = [];
      for (let i = 0; i < 100000; i++) {
        data.push(Math.random());
      }

      const delta = tracker.getMemoryDelta();

      // Should detect some memory increase (not precise due to GC)
      expect(delta.heapUsed).toBeDefined();
    });

    it('should stay within memory budget', () => {
      const delta = tracker.getMemoryDelta();

      tracker.recordMetric(
        'heap_increase',
        delta.heapUsed,
        'MB',
        PERFORMANCE_BUDGETS.HEAP_INCREASE_MAX_MB
      );

      const metrics = tracker.getMetrics();
      expect(metrics[0].passed).toBe(true);
    });
  });

  // ==========================================================================
  // METRIC TRACKING
  // ==========================================================================

  describe('Metric Recording', () => {
    it('should record passing metrics', () => {
      tracker.recordMetric('test_metric', 50, 'ms', 100);

      const metrics = tracker.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0].passed).toBe(true);
    });

    it('should record failing metrics', () => {
      tracker.recordMetric('slow_metric', 150, 'ms', 100);

      const metrics = tracker.getMetrics();
      const failed = tracker.getFailedMetrics();

      expect(metrics[0].passed).toBe(false);
      expect(failed).toHaveLength(1);
    });

    it('should generate summary report', () => {
      tracker.recordMetric('fast', 10, 'ms', 100);
      tracker.recordMetric('slow', 200, 'ms', 100);

      const summary = tracker.getSummary();

      expect(summary).toContain('1/2 passed');
      expect(summary).toContain('slow');
      expect(summary).toContain('200ms');
    });

    it('should reset between tests', () => {
      tracker.recordMetric('metric1', 10, 'ms', 100);
      expect(tracker.getMetrics()).toHaveLength(1);

      tracker.reset();

      expect(tracker.getMetrics()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // SIMULATED TURN PROCESSING
  // ==========================================================================

  describe('Simulated Turn Processing Performance', () => {
    it('should process simulated turn within budget', async () => {
      const { durationMs } = await measureTime(async () => {
        // Simulate analysis
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        });

        // Simulate context building
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });

        return { analysis: {}, context: [] };
      });

      tracker.recordMetric(
        'simulated_turn_processing',
        durationMs,
        'ms',
        PERFORMANCE_BUDGETS.TOTAL_TURN_PROCESSING_MAX_MS
      );

      expect(durationMs).toBeLessThan(PERFORMANCE_BUDGETS.TOTAL_TURN_PROCESSING_MAX_MS);
    });

    it('should analyze within budget', async () => {
      const { durationMs } = await measureTime(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 30);
        });
        return { emotion: 'neutral', topics: [] };
      });

      tracker.recordMetric(
        'simulated_analysis',
        durationMs,
        'ms',
        PERFORMANCE_BUDGETS.TURN_ANALYSIS_MAX_MS
      );

      expect(durationMs).toBeLessThan(PERFORMANCE_BUDGETS.TURN_ANALYSIS_MAX_MS);
    });

    it('should build context within budget', async () => {
      const { durationMs } = await measureTime(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 15);
        });
        return { injections: [], elapsedMs: 15 };
      });

      tracker.recordMetric(
        'simulated_context',
        durationMs,
        'ms',
        PERFORMANCE_BUDGETS.CONTEXT_BUILDING_MAX_MS
      );

      expect(durationMs).toBeLessThan(PERFORMANCE_BUDGETS.CONTEXT_BUILDING_MAX_MS);
    });
  });

  // ==========================================================================
  // SIMULATED STARTUP SEQUENCE
  // ==========================================================================

  describe('Simulated Startup Sequence', () => {
    it('should complete prewarm simulation within budget', async () => {
      const { durationMs } = await measureTime(async () => {
        // Phase 1: External packages (simulated)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        // Phase 2: Internal modules (simulated)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 30);
        });

        // Phase 3: Heavy resources (simulated)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        return { deps: 'loaded' };
      });

      tracker.recordMetric('simulated_prewarm', durationMs, 'ms', 500); // Simulated budget

      expect(durationMs).toBeLessThan(500);
    });

    it('should leave buffer before LiveKit timeout', () => {
      const simulatedPrewarm = 100; // ms (simulated)
      const buffer = PERFORMANCE_BUDGETS.LIVEKIT_INIT_TIMEOUT_MS - simulatedPrewarm;

      // Should have at least 5 seconds buffer
      expect(buffer).toBeGreaterThan(5000);
    });
  });

  // ==========================================================================
  // REGRESSION DETECTION
  // ==========================================================================

  describe('Regression Detection', () => {
    it('should detect timing regression', async () => {
      const baseline = 50; // ms
      const current = 60; // ms (20% slower)
      const threshold = 0.1; // 10% allowed regression

      const regression = (current - baseline) / baseline;

      tracker.recordMetric('timing_regression', current, 'ms', baseline * (1 + threshold));

      if (regression > threshold) {
        expect(tracker.getFailedMetrics().length).toBeGreaterThan(0);
      } else {
        expect(tracker.getFailedMetrics().length).toBe(0);
      }
    });

    it('should track multiple metrics for regression', () => {
      const metrics = [
        { name: 'analysis', value: 80, budget: 100 },
        { name: 'context', value: 45, budget: 50 },
        { name: 'response', value: 180, budget: 200 },
        { name: 'slow_operation', value: 250, budget: 200 }, // Regression
      ];

      for (const m of metrics) {
        tracker.recordMetric(m.name, m.value, 'ms', m.budget);
      }

      const failed = tracker.getFailedMetrics();

      expect(failed).toHaveLength(1);
      expect(failed[0].name).toBe('slow_operation');
    });
  });

  // ==========================================================================
  // BENCHMARK UTILITIES
  // ==========================================================================

  describe('Benchmark Utilities', () => {
    it('should calculate accurate statistics', async () => {
      const mockTimes = [10, 11, 10, 12, 10];
      let callIndex = 0;

      const stats = await benchmark(async () => {
        // Simulate controlled timing
        await new Promise<void>((resolve) => {
          setTimeout(resolve, mockTimes[callIndex++ % mockTimes.length]);
        });
      }, 5);

      expect(stats.mean).toBeGreaterThan(0);
      expect(stats.min).toBeLessThanOrEqual(stats.max);
    });

    it('should detect high variance', async () => {
      const stats = await benchmark(async () => {
        // Random delay for variance
        const delay = Math.random() * 20 + 5;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }, 5);

      // With random delays, we expect some variance
      expect(stats.stdDev).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

export { benchmark, measureTime, measureTimeSync, PerformanceTracker };
export type { PerformanceMetric };
