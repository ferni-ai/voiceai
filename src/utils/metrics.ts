/**
 * Metrics Utility
 *
 * Simple metrics collection for monitoring and observability.
 *
 * Features:
 * - Counters for counting events
 * - Gauges for current values
 * - Histograms for distributions
 * - Labels for dimensional metrics
 *
 * @module utils/metrics
 */

import { getLogger } from './safe-logger.js';
import { registerInterval } from './interval-manager.js';

// ============================================================================
// TYPES
// ============================================================================

export type MetricLabels = Record<string, string | number | boolean>;

export interface CounterMetric {
  name: string;
  value: number;
  labels?: MetricLabels;
  timestamp: Date;
}

export interface GaugeMetric {
  name: string;
  value: number;
  labels?: MetricLabels;
  timestamp: Date;
}

export interface HistogramMetric {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p99: number;
  labels?: MetricLabels;
  timestamp: Date;
}

export interface MetricsSnapshot {
  counters: CounterMetric[];
  gauges: GaugeMetric[];
  histograms: HistogramMetric[];
  timestamp: Date;
}

// ============================================================================
// METRIC STORAGE
// ============================================================================

class MetricStore {
  private counters = new Map<string, { value: number; labels?: MetricLabels }>();
  private gauges = new Map<string, { value: number; labels?: MetricLabels }>();
  private histograms = new Map<string, { values: number[]; labels?: MetricLabels }>();

  private getKey(name: string, labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${sortedLabels}}`;
  }

  // Counter operations
  incrementCounter(name: string, value = 1, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, { value, labels });
    }
  }

  getCounter(name: string, labels?: MetricLabels): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  // Gauge operations
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, { value, labels });
  }

  incrementGauge(name: string, value = 1, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const existing = this.gauges.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.gauges.set(key, { value, labels });
    }
  }

  decrementGauge(name: string, value = 1, labels?: MetricLabels): void {
    this.incrementGauge(name, -value, labels);
  }

  getGauge(name: string, labels?: MetricLabels): number {
    const key = this.getKey(name, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  // Histogram operations
  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const existing = this.histograms.get(key);
    if (existing) {
      existing.values.push(value);
      // Keep only last 1000 values to prevent memory growth
      if (existing.values.length > 1000) {
        existing.values.shift();
      }
    } else {
      this.histograms.set(key, { values: [value], labels });
    }
  }

  getHistogramStats(
    name: string,
    labels?: MetricLabels
  ): {
    count: number;
    sum: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p99: number;
  } | null {
    const key = this.getKey(name, labels);
    const existing = this.histograms.get(key);
    if (!existing || existing.values.length === 0) {
      return null;
    }

    const sorted = [...existing.values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      sum: sorted.reduce((a, b) => a + b, 0),
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      p50: sorted[Math.floor(count * 0.5)] ?? 0,
      p90: sorted[Math.floor(count * 0.9)] ?? 0,
      p99: sorted[Math.floor(count * 0.99)] ?? 0,
    };
  }

  // Snapshot
  getSnapshot(): MetricsSnapshot {
    const now = new Date();

    const counters: CounterMetric[] = [];
    for (const [key, data] of this.counters) {
      counters.push({
        name: key.split('{')[0] ?? key,
        value: data.value,
        labels: data.labels,
        timestamp: now,
      });
    }

    const gauges: GaugeMetric[] = [];
    for (const [key, data] of this.gauges) {
      gauges.push({
        name: key.split('{')[0] ?? key,
        value: data.value,
        labels: data.labels,
        timestamp: now,
      });
    }

    const histograms: HistogramMetric[] = [];
    for (const [key, data] of this.histograms) {
      const metricName = key.split('{')[0] ?? key;
      const stats = this.getHistogramStats(metricName, data.labels);
      if (stats) {
        histograms.push({
          name: metricName,
          ...stats,
          labels: data.labels,
          timestamp: now,
        });
      }
    }

    return { counters, gauges, histograms, timestamp: now };
  }

  // Reset
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// ============================================================================
// SINGLETON METRICS INSTANCE
// ============================================================================

const store = new MetricStore();

/**
 * Metrics singleton for application-wide metric collection.
 *
 * @example
 * // Counter
 * Metrics.increment('api_requests', 1, { endpoint: '/users', method: 'GET' });
 *
 * // Gauge
 * Metrics.setGauge('active_connections', 42);
 *
 * // Histogram (latency)
 * Metrics.recordLatency('api_latency', 150, { endpoint: '/users' });
 *
 * // Get snapshot
 * const snapshot = Metrics.getSnapshot();
 */
export const Metrics = {
  /**
   * Increment a counter metric.
   */
  increment(name: string, value = 1, labels?: MetricLabels): void {
    store.incrementCounter(name, value, labels);
  },

  /**
   * Get current counter value.
   */
  getCounter(name: string, labels?: MetricLabels): number {
    return store.getCounter(name, labels);
  },

  /**
   * Set a gauge to a specific value.
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    store.setGauge(name, value, labels);
  },

  /**
   * Increment a gauge.
   */
  incrementGauge(name: string, value = 1, labels?: MetricLabels): void {
    store.incrementGauge(name, value, labels);
  },

  /**
   * Decrement a gauge.
   */
  decrementGauge(name: string, value = 1, labels?: MetricLabels): void {
    store.decrementGauge(name, value, labels);
  },

  /**
   * Get current gauge value.
   */
  getGauge(name: string, labels?: MetricLabels): number {
    return store.getGauge(name, labels);
  },

  /**
   * Record a value for histogram distribution.
   */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    store.recordHistogram(name, value, labels);
  },

  /**
   * Record latency (convenience method for histograms).
   */
  recordLatency(name: string, durationMs: number, labels?: MetricLabels): void {
    store.recordHistogram(name, durationMs, labels);
  },

  /**
   * Get histogram statistics.
   */
  getHistogramStats(name: string, labels?: MetricLabels) {
    return store.getHistogramStats(name, labels);
  },

  /**
   * Get a snapshot of all metrics.
   */
  getSnapshot(): MetricsSnapshot {
    return store.getSnapshot();
  },

  /**
   * Reset all metrics (for testing).
   */
  reset(): void {
    store.reset();
    getLogger().debug('Metrics reset');
  },

  /**
   * Time a function execution.
   */
  async time<T>(name: string, fn: () => Promise<T>, labels?: MetricLabels): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      store.recordHistogram(name, duration, { ...labels, status: 'success' });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      store.recordHistogram(name, duration, { ...labels, status: 'error' });
      throw error;
    }
  },

  /**
   * Create a timer for manual timing.
   */
  startTimer(name: string, labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      store.recordHistogram(name, duration, labels);
      return duration;
    };
  },
};

// ============================================================================
// METRIC REPORTERS
// ============================================================================

/**
 * Log metrics periodically.
 */
export function startMetricsReporter(intervalMs = 60000): () => void {
  const log = getLogger();

  const clearInterval = registerInterval(
    'metrics-reporter',
    () => {
      const snapshot = Metrics.getSnapshot();
      log.info(
        {
          counterCount: snapshot.counters.length,
          gaugeCount: snapshot.gauges.length,
          histogramCount: snapshot.histograms.length,
          timestamp: snapshot.timestamp.toISOString(),
        },
        'Metrics report'
      );

      // Log any critical gauges
      for (const gauge of snapshot.gauges) {
        if (gauge.name.includes('error') || gauge.name.includes('failure')) {
          if (gauge.value > 0) {
            log.warn(
              { name: gauge.name, value: gauge.value, labels: gauge.labels },
              'Error gauge elevated'
            );
          }
        }
      }
    },
    intervalMs
  );

  return clearInterval;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default Metrics;
