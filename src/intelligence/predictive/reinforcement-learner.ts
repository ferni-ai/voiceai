/**
 * Reinforcement Learning from Outreach Outcomes
 *
 * TRUE PREDICTIVE INTELLIGENCE: Learn what actually works, not just what we think works.
 *
 * This module tracks the outcomes of predictions and outreach actions to continuously
 * improve the system. It answers questions like:
 *
 * - Did the user engage when we predicted they would?
 * - Did our proactive outreach help or annoy?
 * - Which signals are actually predictive vs noise?
 * - Are we calibrated? (When we say 70% confident, are we right 70% of the time?)
 *
 * Learning modes:
 * 1. SIGNAL CALIBRATION - Adjust confidence scores based on actual accuracy
 * 2. WEIGHT LEARNING - Which signals matter for which users
 * 3. TIMING OPTIMIZATION - When do actions have positive outcomes
 * 4. PERSONALIZATION - User-specific preferences and patterns
 *
 * @module intelligence/predictive/reinforcement-learner
 */

import { createLogger } from '../../utils/safe-logger.js';
import { recordPredictionOutcome } from './multi-signal-fusion.js';
import type { SignalSource, PredictionTarget, FusedPrediction } from './multi-signal-fusion.js';
import {
  loadReinforcementState,
  markDirty,
  isUserLoaded,
  markUserLoaded,
  type ReinforcementPersistenceData,
} from './persistence.js';

const log = createLogger({ module: 'ReinforcementLearner' });

// ============================================================================
// TYPES
// ============================================================================

/** Types of outcomes we track */
export type OutcomeType =
  | 'engaged' // User responded positively
  | 'dismissed' // User explicitly dismissed
  | 'ignored' // No response
  | 'delayed' // Response came later
  | 'negative' // User expressed annoyance
  | 'converted'; // Led to deeper engagement

/** Tracked prediction with eventual outcome */
export interface TrackedPrediction {
  id: string;
  userId: string;
  target: PredictionTarget;
  prediction: FusedPrediction;
  timestamp: number;

  // Tracking
  expectedOutcome: OutcomeType;
  actualOutcome?: OutcomeType;
  outcomeTimestamp?: number;
  feedback?: string;

  // Action taken (if any)
  actionTaken?: {
    type: 'outreach' | 'alert' | 'defer' | 'observe';
    channel?: 'push' | 'sms' | 'email' | 'in_app';
    timestamp: number;
  };
}

/** Calibration statistics */
export interface CalibrationStats {
  bucketStart: number; // e.g., 0.7 for 70-80% confidence
  bucketEnd: number;
  predictedPositive: number;
  actualPositive: number;
  total: number;
  calibrationError: number; // Difference between predicted and actual rate
}

/** Learning statistics */
export interface LearningStats {
  userId: string;
  totalPredictions: number;
  totalWithOutcome: number;

  // Overall accuracy
  overallAccuracy: number;

  // Calibration across confidence buckets
  calibration: CalibrationStats[];

  // Per-target accuracy
  targetAccuracy: Map<PredictionTarget, { correct: number; total: number }>;

  // Per-signal accuracy
  signalAccuracy: Map<string, { correct: number; total: number }>;

  // Action effectiveness
  actionEffectiveness: Map<string, { positive: number; negative: number; neutral: number }>;

  // Timing patterns
  bestOutreachTimes: Array<{ hour: number; dayOfWeek: number; successRate: number }>;

  lastUpdated: number;
}

/** Reward signal for an action */
export interface RewardSignal {
  predictionId: string;
  outcome: OutcomeType;
  reward: number; // -1 to 1
  context?: {
    responseTimeMinutes?: number;
    sentimentChange?: number;
    engagementDuration?: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Maximum predictions to track per user */
  MAX_TRACKED_PREDICTIONS: 1000,
  /** How long to wait for outcome before marking as 'ignored' (hours) */
  OUTCOME_TIMEOUT_HOURS: 48,
  /** Minimum predictions for reliable statistics */
  MIN_PREDICTIONS_FOR_STATS: 10,
  /** Confidence bucket width */
  CONFIDENCE_BUCKET_WIDTH: 0.1,
  /** Learning rate for confidence calibration */
  CALIBRATION_LEARNING_RATE: 0.05,
};

// ============================================================================
// STORAGE
// ============================================================================

const trackedPredictions = new Map<string, TrackedPrediction[]>();
const learningStats = new Map<string, LearningStats>();

// ============================================================================
// TRACKING PREDICTIONS
// ============================================================================

/**
 * Track a prediction for later outcome measurement
 *
 * @param userId - User the prediction is for
 * @param prediction - The prediction made
 * @param expectedOutcome - What we expect to happen
 * @returns Tracking ID
 */
export function trackPrediction(
  userId: string,
  prediction: FusedPrediction,
  expectedOutcome: OutcomeType = 'engaged'
): string {
  const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const tracked: TrackedPrediction = {
    id,
    userId,
    target: prediction.target,
    prediction,
    timestamp: Date.now(),
    expectedOutcome,
  };

  // Get or create user's predictions list
  let userPredictions = trackedPredictions.get(userId);
  if (!userPredictions) {
    userPredictions = [];
    trackedPredictions.set(userId, userPredictions);
  }

  // Add and trim to max size
  userPredictions.push(tracked);
  if (userPredictions.length > CONFIG.MAX_TRACKED_PREDICTIONS) {
    userPredictions.shift(); // Remove oldest
  }

  // Mark for persistence
  markDirty(userId);

  log.debug(
    { userId, predictionId: id, target: prediction.target, confidence: prediction.confidence },
    '📊 Tracking prediction for outcome'
  );

  return id;
}

/**
 * Record an action taken based on a prediction
 *
 * @param predictionId - ID of the prediction
 * @param action - Action that was taken
 */
export function recordAction(predictionId: string, action: TrackedPrediction['actionTaken']): void {
  for (const predictions of trackedPredictions.values()) {
    const pred = predictions.find((p) => p.id === predictionId);
    if (pred) {
      pred.actionTaken = action;
      log.debug({ predictionId, action: action?.type }, '📊 Recorded action for prediction');
      return;
    }
  }
}

// ============================================================================
// RECORDING OUTCOMES
// ============================================================================

/**
 * Record the outcome of a prediction
 *
 * @param predictionId - ID of the tracked prediction
 * @param outcome - What actually happened
 * @param feedback - Optional user feedback
 */
export function recordOutcome(predictionId: string, outcome: OutcomeType, feedback?: string): void {
  for (const [userId, predictions] of trackedPredictions.entries()) {
    const pred = predictions.find((p) => p.id === predictionId);
    if (pred) {
      pred.actualOutcome = outcome;
      pred.outcomeTimestamp = Date.now();
      pred.feedback = feedback;

      // Update learning stats
      updateLearningStats(userId, pred, outcome);

      // Propagate learning to signal fusion
      const wasCorrect = isOutcomePositive(outcome);
      recordPredictionOutcome(userId, wasCorrect, pred.prediction.signals);

      log.info(
        {
          predictionId,
          userId,
          target: pred.target,
          predictedConfidence: pred.prediction.confidence,
          outcome,
          wasCorrect,
        },
        '📈 Recorded prediction outcome'
      );

      return;
    }
  }

  log.warn({ predictionId }, 'Prediction not found for outcome recording');
}

/**
 * Record a reward signal (for RL-style learning)
 *
 * @param reward - The reward signal
 */
export function recordReward(reward: RewardSignal): void {
  // Convert reward to outcome type
  let outcome: OutcomeType;
  if (reward.reward > 0.5) outcome = 'engaged';
  else if (reward.reward > 0) outcome = 'delayed';
  else if (reward.reward < -0.5) outcome = 'negative';
  else if (reward.reward < 0) outcome = 'dismissed';
  else outcome = 'ignored';

  recordOutcome(reward.predictionId, outcome);
}

// ============================================================================
// LEARNING & STATISTICS
// ============================================================================

function updateLearningStats(
  userId: string,
  prediction: TrackedPrediction,
  outcome: OutcomeType
): void {
  let stats = learningStats.get(userId);
  if (!stats) {
    stats = createEmptyStats(userId);
    learningStats.set(userId, stats);
  }

  stats.totalPredictions++;
  stats.totalWithOutcome++;

  const isPositive = isOutcomePositive(outcome);

  // Update overall accuracy
  const prevTotal = stats.totalWithOutcome - 1;
  if (prevTotal > 0) {
    stats.overallAccuracy =
      (stats.overallAccuracy * prevTotal + (isPositive ? 1 : 0)) / stats.totalWithOutcome;
  } else {
    stats.overallAccuracy = isPositive ? 1 : 0;
  }

  // Update calibration buckets
  updateCalibration(stats, prediction.prediction.confidence, isPositive);

  // Update per-target accuracy
  const targetStats = stats.targetAccuracy.get(prediction.target) || { correct: 0, total: 0 };
  targetStats.total++;
  if (isPositive) targetStats.correct++;
  stats.targetAccuracy.set(prediction.target, targetStats);

  // Update per-signal accuracy
  for (const signal of prediction.prediction.signals) {
    const signalStats = stats.signalAccuracy.get(signal.name) || { correct: 0, total: 0 };
    signalStats.total++;
    // Signal is "correct" if its value aligned with outcome
    const signalPredictedPositive = signal.value > 0.5;
    if (signalPredictedPositive === isPositive) signalStats.correct++;
    stats.signalAccuracy.set(signal.name, signalStats);
  }

  // Update action effectiveness
  if (prediction.actionTaken) {
    const actionKey = `${prediction.actionTaken.type}_${prediction.actionTaken.channel || 'none'}`;
    const actionStats = stats.actionEffectiveness.get(actionKey) || {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    if (outcome === 'engaged' || outcome === 'converted') {
      actionStats.positive++;
    } else if (outcome === 'negative' || outcome === 'dismissed') {
      actionStats.negative++;
    } else {
      actionStats.neutral++;
    }
    stats.actionEffectiveness.set(actionKey, actionStats);
  }

  // Update best outreach times
  if (prediction.actionTaken && isPositive) {
    const actionTime = new Date(prediction.actionTaken.timestamp);
    const hour = actionTime.getHours();
    const dayOfWeek = actionTime.getDay();

    // Find or create time slot stats
    let timeSlot = stats.bestOutreachTimes.find(
      (t) => t.hour === hour && t.dayOfWeek === dayOfWeek
    );
    if (!timeSlot) {
      timeSlot = { hour, dayOfWeek, successRate: 0 };
      stats.bestOutreachTimes.push(timeSlot);
    }

    // Update success rate with exponential moving average
    timeSlot.successRate = timeSlot.successRate * 0.8 + (isPositive ? 1 : 0) * 0.2;
  }

  stats.lastUpdated = Date.now();
}

function updateCalibration(stats: LearningStats, confidence: number, wasPositive: boolean): void {
  // Find the right bucket
  const bucketIndex = Math.floor(confidence / CONFIG.CONFIDENCE_BUCKET_WIDTH);
  const bucketStart = bucketIndex * CONFIG.CONFIDENCE_BUCKET_WIDTH;

  let bucket = stats.calibration.find((b) => b.bucketStart === bucketStart);
  if (!bucket) {
    bucket = {
      bucketStart,
      bucketEnd: bucketStart + CONFIG.CONFIDENCE_BUCKET_WIDTH,
      predictedPositive: 0,
      actualPositive: 0,
      total: 0,
      calibrationError: 0,
    };
    stats.calibration.push(bucket);
    stats.calibration.sort((a, b) => a.bucketStart - b.bucketStart);
  }

  bucket.total++;
  bucket.predictedPositive += confidence;
  if (wasPositive) bucket.actualPositive++;

  // Calculate calibration error
  const avgPredicted = bucket.predictedPositive / bucket.total;
  const actualRate = bucket.actualPositive / bucket.total;
  bucket.calibrationError = avgPredicted - actualRate;
}

function isOutcomePositive(outcome: OutcomeType): boolean {
  return outcome === 'engaged' || outcome === 'converted' || outcome === 'delayed';
}

function createEmptyStats(userId: string): LearningStats {
  return {
    userId,
    totalPredictions: 0,
    totalWithOutcome: 0,
    overallAccuracy: 0,
    calibration: [],
    targetAccuracy: new Map(),
    signalAccuracy: new Map(),
    actionEffectiveness: new Map(),
    bestOutreachTimes: [],
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// QUERYING STATISTICS
// ============================================================================

/**
 * Get learning statistics for a user
 *
 * @param userId - User to get stats for
 * @returns Learning statistics or null if not enough data
 */
export function getLearningStats(userId: string): LearningStats | null {
  const stats = learningStats.get(userId);
  if (!stats || stats.totalWithOutcome < CONFIG.MIN_PREDICTIONS_FOR_STATS) {
    return null;
  }
  return stats;
}

/**
 * Get calibration adjustment for a confidence level
 *
 * Based on historical calibration, should we adjust this confidence?
 *
 * @param userId - User to check
 * @param confidence - Raw confidence
 * @returns Adjusted confidence
 */
export function getCalibratedConfidence(userId: string, confidence: number): number {
  const stats = learningStats.get(userId);
  if (!stats || stats.totalWithOutcome < CONFIG.MIN_PREDICTIONS_FOR_STATS) {
    return confidence; // Not enough data to calibrate
  }

  // Find the calibration bucket
  const bucketStart =
    Math.floor(confidence / CONFIG.CONFIDENCE_BUCKET_WIDTH) * CONFIG.CONFIDENCE_BUCKET_WIDTH;
  const bucket = stats.calibration.find((b) => b.bucketStart === bucketStart);

  if (!bucket || bucket.total < 5) {
    return confidence; // Not enough data in this bucket
  }

  // Adjust confidence based on calibration error
  const adjustment = -bucket.calibrationError * CONFIG.CALIBRATION_LEARNING_RATE;
  return Math.max(0, Math.min(1, confidence + adjustment));
}

/**
 * Get the best time slots for outreach
 *
 * @param userId - User to check
 * @param limit - Max slots to return
 * @returns Best time slots by success rate
 */
export function getBestOutreachTimes(
  userId: string,
  limit: number = 5
): Array<{ hour: number; dayOfWeek: number; successRate: number }> {
  const stats = learningStats.get(userId);
  if (!stats) return [];

  return [...stats.bestOutreachTimes]
    .filter((t) => t.successRate > 0)
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, limit);
}

/**
 * Get which signals are most accurate for a user
 *
 * @param userId - User to check
 * @returns Signals sorted by accuracy
 */
export function getMostAccurateSignals(
  userId: string
): Array<{ signal: string; accuracy: number; total: number }> {
  const stats = learningStats.get(userId);
  if (!stats) return [];

  const results: Array<{ signal: string; accuracy: number; total: number }> = [];

  for (const [signal, data] of stats.signalAccuracy.entries()) {
    if (data.total >= 5) {
      results.push({
        signal,
        accuracy: data.correct / data.total,
        total: data.total,
      });
    }
  }

  return results.sort((a, b) => b.accuracy - a.accuracy);
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Clean up old predictions and mark timeouts as 'ignored'
 */
export function cleanupOldPredictions(): void {
  const now = Date.now();
  const timeoutMs = CONFIG.OUTCOME_TIMEOUT_HOURS * 60 * 60 * 1000;

  for (const [userId, predictions] of trackedPredictions.entries()) {
    for (const pred of predictions) {
      if (!pred.actualOutcome && now - pred.timestamp > timeoutMs) {
        // Mark as ignored if no outcome recorded
        pred.actualOutcome = 'ignored';
        pred.outcomeTimestamp = now;
        updateLearningStats(userId, pred, 'ignored');

        log.debug({ predictionId: pred.id, userId }, 'Marked prediction as ignored (timeout)');
      }
    }

    // Remove very old predictions (older than 30 days)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const filtered = predictions.filter((p) => now - p.timestamp < thirtyDaysMs);
    if (filtered.length < predictions.length) {
      trackedPredictions.set(userId, filtered);
    }
  }
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Get reinforcement learning data for persistence (called by persistence layer)
 */
export function getReinforcementDataForPersistence(
  userId: string
): ReinforcementPersistenceData | null {
  const predictions = trackedPredictions.get(userId);
  const stats = learningStats.get(userId);

  if (!predictions && !stats) return null;

  // Convert predictions to storable format
  const storedPredictions: Record<
    string,
    {
      prediction: string;
      confidence: number;
      timestamp: number;
      resolved: boolean;
      outcome?: string;
      actualHappened?: boolean;
    }
  > = {};

  if (predictions) {
    for (const pred of predictions) {
      storedPredictions[pred.id] = {
        prediction: pred.target,
        confidence: pred.prediction.confidence,
        timestamp: pred.timestamp,
        resolved: !!pred.actualOutcome,
        outcome: pred.actualOutcome,
        actualHappened: pred.actualOutcome ? isOutcomePositive(pred.actualOutcome) : undefined,
      };
    }
  }

  // Extract calibration buckets
  const calibration: ReinforcementPersistenceData['calibration'] =
    stats?.calibration?.map((bucket) => ({
      binStart: bucket.bucketStart,
      binEnd: bucket.bucketEnd,
      actualRate: bucket.actualPositive / Math.max(1, bucket.total),
      count: bucket.total,
    })) || [];

  // Extract signal accuracy
  const signalAccuracy: Record<
    string,
    {
      signal: string;
      correctPredictions: number;
      totalPredictions: number;
      accuracy: number;
    }
  > = {};

  if (stats?.signalAccuracy) {
    for (const [signal, data] of stats.signalAccuracy.entries()) {
      signalAccuracy[signal] = {
        signal,
        correctPredictions: data.correct,
        totalPredictions: data.total,
        accuracy: data.total > 0 ? data.correct / data.total : 0,
      };
    }
  }

  // Extract outreach history from action effectiveness
  const outreachHistory: ReinforcementPersistenceData['outreachHistory'] = [];
  if (stats?.bestOutreachTimes) {
    for (const time of stats.bestOutreachTimes) {
      outreachHistory.push({
        timestamp: Date.now(),
        hour: time.hour,
        dayOfWeek: time.dayOfWeek,
        outcome: time.successRate > 0.5 ? 'positive' : 'neutral',
      });
    }
  }

  return {
    predictions: storedPredictions,
    calibration,
    signalAccuracy,
    outreachHistory,
    lastUpdated: stats?.lastUpdated || Date.now(),
  };
}

/**
 * Load reinforcement state from Firestore (async, called on first access)
 */
export async function loadReinforcementFromFirestore(userId: string): Promise<void> {
  if (isUserLoaded(userId)) return;

  try {
    const data = await loadReinforcementState(userId);
    if (data) {
      // We don't fully restore predictions (they're ephemeral)
      // But we do restore calibration and signal accuracy

      // Initialize learning stats if needed
      let stats = learningStats.get(userId);
      if (!stats) {
        stats = initializeLearningStats(userId);
        learningStats.set(userId, stats);
      }

      // Restore calibration buckets
      if (data.calibration) {
        stats.calibration = data.calibration.map((bucket) => ({
          bucketStart: bucket.binStart,
          bucketEnd: bucket.binEnd,
          predictedPositive: bucket.count * bucket.actualRate,
          actualPositive: bucket.count * bucket.actualRate,
          total: bucket.count,
          calibrationError: 0,
        }));
      }

      // Restore signal accuracy
      if (data.signalAccuracy) {
        for (const [signal, accuracy] of Object.entries(data.signalAccuracy)) {
          stats.signalAccuracy.set(signal, {
            correct: accuracy.correctPredictions,
            total: accuracy.totalPredictions,
          });
        }
      }

      stats.lastUpdated = data.lastUpdated;

      log.debug(
        { userId, signalCount: Object.keys(data.signalAccuracy || {}).length },
        'Loaded reinforcement state from Firestore'
      );
    }
    markUserLoaded(userId);
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load reinforcement state');
    markUserLoaded(userId);
  }
}

/**
 * Initialize empty learning stats for a user
 */
function initializeLearningStats(userId: string): LearningStats {
  return {
    userId,
    totalPredictions: 0,
    totalWithOutcome: 0,
    overallAccuracy: 0,
    calibration: [],
    targetAccuracy: new Map(),
    signalAccuracy: new Map(),
    actionEffectiveness: new Map(),
    bestOutreachTimes: [],
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackPrediction,
  recordAction,
  recordOutcome,
  recordReward,
  getLearningStats,
  getCalibratedConfidence,
  getBestOutreachTimes,
  getMostAccurateSignals,
  cleanupOldPredictions,
  getReinforcementDataForPersistence,
  loadReinforcementFromFirestore,
};
