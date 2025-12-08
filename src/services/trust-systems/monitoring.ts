/**
 * Trust Systems Monitoring
 *
 * Observability for trust systems in production (P11).
 * Tracks:
 * - System usage metrics
 * - Error rates
 * - Latency
 * - Feature flag states
 *
 * @module TrustMonitoring
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TrustMonitoring' });

// ============================================================================
// TYPES
// ============================================================================

export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels: Record<string, string>;
}

export interface SystemMetrics {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq';
  severity: 'warning' | 'critical';
  enabled: boolean;
}

export interface Alert {
  id: string;
  alertConfigId: string;
  triggeredAt: Date;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const systemMetrics = new Map<string, SystemMetrics>();
const recentMetrics: MetricPoint[] = [];
const activeAlerts: Alert[] = [];
const MAX_METRICS_HISTORY = 1000;

// ============================================================================
// METRIC TRACKING
// ============================================================================

/**
 * Record a metric value
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  const point: MetricPoint = {
    timestamp: new Date(),
    value,
    labels: { ...labels, metric: name },
  };

  recentMetrics.push(point);

  // Trim old metrics
  while (recentMetrics.length > MAX_METRICS_HISTORY) {
    recentMetrics.shift();
  }
}

/**
 * Record a system call (for tracking usage and latency)
 */
export function recordSystemCall(
  systemId: string,
  latencyMs: number,
  success: boolean,
  error?: Error
): void {
  let metrics = systemMetrics.get(systemId);

  if (!metrics) {
    metrics = { calls: 0, errors: 0, totalLatencyMs: 0 };
    systemMetrics.set(systemId, metrics);
  }

  metrics.calls++;
  metrics.totalLatencyMs += latencyMs;

  if (!success) {
    metrics.errors++;
    metrics.lastError = {
      message: error?.message || 'Unknown error',
      timestamp: new Date(),
    };
  }

  // Record individual metrics
  recordMetric(`trust.${systemId}.latency_ms`, latencyMs, { system: systemId });
  recordMetric(`trust.${systemId}.calls`, 1, { system: systemId });

  if (!success) {
    recordMetric(`trust.${systemId}.errors`, 1, { system: systemId });
  }
}

/**
 * Timing wrapper for system calls
 */
export async function withMonitoring<T>(systemId: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  let success = true;
  let error: Error | undefined;

  try {
    return await fn();
  } catch (err) {
    success = false;
    error = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const latency = Date.now() - start;
    recordSystemCall(systemId, latency, success, error);
  }
}

/**
 * Sync version of timing wrapper
 */
export function withMonitoringSync<T>(systemId: string, fn: () => T): T {
  const start = Date.now();
  let success = true;
  let error: Error | undefined;

  try {
    return fn();
  } catch (err) {
    success = false;
    error = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const latency = Date.now() - start;
    recordSystemCall(systemId, latency, success, error);
  }
}

// ============================================================================
// METRICS RETRIEVAL
// ============================================================================

/**
 * Get metrics for a specific system
 */
export function getSystemMetrics(systemId: string): SystemMetrics | null {
  return systemMetrics.get(systemId) || null;
}

/**
 * Get all system metrics
 */
export function getAllSystemMetrics(): Record<string, SystemMetrics> {
  const result: Record<string, SystemMetrics> = {};

  for (const [id, metrics] of systemMetrics.entries()) {
    result[id] = { ...metrics };
  }

  return result;
}

/**
 * Get error rate for a system
 */
export function getErrorRate(systemId: string): number {
  const metrics = systemMetrics.get(systemId);

  if (!metrics || metrics.calls === 0) {
    return 0;
  }

  return metrics.errors / metrics.calls;
}

/**
 * Get average latency for a system
 */
export function getAverageLatency(systemId: string): number {
  const metrics = systemMetrics.get(systemId);

  if (!metrics || metrics.calls === 0) {
    return 0;
  }

  return metrics.totalLatencyMs / metrics.calls;
}

/**
 * Get recent metrics for a time window
 */
export function getRecentMetrics(
  windowMs = 60000,
  filter?: { metric?: string; system?: string }
): MetricPoint[] {
  const cutoff = Date.now() - windowMs;

  return recentMetrics.filter((point) => {
    if (point.timestamp.getTime() < cutoff) return false;

    if (filter?.metric && point.labels.metric !== filter.metric) return false;
    if (filter?.system && point.labels.system !== filter.system) return false;

    return true;
  });
}

// ============================================================================
// ALERTING
// ============================================================================

const alertConfigs: AlertConfig[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    metric: 'error_rate',
    threshold: 0.05, // 5%
    comparison: 'gt',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'high-latency',
    name: 'High Latency',
    metric: 'avg_latency',
    threshold: 500, // 500ms
    comparison: 'gt',
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'very-high-latency',
    name: 'Very High Latency',
    metric: 'avg_latency',
    threshold: 1000, // 1s
    comparison: 'gt',
    severity: 'critical',
    enabled: true,
  },
];

/**
 * Check all alert conditions
 */
export function checkAlerts(): Alert[] {
  const newAlerts: Alert[] = [];

  for (const [systemId, metrics] of systemMetrics.entries()) {
    const errorRate = getErrorRate(systemId);
    const avgLatency = getAverageLatency(systemId);

    for (const config of alertConfigs) {
      if (!config.enabled) continue;

      let value: number;
      let triggered = false;

      switch (config.metric) {
        case 'error_rate':
          value = errorRate;
          break;
        case 'avg_latency':
          value = avgLatency;
          break;
        default:
          continue;
      }

      switch (config.comparison) {
        case 'gt':
          triggered = value > config.threshold;
          break;
        case 'lt':
          triggered = value < config.threshold;
          break;
        case 'eq':
          triggered = value === config.threshold;
          break;
      }

      if (triggered) {
        const alert: Alert = {
          id: `${config.id}-${systemId}-${Date.now()}`,
          alertConfigId: config.id,
          triggeredAt: new Date(),
          severity: config.severity,
          message: `${config.name}: ${systemId} ${config.metric} = ${value.toFixed(4)} (threshold: ${config.threshold})`,
          value,
          threshold: config.threshold,
          acknowledged: false,
        };

        newAlerts.push(alert);
        activeAlerts.push(alert);

        log.warn({ alert }, `🚨 Alert triggered: ${config.name}`);
      }
    }
  }

  return newAlerts;
}

/**
 * Get active alerts
 */
export function getActiveAlerts(): Alert[] {
  return activeAlerts.filter((a) => !a.acknowledged);
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = activeAlerts.find((a) => a.id === alertId);

  if (alert) {
    alert.acknowledged = true;
    log.info({ alertId }, 'Alert acknowledged');
    return true;
  }

  return false;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  systems: Record<
    string,
    {
      status: 'ok' | 'warning' | 'error';
      errorRate: number;
      avgLatency: number;
      lastError?: string;
    }
  >;
  activeAlerts: number;
  timestamp: Date;
}

/**
 * Get overall health status
 */
export function getHealthStatus(): HealthStatus {
  const systems: HealthStatus['systems'] = {};
  let hasWarning = false;
  let hasError = false;

  for (const [systemId, metrics] of systemMetrics.entries()) {
    const errorRate = getErrorRate(systemId);
    const avgLatency = getAverageLatency(systemId);

    let status: 'ok' | 'warning' | 'error' = 'ok';

    if (errorRate > 0.05 || avgLatency > 1000) {
      status = 'error';
      hasError = true;
    } else if (errorRate > 0.01 || avgLatency > 500) {
      status = 'warning';
      hasWarning = true;
    }

    systems[systemId] = {
      status,
      errorRate,
      avgLatency,
      lastError: metrics.lastError?.message,
    };
  }

  const unacknowledgedAlerts = activeAlerts.filter((a) => !a.acknowledged).length;

  let overallStatus: HealthStatus['status'] = 'healthy';
  if (hasError || unacknowledgedAlerts > 0) {
    overallStatus = 'unhealthy';
  } else if (hasWarning) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    systems,
    activeAlerts: unacknowledgedAlerts,
    timestamp: new Date(),
  };
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

export interface DashboardData {
  health: HealthStatus;
  metrics: {
    totalCalls: number;
    totalErrors: number;
    avgLatency: number;
    systemBreakdown: Record<string, { calls: number; errors: number; avgLatency: number }>;
  };
  alerts: Alert[];
  recentActivity: MetricPoint[];
}

/**
 * Get all data for monitoring dashboard
 */
export function getDashboardData(): DashboardData {
  let totalCalls = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  const systemBreakdown: DashboardData['metrics']['systemBreakdown'] = {};

  for (const [systemId, metrics] of systemMetrics.entries()) {
    totalCalls += metrics.calls;
    totalErrors += metrics.errors;
    totalLatency += metrics.totalLatencyMs;

    systemBreakdown[systemId] = {
      calls: metrics.calls,
      errors: metrics.errors,
      avgLatency: metrics.calls > 0 ? metrics.totalLatencyMs / metrics.calls : 0,
    };
  }

  return {
    health: getHealthStatus(),
    metrics: {
      totalCalls,
      totalErrors,
      avgLatency: totalCalls > 0 ? totalLatency / totalCalls : 0,
      systemBreakdown,
    },
    alerts: activeAlerts.slice(-20), // Last 20 alerts
    recentActivity: getRecentMetrics(300000), // Last 5 minutes
  };
}

// ============================================================================
// RESET
// ============================================================================

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  systemMetrics.clear();
  recentMetrics.length = 0;
  activeAlerts.length = 0;

  log.info('Metrics reset');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordMetric,
  recordSystemCall,
  withMonitoring,
  withMonitoringSync,
  getSystemMetrics,
  getAllSystemMetrics,
  getErrorRate,
  getAverageLatency,
  getRecentMetrics,
  checkAlerts,
  getActiveAlerts,
  acknowledgeAlert,
  getHealthStatus,
  getDashboardData,
  resetMetrics,
};
