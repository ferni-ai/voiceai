/**
 * Interval Manager Tests
 *
 * Tests for the global interval tracking and cleanup system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('IntervalManager', () => {
  let IntervalManager: typeof import('../utils/interval-manager.js');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    IntervalManager = await import('../utils/interval-manager.js');
    IntervalManager.clearAllIntervals();
  });

  afterEach(() => {
    IntervalManager.clearAllIntervals();
    vi.useRealTimers();
  });

  describe('registerInterval', () => {
    it('should register an interval and return cleanup function', () => {
      let callCount = 0;
      const cleanup = IntervalManager.registerInterval(
        'test-interval',
        () => {
          callCount++;
        },
        1000
      );

      expect(typeof cleanup).toBe('function');
      expect(IntervalManager.hasInterval('test-interval')).toBe(true);

      // Advance time and check callback is called
      vi.advanceTimersByTime(3000);
      expect(callCount).toBe(3);

      // Cleanup
      cleanup();
      expect(IntervalManager.hasInterval('test-interval')).toBe(false);
    });

    it('should replace existing interval with same name', () => {
      let firstCallCount = 0;
      let secondCallCount = 0;

      IntervalManager.registerInterval(
        'test-interval',
        () => {
          firstCallCount++;
        },
        1000
      );

      // Replace with new interval
      IntervalManager.registerInterval(
        'test-interval',
        () => {
          secondCallCount++;
        },
        1000
      );

      vi.advanceTimersByTime(3000);

      // Only second interval should have been called
      expect(firstCallCount).toBe(0);
      expect(secondCallCount).toBe(3);
    });

    it('should handle async callbacks', async () => {
      let callCount = 0;
      IntervalManager.registerInterval(
        'async-interval',
        async () => {
          callCount++;
          await Promise.resolve();
        },
        1000
      );

      vi.advanceTimersByTime(2000);
      expect(callCount).toBe(2);
    });

    it('should catch and log callback errors', () => {
      const errorCallback = () => {
        throw new Error('Test error');
      };

      IntervalManager.registerInterval('error-interval', errorCallback, 1000);

      // Should not throw
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    });
  });

  describe('clearNamedInterval', () => {
    it('should clear a specific interval', () => {
      IntervalManager.registerInterval('interval-1', () => {}, 1000);
      IntervalManager.registerInterval('interval-2', () => {}, 1000);

      const cleared = IntervalManager.clearNamedInterval('interval-1');

      expect(cleared).toBe(true);
      expect(IntervalManager.hasInterval('interval-1')).toBe(false);
      expect(IntervalManager.hasInterval('interval-2')).toBe(true);
    });

    it('should return false for non-existent interval', () => {
      const cleared = IntervalManager.clearNamedInterval('non-existent');
      expect(cleared).toBe(false);
    });
  });

  describe('clearAllIntervals', () => {
    it('should clear all registered intervals', () => {
      IntervalManager.registerInterval('interval-1', () => {}, 1000);
      IntervalManager.registerInterval('interval-2', () => {}, 1000);
      IntervalManager.registerInterval('interval-3', () => {}, 1000);

      const count = IntervalManager.clearAllIntervals();

      expect(count).toBe(3);
      expect(IntervalManager.hasInterval('interval-1')).toBe(false);
      expect(IntervalManager.hasInterval('interval-2')).toBe(false);
      expect(IntervalManager.hasInterval('interval-3')).toBe(false);
    });

    it('should return 0 when no intervals registered', () => {
      const count = IntervalManager.clearAllIntervals();
      expect(count).toBe(0);
    });
  });

  describe('getIntervalStats', () => {
    it('should return stats for all intervals', () => {
      IntervalManager.registerInterval('interval-1', () => {}, 1000);
      IntervalManager.registerInterval('interval-2', () => {}, 5000);

      // Advance to trigger some runs
      vi.advanceTimersByTime(6000);

      const stats = IntervalManager.getIntervalStats();

      expect(stats).toHaveLength(2);
      expect(stats.find((s) => s.name === 'interval-1')).toBeDefined();
      expect(stats.find((s) => s.name === 'interval-2')).toBeDefined();

      // interval-1 should have more runs
      const stat1 = stats.find((s) => s.name === 'interval-1')!;
      const stat2 = stats.find((s) => s.name === 'interval-2')!;
      expect(stat1.runCount).toBe(6);
      expect(stat2.runCount).toBe(1);
    });

    it('should return empty array when no intervals', () => {
      const stats = IntervalManager.getIntervalStats();
      expect(stats).toHaveLength(0);
    });
  });

  describe('hasInterval', () => {
    it('should return true for registered interval', () => {
      IntervalManager.registerInterval('test-interval', () => {}, 1000);
      expect(IntervalManager.hasInterval('test-interval')).toBe(true);
    });

    it('should return false for non-registered interval', () => {
      expect(IntervalManager.hasInterval('non-existent')).toBe(false);
    });
  });
});
