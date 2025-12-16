/**
 * Anomaly Detection for Predictive Failure Prevention
 *
 * Monitors metrics in real-time and detects anomalies before they cause failures.
 * Uses statistical methods (z-score, moving average) for lightweight detection.
 *
 * Features:
 * - Rolling window statistics for each metric
 * - Z-score based anomaly detection (> 3 standard deviations)
 * - Trend detection (consistent degradation)
 * - Early warning alerts before circuit breakers trip
 *
 * Monitored signals:
 * - Latency spikes
 * - Error rate increases
 * - Success rate drops
 * - Request volume anomalies
 */

import { createLogger } from '../../utils/safe-logger.js';
import { handleCircuitStateChange } from './circuit-alerting.js';

const log = createLogger({ module: 'anomaly-detection' });

// ============================================================================
// TYPES
// ============================================================================

export interface MetricWindow {
  name: string;
  values: number[];
  timestamps: number[];
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  lastAnomalyTime: number | null;
}

export interface AnomalyConfig {
  /** Window size for rolling statistics (default: 100) */
  windowSize?: number;
  /** Z-score threshold for anomaly detection (default: 3) */
  zScoreThreshold?: number;
  /** Minimum samples before detecting anomalies (default: 20) */
  minSamples?: number;
  /** Cooldown between anomaly alerts for same metric (ms, default: 60000) */
  anomalyCooldownMs?: number;
  /** Enable trend detection (default: true) */
  enableTrendDetection?: boolean;
  /** Callback when anomaly detected */
  onAnomaly?: (anomaly: Anomaly) => void;
}

export interface Anomaly {
  metricName: string;
  value: number;
  zScore: number;
  mean: number;
  stdDev: number;
  timestamp: Date;
  type: 'spike' | 'drop' | 'trend';
  severity: 'warning' | 'critical';
  message: string;
}

export interface TrendAnalysis {
  direction: 'improving' | 'degrading' | 'stable';
  strength: number; // 0-1, how strong the trend is
  changePercent: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<AnomalyConfig> = {
  windowSize: 100,
  zScoreThreshold: 3,
  minSamples: 20,
  anomalyCooldownMs: 60000,
  enableTrendDetection: true,
  onAnomaly: () => {},
};

let config: Required<AnomalyConfig> = { ...DEFAULT_CONFIG };

// Metric windows for each tracked metric
const metricWindows = new Map<string, MetricWindow>();

// Recent anomalies for deduplication
const recentAnomalies: Anomaly[] = [];
const MAX_ANOMALY_HISTORY = 500;

// ============================================================================
// STATISTICS
// ============================================================================

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

// ============================================================================
// METRIC WINDOW MANAGEMENT
// ============================================================================

function getOrCreateWindow(metricName: string): MetricWindow {
  if (!metricWindows.has(metricName)) {
    metricWindows.set(metricName, {
      name: metricName,
      values: [],
      timestamps: [],
      mean: 0,
      stdDev: 0,
      min: Infinity,
      max: -Infinity,
      lastAnomalyTime: null,
    });
  }
  return metricWindows.get(metricName)!;
}

function updateWindowStats(window: MetricWindow): void {
  window.mean = calculateMean(window.values);
  window.stdDev = calculateStdDev(window.values, window.mean);
  window.min = Math.min(...window.values);
  window.max = Math.max(...window.values);
}

// ============================================================================
// TREND DETECTION
// ============================================================================

function detectTrend(window: MetricWindow): TrendAnalysis {
  if (window.values.length < 10) {
    return { direction: 'stable', strength: 0, changePercent: 0 };
  }

  // Compare recent half to older half
  const midpoint = Math.floor(window.values.length / 2);
  const recentValues = window.values.slice(midpoint);
  const olderValues = window.values.slice(0, midpoint);

  const recentMean = calculateMean(recentValues);
  const olderMean = calculateMean(olderValues);

  if (olderMean === 0) {
    return { direction: 'stable', strength: 0, changePercent: 0 };
  }

  const changePercent = ((recentMean - olderMean) / olderMean) * 100;
  const strength = Math.min(Math.abs(changePercent) / 50, 1); // Normalize to 0-1

  // Determine direction based on metric type
  // For latency/error metrics, higher is worse (degrading)
  // For success rate, lower is worse (degrading)
  const isHigherBetter = window.name.includes('success_rate');

  let direction: TrendAnalysis['direction'] = 'stable';
  if (Math.abs(changePercent) > 10) {
    // >10% change threshold
    if (isHigherBetter) {
      direction = changePercent > 0 ? 'improving' : 'degrading';
    } else {
      direction = changePercent > 0 ? 'degrading' : 'improving';
    }
  }

  return { direction, strength, changePercent };
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

function isInCooldown(window: MetricWindow): boolean {
  if (!window.lastAnomalyTime) return false;
  return Date.now() - window.lastAnomalyTime < config.anomalyCooldownMs;
}

function createAnomaly(
  window: MetricWindow,
  value: number,
  zScore: number,
  type: Anomaly['type']
): Anomaly {
  const isHigherBetter = window.name.includes('success_rate');
  const isSpike = type === 'spike' || (type !== 'drop' && zScore > 0);

  // Determine severity based on z-score
  const severity: Anomaly['severity'] = Math.abs(zScore) > 4 ? 'critical' : 'warning';

  // Generate human-readable message
  let message: string;
  if (type === 'trend') {
    const trend = detectTrend(window);
    message = `${window.name} is ${trend.direction} (${trend.changePercent.toFixed(1)}% change)`;
  } else {
    const direction = isSpike ? 'spike' : 'drop';
    const impact = isHigherBetter
      ? isSpike
        ? 'unusually high (good)'
        : 'unusually low (concerning)'
      : isSpike
        ? 'unusually high (concerning)'
        : 'unusually low (good)';
    message = `${window.name} ${direction} detected: ${value.toFixed(2)} (${impact}). Expected: ${window.mean.toFixed(2)} ± ${(window.stdDev * 2).toFixed(2)}`;
  }

  return {
    metricName: window.name,
    value,
    zScore,
    mean: window.mean,
    stdDev: window.stdDev,
    timestamp: new Date(),
    type,
    severity,
    message,
  };
}

/**
 * Record a metric value and check for anomalies.
 * Returns anomaly if detected, null otherwise.
 */
export function recordAndDetect(
  metricName: string,
  value: number,
  options?: { suppressAlerts?: boolean }
): Anomaly | null {
  const window = getOrCreateWindow(metricName);
  const now = Date.now();

  // Add value to window
  window.values.push(value);
  window.timestamps.push(now);

  // Trim window to max size
  if (window.values.length > config.windowSize) {
    window.values.shift();
    window.timestamps.shift();
  }

  // Update statistics
  updateWindowStats(window);

  // Need minimum samples before detecting
  if (window.values.length < config.minSamples) {
    return null;
  }

  // Check for anomaly
  const zScore = calculateZScore(value, window.mean, window.stdDev);

  if (Math.abs(zScore) > config.zScoreThreshold) {
    // Anomaly detected!
    if (!isInCooldown(window)) {
      window.lastAnomalyTime = now;

      const type: Anomaly['type'] = zScore > 0 ? 'spike' : 'drop';
      const anomaly = createAnomaly(window, value, zScore, type);

      // Store in history
      recentAnomalies.push(anomaly);
      if (recentAnomalies.length > MAX_ANOMALY_HISTORY) {
        recentAnomalies.shift();
      }

      // Log
      if (anomaly.severity === 'critical') {
        log.warn({ ...anomaly }, `Anomaly detected: ${anomaly.message}`);
      } else {
        log.info({ ...anomaly }, `Anomaly detected: ${anomaly.message}`);
      }

      // Callback
      if (!options?.suppressAlerts) {
        config.onAnomaly(anomaly);
      }

      return anomaly;
    }
  }

  // Check for trends (less frequently)
  if (config.enableTrendDetection && window.values.length >= 50) {
    const trend = detectTrend(window);

    if (trend.direction === 'degrading' && trend.strength > 0.5) {
      // Degrading trend detected
      if (!isInCooldown(window)) {
        window.lastAnomalyTime = now;

        const anomaly = createAnomaly(window, value, trend.changePercent / 20, 'trend');

        recentAnomalies.push(anomaly);
        if (recentAnomalies.length > MAX_ANOMALY_HISTORY) {
          recentAnomalies.shift();
        }

        log.info({ ...anomaly, trend }, `Trend detected: ${anomaly.message}`);

        if (!options?.suppressAlerts) {
          config.onAnomaly(anomaly);
        }

        return anomaly;
      }
    }
  }

  return null;
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Record latency for a service
 */
export function recordLatency(serviceName: string, latencyMs: number): Anomaly | null {
  return recordAndDetect(`${serviceName}/latency`, latencyMs);
}

/**
 * Record error rate for a service (0-100)
 */
export function recordErrorRate(serviceName: string, errorRatePercent: number): Anomaly | null {
  return recordAndDetect(`${serviceName}/error_rate`, errorRatePercent);
}

/**
 * Record success rate for a service (0-100)
 */
export function recordSuccessRate(serviceName: string, successRatePercent: number): Anomaly | null {
  return recordAndDetect(`${serviceName}/success_rate`, successRatePercent);
}

/**
 * Record request count (for volume anomalies)
 */
export function recordRequestVolume(serviceName: string, requestCount: number): Anomaly | null {
  return recordAndDetect(`${serviceName}/volume`, requestCount);
}

// ============================================================================
// CONFIGURATION & STATE
// ============================================================================

/**
 * Configure anomaly detection
 */
export function configureAnomalyDetection(newConfig: Partial<AnomalyConfig>): void {
  config = { ...config, ...newConfig };
  log.info(
    {
      windowSize: config.windowSize,
      zScoreThreshold: config.zScoreThreshold,
      trendDetection: config.enableTrendDetection,
    },
    'Anomaly detection configured'
  );
}

/**
 * Get current configuration
 */
export function getAnomalyConfig(): AnomalyConfig {
  return { ...config };
}

/**
 * Get statistics for a metric
 */
export function getMetricStats(metricName: string): MetricWindow | undefined {
  return metricWindows.get(metricName);
}

/**
 * Get all monitored metrics
 */
export function getAllMetricStats(): MetricWindow[] {
  return Array.from(metricWindows.values());
}

/**
 * Get recent anomalies
 */
export function getRecentAnomalies(limit = 100): Anomaly[] {
  return recentAnomalies.slice(-limit);
}

/**
 * Get anomaly history for dashboard display.
 * Returns data points suitable for graphing.
 */
export interface AnomalyHistoryPoint {
  timestamp: string;
  metric: string;
  value: number;
  mean: number;
  max: number;
  zScore: number;
  isAnomaly: boolean;
}

export function getAnomalyHistory(windowMinutes = 60): AnomalyHistoryPoint[] {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const points: AnomalyHistoryPoint[] = [];

  // Get data from all metric windows
  for (const [name, window] of metricWindows.entries()) {
    // Filter to values within the time window
    const validIndices: number[] = [];
    for (let i = 0; i < window.timestamps.length; i++) {
      if (window.timestamps[i] >= cutoff) {
        validIndices.push(i);
      }
    }

    // Sample data points (max 60 per metric)
    const step = Math.max(1, Math.floor(validIndices.length / 60));
    for (let i = 0; i < validIndices.length; i += step) {
      const idx = validIndices[i];
      const value = window.values[idx];
      const zScore = calculateZScore(value, window.mean, window.stdDev);

      points.push({
        timestamp: new Date(window.timestamps[idx]).toISOString(),
        metric: name,
        value,
        mean: window.mean,
        max: window.max,
        zScore,
        isAnomaly: Math.abs(zScore) > config.zScoreThreshold,
      });
    }
  }

  // Sort by timestamp and limit
  return points
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-60);
}

/**
 * Get anomalies for a specific metric
 */
export function getMetricAnomalies(metricName: string, limit = 50): Anomaly[] {
  return recentAnomalies.filter((a) => a.metricName === metricName).slice(-limit);
}

/**
 * Clear all state (for testing)
 */
export function resetAnomalyDetection(): void {
  metricWindows.clear();
  recentAnomalies.length = 0;
}

// ============================================================================
// INTEGRATION WITH CIRCUIT BREAKERS
// ============================================================================

/**
 * Create an integration that predicts circuit breaker trips.
 * Call this when creating resilient HTTP clients.
 */
export function createPredictiveMonitor(serviceName: string): {
  onRequest: (durationMs: number, success: boolean) => void;
  checkHealth: () => { healthy: boolean; warnings: string[] };
} {
  let recentRequests = 0;
  let recentFailures = 0;
  let lastReset = Date.now();
  const WINDOW_MS = 60000; // 1 minute window

  return {
    onRequest: (durationMs: number, success: boolean) => {
      // Reset counters periodically
      if (Date.now() - lastReset > WINDOW_MS) {
        // Calculate rates before reset
        if (recentRequests > 0) {
          const errorRate = (recentFailures / recentRequests) * 100;
          recordErrorRate(serviceName, errorRate);
        }
        recentRequests = 0;
        recentFailures = 0;
        lastReset = Date.now();
      }

      recentRequests++;
      if (!success) {
        recentFailures++;
      }

      // Record latency
      recordLatency(serviceName, durationMs);
    },

    checkHealth: () => {
      const warnings: string[] = [];
      let healthy = true;

      // Check latency stats
      const latencyStats = getMetricStats(`${serviceName}/latency`);
      if (latencyStats && latencyStats.values.length >= config.minSamples) {
        const recentLatency = latencyStats.values[latencyStats.values.length - 1];
        if (recentLatency > latencyStats.mean + 2 * latencyStats.stdDev) {
          warnings.push(
            `Elevated latency: ${recentLatency.toFixed(0)}ms (avg: ${latencyStats.mean.toFixed(0)}ms)`
          );
        }
      }

      // Check error rate stats
      const errorStats = getMetricStats(`${serviceName}/error_rate`);
      if (errorStats && errorStats.values.length >= config.minSamples) {
        const recentErrorRate = errorStats.values[errorStats.values.length - 1];
        if (recentErrorRate > 10) {
          // >10% error rate
          warnings.push(`High error rate: ${recentErrorRate.toFixed(1)}%`);
          healthy = false;
        } else if (recentErrorRate > 5) {
          warnings.push(`Elevated error rate: ${recentErrorRate.toFixed(1)}%`);
        }
      }

      return { healthy, warnings };
    },
  };
}

// ============================================================================
// ALERT INTEGRATION
// ============================================================================

/**
 * Default anomaly handler that sends alerts for critical anomalies
 */
export function createAlertingAnomalyHandler(): (anomaly: Anomaly) => void {
  return (anomaly: Anomaly) => {
    if (anomaly.severity === 'critical') {
      // Use circuit alerting to send notifications
      handleCircuitStateChange(
        `anomaly:${anomaly.metricName}`,
        'closed' as const,
        'open' as const,
        {
          failures: 1,
          lastError: anomaly.message,
        }
      );
    }
  };
}
