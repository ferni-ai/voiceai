/**
 * Cloud Monitoring Metrics
 *
 * Exports circuit breaker and self-healing metrics to Google Cloud Monitoring.
 * Enables dashboards, alerting policies, and SLO tracking.
 *
 * Metrics exported:
 * - circuit_breaker/state (gauge): Current state (0=closed, 1=half_open, 2=open)
 * - circuit_breaker/requests (counter): Total requests through circuit
 * - circuit_breaker/failures (counter): Failed requests
 * - circuit_breaker/success_rate (gauge): Rolling success rate
 * - circuit_breaker/state_changes (counter): Number of state transitions
 * - resilient_http/retries (counter): Retry attempts
 * - resilient_http/latency (distribution): Request latency
 *
 * Setup:
 * 1. Enable Cloud Monitoring API in GCP Console
 * 2. Service account needs roles/monitoring.metricWriter
 * 3. Set GOOGLE_APPLICATION_CREDENTIALS or run on GCP
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import type { CircuitState } from './circuit-breaker.js';

const log = createLogger({ module: 'cloud-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp?: Date;
}

export interface MetricsConfig {
  /** GCP Project ID */
  projectId?: string;
  /** Enable metrics export (default: true in production) */
  enabled?: boolean;
  /** Export interval in ms (default: 60000) */
  exportIntervalMs?: number;
  /** Metric prefix (default: custom.googleapis.com/ferni) */
  metricPrefix?: string;
}

interface MetricBuffer {
  points: MetricPoint[];
  lastFlush: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: MetricsConfig = {
  projectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  enabled: process.env.NODE_ENV === 'production',
  exportIntervalMs: 60000, // 1 minute
  metricPrefix: 'custom.googleapis.com/ferni',
};

let config: MetricsConfig = { ...DEFAULT_CONFIG };

// Metric buffer for batching
const metricBuffer: MetricBuffer = {
  points: [],
  lastFlush: Date.now(),
};

// Export interval name for managed interval
const CLOUD_METRICS_EXPORT_INTERVAL = 'cloud-metrics-export';

// ============================================================================
// METRIC STATE MAPPING
// ============================================================================

const STATE_VALUES: Record<CircuitState, number> = {
  closed: 0,
  half_open: 1,
  open: 2,
};

// ============================================================================
// CLOUD MONITORING CLIENT
// ============================================================================

let monitoringClient: MonitoringClient | null = null;

interface MonitoringClient {
  createTimeSeries: (request: { name: string; timeSeries: TimeSeriesData[] }) => Promise<void>;
}

interface TimeSeriesData {
  metric: {
    type: string;
    labels: Record<string, string>;
  };
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  points: Array<{
    interval: { endTime: { seconds: number; nanos: number } };
    value: { int64Value?: string; doubleValue?: number };
  }>;
}

async function getMonitoringClient(): Promise<MonitoringClient | null> {
  if (!config.enabled || !config.projectId) {
    return null;
  }

  if (monitoringClient) {
    return monitoringClient;
  }

  try {
    // Dynamic import to avoid loading in non-GCP environments
    const { MetricServiceClient } = await import('@google-cloud/monitoring');
    monitoringClient = new MetricServiceClient() as unknown as MonitoringClient;
    log.info({ projectId: config.projectId }, 'Cloud Monitoring client initialized');
    return monitoringClient;
  } catch (error) {
    log.debug({ error: String(error) }, 'Cloud Monitoring not available (expected in development)');
    return null;
  }
}

// ============================================================================
// METRIC RECORDING
// ============================================================================

/**
 * Record a metric point (buffered for batch export)
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  if (!config.enabled) {
    return;
  }

  metricBuffer.points.push({
    name,
    value,
    labels,
    timestamp: new Date(),
  });

  // Check if we should flush
  if (metricBuffer.points.length >= 100) {
    flushMetrics().catch((err) => {
      log.warn({ error: String(err) }, 'Failed to flush metrics');
    });
  }
}

/**
 * Record circuit breaker state
 */
export function recordCircuitState(
  circuitName: string,
  state: CircuitState,
  stats?: {
    failures?: number;
    totalRequests?: number;
    totalSuccesses?: number;
    totalFailures?: number;
  }
): void {
  const labels = { circuit_name: circuitName };

  // State gauge
  recordMetric('circuit_breaker/state', STATE_VALUES[state], labels);

  // Stats if provided
  if (stats) {
    if (stats.totalRequests !== undefined) {
      recordMetric('circuit_breaker/requests', stats.totalRequests, labels);
    }
    if (stats.totalFailures !== undefined) {
      recordMetric('circuit_breaker/failures', stats.totalFailures, labels);
    }
    if (stats.totalRequests && stats.totalSuccesses !== undefined) {
      const successRate = (stats.totalSuccesses / stats.totalRequests) * 100;
      recordMetric('circuit_breaker/success_rate', successRate, labels);
    }
  }
}

/**
 * Record circuit state change event
 */
export function recordStateChange(
  circuitName: string,
  oldState: CircuitState,
  newState: CircuitState
): void {
  recordMetric('circuit_breaker/state_changes', 1, {
    circuit_name: circuitName,
    old_state: oldState,
    new_state: newState,
  });
}

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  serviceName: string,
  durationMs: number,
  success: boolean,
  retries: number
): void {
  const labels = { service: serviceName };

  // Request count
  recordMetric('resilient_http/requests', 1, {
    ...labels,
    success: String(success),
  });

  // Latency
  recordMetric('resilient_http/latency_ms', durationMs, labels);

  // Retries
  if (retries > 0) {
    recordMetric('resilient_http/retries', retries, labels);
  }
}

// ============================================================================
// METRIC EXPORT
// ============================================================================

/**
 * Flush buffered metrics to Cloud Monitoring
 */
export async function flushMetrics(): Promise<number> {
  if (metricBuffer.points.length === 0) {
    return 0;
  }

  const client = await getMonitoringClient();
  if (!client) {
    // Clear buffer if we can't export
    const count = metricBuffer.points.length;
    metricBuffer.points = [];
    metricBuffer.lastFlush = Date.now();
    return count;
  }

  const pointsToExport = [...metricBuffer.points];
  metricBuffer.points = [];
  metricBuffer.lastFlush = Date.now();

  try {
    // Group points by metric name
    const grouped = new Map<string, MetricPoint[]>();
    for (const point of pointsToExport) {
      const key = `${point.name}:${JSON.stringify(point.labels)}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(point);
    }

    // Create time series for each group
    const timeSeries: TimeSeriesData[] = [];

    for (const [, points] of grouped) {
      if (points.length === 0) continue;

      const lastPoint = points[points.length - 1];
      const endTime = lastPoint.timestamp || new Date();
      const seconds = Math.floor(endTime.getTime() / 1000);
      const nanos = (endTime.getTime() % 1000) * 1000000;

      // Aggregate value (sum for counters, latest for gauges)
      const isCounter =
        lastPoint.name.includes('/requests') ||
        lastPoint.name.includes('/failures') ||
        lastPoint.name.includes('/retries') ||
        lastPoint.name.includes('/state_changes');

      const value = isCounter ? points.reduce((sum, p) => sum + p.value, 0) : lastPoint.value;

      timeSeries.push({
        metric: {
          type: `${config.metricPrefix}/${lastPoint.name}`,
          labels: lastPoint.labels,
        },
        resource: {
          type: 'global',
          labels: {
            project_id: config.projectId!,
          },
        },
        points: [
          {
            interval: { endTime: { seconds, nanos } },
            value: Number.isInteger(value) ? { int64Value: String(value) } : { doubleValue: value },
          },
        ],
      });
    }

    if (timeSeries.length > 0) {
      await client.createTimeSeries({
        name: `projects/${config.projectId}`,
        timeSeries,
      });
      log.debug({ count: timeSeries.length }, 'Metrics exported to Cloud Monitoring');
    }

    return pointsToExport.length;
  } catch (error) {
    log.warn(
      { error: String(error), pointCount: pointsToExport.length },
      'Failed to export metrics'
    );
    // Re-add points to buffer for retry (limited)
    if (metricBuffer.points.length < 500) {
      metricBuffer.points.push(...pointsToExport.slice(0, 100));
    }
    return 0;
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Configure metrics export
 */
export function configureMetrics(newConfig: Partial<MetricsConfig>): void {
  config = { ...config, ...newConfig };

  if (config.enabled && !hasInterval(CLOUD_METRICS_EXPORT_INTERVAL)) {
    startMetricsExport();
  } else if (!config.enabled && hasInterval(CLOUD_METRICS_EXPORT_INTERVAL)) {
    stopMetricsExport();
  }

  log.info({ enabled: config.enabled, projectId: config.projectId }, 'Metrics configured');
}

/**
 * Start periodic metrics export
 */
export function startMetricsExport(): void {
  if (hasInterval(CLOUD_METRICS_EXPORT_INTERVAL)) {
    return;
  }

  const intervalMs = config.exportIntervalMs || 60000;
  registerInterval(
    CLOUD_METRICS_EXPORT_INTERVAL,
    () => {
      flushMetrics().catch((err) => {
        log.warn({ error: String(err) }, 'Periodic metrics flush failed');
      });
    },
    intervalMs
  );

  log.info({ intervalMs }, 'Metrics export started');
}

/**
 * Stop periodic metrics export
 */
export function stopMetricsExport(): void {
  clearNamedInterval(CLOUD_METRICS_EXPORT_INTERVAL);

  // Final flush
  flushMetrics().catch((err) => {
    log.warn({ error: String(err) }, 'Final metrics flush failed (non-critical)');
  });
}

/**
 * Get current metrics configuration
 */
export function getMetricsConfig(): MetricsConfig {
  return { ...config };
}

/**
 * Get buffered metric count (for debugging)
 */
export function getBufferedMetricCount(): number {
  return metricBuffer.points.length;
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Create circuit breaker callbacks that record metrics
 */
export function createMetricsCallbacks(): {
  onStateChange: (name: string, oldState: CircuitState, newState: CircuitState) => void;
  onRequest: (name: string, success: boolean, durationMs: number) => void;
} {
  return {
    onStateChange: (name, oldState, newState) => {
      recordStateChange(name, oldState, newState);
      recordCircuitState(name, newState);
    },
    onRequest: (name, success, durationMs) => {
      recordHttpRequest(name, durationMs, success, 0);
    },
  };
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

// Auto-start in production
if (process.env.NODE_ENV === 'production' && config.projectId) {
  startMetricsExport();
}
