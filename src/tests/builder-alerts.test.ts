/**
 * Tests for the Builder Alerts System
 *
 * @module tests/builder-alerts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAlertListener,
  clearAlerts,
  getActiveAlerts,
  getAlertHistory,
  getAlertSummary,
  getThresholds,
  recordBuilderError,
  recordBuilderSuccess,
  resetThresholds,
  runAlertChecks,
  setThresholds,
  startAlertMonitoring,
  stopAlertMonitoring,
  type AlertListener,
} from '../intelligence/context-builders/alerts.js';
import { recordBuilderMetrics, resetAllMetrics } from '../intelligence/context-builders/metrics.js';

describe('builder-alerts', () => {
  beforeEach(() => {
    // Reset state before each test
    clearAlerts();
    resetAllMetrics();
    resetThresholds();
    stopAlertMonitoring();
  });

  afterEach(() => {
    // Cleanup after tests
    stopAlertMonitoring();
    vi.useRealTimers();
  });

  describe('thresholds', () => {
    it('should have default thresholds', () => {
      const thresholds = getThresholds();
      expect(thresholds.slowBuilderWarning).toBe(50);
      expect(thresholds.slowBuilderCritical).toBe(100);
      expect(thresholds.errorRateWarning).toBe(0.05);
      expect(thresholds.errorRateCritical).toBe(0.1);
    });

    it('should allow updating thresholds', () => {
      setThresholds({ slowBuilderWarning: 25 });
      const thresholds = getThresholds();
      expect(thresholds.slowBuilderWarning).toBe(25);
      expect(thresholds.slowBuilderCritical).toBe(100); // unchanged
    });

    it('should allow resetting to defaults', () => {
      setThresholds({ slowBuilderWarning: 25 });
      resetThresholds();
      const thresholds = getThresholds();
      expect(thresholds.slowBuilderWarning).toBe(50);
    });
  });

  describe('slow builder alerts', () => {
    it('should emit warning for slow builders', () => {
      // Record slow metrics
      recordBuilderMetrics('slow-builder', 60, 1); // 60ms avg
      recordBuilderMetrics('slow-builder', 60, 1);
      recordBuilderMetrics('slow-builder', 60, 1);

      runAlertChecks();

      const alerts = getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].category).toBe('performance');
      expect(alerts[0].builder).toBe('slow-builder');
    });

    it('should emit critical for very slow builders', () => {
      // Record very slow metrics
      recordBuilderMetrics('very-slow-builder', 120, 1); // 120ms avg
      recordBuilderMetrics('very-slow-builder', 120, 1);
      recordBuilderMetrics('very-slow-builder', 120, 1);

      runAlertChecks();

      const alerts = getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe('critical');
    });

    it('should not emit alert for fast builders', () => {
      // Record fast metrics
      recordBuilderMetrics('fast-builder', 10, 1); // 10ms avg

      runAlertChecks();

      const alerts = getActiveAlerts();
      expect(alerts.length).toBe(0);
    });
  });

  describe('error rate alerts', () => {
    it('should emit warning for elevated error rates', () => {
      // Record metrics with 6% error rate
      for (let i = 0; i < 94; i++) {
        recordBuilderMetrics('error-builder', 10, 1);
      }
      for (let i = 0; i < 6; i++) {
        recordBuilderMetrics('error-builder', 10, 0, new Error('test'));
      }

      runAlertChecks();

      const alerts = getActiveAlerts();
      const errorAlert = alerts.find((a) => a.category === 'errors');
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.severity).toBe('warning');
    });

    it('should emit critical for high error rates', () => {
      // Record metrics with 15% error rate
      for (let i = 0; i < 85; i++) {
        recordBuilderMetrics('bad-builder', 10, 1);
      }
      for (let i = 0; i < 15; i++) {
        recordBuilderMetrics('bad-builder', 10, 0, new Error('test'));
      }

      runAlertChecks();

      const alerts = getActiveAlerts();
      const errorAlert = alerts.find((a) => a.category === 'errors');
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.severity).toBe('critical');
    });
  });

  describe('consecutive error tracking', () => {
    it('should track consecutive errors', () => {
      recordBuilderError('failing-builder');
      recordBuilderError('failing-builder');
      recordBuilderError('failing-builder');

      const alerts = getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].message).toContain('3 consecutive errors');
    });

    it('should reset on success', () => {
      recordBuilderError('flaky-builder');
      recordBuilderError('flaky-builder');
      recordBuilderSuccess('flaky-builder');
      recordBuilderError('flaky-builder');

      // Should not have alert since success reset the count
      const alerts = getActiveAlerts();
      expect(alerts.filter((a) => a.builder === 'flaky-builder')).toHaveLength(0);
    });
  });

  describe('alert listeners', () => {
    it('should notify listeners on new alerts', () => {
      const listener = vi.fn<AlertListener>();
      addAlertListener(listener);

      recordBuilderError('test-builder');
      recordBuilderError('test-builder');
      recordBuilderError('test-builder');

      expect(listener).toHaveBeenCalled();
      const alert = listener.mock.calls[0][0];
      expect(alert.builder).toBe('test-builder');
    });

    it('should allow removing listeners', () => {
      const listener = vi.fn<AlertListener>();
      const remove = addAlertListener(listener);

      // Should receive first alert
      recordBuilderError('test-builder');
      recordBuilderError('test-builder');
      recordBuilderError('test-builder');
      expect(listener).toHaveBeenCalled();

      // Clear and remove listener
      clearAlerts();
      remove();

      // Should not receive second alert
      const callCount = listener.mock.calls.length;
      recordBuilderError('test-builder2');
      recordBuilderError('test-builder2');
      recordBuilderError('test-builder2');
      expect(listener.mock.calls.length).toBe(callCount);
    });
  });

  describe('alert history', () => {
    it('should keep alert history', () => {
      recordBuilderError('builder1');
      recordBuilderError('builder1');
      recordBuilderError('builder1');

      const history = getAlertHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history size', () => {
      const history = getAlertHistory(10);
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('alert summary', () => {
    it('should provide summary of active alerts', () => {
      recordBuilderError('builder1');
      recordBuilderError('builder1');
      recordBuilderError('builder1');

      const summary = getAlertSummary();
      expect(summary.active).toBeGreaterThanOrEqual(1);
      expect(typeof summary.critical).toBe('number');
      expect(typeof summary.warnings).toBe('number');
      expect(Array.isArray(summary.alerts)).toBe(true);
    });
  });

  describe('alert monitoring', () => {
    it('should start and stop monitoring', () => {
      vi.useFakeTimers();

      startAlertMonitoring(1000);

      // Should run checks periodically
      vi.advanceTimersByTime(3000);

      stopAlertMonitoring();

      // Should stop after stopping
      vi.advanceTimersByTime(3000);
    });
  });

  describe('clearAlerts', () => {
    it('should clear all alerts', () => {
      recordBuilderError('builder1');
      recordBuilderError('builder1');
      recordBuilderError('builder1');

      expect(getActiveAlerts().length).toBeGreaterThan(0);

      clearAlerts();

      expect(getActiveAlerts().length).toBe(0);
      expect(getAlertHistory().length).toBe(0);
    });
  });
});
