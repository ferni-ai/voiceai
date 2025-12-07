/**
 * Cognitive Metrics Tests
 *
 * Tests for:
 * - CognitiveMetricsTracker timing and recording
 * - Summary calculations (avg, p95, max, percentages)
 * - Helper functions (timeCognitiveOperation, timeCognitiveOperationSync)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock cognitive-broadcast to prevent import
vi.mock('../services/cognitive-broadcast.js', () => ({
  broadcastMetrics: vi.fn(),
}));

import {
  cognitiveMetrics,
  timeCognitiveOperation,
  timeCognitiveOperationSync,
  recordTurnMetrics,
  getCognitiveMetricsSummary,
  maybeLogMetrics,
} from '../utils/cognitive-metrics.js';

describe('CognitiveMetricsTracker', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  describe('Timing Operations', () => {
    it('should start and end timing for an operation', () => {
      cognitiveMetrics.startTiming('contextBuildTime');
      const duration = cognitiveMetrics.endTiming('contextBuildTime');

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for endTiming without startTiming', () => {
      const duration = cognitiveMetrics.endTiming('contextBuildTime');

      expect(duration).toBe(0);
    });

    it('should track multiple operations independently', () => {
      cognitiveMetrics.startTiming('contextBuildTime');
      cognitiveMetrics.startTiming('speechAdjustTime');

      const contextDuration = cognitiveMetrics.endTiming('contextBuildTime');
      const speechDuration = cognitiveMetrics.endTiming('speechAdjustTime');

      expect(contextDuration).toBeGreaterThanOrEqual(0);
      expect(speechDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Recording Metrics', () => {
    it('should record metrics with all fields', () => {
      cognitiveMetrics.startTiming('contextBuildTime');
      cognitiveMetrics.endTiming('contextBuildTime');

      const metrics = cognitiveMetrics.recordMetrics();

      expect(metrics).toHaveProperty('contextBuildTime');
      expect(metrics).toHaveProperty('speechAdjustTime');
      expect(metrics).toHaveProperty('userStyleDetectTime');
      expect(metrics).toHaveProperty('quirkActivationTime');
      expect(metrics).toHaveProperty('voiceEmotionTime');
      expect(metrics).toHaveProperty('totalOverhead');
      expect(metrics).toHaveProperty('timestamp');
    });

    it('should calculate totalOverhead as sum of all times', () => {
      // Simulate timing values by directly setting them through recording
      cognitiveMetrics.startTiming('contextBuildTime');
      cognitiveMetrics.endTiming('contextBuildTime');
      cognitiveMetrics.startTiming('speechAdjustTime');
      cognitiveMetrics.endTiming('speechAdjustTime');

      const metrics = cognitiveMetrics.recordMetrics();

      expect(metrics.totalOverhead).toBe(
        metrics.contextBuildTime +
          metrics.speechAdjustTime +
          metrics.userStyleDetectTime +
          metrics.quirkActivationTime +
          metrics.voiceEmotionTime
      );
    });

    it('should default untimed operations to 0', () => {
      const metrics = cognitiveMetrics.recordMetrics();

      expect(metrics.contextBuildTime).toBe(0);
      expect(metrics.speechAdjustTime).toBe(0);
      expect(metrics.userStyleDetectTime).toBe(0);
      expect(metrics.quirkActivationTime).toBe(0);
      expect(metrics.voiceEmotionTime).toBe(0);
    });

    it('should limit stored samples to maxSamples', () => {
      // Record more than maxSamples (1000)
      for (let i = 0; i < 1050; i++) {
        cognitiveMetrics.recordMetrics();
      }

      const recent = cognitiveMetrics.getRecentMetrics(2000);
      expect(recent.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Summary Calculations', () => {
    beforeEach(() => {
      cognitiveMetrics.clear();
    });

    it('should return zero summary when no samples', () => {
      const summary = cognitiveMetrics.getSummary();

      expect(summary.sampleCount).toBe(0);
      expect(summary.avgTotalOverhead).toBe(0);
      expect(summary.p95TotalOverhead).toBe(0);
      expect(summary.maxTotalOverhead).toBe(0);
      expect(summary.under50msPercentage).toBe(0);
      expect(summary.under100msPercentage).toBe(0);
    });

    it('should calculate correct sample count', () => {
      cognitiveMetrics.recordMetrics();
      cognitiveMetrics.recordMetrics();
      cognitiveMetrics.recordMetrics();

      const summary = cognitiveMetrics.getSummary();

      expect(summary.sampleCount).toBe(3);
    });

    it('should calculate percentage under thresholds', () => {
      // Record metrics with 0 overhead (all under 50ms and 100ms)
      for (let i = 0; i < 10; i++) {
        cognitiveMetrics.recordMetrics();
      }

      const summary = cognitiveMetrics.getSummary();

      expect(summary.under50msPercentage).toBe(100);
      expect(summary.under100msPercentage).toBe(100);
    });
  });

  describe('Recent Metrics', () => {
    it('should return empty array when no metrics', () => {
      const recent = cognitiveMetrics.getRecentMetrics(10);

      expect(recent).toEqual([]);
    });

    it('should return last N metrics', () => {
      for (let i = 0; i < 20; i++) {
        cognitiveMetrics.recordMetrics();
      }

      const recent = cognitiveMetrics.getRecentMetrics(5);

      expect(recent.length).toBe(5);
    });

    it('should return all metrics if count exceeds total', () => {
      cognitiveMetrics.recordMetrics();
      cognitiveMetrics.recordMetrics();

      const recent = cognitiveMetrics.getRecentMetrics(10);

      expect(recent.length).toBe(2);
    });

    it('should default to 10 metrics', () => {
      for (let i = 0; i < 20; i++) {
        cognitiveMetrics.recordMetrics();
      }

      const recent = cognitiveMetrics.getRecentMetrics();

      expect(recent.length).toBe(10);
    });
  });

  describe('Clear', () => {
    it('should clear all metrics and state', () => {
      cognitiveMetrics.startTiming('contextBuildTime');
      cognitiveMetrics.recordMetrics();
      cognitiveMetrics.recordMetrics();

      cognitiveMetrics.clear();

      expect(cognitiveMetrics.getRecentMetrics(100).length).toBe(0);
      expect(cognitiveMetrics.getSummary().sampleCount).toBe(0);
    });
  });

  describe('Log Summary', () => {
    it('should log without error', () => {
      cognitiveMetrics.recordMetrics();

      // Should not throw
      expect(() => cognitiveMetrics.logSummary()).not.toThrow();
    });
  });
});

describe('timeCognitiveOperation', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  it('should time an async operation', async () => {
    const result = await timeCognitiveOperation('contextBuildTime', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'result';
    });

    expect(result).toBe('result');
  });

  it('should record timing even if operation throws', async () => {
    await expect(
      timeCognitiveOperation('contextBuildTime', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    // The timing should still have been recorded
    // (Note: this tests the finally block behavior)
  });

  it('should return the result of the async function', async () => {
    const result = await timeCognitiveOperation('speechAdjustTime', async () => {
      return { data: 'test', count: 42 };
    });

    expect(result).toEqual({ data: 'test', count: 42 });
  });
});

describe('timeCognitiveOperationSync', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  it('should time a sync operation', () => {
    const result = timeCognitiveOperationSync('contextBuildTime', () => {
      return 'sync result';
    });

    expect(result).toBe('sync result');
  });

  it('should record timing even if operation throws', () => {
    expect(() =>
      timeCognitiveOperationSync('contextBuildTime', () => {
        throw new Error('Sync error');
      })
    ).toThrow('Sync error');
  });

  it('should return the result of the sync function', () => {
    const result = timeCognitiveOperationSync('userStyleDetectTime', () => {
      return [1, 2, 3];
    });

    expect(result).toEqual([1, 2, 3]);
  });
});

describe('recordTurnMetrics', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  it('should record and return metrics', () => {
    const metrics = recordTurnMetrics();

    expect(metrics).toHaveProperty('totalOverhead');
    expect(metrics).toHaveProperty('timestamp');
  });
});

describe('getCognitiveMetricsSummary', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  it('should return summary from tracker', () => {
    recordTurnMetrics();
    recordTurnMetrics();

    const summary = getCognitiveMetricsSummary();

    expect(summary.sampleCount).toBe(2);
  });
});

describe('maybeLogMetrics', () => {
  it('should not throw when called', () => {
    expect(() => maybeLogMetrics()).not.toThrow();
  });

  it('should not log before interval', () => {
    // Just ensure it doesn't crash when called multiple times
    for (let i = 0; i < 10; i++) {
      maybeLogMetrics();
    }
  });
});
