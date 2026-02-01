/**
 * Preference Predictor
 *
 * Predicts user preferences for memory surfacing based on historical patterns.
 * Learns from past interactions to improve timing and topic selection.
 *
 * @module memory/lifecycle/preference-predictor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  PreferencePredictorConfig,
  PredictedPreference,
} from './types.js';
import { DEFAULT_PREFERENCE_PREDICTOR_CONFIG } from './types.js';

const log = createLogger({ module: 'PreferencePredictor' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Historical data point for learning
 */
export interface PreferenceDataPoint {
  /** Subject (topic, person, etc.) */
  subject: string;

  /** Subject type */
  subjectType: 'topic' | 'person' | 'memory_type' | 'time_of_day';

  /** User's response (0 = deflected, 1 = engaged) */
  response: number;

  /** When this happened */
  timestamp: Date;

  /** Context */
  context?: {
    turnCount?: number;
    emotionalIntensity?: number;
    timeOfDay?: string;
  };
}

/**
 * Aggregated preference data
 */
interface AggregatedPreference {
  subject: string;
  subjectType: 'topic' | 'person' | 'memory_type' | 'time_of_day';
  totalResponses: number;
  weightedSum: number;
  recentTrend: number;
  lastUpdated: Date;
}

// ============================================================================
// PREFERENCE PREDICTOR
// ============================================================================

/**
 * Preference Predictor
 *
 * Learns and predicts user preferences.
 */
export class PreferencePredictor {
  private config: PreferencePredictorConfig;
  private preferences: Map<string, Map<string, AggregatedPreference>> = new Map();
  private dataPoints: Map<string, PreferenceDataPoint[]> = new Map();

  constructor(config: Partial<PreferencePredictorConfig> = {}) {
    this.config = { ...DEFAULT_PREFERENCE_PREDICTOR_CONFIG, ...config };
  }

  /**
   * Record a data point
   */
  recordDataPoint(userId: string, dataPoint: PreferenceDataPoint): void {
    // Store raw data point
    const userPoints = this.dataPoints.get(userId) || [];
    userPoints.push(dataPoint);
    this.dataPoints.set(userId, userPoints);

    // Update aggregated preference
    this.updateAggregatedPreference(userId, dataPoint);

    log.debug({
      userId,
      subject: dataPoint.subject,
      response: dataPoint.response,
    }, 'Recorded preference data point');
  }

  /**
   * Update aggregated preference from data point
   */
  private updateAggregatedPreference(userId: string, dataPoint: PreferenceDataPoint): void {
    let userPrefs = this.preferences.get(userId);
    if (!userPrefs) {
      userPrefs = new Map();
      this.preferences.set(userId, userPrefs);
    }

    const key = `${dataPoint.subjectType}:${dataPoint.subject.toLowerCase()}`;
    const existing = userPrefs.get(key);

    if (existing) {
      // Apply decay to old data
      const daysSince = (Date.now() - existing.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.pow(this.config.preferenceDecayRate, daysSince);

      // Update with recency weighting
      existing.weightedSum = existing.weightedSum * decayFactor + dataPoint.response * this.config.recencyWeight;
      existing.totalResponses = existing.totalResponses * decayFactor + 1;
      existing.lastUpdated = dataPoint.timestamp;

      // Update trend (simple moving average direction)
      const currentAvg = existing.weightedSum / existing.totalResponses;
      existing.recentTrend = dataPoint.response > currentAvg ? 1 : dataPoint.response < currentAvg ? -1 : 0;
    } else {
      userPrefs.set(key, {
        subject: dataPoint.subject,
        subjectType: dataPoint.subjectType,
        totalResponses: 1,
        weightedSum: dataPoint.response,
        recentTrend: 0,
        lastUpdated: dataPoint.timestamp,
      });
    }
  }

  /**
   * Predict preference for a subject
   */
  predictPreference(userId: string, subject: string, subjectType: PredictedPreference['subjectType']): PredictedPreference {
    const userPrefs = this.preferences.get(userId);
    const key = `${subjectType}:${subject.toLowerCase()}`;
    const pref = userPrefs?.get(key);

    if (!pref || pref.totalResponses < this.config.minDataPoints) {
      // Not enough data, return neutral prediction
      return {
        subject,
        subjectType,
        predictedReceptivity: 0.5,
        confidence: 0.2,
        dataPoints: pref?.totalResponses || 0,
        trend: 'stable',
      };
    }

    // Calculate predicted receptivity
    const predictedReceptivity = pref.weightedSum / pref.totalResponses;

    // Calculate confidence based on data points
    const confidence = Math.min(0.9, 0.3 + pref.totalResponses * 0.1);

    // Determine trend
    let trend: PredictedPreference['trend'] = 'stable';
    if (pref.recentTrend > 0.1) trend = 'increasing';
    else if (pref.recentTrend < -0.1) trend = 'decreasing';

    return {
      subject,
      subjectType,
      predictedReceptivity: Math.max(0, Math.min(1, predictedReceptivity)),
      confidence,
      dataPoints: pref.totalResponses,
      trend,
    };
  }

  /**
   * Get all predictions for a user
   */
  getAllPredictions(userId: string): PredictedPreference[] {
    const userPrefs = this.preferences.get(userId);
    if (!userPrefs) return [];

    const predictions: PredictedPreference[] = [];

    for (const pref of userPrefs.values()) {
      predictions.push(this.predictPreference(userId, pref.subject, pref.subjectType));
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions;
  }

  /**
   * Get top positive preferences (things user likes)
   */
  getPositivePreferences(userId: string, limit: number = 10): PredictedPreference[] {
    return this.getAllPredictions(userId)
      .filter((p) => p.predictedReceptivity > 0.6 && p.confidence > 0.5)
      .slice(0, limit);
  }

  /**
   * Get negative preferences (things to avoid)
   */
  getNegativePreferences(userId: string, limit: number = 10): PredictedPreference[] {
    return this.getAllPredictions(userId)
      .filter((p) => p.predictedReceptivity < 0.4 && p.confidence > 0.5)
      .slice(0, limit);
  }

  /**
   * Get best time of day for memory surfacing
   */
  getBestTimeOfDay(userId: string): { hour: number; receptivity: number } | null {
    const userPrefs = this.preferences.get(userId);
    if (!userPrefs) return null;

    let bestHour = -1;
    let bestReceptivity = 0;

    for (let hour = 0; hour < 24; hour++) {
      const prediction = this.predictPreference(userId, hour.toString(), 'time_of_day');
      if (prediction.confidence > 0.4 && prediction.predictedReceptivity > bestReceptivity) {
        bestReceptivity = prediction.predictedReceptivity;
        bestHour = hour;
      }
    }

    if (bestHour === -1) return null;

    return { hour: bestHour, receptivity: bestReceptivity };
  }

  /**
   * Clear old data points
   */
  pruneOldData(userId: string, maxAgeDays: number = 90): number {
    const points = this.dataPoints.get(userId) || [];
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const filtered = points.filter((p) => p.timestamp >= cutoff);
    const removed = points.length - filtered.length;

    this.dataPoints.set(userId, filtered);

    log.debug({ userId, removed, remaining: filtered.length }, 'Pruned old preference data');
    return removed;
  }

  /**
   * Export user preferences (for backup/transfer)
   */
  exportPreferences(userId: string): {
    aggregated: AggregatedPreference[];
    dataPoints: PreferenceDataPoint[];
  } {
    const userPrefs = this.preferences.get(userId);
    const points = this.dataPoints.get(userId) || [];

    return {
      aggregated: userPrefs ? Array.from(userPrefs.values()) : [],
      dataPoints: points,
    };
  }

  /**
   * Import user preferences
   */
  importPreferences(userId: string, data: {
    aggregated: AggregatedPreference[];
    dataPoints: PreferenceDataPoint[];
  }): void {
    const userPrefs = new Map<string, AggregatedPreference>();
    for (const pref of data.aggregated) {
      const key = `${pref.subjectType}:${pref.subject.toLowerCase()}`;
      userPrefs.set(key, pref);
    }
    this.preferences.set(userId, userPrefs);
    this.dataPoints.set(userId, data.dataPoints);

    log.info({
      userId,
      aggregatedCount: data.aggregated.length,
      dataPointCount: data.dataPoints.length,
    }, 'Imported user preferences');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let predictorInstance: PreferencePredictor | null = null;

export function getPreferencePredictor(config?: Partial<PreferencePredictorConfig>): PreferencePredictor {
  if (!predictorInstance) {
    predictorInstance = new PreferencePredictor(config);
  }
  return predictorInstance;
}

export function resetPreferencePredictor(): void {
  predictorInstance = null;
}
