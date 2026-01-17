/**
 * Turn Profiler Tests
 *
 * Tests for the turn performance profiling system that tracks
 * latencies and identifies bottlenecks in voice conversation turns.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTurnProfiler,
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
  getSessionPerformanceSummary,
  getGlobalPerformanceSummary,
  clearSessionProfiling,
  PERFORMANCE_THRESHOLDS,
  type TurnMetrics,
} from '../turn-profiler.js';

describe('TurnProfiler', () => {
  beforeEach(() => {
    // Clear the profiler before each test
    const profiler = getTurnProfiler();
    profiler.clear();
  });

  describe('getTurnProfiler', () => {
    it('should return singleton instance', () => {
      const instance1 = getTurnProfiler();
      const instance2 = getTurnProfiler();
      expect(instance1).toBe(instance2);
    });
  });

  describe('PERFORMANCE_THRESHOLDS', () => {
    it('should have expected threshold values', () => {
      // Updated thresholds for faster response targets (Dec 2024)
      expect(PERFORMANCE_THRESHOLDS.EXCELLENT_TOTAL_MS).toBe(250);
      expect(PERFORMANCE_THRESHOLDS.GOOD_TOTAL_MS).toBe(400);
      expect(PERFORMANCE_THRESHOLDS.ACCEPTABLE_TOTAL_MS).toBe(600);
      expect(PERFORMANCE_THRESHOLDS.SLOW_TOTAL_MS).toBe(1200);
      expect(PERFORMANCE_THRESHOLDS.TARGET_TTFA_MS).toBe(300);
    });
  });

  describe('startTurnProfiling', () => {
    it('should start profiling a turn', () => {
      startTurnProfiling('session-1', 1);

      // Complete the turn to verify it was started
      const metrics = completeTurnProfiling('session-1', 1);
      expect(metrics).not.toBeNull();
      expect(metrics?.sessionId).toBe('session-1');
      expect(metrics?.turnNumber).toBe(1);
    });

    it('should handle multiple sessions', () => {
      startTurnProfiling('session-a', 1);
      startTurnProfiling('session-b', 1);

      const metricsA = completeTurnProfiling('session-a', 1);
      const metricsB = completeTurnProfiling('session-b', 1);

      expect(metricsA?.sessionId).toBe('session-a');
      expect(metricsB?.sessionId).toBe('session-b');
    });

    it('should handle multiple turns in same session', () => {
      startTurnProfiling('session-1', 1);
      startTurnProfiling('session-1', 2);

      const metrics1 = completeTurnProfiling('session-1', 1);
      const metrics2 = completeTurnProfiling('session-1', 2);

      expect(metrics1?.turnNumber).toBe(1);
      expect(metrics2?.turnNumber).toBe(2);
    });
  });

  describe('markTurnCheckpoint', () => {
    it('should mark timing checkpoints', () => {
      startTurnProfiling('session-1', 1);

      markTurnCheckpoint('session-1', 1, 'analysisComplete');
      markTurnCheckpoint('session-1', 1, 'contextBuildStart');
      markTurnCheckpoint('session-1', 1, 'contextBuildComplete');
      markTurnCheckpoint('session-1', 1, 'llmStart');
      markTurnCheckpoint('session-1', 1, 'llmFirstToken');
      markTurnCheckpoint('session-1', 1, 'llmComplete');
      markTurnCheckpoint('session-1', 1, 'ttsStart');
      markTurnCheckpoint('session-1', 1, 'ttsFirstByte');
      markTurnCheckpoint('session-1', 1, 'ttsComplete');

      const metrics = completeTurnProfiling('session-1', 1);

      expect(metrics?.timings.analysisComplete).toBeDefined();
      expect(metrics?.timings.contextBuildStart).toBeDefined();
      expect(metrics?.timings.llmStart).toBeDefined();
      expect(metrics?.timings.ttsComplete).toBeDefined();
    });

    it('should ignore checkpoints for unknown turns', () => {
      // Don't start the turn - just try to mark
      markTurnCheckpoint('unknown-session', 99, 'analysisComplete');

      // Should not throw, just silently ignore
      const metrics = completeTurnProfiling('unknown-session', 99);
      expect(metrics).toBeNull();
    });
  });

  describe('completeTurnProfiling', () => {
    it('should calculate latencies correctly', async () => {
      startTurnProfiling('session-1', 1);

      // Simulate some time passing
      await delay(10);
      markTurnCheckpoint('session-1', 1, 'analysisComplete');

      await delay(10);
      markTurnCheckpoint('session-1', 1, 'contextBuildStart');

      await delay(10);
      markTurnCheckpoint('session-1', 1, 'contextBuildComplete');

      const metrics = completeTurnProfiling('session-1', 1);

      expect(metrics?.latencies.totalTurnMs).toBeGreaterThan(0);
      expect(metrics?.latencies.analysisMs).toBeGreaterThanOrEqual(0);
      expect(metrics?.latencies.contextBuildingMs).toBeGreaterThanOrEqual(0);
    });

    it('should return null for unknown turns', () => {
      const metrics = completeTurnProfiling('unknown', 999);
      expect(metrics).toBeNull();
    });

    it('should identify bottleneck component', async () => {
      startTurnProfiling('session-1', 1);

      // Simulate LLM taking the most time
      markTurnCheckpoint('session-1', 1, 'llmStart');
      await delay(50);
      markTurnCheckpoint('session-1', 1, 'llmComplete');

      const metrics = completeTurnProfiling('session-1', 1);

      expect(metrics?.bottleneck).toBeDefined();
      expect(metrics?.bottleneck.component).toBeDefined();
      expect(metrics?.bottleneck.latencyMs).toBeGreaterThanOrEqual(0);
      expect(metrics?.bottleneck.percentOfTotal).toBeGreaterThanOrEqual(0);
    });
  });

  describe('performance tiers', () => {
    it('should classify as excellent for fast turns', () => {
      startTurnProfiling('session-1', 1);
      // Complete immediately - should be excellent
      const metrics = completeTurnProfiling('session-1', 1);

      expect(metrics?.tier).toBe('excellent');
    });

    it('should classify based on total turn time', async () => {
      // Test each tier threshold
      const testCases = [
        { delay: 0, expected: 'excellent' },
        { delay: 350, expected: 'good' },
        { delay: 550, expected: 'acceptable' },
        { delay: 900, expected: 'slow' },
        { delay: 1600, expected: 'critical' },
      ];

      for (const tc of testCases) {
        const profiler = getTurnProfiler();
        profiler.clear();

        // Mock Date.now to control timing
        const startTime = Date.now();
        vi.spyOn(Date, 'now')
          .mockReturnValueOnce(startTime) // turnStart
          .mockReturnValue(startTime + tc.delay); // turnComplete

        startTurnProfiling('session-tier', 1);
        const metrics = completeTurnProfiling('session-tier', 1);

        expect(metrics?.tier).toBe(tc.expected);
        vi.restoreAllMocks();
      }
    });
  });

  describe('getSessionPerformanceSummary', () => {
    it('should return null for unknown sessions', () => {
      const summary = getSessionPerformanceSummary('unknown-session');
      expect(summary).toBeNull();
    });

    it('should calculate session summary correctly', () => {
      // Create multiple turns
      for (let i = 1; i <= 5; i++) {
        startTurnProfiling('session-summary', i);
        completeTurnProfiling('session-summary', i);
      }

      const summary = getSessionPerformanceSummary('session-summary');

      expect(summary).not.toBeNull();
      expect(summary?.sessionId).toBe('session-summary');
      expect(summary?.totalTurns).toBe(5);
      expect(summary?.avgTotalTurnMs).toBeGreaterThanOrEqual(0);
      expect(summary?.p50TurnMs).toBeDefined();
      expect(summary?.p95TurnMs).toBeDefined();
      expect(summary?.p99TurnMs).toBeDefined();
      expect(summary?.tierDistribution).toBeDefined();
      expect(summary?.bottleneckDistribution).toBeDefined();
    });

    it('should track tier distribution', () => {
      for (let i = 1; i <= 3; i++) {
        startTurnProfiling('session-tiers', i);
        completeTurnProfiling('session-tiers', i);
      }

      const summary = getSessionPerformanceSummary('session-tiers');

      expect(summary?.tierDistribution.excellent).toBe(3);
    });
  });

  describe('getGlobalPerformanceSummary', () => {
    it('should return empty summary when no metrics', () => {
      const summary = getGlobalPerformanceSummary();

      expect(summary.totalTurns).toBe(0);
      expect(summary.avgTurnMs).toBe(0);
      expect(summary.slowTurnPercentage).toBe(0);
      expect(summary.topBottlenecks).toEqual([]);
    });

    it('should aggregate metrics across sessions', () => {
      // Create turns in multiple sessions
      for (let s = 1; s <= 3; s++) {
        for (let t = 1; t <= 2; t++) {
          startTurnProfiling(`session-${s}`, t);
          completeTurnProfiling(`session-${s}`, t);
        }
      }

      const summary = getGlobalPerformanceSummary();

      expect(summary.totalTurns).toBe(6); // 3 sessions × 2 turns
      expect(summary.avgTurnMs).toBeGreaterThanOrEqual(0);
      expect(summary.topBottlenecks.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate slow turn percentage', async () => {
      // Create some fast and some slow turns
      const startTime = Date.now();

      // Fast turn
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValue(startTime + 100);
      startTurnProfiling('perf-test', 1);
      completeTurnProfiling('perf-test', 1);
      vi.restoreAllMocks();

      // Slow turn
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValue(startTime + 2000); // Critical tier
      startTurnProfiling('perf-test', 2);
      completeTurnProfiling('perf-test', 2);
      vi.restoreAllMocks();

      const summary = getGlobalPerformanceSummary();

      expect(summary.slowTurnPercentage).toBe(50); // 1 of 2 is slow/critical
    });

    it('should identify top bottlenecks', () => {
      // Create turns with different bottlenecks
      for (let i = 1; i <= 5; i++) {
        startTurnProfiling('bottleneck-test', i);

        // Alternate which component takes longest
        if (i % 2 === 0) {
          markTurnCheckpoint('bottleneck-test', i, 'llmStart');
          markTurnCheckpoint('bottleneck-test', i, 'llmComplete');
        } else {
          markTurnCheckpoint('bottleneck-test', i, 'ttsStart');
          markTurnCheckpoint('bottleneck-test', i, 'ttsComplete');
        }

        completeTurnProfiling('bottleneck-test', i);
      }

      const summary = getGlobalPerformanceSummary();

      expect(summary.topBottlenecks.length).toBeGreaterThan(0);
      expect(summary.topBottlenecks[0]).toHaveProperty('component');
      expect(summary.topBottlenecks[0]).toHaveProperty('count');
    });
  });

  describe('clearSessionProfiling', () => {
    it('should clear session metrics', () => {
      // Create some turns
      for (let i = 1; i <= 3; i++) {
        startTurnProfiling('session-to-clear', i);
        completeTurnProfiling('session-to-clear', i);
      }

      expect(getSessionPerformanceSummary('session-to-clear')?.totalTurns).toBe(3);

      // Clear
      clearSessionProfiling('session-to-clear');

      expect(getSessionPerformanceSummary('session-to-clear')).toBeNull();
    });

    it('should clear active turns for session', () => {
      startTurnProfiling('session-active', 1);
      startTurnProfiling('session-active', 2);

      // Clear before completing
      clearSessionProfiling('session-active');

      // Completing should return null now
      expect(completeTurnProfiling('session-active', 1)).toBeNull();
      expect(completeTurnProfiling('session-active', 2)).toBeNull();
    });

    it('should not affect other sessions', () => {
      startTurnProfiling('keep-session', 1);
      completeTurnProfiling('keep-session', 1);

      startTurnProfiling('clear-session', 1);
      completeTurnProfiling('clear-session', 1);

      clearSessionProfiling('clear-session');

      expect(getSessionPerformanceSummary('keep-session')).not.toBeNull();
      expect(getSessionPerformanceSummary('clear-session')).toBeNull();
    });
  });

  describe('latency calculations', () => {
    it('should calculate time to first audio correctly', async () => {
      const startTime = Date.now();

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime) // turnStart
        .mockReturnValueOnce(startTime + 100) // ttsFirstByte
        .mockReturnValue(startTime + 200); // turnComplete

      startTurnProfiling('ttfa-test', 1);
      markTurnCheckpoint('ttfa-test', 1, 'ttsFirstByte');
      const metrics = completeTurnProfiling('ttfa-test', 1);

      vi.restoreAllMocks();

      // Time to first audio should be from turnStart to ttsFirstByte
      expect(metrics?.latencies.timeToFirstAudioMs).toBe(100);
    });

    it('should use audioPlaybackStart if available for TTFA', async () => {
      const startTime = Date.now();

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime) // turnStart
        .mockReturnValueOnce(startTime + 100) // ttsFirstByte
        .mockReturnValueOnce(startTime + 150) // audioPlaybackStart
        .mockReturnValue(startTime + 200); // turnComplete

      startTurnProfiling('ttfa-test-2', 1);
      markTurnCheckpoint('ttfa-test-2', 1, 'ttsFirstByte');
      markTurnCheckpoint('ttfa-test-2', 1, 'audioPlaybackStart');
      const metrics = completeTurnProfiling('ttfa-test-2', 1);

      vi.restoreAllMocks();

      // Should use audioPlaybackStart
      expect(metrics?.latencies.timeToFirstAudioMs).toBe(150);
    });
  });

  describe('metrics storage limits', () => {
    it('should limit stored metrics per session', () => {
      // Create more than 100 turns
      for (let i = 1; i <= 110; i++) {
        startTurnProfiling('limit-session', i);
        completeTurnProfiling('limit-session', i);
      }

      const summary = getSessionPerformanceSummary('limit-session');

      // Should be capped at 100
      expect(summary?.totalTurns).toBeLessThanOrEqual(100);
    });
  });
});

// Helper function
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
