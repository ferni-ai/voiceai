/**
 * Trust Systems Validation & Metrics
 *
 * Measures impact and enables iteration (P13).
 *
 * Success Metrics:
 * - Trust score improvement: +15% over 30 days
 * - Session time increase: +20%
 * - Return rate: +25% weekly
 * - User satisfaction: >4.2/5
 *
 * @module TrustValidation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TrustValidation' });

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationMetric {
  id: string;
  name: string;
  description: string;
  target: number;
  unit: string;
  direction: 'higher_better' | 'lower_better';
}

export interface MetricValue {
  metricId: string;
  value: number;
  timestamp: Date;
  userId?: string;
  context?: Record<string, unknown>;
}

export interface MetricSummary {
  metricId: string;
  current: number;
  baseline: number;
  target: number;
  delta: number;
  deltaPercent: number;
  onTrack: boolean;
  sampleSize: number;
  period: string;
}

export interface ABTestResult {
  testId: string;
  variantA: {
    name: string;
    sampleSize: number;
    conversionRate: number;
  };
  variantB: {
    name: string;
    sampleSize: number;
    conversionRate: number;
  };
  winner: 'A' | 'B' | 'none';
  confidence: number;
  significanceLevel: number;
}

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

export const VALIDATION_METRICS: ValidationMetric[] = [
  {
    id: 'trust_score_improvement',
    name: 'Trust Score Improvement',
    description: 'Average improvement in relationship health score over 30 days',
    target: 15, // 15% improvement
    unit: 'percent',
    direction: 'higher_better',
  },
  {
    id: 'session_duration',
    name: 'Session Duration',
    description: 'Average conversation session time',
    target: 20, // 20% increase
    unit: 'percent_change',
    direction: 'higher_better',
  },
  {
    id: 'weekly_return_rate',
    name: 'Weekly Return Rate',
    description: 'Percentage of users who return within 7 days',
    target: 25, // 25% increase
    unit: 'percent_change',
    direction: 'higher_better',
  },
  {
    id: 'user_satisfaction',
    name: 'User Satisfaction',
    description: 'Average user rating (1-5 scale)',
    target: 4.2,
    unit: 'rating',
    direction: 'higher_better',
  },
  {
    id: 'win_detection_accuracy',
    name: 'Win Detection Accuracy',
    description: 'Percentage of correctly detected wins (manual review)',
    target: 80,
    unit: 'percent',
    direction: 'higher_better',
  },
  {
    id: 'life_event_detection_accuracy',
    name: 'Life Event Detection Accuracy',
    description: 'Percentage of correctly detected life events',
    target: 70,
    unit: 'percent',
    direction: 'higher_better',
  },
  {
    id: 'context_injection_latency',
    name: 'Context Injection Latency',
    description: 'Average time to build trust context',
    target: 100, // < 100ms
    unit: 'ms',
    direction: 'lower_better',
  },
  {
    id: 'error_rate',
    name: 'Error Rate',
    description: 'Percentage of trust system errors',
    target: 0.1, // < 0.1%
    unit: 'percent',
    direction: 'lower_better',
  },
];

// ============================================================================
// STATE
// ============================================================================

const metricValues: MetricValue[] = [];
const baselineValues = new Map<string, number>();
const MAX_VALUES = 10000;

// ============================================================================
// METRIC RECORDING
// ============================================================================

/**
 * Record a metric value
 */
export function recordMetricValue(
  metricId: string,
  value: number,
  userId?: string,
  context?: Record<string, unknown>
): void {
  metricValues.push({
    metricId,
    value,
    timestamp: new Date(),
    userId,
    context,
  });

  // Trim old values
  while (metricValues.length > MAX_VALUES) {
    metricValues.shift();
  }
}

/**
 * Set baseline value for a metric
 */
export function setBaseline(metricId: string, value: number): void {
  baselineValues.set(metricId, value);
  log.info({ metricId, value }, 'Baseline set');
}

/**
 * Record satisfaction rating
 */
export function recordSatisfactionRating(
  userId: string,
  rating: number,
  context?: string
): void {
  recordMetricValue('user_satisfaction', rating, userId, { context });
}

/**
 * Record session duration
 */
export function recordSessionDuration(
  userId: string,
  durationMs: number
): void {
  recordMetricValue('session_duration', durationMs, userId);
}

/**
 * Record return event
 */
export function recordReturn(userId: string): void {
  recordMetricValue('weekly_return_rate', 1, userId);
}

/**
 * Record detection accuracy
 */
export function recordDetectionAccuracy(
  type: 'win' | 'life_event',
  correct: boolean,
  userId?: string
): void {
  const metricId = type === 'win' ? 'win_detection_accuracy' : 'life_event_detection_accuracy';
  recordMetricValue(metricId, correct ? 1 : 0, userId);
}

// ============================================================================
// METRIC ANALYSIS
// ============================================================================

/**
 * Get summary for a specific metric
 */
export function getMetricSummary(
  metricId: string,
  periodDays: number = 30
): MetricSummary | null {
  const metric = VALIDATION_METRICS.find((m) => m.id === metricId);
  if (!metric) return null;

  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const periodValues = metricValues.filter(
    (v) => v.metricId === metricId && v.timestamp.getTime() > cutoff
  );

  if (periodValues.length === 0) {
    return null;
  }

  const values = periodValues.map((v) => v.value);
  const current = values.reduce((a, b) => a + b, 0) / values.length;
  const baseline = baselineValues.get(metricId) || current;

  const delta = current - baseline;
  const deltaPercent = baseline !== 0 ? (delta / baseline) * 100 : 0;

  let onTrack: boolean;
  if (metric.direction === 'higher_better') {
    onTrack = current >= metric.target || deltaPercent >= metric.target;
  } else {
    onTrack = current <= metric.target;
  }

  return {
    metricId,
    current,
    baseline,
    target: metric.target,
    delta,
    deltaPercent,
    onTrack,
    sampleSize: periodValues.length,
    period: `${periodDays} days`,
  };
}

/**
 * Get summaries for all metrics
 */
export function getAllMetricSummaries(
  periodDays: number = 30
): MetricSummary[] {
  return VALIDATION_METRICS
    .map((m) => getMetricSummary(m.id, periodDays))
    .filter((s): s is MetricSummary => s !== null);
}

/**
 * Get overall validation status
 */
export function getValidationStatus(): {
  status: 'on_track' | 'at_risk' | 'failing';
  metricsOnTrack: number;
  metricsTotal: number;
  summaries: MetricSummary[];
  recommendations: string[];
} {
  const summaries = getAllMetricSummaries();
  const metricsOnTrack = summaries.filter((s) => s.onTrack).length;
  const metricsTotal = summaries.length;

  const ratio = metricsTotal > 0 ? metricsOnTrack / metricsTotal : 0;

  let status: 'on_track' | 'at_risk' | 'failing';
  if (ratio >= 0.8) {
    status = 'on_track';
  } else if (ratio >= 0.5) {
    status = 'at_risk';
  } else {
    status = 'failing';
  }

  const recommendations: string[] = [];

  // Generate recommendations for failing metrics
  for (const summary of summaries) {
    if (!summary.onTrack) {
      const metric = VALIDATION_METRICS.find((m) => m.id === summary.metricId);
      if (metric) {
        recommendations.push(
          `${metric.name}: Current ${summary.current.toFixed(2)} ${metric.unit}, ` +
          `target ${metric.target} ${metric.unit}. Delta: ${summary.deltaPercent.toFixed(1)}%`
        );
      }
    }
  }

  return {
    status,
    metricsOnTrack,
    metricsTotal,
    summaries,
    recommendations,
  };
}

// ============================================================================
// A/B TESTING
// ============================================================================

const abTestResults = new Map<string, { a: number[]; b: number[] }>();

/**
 * Record A/B test conversion
 */
export function recordABTestConversion(
  testId: string,
  variant: 'A' | 'B',
  converted: boolean
): void {
  if (!abTestResults.has(testId)) {
    abTestResults.set(testId, { a: [], b: [] });
  }

  const results = abTestResults.get(testId)!;
  const value = converted ? 1 : 0;

  if (variant === 'A') {
    results.a.push(value);
  } else {
    results.b.push(value);
  }
}

/**
 * Get A/B test results
 */
export function getABTestResult(testId: string): ABTestResult | null {
  const results = abTestResults.get(testId);
  if (!results) return null;

  const conversionRateA = results.a.length > 0
    ? results.a.reduce((a, b) => a + b, 0) / results.a.length
    : 0;

  const conversionRateB = results.b.length > 0
    ? results.b.reduce((a, b) => a + b, 0) / results.b.length
    : 0;

  // Simple significance calculation (would use proper stats lib in production)
  const minSamples = 100;
  const hasEnoughSamples = results.a.length >= minSamples && results.b.length >= minSamples;

  let winner: 'A' | 'B' | 'none' = 'none';
  let confidence = 0;

  if (hasEnoughSamples) {
    const diff = Math.abs(conversionRateA - conversionRateB);
    // Rough confidence calculation
    confidence = Math.min(0.99, diff * 10);

    if (confidence > 0.95) {
      winner = conversionRateA > conversionRateB ? 'A' : 'B';
    }
  }

  return {
    testId,
    variantA: {
      name: 'Control',
      sampleSize: results.a.length,
      conversionRate: conversionRateA,
    },
    variantB: {
      name: 'Treatment',
      sampleSize: results.b.length,
      conversionRate: conversionRateB,
    },
    winner,
    confidence,
    significanceLevel: 0.95,
  };
}

// ============================================================================
// USER FEEDBACK
// ============================================================================

interface UserFeedback {
  userId: string;
  timestamp: Date;
  rating: number;
  comment?: string;
  feature?: string;
}

const userFeedback: UserFeedback[] = [];

/**
 * Record user feedback
 */
export function recordUserFeedback(
  userId: string,
  rating: number,
  comment?: string,
  feature?: string
): void {
  userFeedback.push({
    userId,
    timestamp: new Date(),
    rating,
    comment,
    feature,
  });

  recordMetricValue('user_satisfaction', rating, userId, { comment, feature });
}

/**
 * Get feedback summary
 */
export function getFeedbackSummary(periodDays: number = 30): {
  avgRating: number;
  totalFeedback: number;
  positivePercent: number;
  negativePercent: number;
  recentComments: string[];
} {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const recent = userFeedback.filter((f) => f.timestamp.getTime() > cutoff);

  if (recent.length === 0) {
    return {
      avgRating: 0,
      totalFeedback: 0,
      positivePercent: 0,
      negativePercent: 0,
      recentComments: [],
    };
  }

  const ratings = recent.map((f) => f.rating);
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  const positive = recent.filter((f) => f.rating >= 4).length;
  const negative = recent.filter((f) => f.rating <= 2).length;

  const recentComments = recent
    .filter((f) => f.comment)
    .slice(-10)
    .map((f) => f.comment!);

  return {
    avgRating,
    totalFeedback: recent.length,
    positivePercent: (positive / recent.length) * 100,
    negativePercent: (negative / recent.length) * 100,
    recentComments,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  VALIDATION_METRICS,
  recordMetricValue,
  setBaseline,
  recordSatisfactionRating,
  recordSessionDuration,
  recordReturn,
  recordDetectionAccuracy,
  getMetricSummary,
  getAllMetricSummaries,
  getValidationStatus,
  recordABTestConversion,
  getABTestResult,
  recordUserFeedback,
  getFeedbackSummary,
};

