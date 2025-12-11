/**
 * Tests for context-builders/metrics.ts
 *
 * Verifies builder performance tracking works correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkPerformanceIssues,
  getAllBuilderMetrics,
  getBuilderMetrics,
  getMetricsSummary,
  getRecentTurnMetrics,
  getSessionMetrics,
  recordBuilderMetrics,
  recordTurnMetrics,
  resetAllMetrics,
  resetBuilderMetrics,
} from '../intelligence/context-builders/metrics.js';

describe('builder-metrics', () => {
  beforeEach(() => {
    resetAllMetrics();
  });

  describe('recordBuilderMetrics', () => {
    it('should record metrics for a builder', () => {
      recordBuilderMetrics('test-builder', 50, 2);
      const metrics = getBuilderMetrics('test-builder');

      expect(metrics).toBeDefined();
      expect(metrics?.name).toBe('test-builder');
      expect(metrics?.callCount).toBe(1);
      expect(metrics?.totalDurationMs).toBe(50);
      expect(metrics?.injectionsProduced).toBe(2);
    });

    it('should accumulate metrics over multiple calls', () => {
      recordBuilderMetrics('accumulate-test', 50, 2);
      recordBuilderMetrics('accumulate-test', 100, 3);
      const metrics = getBuilderMetrics('accumulate-test');

      expect(metrics?.callCount).toBe(2);
      expect(metrics?.totalDurationMs).toBe(150);
      expect(metrics?.avgDurationMs).toBe(75);
      expect(metrics?.injectionsProduced).toBe(5);
    });

    it('should track skip count when no injections produced', () => {
      recordBuilderMetrics('skip-test', 10, 0);
      recordBuilderMetrics('skip-test', 10, 0);
      recordBuilderMetrics('skip-test', 10, 2);
      const metrics = getBuilderMetrics('skip-test');

      expect(metrics?.skipCount).toBe(2);
    });

    it('should track error count', () => {
      recordBuilderMetrics('error-test', 10, 0, new Error('Test error'));
      recordBuilderMetrics('error-test', 10, 2);
      const metrics = getBuilderMetrics('error-test');

      expect(metrics?.errorCount).toBe(1);
    });

    it('should track last call timestamp', () => {
      const before = new Date();
      recordBuilderMetrics('timestamp-test', 10, 1);
      const after = new Date();
      const metrics = getBuilderMetrics('timestamp-test');

      expect(metrics?.lastCallTimestamp).toBeDefined();
      expect(metrics?.lastCallTimestamp?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(metrics?.lastCallTimestamp?.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getAllBuilderMetrics', () => {
    it('should return metrics for all builders', () => {
      recordBuilderMetrics('builder-a', 10, 1);
      recordBuilderMetrics('builder-b', 20, 2);
      recordBuilderMetrics('builder-c', 30, 3);

      const all = getAllBuilderMetrics();
      expect(all.length).toBe(3);
      expect(all.map((m) => m.name)).toContain('builder-a');
      expect(all.map((m) => m.name)).toContain('builder-b');
      expect(all.map((m) => m.name)).toContain('builder-c');
    });
  });

  describe('recordTurnMetrics', () => {
    it('should record turn-level metrics', () => {
      const builderResults = [
        { name: 'builder-1', durationMs: 10, injectionCount: 2 },
        { name: 'builder-2', durationMs: 20, injectionCount: 1 },
      ];

      const turnMetrics = recordTurnMetrics('session-1', 1, builderResults);

      expect(turnMetrics.sessionId).toBe('session-1');
      expect(turnMetrics.turnNumber).toBe(1);
      expect(turnMetrics.totalDurationMs).toBe(30);
      expect(turnMetrics.buildersRan).toBe(2);
      expect(turnMetrics.totalInjections).toBe(3);
    });

    it('should track builders that produced injections', () => {
      const builderResults = [
        { name: 'active-builder', durationMs: 10, injectionCount: 2 },
        { name: 'inactive-builder', durationMs: 20, injectionCount: 0 },
      ];

      const turnMetrics = recordTurnMetrics('session-2', 1, builderResults);
      expect(turnMetrics.buildersProducedInjections).toBe(1);
    });
  });

  describe('getRecentTurnMetrics', () => {
    it('should return recent turns', () => {
      recordTurnMetrics('session-a', 1, []);
      recordTurnMetrics('session-a', 2, []);
      recordTurnMetrics('session-a', 3, []);

      const recent = getRecentTurnMetrics(2);
      expect(recent.length).toBe(2);
      expect(recent[1].turnNumber).toBe(3);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return empty summary when no metrics', () => {
      const summary = getMetricsSummary();
      expect(summary.totalBuilds).toBe(0);
      expect(summary.avgBuildTimeMs).toBe(0);
    });

    it('should calculate summary statistics', () => {
      // Record some builder metrics
      recordBuilderMetrics('slow-builder', 100, 5);
      recordBuilderMetrics('slow-builder', 100, 5);
      recordBuilderMetrics('fast-builder', 10, 1);
      recordBuilderMetrics('fast-builder', 10, 1);

      // Record turn metrics
      recordTurnMetrics('session-1', 1, [
        { name: 'slow-builder', durationMs: 100, injectionCount: 5 },
        { name: 'fast-builder', durationMs: 10, injectionCount: 1 },
      ]);

      const summary = getMetricsSummary();
      expect(summary.totalBuilds).toBe(1);
      expect(summary.slowestBuilders[0].name).toBe('slow-builder');
    });

    it('should identify most active builders', () => {
      recordBuilderMetrics('active', 10, 10);
      recordBuilderMetrics('inactive', 10, 1);

      const summary = getMetricsSummary();
      expect(summary.mostActiveBuilders[0].name).toBe('active');
    });
  });

  describe('getSessionMetrics', () => {
    it('should return metrics for specific session', () => {
      recordTurnMetrics('session-x', 1, [{ name: 'b1', durationMs: 10, injectionCount: 2 }]);
      recordTurnMetrics('session-x', 2, [{ name: 'b1', durationMs: 20, injectionCount: 3 }]);
      recordTurnMetrics('session-y', 1, [{ name: 'b1', durationMs: 50, injectionCount: 1 }]);

      const metrics = getSessionMetrics('session-x');
      expect(metrics.turns.length).toBe(2);
      expect(metrics.avgDurationMs).toBe(15);
      expect(metrics.totalInjections).toBe(5);
    });
  });

  describe('resetBuilderMetrics', () => {
    it('should reset metrics for specific builder', () => {
      recordBuilderMetrics('reset-me', 100, 5);
      recordBuilderMetrics('keep-me', 50, 3);

      resetBuilderMetrics('reset-me');

      expect(getBuilderMetrics('reset-me')).toBeUndefined();
      expect(getBuilderMetrics('keep-me')).toBeDefined();
    });
  });

  describe('checkPerformanceIssues', () => {
    it('should warn about slow builders', () => {
      // Record slow builder
      for (let i = 0; i < 5; i++) {
        recordBuilderMetrics('very-slow', 200, 1);
      }
      recordTurnMetrics('perf-session', 1, [
        { name: 'very-slow', durationMs: 200, injectionCount: 1 },
      ]);

      const warnings = checkPerformanceIssues();
      expect(warnings.some((w) => w.includes('very-slow'))).toBe(true);
    });

    it('should warn about high skip rate', () => {
      // Builder that almost never produces
      for (let i = 0; i < 10; i++) {
        recordBuilderMetrics('skipper', 10, 0);
      }

      const warnings = checkPerformanceIssues();
      expect(warnings.some((w) => w.includes('skipper') && w.includes('skip'))).toBe(true);
    });

    it('should warn about error-prone builders', () => {
      recordBuilderMetrics('error-prone', 10, 0, new Error('fail'));
      recordBuilderMetrics('error-prone', 10, 0, new Error('fail'));
      recordBuilderMetrics('error-prone', 10, 1);

      const warnings = checkPerformanceIssues();
      expect(warnings.some((w) => w.includes('error-prone') && w.includes('error'))).toBe(true);
    });
  });
});
