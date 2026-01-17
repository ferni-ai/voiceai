/**
 * Metrics Tests
 *
 * Tests for counters, gauges, histograms, and metric reporting.
 *
 * @module utils/__tests__/metrics.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Metrics, startMetricsReporter } from '../metrics.js';
import { clearAllIntervals } from '../interval-manager.js';

describe('Metrics', () => {
  beforeEach(() => {
    Metrics.reset();
  });

  afterEach(() => {
    clearAllIntervals();
  });

  describe('Counters', () => {
    it('should increment counter', () => {
      Metrics.increment('test_counter');
      expect(Metrics.getCounter('test_counter')).toBe(1);

      Metrics.increment('test_counter');
      expect(Metrics.getCounter('test_counter')).toBe(2);
    });

    it('should increment by custom value', () => {
      Metrics.increment('test_counter', 5);
      expect(Metrics.getCounter('test_counter')).toBe(5);
    });

    it('should support labels', () => {
      Metrics.increment('requests', 1, { method: 'GET' });
      Metrics.increment('requests', 1, { method: 'POST' });
      Metrics.increment('requests', 1, { method: 'GET' });

      expect(Metrics.getCounter('requests', { method: 'GET' })).toBe(2);
      expect(Metrics.getCounter('requests', { method: 'POST' })).toBe(1);
    });

    it('should return 0 for non-existent counter', () => {
      expect(Metrics.getCounter('non_existent')).toBe(0);
    });
  });

  describe('Gauges', () => {
    it('should set gauge value', () => {
      Metrics.setGauge('active_connections', 42);
      expect(Metrics.getGauge('active_connections')).toBe(42);
    });

    it('should overwrite gauge value', () => {
      Metrics.setGauge('active_connections', 10);
      Metrics.setGauge('active_connections', 20);
      expect(Metrics.getGauge('active_connections')).toBe(20);
    });

    it('should increment gauge', () => {
      Metrics.setGauge('connections', 10);
      Metrics.incrementGauge('connections');
      expect(Metrics.getGauge('connections')).toBe(11);
    });

    it('should decrement gauge', () => {
      Metrics.setGauge('connections', 10);
      Metrics.decrementGauge('connections', 3);
      expect(Metrics.getGauge('connections')).toBe(7);
    });

    it('should support labels', () => {
      Metrics.setGauge('memory', 100, { service: 'api' });
      Metrics.setGauge('memory', 200, { service: 'worker' });

      expect(Metrics.getGauge('memory', { service: 'api' })).toBe(100);
      expect(Metrics.getGauge('memory', { service: 'worker' })).toBe(200);
    });
  });

  describe('Histograms', () => {
    it('should record histogram values', () => {
      Metrics.recordHistogram('latency', 100);
      Metrics.recordHistogram('latency', 150);
      Metrics.recordHistogram('latency', 200);

      const stats = Metrics.getHistogramStats('latency');

      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(3);
      expect(stats?.min).toBe(100);
      expect(stats?.max).toBe(200);
    });

    it('should calculate percentiles', () => {
      // Add 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        Metrics.recordHistogram('percentile_test', i);
      }

      const stats = Metrics.getHistogramStats('percentile_test');

      // Percentiles are approximations based on index: Math.floor(count * percentile)
      expect(stats?.p50).toBeGreaterThanOrEqual(49);
      expect(stats?.p50).toBeLessThanOrEqual(51);
      expect(stats?.p90).toBeGreaterThanOrEqual(89);
      expect(stats?.p90).toBeLessThanOrEqual(91);
      expect(stats?.p99).toBeGreaterThanOrEqual(98);
      expect(stats?.p99).toBeLessThanOrEqual(100);
    });

    it('should record latency convenience method', () => {
      Metrics.recordLatency('api_latency', 250, { endpoint: '/users' });

      const stats = Metrics.getHistogramStats('api_latency', { endpoint: '/users' });
      expect(stats?.count).toBe(1);
    });

    it('should return null for non-existent histogram', () => {
      expect(Metrics.getHistogramStats('non_existent')).toBeNull();
    });
  });

  describe('Timing', () => {
    it('should time async function', async () => {
      const result = await Metrics.time('async_operation', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      expect(result).toBe('done');

      const stats = Metrics.getHistogramStats('async_operation', { status: 'success' });
      expect(stats?.count).toBe(1);
      expect(stats?.min).toBeGreaterThanOrEqual(50);
    });

    it('should record error timing', async () => {
      await expect(
        Metrics.time('failing_operation', async () => {
          await new Promise((r) => setTimeout(r, 10));
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const stats = Metrics.getHistogramStats('failing_operation', { status: 'error' });
      expect(stats?.count).toBe(1);
    });

    it('should support manual timer', async () => {
      const endTimer = Metrics.startTimer('manual_timer');

      await new Promise((r) => setTimeout(r, 30));

      const duration = endTimer();

      expect(duration).toBeGreaterThanOrEqual(30);

      const stats = Metrics.getHistogramStats('manual_timer');
      expect(stats?.count).toBe(1);
    });
  });

  describe('Snapshot', () => {
    it('should return snapshot of all metrics', () => {
      Metrics.increment('counter1');
      Metrics.setGauge('gauge1', 100);
      Metrics.recordHistogram('hist1', 50);

      const snapshot = Metrics.getSnapshot();

      expect(snapshot.counters.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.gauges.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.histograms.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Reset', () => {
    it('should clear all metrics', () => {
      Metrics.increment('counter');
      Metrics.setGauge('gauge', 100);
      Metrics.recordHistogram('hist', 50);

      Metrics.reset();

      expect(Metrics.getCounter('counter')).toBe(0);
      expect(Metrics.getGauge('gauge')).toBe(0);
      expect(Metrics.getHistogramStats('hist')).toBeNull();
    });
  });

  describe('Metrics Reporter', () => {
    it('should start and stop reporter', async () => {
      const stop = startMetricsReporter(100);

      expect(typeof stop).toBe('function');

      // Let it run once
      await new Promise((r) => setTimeout(r, 150));

      stop();
    });
  });
});
