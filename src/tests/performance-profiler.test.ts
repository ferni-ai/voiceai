/**
 * Performance Profiler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  performanceProfiler,
  withTiming,
} from '../services/performance-profiler.js';

describe('Performance Profiler', () => {
  beforeEach(() => {
    performanceProfiler.reset();
  });

  describe('trace lifecycle', () => {
    it('should start and end traces', () => {
      performanceProfiler.startTrace('trace-1', 'session-1', { personaId: 'ferni' });
      performanceProfiler.mark('trace-1', 'step1');
      performanceProfiler.mark('trace-1', 'step2');
      const trace = performanceProfiler.endTrace('trace-1');

      expect(trace).not.toBeNull();
      expect(trace?.traceId).toBe('trace-1');
      expect(trace?.sessionId).toBe('session-1');
      expect(trace?.marks).toHaveLength(2);
      expect(trace?.marks[0]?.name).toBe('step1');
      expect(trace?.marks[1]?.name).toBe('step2');
    });

    it('should handle non-existent traces gracefully', () => {
      performanceProfiler.mark('non-existent', 'step1');
      const trace = performanceProfiler.endTrace('non-existent');
      expect(trace).toBeNull();
    });

    it('should calculate durations from start', () => {
      performanceProfiler.startTrace('trace-1', 'session-1');
      
      // Small delay to ensure measurable duration
      const start = performance.now();
      while (performance.now() - start < 5) {
        // busy wait
      }
      
      performanceProfiler.mark('trace-1', 'after-delay');
      const trace = performanceProfiler.endTrace('trace-1');

      expect(trace?.marks[0]?.duration).toBeGreaterThan(0);
    });
  });

  describe('interval calculation', () => {
    it('should calculate interval between marks', () => {
      performanceProfiler.startTrace('trace-1', 'session-1');
      performanceProfiler.mark('trace-1', 'llm_start');
      
      // Small delay
      const start = performance.now();
      while (performance.now() - start < 5) {
        // busy wait
      }
      
      performanceProfiler.mark('trace-1', 'llm_end');
      performanceProfiler.endTrace('trace-1');

      const interval = performanceProfiler.getInterval('trace-1', 'llm_start', 'llm_end');
      expect(interval).toBeGreaterThan(0);
    });

    it('should return null for missing marks', () => {
      performanceProfiler.startTrace('trace-1', 'session-1');
      performanceProfiler.mark('trace-1', 'start');
      performanceProfiler.endTrace('trace-1');

      const interval = performanceProfiler.getInterval('trace-1', 'start', 'missing');
      expect(interval).toBeNull();
    });
  });

  describe('report generation', () => {
    it('should generate empty report with no traces', () => {
      const report = performanceProfiler.generateReport();
      
      expect(report.totalRequests).toBe(0);
      expect(report.totalResponseTime.count).toBe(0);
    });

    it('should calculate statistics correctly', () => {
      // Create multiple traces
      for (let i = 0; i < 10; i++) {
        performanceProfiler.startTrace(`trace-${i}`, 'session-1');
        performanceProfiler.mark(`trace-${i}`, 'llm_first_token');
        performanceProfiler.mark(`trace-${i}`, 'llm_start');
        performanceProfiler.mark(`trace-${i}`, 'llm_end');
        performanceProfiler.mark(`trace-${i}`, 'audio_start');
        performanceProfiler.endTrace(`trace-${i}`);
      }

      const report = performanceProfiler.generateReport();
      
      expect(report.totalRequests).toBe(10);
      expect(report.totalResponseTime.count).toBe(10);
      expect(report.totalResponseTime.mean).toBeGreaterThanOrEqual(0);
      expect(report.totalResponseTime.p50).toBeGreaterThanOrEqual(0);
      expect(report.totalResponseTime.p90).toBeGreaterThanOrEqual(0);
    });

    it('should track slow requests', () => {
      // Mock slow request
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)    // start
        .mockReturnValueOnce(100)  // mark 1
        .mockReturnValueOnce(600)  // end (slow: > 500ms)
        .mockReturnValueOnce(1000); // for report filter

      performanceProfiler.startTrace('slow-trace', 'session-1');
      performanceProfiler.mark('slow-trace', 'step1');
      performanceProfiler.endTrace('slow-trace');

      vi.restoreAllMocks();

      const report = performanceProfiler.generateReport();
      
      expect(report.slowRequests.length).toBeGreaterThan(0);
      expect(report.slowRequests[0]?.traceId).toBe('slow-trace');
    });
  });

  describe('optimization suggestions', () => {
    it('should return suggestions for slow metrics', () => {
      // Create traces with slow timings
      vi.spyOn(performance, 'now')
        .mockImplementation(() => {
          // Increment by 200ms each call to simulate slow operations
          return Date.now();
        });

      // Create enough traces for suggestions
      for (let i = 0; i < 15; i++) {
        const base = i * 1000;
        vi.spyOn(performance, 'now')
          .mockReturnValueOnce(base)        // start
          .mockReturnValueOnce(base + 150)  // llm_first_token
          .mockReturnValueOnce(base + 200)  // llm_start
          .mockReturnValueOnce(base + 500)  // llm_end
          .mockReturnValueOnce(base + 550)  // tts_start
          .mockReturnValueOnce(base + 700)  // tts_end
          .mockReturnValueOnce(base + 750)  // audio_start
          .mockReturnValueOnce(base + 800); // end

        performanceProfiler.startTrace(`trace-${i}`, 'session-1');
        performanceProfiler.mark(`trace-${i}`, 'llm_first_token');
        performanceProfiler.mark(`trace-${i}`, 'llm_start');
        performanceProfiler.mark(`trace-${i}`, 'llm_end');
        performanceProfiler.mark(`trace-${i}`, 'tts_start');
        performanceProfiler.mark(`trace-${i}`, 'tts_end');
        performanceProfiler.mark(`trace-${i}`, 'audio_start');
        performanceProfiler.endTrace(`trace-${i}`);
      }

      vi.restoreAllMocks();

      const suggestions = performanceProfiler.getOptimizationSuggestions();
      
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should indicate insufficient data', () => {
      const suggestions = performanceProfiler.getOptimizationSuggestions();
      
      expect(suggestions).toContain(
        'Insufficient data for optimization suggestions (need 10+ requests)'
      );
    });
  });
});

describe('withTiming helper', () => {
  beforeEach(() => {
    performanceProfiler.reset();
  });

  it('should time async functions', async () => {
    performanceProfiler.startTrace('trace-1', 'session-1');
    
    const result = await withTiming('trace-1', 'operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    });
    
    performanceProfiler.endTrace('trace-1');

    expect(result).toBe('done');
    
    const interval = performanceProfiler.getInterval(
      'trace-1',
      'operation_start',
      'operation_end'
    );
    expect(interval).toBeGreaterThan(0);
  });

  it('should handle errors', async () => {
    performanceProfiler.startTrace('trace-1', 'session-1');
    
    await expect(
      withTiming('trace-1', 'failing', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');

    performanceProfiler.endTrace('trace-1');
  });
});


