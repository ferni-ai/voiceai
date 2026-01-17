/**
 * Predictive Alerting - Trend-Based Alerts
 *
 * Alerts BEFORE thresholds are hit by detecting trends and extrapolating.
 * "Your disk will be full in 2 hours" is more useful than "Your disk is full".
 *
 * Features:
 * - Linear regression on time-series data
 * - Predicts when thresholds will be breached
 * - Alerts with time-to-breach estimates
 * - Learns from historical patterns
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import { SlackNotificationService } from '../integrations/slack-notifications.js';

const log = createLogger({ module: 'PredictiveAlerting' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PredictiveConfig {
  // How far ahead to look (ms)
  predictionHorizonMs: number;

  // Minimum data points needed for prediction
  minDataPoints: number;

  // Alert if breach predicted within this time (ms)
  alertLeadTimeMs: number;

  // How often to run predictions (ms)
  predictionIntervalMs: number;

  // Cooldown between same alerts (ms)
  alertCooldownMs: number;

  enableSlack: boolean;
}

const DEFAULT_CONFIG: PredictiveConfig = {
  predictionHorizonMs: 4 * 60 * 60 * 1000, // Look 4 hours ahead
  minDataPoints: 10, // Need at least 10 samples
  alertLeadTimeMs: 2 * 60 * 60 * 1000, // Alert if breach in 2 hours
  predictionIntervalMs: 5 * 60 * 1000, // Run predictions every 5 min
  alertCooldownMs: 30 * 60 * 1000, // 30 min cooldown
  enableSlack: true,
};

// ============================================================================
// TYPES
// ============================================================================

interface DataPoint {
  timestamp: number;
  value: number;
}

interface MetricSeries {
  name: string;
  threshold: number;
  thresholdType: 'upper' | 'lower'; // upper = alert when exceeds, lower = alert when drops below
  data: DataPoint[];
  maxDataPoints: number;
}

interface Prediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  slope: number; // rate of change per hour
  willBreachThreshold: boolean;
  timeToBreachMs: number | null;
  confidence: number; // 0-1 based on R²
}

interface PredictiveAlert {
  metric: string;
  currentValue: number;
  threshold: number;
  timeToBreachMs: number;
  timeToBreachHuman: string;
  recommendation: string;
}

// ============================================================================
// STATE
// ============================================================================

let config = { ...DEFAULT_CONFIG };
const metrics = new Map<string, MetricSeries>();
const lastAlerts = new Map<string, number>();
const PREDICTION_INTERVAL_NAME = 'predictive-alerting';
let slackService: SlackNotificationService | null = null;
let isRunning = false;

// ============================================================================
// METRIC REGISTRATION
// ============================================================================

/**
 * Register a metric to track for predictive alerting
 */
export function registerMetric(
  name: string,
  threshold: number,
  thresholdType: 'upper' | 'lower' = 'upper',
  maxDataPoints = 1000
): void {
  metrics.set(name, {
    name,
    threshold,
    thresholdType,
    data: [],
    maxDataPoints,
  });
  log.debug({ name, threshold, thresholdType }, 'Registered metric for prediction');
}

/**
 * Record a data point for a metric.
 * If the metric isn't registered yet, silently ignore (will be registered when service starts).
 */
export function recordMetricValue(name: string, value: number): void {
  const series = metrics.get(name);
  if (!series) {
    // Silently ignore - metric will be registered when predictive alerting starts
    // This prevents log spam when the service hasn't been initialized yet
    return;
  }

  series.data.push({
    timestamp: Date.now(),
    value,
  });

  // Trim old data
  if (series.data.length > series.maxDataPoints) {
    series.data = series.data.slice(-series.maxDataPoints);
  }
}

// ============================================================================
// LINEAR REGRESSION
// ============================================================================

interface RegressionResult {
  slope: number; // change per ms
  intercept: number;
  rSquared: number; // goodness of fit (0-1)
}

function linearRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 2) return null;

  const n = data.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;

  // Normalize timestamps to prevent overflow
  const baseTime = data[0].timestamp;

  for (const point of data) {
    const x = point.timestamp - baseTime;
    const y = point.value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R² (coefficient of determination)
  const meanY = sumY / n;
  let ssTotal = 0,
    ssResidual = 0;

  for (const point of data) {
    const x = point.timestamp - baseTime;
    const y = point.value;
    const predictedY = slope * x + intercept;
    ssTotal += (y - meanY) ** 2;
    ssResidual += (y - predictedY) ** 2;
  }

  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, rSquared };
}

// ============================================================================
// PREDICTION
// ============================================================================

function predictMetric(series: MetricSeries): Prediction | null {
  if (series.data.length < config.minDataPoints) {
    return null;
  }

  // Use recent data for prediction (last hour)
  const recentData = series.data.filter((d) => d.timestamp > Date.now() - 60 * 60 * 1000);

  if (recentData.length < config.minDataPoints) {
    return null;
  }

  const regression = linearRegression(recentData);
  if (!regression || regression.rSquared < 0.3) {
    // Poor fit, prediction unreliable
    return null;
  }

  const currentValue = recentData[recentData.length - 1].value;
  const slopePerHour = regression.slope * 60 * 60 * 1000;

  // Predict value at horizon
  const predictedValue =
    currentValue + slopePerHour * (config.predictionHorizonMs / (60 * 60 * 1000));

  // Calculate time to breach
  let timeToBreachMs: number | null = null;
  let willBreachThreshold = false;

  if (series.thresholdType === 'upper') {
    if (currentValue >= series.threshold) {
      // Already breached
      willBreachThreshold = true;
      timeToBreachMs = 0;
    } else if (slopePerHour > 0) {
      // Growing toward threshold
      const remainingToThreshold = series.threshold - currentValue;
      timeToBreachMs = (remainingToThreshold / slopePerHour) * 60 * 60 * 1000;
      willBreachThreshold = timeToBreachMs <= config.predictionHorizonMs;
    }
  } else {
    // lower threshold
    if (currentValue <= series.threshold) {
      willBreachThreshold = true;
      timeToBreachMs = 0;
    } else if (slopePerHour < 0) {
      const remainingToThreshold = currentValue - series.threshold;
      timeToBreachMs = (remainingToThreshold / Math.abs(slopePerHour)) * 60 * 60 * 1000;
      willBreachThreshold = timeToBreachMs <= config.predictionHorizonMs;
    }
  }

  return {
    metric: series.name,
    currentValue,
    predictedValue,
    slope: slopePerHour,
    willBreachThreshold,
    timeToBreachMs,
    confidence: regression.rSquared,
  };
}

// ============================================================================
// ALERTING
// ============================================================================

function formatTimeToBreachMs(ms: number): string {
  if (ms <= 0) return 'NOW';
  if (ms < 60 * 1000) return 'less than 1 minute';
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60 / 1000)} minutes`;
  return `${(ms / 60 / 60 / 1000).toFixed(1)} hours`;
}

function getRecommendation(metric: string, prediction: Prediction): string {
  const recommendations: Record<string, string> = {
    disk_usage: 'Run `ferni disk clean` or `ferni disk clean:aggressive` to free space',
    memory_usage: 'Consider restarting the container or investigating memory leaks',
    cost_hourly: 'Review API usage patterns, consider caching or rate limiting',
    cost_daily: 'Check for runaway processes or unusual traffic patterns',
    latency_p99: 'Check service health, consider scaling or investigating bottlenecks',
    error_rate: 'Check circuit breakers, review recent changes or external service status',
  };

  return recommendations[metric] || 'Review metrics dashboard and recent changes';
}

function shouldSendPredictiveAlert(metric: string): boolean {
  const lastAlert = lastAlerts.get(metric);
  if (!lastAlert) return true;
  return Date.now() - lastAlert > config.alertCooldownMs;
}

async function sendPredictiveAlert(alert: PredictiveAlert): Promise<void> {
  if (!shouldSendPredictiveAlert(alert.metric)) {
    log.debug({ metric: alert.metric }, 'Predictive alert rate-limited');
    return;
  }

  lastAlerts.set(alert.metric, Date.now());

  const emoji = alert.timeToBreachMs < 30 * 60 * 1000 ? '🚨' : '⚠️';
  const severity = alert.timeToBreachMs < 30 * 60 * 1000 ? 'critical' : 'warning';

  log.warn(alert, `${emoji} Predictive Alert: ${alert.metric}`);

  if (config.enableSlack && slackService) {
    try {
      await slackService.notify({
        type: severity === 'critical' ? 'incident_opened' : 'health_degraded',
        title: `🔮 Predicted: ${alert.metric} will breach threshold`,
        message: `Current: ${alert.currentValue.toFixed(1)} → Threshold: ${alert.threshold}\nTime to breach: ${alert.timeToBreachHuman}\n\n💡 ${alert.recommendation}`,
        severity: severity === 'critical' ? 'error' : 'warning',
        metadata: alert as unknown as Record<string, unknown>,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to send Slack alert');
    }
  }
}

// ============================================================================
// PREDICTION LOOP
// ============================================================================

async function runPredictions(): Promise<void> {
  for (const series of metrics.values()) {
    const prediction = predictMetric(series);
    if (!prediction) continue;

    log.debug(
      {
        metric: prediction.metric,
        current: prediction.currentValue.toFixed(2),
        slope: prediction.slope.toFixed(4),
        confidence: prediction.confidence.toFixed(2),
      },
      'Prediction computed'
    );

    // Check if we should alert
    if (
      prediction.willBreachThreshold &&
      prediction.timeToBreachMs !== null &&
      prediction.timeToBreachMs <= config.alertLeadTimeMs &&
      prediction.confidence >= 0.5
    ) {
      await sendPredictiveAlert({
        metric: prediction.metric,
        currentValue: prediction.currentValue,
        threshold: series.threshold,
        timeToBreachMs: prediction.timeToBreachMs,
        timeToBreachHuman: formatTimeToBreachMs(prediction.timeToBreachMs),
        recommendation: getRecommendation(prediction.metric, prediction),
      });
    }
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export function startPredictiveAlerting(userConfig?: Partial<PredictiveConfig>): void {
  if (isRunning) {
    log.warn('Predictive alerting already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  isRunning = true;

  // Initialize Slack
  if (config.enableSlack) {
    try {
      slackService = new SlackNotificationService();
    } catch (error) {
      log.warn({ error: String(error) }, 'Slack notifications disabled');
      config.enableSlack = false;
    }
  }

  // Register default metrics
  registerMetric('disk_usage', 85, 'upper'); // Alert when disk will hit 85%
  registerMetric('memory_usage', 90, 'upper'); // Alert when memory will hit 90%
  registerMetric('cost_hourly', 5, 'upper'); // Alert when hourly cost will hit $5
  registerMetric('error_rate', 0.05, 'upper'); // Alert when error rate will hit 5%
  registerMetric('latency_p99', 2000, 'upper'); // Alert when P99 will hit 2000ms

  // Call quality metrics (registered for predictive alerting integration)
  registerMetric('connection_success_rate', 95, 'lower'); // Alert when drops below 95%
  registerMetric('disconnect_rate', 5, 'upper'); // Alert when rises above 5%
  registerMetric('first_response_time', 3000, 'upper'); // Alert when response time exceeds 3s

  // Start prediction loop
  registerInterval(
    PREDICTION_INTERVAL_NAME,
    () => {
      runPredictions().catch((e) => log.error({ error: String(e) }, 'Prediction loop failed'));
    },
    config.predictionIntervalMs
  );

  log.info('🔮 Predictive alerting started');
}

export function stopPredictiveAlerting(): void {
  if (!isRunning) return;

  clearNamedInterval(PREDICTION_INTERVAL_NAME);

  isRunning = false;
  log.info('Predictive alerting stopped');
}

// ============================================================================
// API
// ============================================================================

export function getPredictions(): Prediction[] {
  const predictions: Prediction[] = [];

  for (const series of metrics.values()) {
    const prediction = predictMetric(series);
    if (prediction) {
      predictions.push(prediction);
    }
  }

  return predictions;
}

export function getMetricHistory(name: string): DataPoint[] {
  return metrics.get(name)?.data || [];
}
