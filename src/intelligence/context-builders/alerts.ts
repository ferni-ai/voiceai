/**
 * Builder Alerts System
 *
 * Monitors context builder performance and emits alerts when
 * thresholds are exceeded. Integrates with the metrics system.
 *
 * Alert Types:
 * - Slow builder (avg duration > threshold)
 * - High error rate (> threshold)
 * - Builder failure (consecutive errors)
 * - Memory pressure (too many active sessions)
 *
 * @module intelligence/context-builders/alerts
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getAllBuilderMetrics } from './metrics.js';

const log = createLogger({ module: 'context:builder-alerts' });

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'performance' | 'errors' | 'health' | 'capacity';

export interface BuilderAlert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  category: AlertCategory;
  builder: string;
  message: string;
  value?: number;
  threshold?: number;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface AlertThresholds {
  /** Max avg duration in ms before warning */
  slowBuilderWarning: number;
  /** Max avg duration in ms before critical */
  slowBuilderCritical: number;
  /** Max error rate before warning (0-1) */
  errorRateWarning: number;
  /** Max error rate before critical (0-1) */
  errorRateCritical: number;
  /** Consecutive errors before alert */
  consecutiveErrorsWarning: number;
  /** Max active sessions before warning */
  maxSessionsWarning: number;
}

export interface AlertListener {
  (alert: BuilderAlert): void;
}

// ============================================================================
// STATE
// ============================================================================

const DEFAULT_THRESHOLDS: AlertThresholds = {
  slowBuilderWarning: 50, // 50ms avg
  slowBuilderCritical: 100, // 100ms avg
  errorRateWarning: 0.05, // 5%
  errorRateCritical: 0.1, // 10%
  consecutiveErrorsWarning: 3,
  maxSessionsWarning: 1000,
};

let thresholds: AlertThresholds = { ...DEFAULT_THRESHOLDS };
const activeAlerts: Map<string, BuilderAlert> = new Map();
const alertHistory: BuilderAlert[] = [];
const listeners: Set<AlertListener> = new Set();
let consecutiveErrors: Map<string, number> = new Map();
let checkInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

function generateAlertId(category: AlertCategory, builder: string): string {
  return `${category}:${builder}`;
}

function emitAlert(alert: BuilderAlert): void {
  // Check if we already have this active alert
  const existingAlert = activeAlerts.get(alert.id);
  if (existingAlert && !existingAlert.resolved) {
    // Update existing alert
    existingAlert.timestamp = alert.timestamp;
    existingAlert.value = alert.value;
    return;
  }

  // New alert
  activeAlerts.set(alert.id, alert);
  alertHistory.push(alert);

  // Keep history bounded
  if (alertHistory.length > 1000) {
    alertHistory.shift();
  }

  // Notify listeners
  listeners.forEach((listener) => {
    try {
      listener(alert);
    } catch (error) {
      log.error({ error }, 'Alert listener error');
    }
  });

  // Log based on severity
  const logContext = {
    alertId: alert.id,
    builder: alert.builder,
    category: alert.category,
    value: alert.value,
    threshold: alert.threshold,
  };

  if (alert.severity === 'critical') {
    log.error(logContext, `CRITICAL: ${alert.message}`);
  } else if (alert.severity === 'warning') {
    log.warn(logContext, `WARNING: ${alert.message}`);
  } else {
    log.info(logContext, alert.message);
  }
}

function resolveAlert(alertId: string): void {
  const alert = activeAlerts.get(alertId);
  if (alert && !alert.resolved) {
    alert.resolved = true;
    alert.resolvedAt = new Date();
    log.info({ alertId }, 'Alert resolved');

    // Notify listeners of resolution
    listeners.forEach((listener) => {
      try {
        listener({ ...alert, resolved: true });
      } catch (error) {
        log.error({ error }, 'Alert listener error on resolution');
      }
    });
  }
}

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

function checkSlowBuilders(): void {
  const allMetrics = getAllBuilderMetrics();

  for (const metrics of allMetrics) {
    const alertId = generateAlertId('performance', metrics.name);
    const avgMs = metrics.avgDurationMs;

    if (avgMs >= thresholds.slowBuilderCritical) {
      emitAlert({
        id: alertId,
        timestamp: new Date(),
        severity: 'critical',
        category: 'performance',
        builder: metrics.name,
        message: `Builder '${metrics.name}' is critically slow (${avgMs.toFixed(1)}ms avg)`,
        value: avgMs,
        threshold: thresholds.slowBuilderCritical,
        resolved: false,
      });
    } else if (avgMs >= thresholds.slowBuilderWarning) {
      emitAlert({
        id: alertId,
        timestamp: new Date(),
        severity: 'warning',
        category: 'performance',
        builder: metrics.name,
        message: `Builder '${metrics.name}' is slow (${avgMs.toFixed(1)}ms avg)`,
        value: avgMs,
        threshold: thresholds.slowBuilderWarning,
        resolved: false,
      });
    } else {
      // Resolve if under threshold
      resolveAlert(alertId);
    }
  }
}

function checkErrorRates(): void {
  const allMetrics = getAllBuilderMetrics();

  for (const metrics of allMetrics) {
    if (metrics.callCount === 0) continue;

    const alertId = generateAlertId('errors', metrics.name);
    const errorRate = metrics.errorCount / metrics.callCount;

    if (errorRate >= thresholds.errorRateCritical) {
      emitAlert({
        id: alertId,
        timestamp: new Date(),
        severity: 'critical',
        category: 'errors',
        builder: metrics.name,
        message: `Builder '${metrics.name}' has critical error rate (${(errorRate * 100).toFixed(1)}%)`,
        value: errorRate,
        threshold: thresholds.errorRateCritical,
        resolved: false,
      });
    } else if (errorRate >= thresholds.errorRateWarning) {
      emitAlert({
        id: alertId,
        timestamp: new Date(),
        severity: 'warning',
        category: 'errors',
        builder: metrics.name,
        message: `Builder '${metrics.name}' has elevated error rate (${(errorRate * 100).toFixed(1)}%)`,
        value: errorRate,
        threshold: thresholds.errorRateWarning,
        resolved: false,
      });
    } else {
      resolveAlert(alertId);
    }
  }
}

function checkHealth(): void {
  // Check overall system health using error-prone builders from summary
  const allMetrics = getAllBuilderMetrics();
  let totalErrors = 0;
  let totalCalls = 0;

  for (const metrics of allMetrics) {
    totalErrors += metrics.errorCount;
    totalCalls += metrics.callCount;
  }

  if (totalCalls > 100 && totalErrors / totalCalls > thresholds.errorRateCritical) {
    emitAlert({
      id: 'health:system',
      timestamp: new Date(),
      severity: 'critical',
      category: 'health',
      builder: 'system',
      message: `Overall system error rate critical (${((totalErrors / totalCalls) * 100).toFixed(1)}%)`,
      value: totalErrors / totalCalls,
      threshold: thresholds.errorRateCritical,
      resolved: false,
    });
  } else {
    resolveAlert('health:system');
  }
}

/**
 * Record a builder error for consecutive error tracking
 */
export function recordBuilderError(builder: string): void {
  const count = (consecutiveErrors.get(builder) || 0) + 1;
  consecutiveErrors.set(builder, count);

  if (count >= thresholds.consecutiveErrorsWarning) {
    emitAlert({
      id: generateAlertId('errors', `${builder}-consecutive`),
      timestamp: new Date(),
      severity: 'warning',
      category: 'errors',
      builder,
      message: `Builder '${builder}' has ${count} consecutive errors`,
      value: count,
      threshold: thresholds.consecutiveErrorsWarning,
      resolved: false,
    });
  }
}

/**
 * Record a builder success (resets consecutive error count)
 */
export function recordBuilderSuccess(builder: string): void {
  if (consecutiveErrors.has(builder)) {
    consecutiveErrors.set(builder, 0);
    resolveAlert(generateAlertId('errors', `${builder}-consecutive`));
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Run all alert checks against current metrics
 */
export function runAlertChecks(): void {
  checkSlowBuilders();
  checkErrorRates();
  checkHealth();
}

/**
 * Start automatic alert checking
 */
export function startAlertMonitoring(intervalMs: number = 30000): void {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  checkInterval = setInterval(runAlertChecks, intervalMs);
  log.info({ intervalMs }, 'Started alert monitoring');
}

/**
 * Stop automatic alert checking
 */
export function stopAlertMonitoring(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    log.info('Stopped alert monitoring');
  }
}

/**
 * Add an alert listener
 */
export function addAlertListener(listener: AlertListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Get all active alerts
 */
export function getActiveAlerts(): BuilderAlert[] {
  return Array.from(activeAlerts.values()).filter((a) => !a.resolved);
}

/**
 * Get alert history
 */
export function getAlertHistory(limit: number = 100): BuilderAlert[] {
  return alertHistory.slice(-limit);
}

/**
 * Get current thresholds
 */
export function getThresholds(): AlertThresholds {
  return { ...thresholds };
}

/**
 * Update thresholds
 */
export function setThresholds(updates: Partial<AlertThresholds>): void {
  thresholds = { ...thresholds, ...updates };
  log.info({ thresholds }, 'Updated alert thresholds');
}

/**
 * Reset thresholds to defaults
 */
export function resetThresholds(): void {
  thresholds = { ...DEFAULT_THRESHOLDS };
  log.info('Reset alert thresholds to defaults');
}

/**
 * Clear all alerts (for testing)
 */
export function clearAlerts(): void {
  activeAlerts.clear();
  alertHistory.length = 0;
  consecutiveErrors.clear();
}

/**
 * Get alert summary for API response
 */
export function getAlertSummary(): {
  active: number;
  critical: number;
  warnings: number;
  alerts: BuilderAlert[];
} {
  const active = getActiveAlerts();
  return {
    active: active.length,
    critical: active.filter((a) => a.severity === 'critical').length,
    warnings: active.filter((a) => a.severity === 'warning').length,
    alerts: active,
  };
}
