/**
 * Time Series Forecaster
 *
 * TRUE PREDICTIVE INTELLIGENCE: Forecast mood, energy, and engagement over time.
 *
 * Unlike simple rules like "if Sunday → anxious", this uses actual time-series
 * forecasting to predict continuous values based on historical patterns.
 *
 * Techniques:
 * - Exponential smoothing for trend detection
 * - Seasonal decomposition (weekly, monthly cycles)
 * - Anomaly detection for unusual states
 * - Confidence intervals for predictions
 *
 * @module intelligence/predictive/time-series-forecaster
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  loadTimeSeriesState,
  saveTimeSeriesState,
  markDirty,
  isUserLoaded,
  markUserLoaded,
  type TimeSeriesPersistenceData,
} from './persistence.js';
import {
  isTimeSeriesForecastingAvailable,
  calculateStatisticsF32,
  calculateLinearTrendF32,
  exponentialSmoothingF32,
  type TimeSeriesStats as RustTimeSeriesStats,
} from '../../memory/rust-accelerator.js';

const log = createLogger({ module: 'TimeSeriesForecaster' });

/** Check if native Rust SIMD acceleration is available */
const useNativeTimeSeries = isTimeSeriesForecastingAvailable();

if (useNativeTimeSeries) {
  log.debug('🦀 Using Rust SIMD-accelerated time series calculations');
}

// ============================================================================
// TYPES
// ============================================================================

/** Time series data point */
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  metadata?: {
    dayOfWeek: number;
    hourOfDay: number;
    topic?: string;
    event?: string;
  };
}

/** Forecast result */
export interface Forecast {
  /** When we're forecasting for */
  targetTime: Date;
  /** Predicted value */
  predictedValue: number;
  /** Confidence interval */
  confidence: {
    lower: number;
    upper: number;
    level: number; // e.g., 0.95 for 95%
  };
  /** Components of the forecast */
  components: {
    level: number; // Base level
    trend: number; // Direction (-1 to 1)
    seasonality: number; // Seasonal adjustment
  };
  /** How reliable is this forecast */
  reliability: 'high' | 'medium' | 'low' | 'insufficient_data';
  /** Detected anomaly? */
  anomaly?: {
    detected: boolean;
    deviation: number;
    direction: 'above' | 'below';
  };
}

/** Series statistics */
interface SeriesStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  trend: number; // Positive = improving, Negative = declining
}

/** Seasonal pattern */
interface SeasonalPattern {
  /** Day of week adjustments (0-6) */
  dayOfWeek: number[];
  /** Hour of day adjustments (0-23) */
  hourOfDay: number[];
  /** Week of month adjustments (1-4) */
  weekOfMonth: number[];
}

/** User's time series profile */
interface TimeSeriesProfile {
  userId: string;
  series: {
    mood: TimeSeriesPoint[];
    energy: TimeSeriesPoint[];
    engagement: TimeSeriesPoint[];
    stress: TimeSeriesPoint[];
  };
  seasonality: {
    mood: SeasonalPattern;
    energy: SeasonalPattern;
    engagement: SeasonalPattern;
    stress: SeasonalPattern;
  };
  stats: {
    mood: SeriesStats | null;
    energy: SeriesStats | null;
    engagement: SeriesStats | null;
    stress: SeriesStats | null;
  };
  lastUpdated: number;
}

type SeriesType = 'mood' | 'energy' | 'engagement' | 'stress';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Minimum points for forecasting */
  MIN_POINTS_FOR_FORECAST: 7,
  /** Maximum points to keep in memory */
  MAX_POINTS_PER_SERIES: 365,
  /** Smoothing factor for level (0-1) */
  ALPHA: 0.3,
  /** Smoothing factor for trend (0-1) */
  BETA: 0.1,
  /** Smoothing factor for seasonality (0-1) */
  GAMMA: 0.1,
  /** Z-score threshold for anomaly detection */
  ANOMALY_THRESHOLD: 2.5,
  /** Default seasonal pattern (neutral) */
  DEFAULT_SEASONAL_ADJUSTMENT: 1.0,
};

// ============================================================================
// STORAGE
// ============================================================================

const userProfiles = new Map<string, TimeSeriesProfile>();

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Record a time series observation
 *
 * @param userId - User to record for
 * @param series - Which series (mood, energy, engagement, stress)
 * @param value - Observed value (0-1 normalized)
 * @param timestamp - When observed
 * @param metadata - Optional context
 */
export function recordObservation(
  userId: string,
  series: SeriesType,
  value: number,
  timestamp: Date = new Date(),
  metadata?: TimeSeriesPoint['metadata']
): void {
  const profile = getOrCreateProfile(userId);

  // Add the observation
  profile.series[series].push({
    timestamp: timestamp.getTime(),
    value: Math.max(0, Math.min(1, value)), // Clamp to 0-1
    metadata: metadata || {
      dayOfWeek: timestamp.getDay(),
      hourOfDay: timestamp.getHours(),
    },
  });

  // Trim to max size (keep recent)
  if (profile.series[series].length > CONFIG.MAX_POINTS_PER_SERIES) {
    profile.series[series] = profile.series[series].slice(-CONFIG.MAX_POINTS_PER_SERIES);
  }

  // Update statistics
  profile.stats[series] = calculateStats(profile.series[series]);

  // Update seasonal patterns if enough data
  if (profile.series[series].length >= 14) {
    profile.seasonality[series] = calculateSeasonality(profile.series[series]);
  }

  profile.lastUpdated = Date.now();

  // Mark for persistence
  markDirty(userId);

  log.debug(
    { userId, series, value, totalPoints: profile.series[series].length },
    '📊 Recorded time series observation'
  );
}

/**
 * Forecast a future value
 *
 * @param userId - User to forecast for
 * @param series - Which series to forecast
 * @param targetTime - When to forecast for
 * @returns Forecast with prediction and confidence
 */
export function forecast(
  userId: string,
  series: SeriesType,
  targetTime: Date = new Date()
): Forecast {
  const profile = userProfiles.get(userId);
  const now = Date.now();

  // Check for sufficient data
  if (!profile || profile.series[series].length < CONFIG.MIN_POINTS_FOR_FORECAST) {
    return createInsufficientDataForecast(targetTime);
  }

  const data = profile.series[series];
  const stats = profile.stats[series]!;
  const seasonality = profile.seasonality[series];

  // Exponential smoothing for level and trend
  const { level, trend } = calculateSmoothedTrend(data);

  // Seasonal adjustment
  const seasonalAdj = getSeasonalAdjustment(seasonality, targetTime);

  // Calculate forecast
  const hoursAhead = (targetTime.getTime() - now) / (1000 * 60 * 60);
  const trendAdjustment = trend * Math.min(hoursAhead, 72) / 24; // Cap trend effect at 3 days
  const predictedValue = Math.max(0, Math.min(1, (level + trendAdjustment) * seasonalAdj));

  // Calculate confidence interval
  const forecastError = calculateForecastError(data, level, trend, seasonality);
  const zScore = 1.96; // 95% confidence
  const confidence = {
    lower: Math.max(0, predictedValue - zScore * forecastError),
    upper: Math.min(1, predictedValue + zScore * forecastError),
    level: 0.95,
  };

  // Determine reliability
  const reliability = determineReliability(data.length, forecastError, hoursAhead);

  // Check for anomaly in most recent observation
  const lastPoint = data[data.length - 1];
  const anomaly = detectAnomaly(lastPoint.value, stats);

  return {
    targetTime,
    predictedValue,
    confidence,
    components: {
      level,
      trend,
      seasonality: seasonalAdj,
    },
    reliability,
    anomaly,
  };
}

/**
 * Get best/worst predicted times for a metric
 *
 * @param userId - User to analyze
 * @param series - Which metric
 * @param daysAhead - How many days to look ahead
 * @returns Array of forecasts sorted by predicted value
 */
export function findOptimalTimes(
  userId: string,
  series: SeriesType,
  daysAhead: number = 7
): Array<{ time: Date; forecast: Forecast }> {
  const results: Array<{ time: Date; forecast: Forecast }> = [];
  const now = new Date();

  // Sample every 2 hours for the next N days
  for (let hours = 0; hours < daysAhead * 24; hours += 2) {
    const targetTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const fc = forecast(userId, series, targetTime);

    if (fc.reliability !== 'insufficient_data') {
      results.push({ time: targetTime, forecast: fc });
    }
  }

  // Sort by predicted value (descending for positive metrics like energy, ascending for stress)
  const isNegativeMetric = series === 'stress';
  results.sort((a, b) =>
    isNegativeMetric
      ? a.forecast.predictedValue - b.forecast.predictedValue
      : b.forecast.predictedValue - a.forecast.predictedValue
  );

  return results;
}

/**
 * Predict trend direction over time
 *
 * @param userId - User to analyze
 * @param series - Which metric
 * @returns Trend analysis
 */
export function analyzeTrend(
  userId: string,
  series: SeriesType
): {
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number;
  confidence: number;
  periodDays: number;
} {
  const profile = userProfiles.get(userId);

  if (!profile || profile.series[series].length < 7) {
    return {
      direction: 'stable',
      magnitude: 0,
      confidence: 0,
      periodDays: 0,
    };
  }

  const data = profile.series[series];

  // Calculate trend over last 7 days vs previous 7 days
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const recentPoints = data.filter((p) => p.timestamp > now - weekMs);
  const previousPoints = data.filter(
    (p) => p.timestamp > now - 2 * weekMs && p.timestamp <= now - weekMs
  );

  if (recentPoints.length < 3 || previousPoints.length < 3) {
    return {
      direction: 'stable',
      magnitude: 0,
      confidence: 0.3,
      periodDays: 7,
    };
  }

  const recentMean = mean(recentPoints.map((p) => p.value));
  const previousMean = mean(previousPoints.map((p) => p.value));
  const change = recentMean - previousMean;

  // Determine direction
  let direction: 'improving' | 'stable' | 'declining';
  const isNegativeMetric = series === 'stress';

  if (Math.abs(change) < 0.1) {
    direction = 'stable';
  } else if ((change > 0 && !isNegativeMetric) || (change < 0 && isNegativeMetric)) {
    direction = 'improving';
  } else {
    direction = 'declining';
  }

  // Calculate confidence based on consistency
  const recentVariance = variance(recentPoints.map((p) => p.value));
  const confidence = Math.max(0.3, 1 - Math.sqrt(recentVariance));

  return {
    direction,
    magnitude: Math.abs(change),
    confidence,
    periodDays: 7,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateProfile(userId: string): TimeSeriesProfile {
  let profile = userProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      series: {
        mood: [],
        energy: [],
        engagement: [],
        stress: [],
      },
      seasonality: {
        mood: createDefaultSeasonality(),
        energy: createDefaultSeasonality(),
        engagement: createDefaultSeasonality(),
        stress: createDefaultSeasonality(),
      },
      stats: {
        mood: null,
        energy: null,
        engagement: null,
        stress: null,
      },
      lastUpdated: Date.now(),
    };
    userProfiles.set(userId, profile);

    // Async load from Firestore (don't block)
    if (!isUserLoaded(userId)) {
      void loadTimeSeriesProfileFromFirestore(userId);
    }
  }

  return profile;
}

/**
 * Load time series profile from Firestore (async, called on first access)
 */
async function loadTimeSeriesProfileFromFirestore(userId: string): Promise<void> {
  try {
    const data = await loadTimeSeriesState(userId);
    if (data) {
      const profile = userProfiles.get(userId);
      if (profile) {
        // Restore series data
        if (data.mood) profile.series.mood = data.mood;
        if (data.energy) profile.series.energy = data.energy;
        if (data.engagement) profile.series.engagement = data.engagement;
        if (data.stress) profile.series.stress = data.stress;

        // Restore seasonality
        if (data.seasonality) {
          if (data.seasonality.mood) {
            profile.seasonality.mood.dayOfWeek = data.seasonality.mood.dayOfWeek || createDefaultSeasonality().dayOfWeek;
            profile.seasonality.mood.hourOfDay = data.seasonality.mood.hourOfDay || createDefaultSeasonality().hourOfDay;
          }
          if (data.seasonality.energy) {
            profile.seasonality.energy.dayOfWeek = data.seasonality.energy.dayOfWeek || createDefaultSeasonality().dayOfWeek;
            profile.seasonality.energy.hourOfDay = data.seasonality.energy.hourOfDay || createDefaultSeasonality().hourOfDay;
          }
          if (data.seasonality.engagement) {
            profile.seasonality.engagement.dayOfWeek = data.seasonality.engagement.dayOfWeek || createDefaultSeasonality().dayOfWeek;
            profile.seasonality.engagement.hourOfDay = data.seasonality.engagement.hourOfDay || createDefaultSeasonality().hourOfDay;
          }
          if (data.seasonality.stress) {
            profile.seasonality.stress.dayOfWeek = data.seasonality.stress.dayOfWeek || createDefaultSeasonality().dayOfWeek;
            profile.seasonality.stress.hourOfDay = data.seasonality.stress.hourOfDay || createDefaultSeasonality().hourOfDay;
          }
        }

        // Recalculate stats
        for (const seriesType of ['mood', 'energy', 'engagement', 'stress'] as const) {
          if (profile.series[seriesType].length >= CONFIG.MIN_POINTS_FOR_FORECAST) {
            profile.stats[seriesType] = calculateStats(profile.series[seriesType]);
          }
        }

        profile.lastUpdated = data.lastUpdated || Date.now();

        const totalPoints =
          profile.series.mood.length +
          profile.series.energy.length +
          profile.series.engagement.length +
          profile.series.stress.length;
        log.debug({ userId, totalPoints }, 'Loaded time series profile from Firestore');
      }
    }
    markUserLoaded(userId);
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load time series profile');
    markUserLoaded(userId); // Don't retry
  }
}

function createDefaultSeasonality(): SeasonalPattern {
  return {
    dayOfWeek: Array(7).fill(CONFIG.DEFAULT_SEASONAL_ADJUSTMENT),
    hourOfDay: Array(24).fill(CONFIG.DEFAULT_SEASONAL_ADJUSTMENT),
    weekOfMonth: Array(4).fill(CONFIG.DEFAULT_SEASONAL_ADJUSTMENT),
  };
}

function createInsufficientDataForecast(targetTime: Date): Forecast {
  return {
    targetTime,
    predictedValue: 0.5, // Neutral
    confidence: {
      lower: 0,
      upper: 1,
      level: 0.95,
    },
    components: {
      level: 0.5,
      trend: 0,
      seasonality: 1,
    },
    reliability: 'insufficient_data',
  };
}

function calculateStats(data: TimeSeriesPoint[]): SeriesStats {
  if (data.length === 0) {
    return { mean: 0.5, stdDev: 0, min: 0, max: 1, count: 0, trend: 0 };
  }

  const values = data.map((d) => d.value);

  // Use Rust SIMD for stats calculation when available (2-4x faster for 100+ points)
  if (useNativeTimeSeries && data.length >= 10) {
    try {
      const valuesF32 = new Float32Array(values);
      const rustStats = calculateStatisticsF32(valuesF32);

      // Calculate trend using Rust SIMD linear regression
      const trend = calculateLinearTrend(data);

      return {
        mean: rustStats.mean,
        stdDev: rustStats.stdDev,
        min: rustStats.min,
        max: rustStats.max,
        count: rustStats.count,
        trend,
      };
    } catch {
      // Fall back to JS on any error
    }
  }

  // JS fallback
  const m = mean(values);
  const v = variance(values);
  const sd = Math.sqrt(v);
  const trend = calculateLinearTrend(data);

  return {
    mean: m,
    stdDev: sd,
    min: Math.min(...values),
    max: Math.max(...values),
    count: data.length,
    trend,
  };
}

function calculateSeasonality(data: TimeSeriesPoint[]): SeasonalPattern {
  const dayOfWeek = Array(7).fill(0);
  const dayOfWeekCounts = Array(7).fill(0);
  const hourOfDay = Array(24).fill(0);
  const hourOfDayCounts = Array(24).fill(0);
  const weekOfMonth = Array(4).fill(0);
  const weekOfMonthCounts = Array(4).fill(0);

  const overallMean = mean(data.map((d) => d.value));

  for (const point of data) {
    const date = new Date(point.timestamp);
    const dow = date.getDay();
    const hod = date.getHours();
    const wom = Math.min(3, Math.floor((date.getDate() - 1) / 7));

    // Accumulate deviations from mean
    dayOfWeek[dow] += point.value - overallMean;
    dayOfWeekCounts[dow]++;

    hourOfDay[hod] += point.value - overallMean;
    hourOfDayCounts[hod]++;

    weekOfMonth[wom] += point.value - overallMean;
    weekOfMonthCounts[wom]++;
  }

  // Convert to multiplicative factors
  const seasonalDow = dayOfWeek.map((sum, i) =>
    dayOfWeekCounts[i] > 2 ? 1 + sum / dayOfWeekCounts[i] / overallMean : 1
  );

  const seasonalHod = hourOfDay.map((sum, i) =>
    hourOfDayCounts[i] > 2 ? 1 + sum / hourOfDayCounts[i] / overallMean : 1
  );

  const seasonalWom = weekOfMonth.map((sum, i) =>
    weekOfMonthCounts[i] > 2 ? 1 + sum / weekOfMonthCounts[i] / overallMean : 1
  );

  return {
    dayOfWeek: seasonalDow,
    hourOfDay: seasonalHod,
    weekOfMonth: seasonalWom,
  };
}

function calculateSmoothedTrend(data: TimeSeriesPoint[]): { level: number; trend: number } {
  if (data.length === 0) return { level: 0.5, trend: 0 };
  if (data.length === 1) return { level: data[0].value, trend: 0 };

  // Use Rust SIMD exponential smoothing when available
  if (useNativeTimeSeries && data.length >= 10) {
    try {
      const values = new Float32Array(data.map((d) => d.value));
      const result = exponentialSmoothingF32(values, CONFIG.ALPHA, CONFIG.BETA);
      return { level: result.level, trend: result.trend };
    } catch {
      // Fall back to JS on any error
    }
  }

  // JS fallback: Holt's linear exponential smoothing
  let level = data[0].value;
  let trend = data.length > 1 ? (data[1].value - data[0].value) : 0;

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = CONFIG.ALPHA * data[i].value + (1 - CONFIG.ALPHA) * (level + trend);
    trend = CONFIG.BETA * (level - prevLevel) + (1 - CONFIG.BETA) * trend;
  }

  return { level, trend };
}

function getSeasonalAdjustment(seasonality: SeasonalPattern, targetTime: Date): number {
  const dow = targetTime.getDay();
  const hod = targetTime.getHours();
  const wom = Math.min(3, Math.floor((targetTime.getDate() - 1) / 7));

  // Combine seasonal factors (multiplicative)
  return seasonality.dayOfWeek[dow] *
         seasonality.hourOfDay[hod] *
         seasonality.weekOfMonth[wom];
}

function calculateForecastError(
  data: TimeSeriesPoint[],
  level: number,
  trend: number,
  seasonality: SeasonalPattern
): number {
  if (data.length < 3) return 0.3; // High uncertainty

  // Calculate mean absolute error on historical data
  let totalError = 0;
  const { level: _, trend: __ } = calculateSmoothedTrend(data.slice(0, -1));

  for (let i = Math.max(1, data.length - 10); i < data.length; i++) {
    const actual = data[i].value;
    const targetTime = new Date(data[i].timestamp);
    const predicted = level * getSeasonalAdjustment(seasonality, targetTime);
    totalError += Math.abs(actual - predicted);
  }

  const mae = totalError / Math.min(10, data.length - 1);
  return Math.max(0.05, Math.min(0.4, mae * 1.5)); // Bound error estimate
}

function determineReliability(
  dataPoints: number,
  forecastError: number,
  hoursAhead: number
): Forecast['reliability'] {
  if (dataPoints < 7) return 'low';
  if (forecastError > 0.25 || hoursAhead > 168) return 'low'; // 1 week
  if (dataPoints >= 30 && forecastError < 0.15 && hoursAhead < 48) return 'high';
  return 'medium';
}

function detectAnomaly(
  value: number,
  stats: SeriesStats
): { detected: boolean; deviation: number; direction: 'above' | 'below' } | undefined {
  if (stats.stdDev === 0) return undefined;

  const zScore = (value - stats.mean) / stats.stdDev;

  if (Math.abs(zScore) >= CONFIG.ANOMALY_THRESHOLD) {
    return {
      detected: true,
      deviation: Math.abs(zScore),
      direction: zScore > 0 ? 'above' : 'below',
    };
  }

  return { detected: false, deviation: Math.abs(zScore), direction: zScore > 0 ? 'above' : 'below' };
}

function calculateLinearTrend(data: TimeSeriesPoint[]): number {
  if (data.length < 2) return 0;

  // Use Rust SIMD linear regression when available
  if (useNativeTimeSeries && data.length >= 10) {
    try {
      const values = new Float32Array(data.map((d) => d.value));
      return calculateLinearTrendF32(values);
    } catch {
      // Fall back to JS on any error
    }
  }

  // JS fallback: Simple linear regression for trend
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i].value;
    sumXY += i * data[i].value;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return isNaN(slope) ? 0 : slope;
}

// Statistics helpers
function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1);
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Get time series data for persistence (called by persistence layer)
 */
export function getTimeSeriesDataForPersistence(userId: string): TimeSeriesPersistenceData | null {
  const profile = userProfiles.get(userId);
  if (!profile) return null;

  return {
    mood: profile.series.mood,
    energy: profile.series.energy,
    engagement: profile.series.engagement,
    stress: profile.series.stress,
    seasonality: {
      mood: {
        dayOfWeek: profile.seasonality.mood.dayOfWeek,
        hourOfDay: profile.seasonality.mood.hourOfDay,
      },
      energy: {
        dayOfWeek: profile.seasonality.energy.dayOfWeek,
        hourOfDay: profile.seasonality.energy.hourOfDay,
      },
      engagement: {
        dayOfWeek: profile.seasonality.engagement.dayOfWeek,
        hourOfDay: profile.seasonality.engagement.hourOfDay,
      },
      stress: {
        dayOfWeek: profile.seasonality.stress.dayOfWeek,
        hourOfDay: profile.seasonality.stress.hourOfDay,
      },
    },
    lastUpdated: profile.lastUpdated,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordObservation,
  forecast,
  findOptimalTimes,
  analyzeTrend,
  getTimeSeriesDataForPersistence,
};
