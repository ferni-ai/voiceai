/**
 * Interval Manager Tests
 *
 * Tests for global interval tracking and cleanup.
 *
 * @module utils/__tests__/interval-manager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerInterval,
  clearNamedInterval,
  clearAllIntervals,
  getIntervalStats,
  hasInterval,
} from '../interval-manager.js';

describe('Interval Manager', () => {
  beforeEach(() => {
    // Clean up any intervals from previous tests
    clearAllIntervals();
  });

  afterEach(() => {
    // Ensure no intervals leak between tests
    clearAllIntervals();
  });

  describe('registerInterval', () => {
    it('should register and execute an interval', async () => {
      const callback = vi.fn();
      registerInterval('test-interval', callback, 50);

      expect(hasInterval('test-interval')).toBe(true);
      expect(callback).not.toHaveBeenCalled();

      // Wait for interval to fire
      await new Promise((r) => setTimeout(r, 100));

      expect(callback).toHaveBeenCalled();
    });

    it('should replace existing interval with same name', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      registerInterval('replace-test', callback1, 1000);
      registerInterval('replace-test', callback2, 1000);

      // Only one interval should exist
      const stats = getIntervalStats();
      const testStats = stats.filter((s) => s.name === 'replace-test');
      expect(testStats.length).toBe(1);
    });

    it('should return a cleanup function', async () => {
      const callback = vi.fn();
      const clear = registerInterval('cleanup-test', callback, 50);

      expect(hasInterval('cleanup-test')).toBe(true);

      clear();

      expect(hasInterval('cleanup-test')).toBe(false);

      // Wait and verify callback not called after cleanup
      await new Promise((r) => setTimeout(r, 100));
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle async callbacks', async () => {
      const results: number[] = [];

      registerInterval(
        'async-test',
        async () => {
          results.push(Date.now());
        },
        50
      );

      await new Promise((r) => setTimeout(r, 150));

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should catch and log callback errors', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('test error');
      });

      registerInterval('error-test', errorCallback, 50);

      // Should not throw
      await new Promise((r) => setTimeout(r, 100));

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('clearNamedInterval', () => {
    it('should clear a specific interval', () => {
      registerInterval('clear-1', vi.fn(), 1000);
      registerInterval('clear-2', vi.fn(), 1000);

      expect(hasInterval('clear-1')).toBe(true);
      expect(hasInterval('clear-2')).toBe(true);

      const result = clearNamedInterval('clear-1');

      expect(result).toBe(true);
      expect(hasInterval('clear-1')).toBe(false);
      expect(hasInterval('clear-2')).toBe(true);
    });

    it('should return false for non-existent interval', () => {
      const result = clearNamedInterval('does-not-exist');
      expect(result).toBe(false);
    });
  });

  describe('clearAllIntervals', () => {
    it('should clear all registered intervals', () => {
      registerInterval('all-1', vi.fn(), 1000);
      registerInterval('all-2', vi.fn(), 1000);
      registerInterval('all-3', vi.fn(), 1000);

      expect(getIntervalStats().length).toBe(3);

      const count = clearAllIntervals();

      expect(count).toBe(3);
      expect(getIntervalStats().length).toBe(0);
    });

    it('should return 0 when no intervals exist', () => {
      const count = clearAllIntervals();
      expect(count).toBe(0);
    });
  });

  describe('getIntervalStats', () => {
    it('should return stats for all intervals', async () => {
      const callback = vi.fn();
      registerInterval('stats-test', callback, 50);

      await new Promise((r) => setTimeout(r, 75));

      const stats = getIntervalStats();
      const stat = stats.find((s) => s.name === 'stats-test');

      expect(stat).toBeDefined();
      expect(stat?.intervalMs).toBe(50);
      expect(stat?.runCount).toBeGreaterThanOrEqual(1);
      expect(stat?.registeredAt).toBeInstanceOf(Date);
      expect(stat?.lastRun).toBeInstanceOf(Date);
    });

    it('should return empty array when no intervals', () => {
      expect(getIntervalStats()).toEqual([]);
    });
  });

  describe('hasInterval', () => {
    it('should return true for registered interval', () => {
      registerInterval('has-test', vi.fn(), 1000);
      expect(hasInterval('has-test')).toBe(true);
    });

    it('should return false for unregistered interval', () => {
      expect(hasInterval('not-registered')).toBe(false);
    });
  });
});
