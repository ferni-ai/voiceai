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
import type { PredictionTarget, FusedPrediction } from './multi-signal-fusion.js';
import { type ReinforcementPersistenceData } from './persistence.js';
/** Types of outcomes we track */
export type OutcomeType = 'engaged' | 'dismissed' | 'ignored' | 'delayed' | 'negative' | 'converted';
/** Tracked prediction with eventual outcome */
export interface TrackedPrediction {
    id: string;
    userId: string;
    target: PredictionTarget;
    prediction: FusedPrediction;
    timestamp: number;
    expectedOutcome: OutcomeType;
    actualOutcome?: OutcomeType;
    outcomeTimestamp?: number;
    feedback?: string;
    actionTaken?: {
        type: 'outreach' | 'alert' | 'defer' | 'observe';
        channel?: 'push' | 'sms' | 'email' | 'in_app';
        timestamp: number;
    };
}
/** Calibration statistics */
export interface CalibrationStats {
    bucketStart: number;
    bucketEnd: number;
    predictedPositive: number;
    actualPositive: number;
    total: number;
    calibrationError: number;
}
/** Learning statistics */
export interface LearningStats {
    userId: string;
    totalPredictions: number;
    totalWithOutcome: number;
    overallAccuracy: number;
    calibration: CalibrationStats[];
    targetAccuracy: Map<PredictionTarget, {
        correct: number;
        total: number;
    }>;
    signalAccuracy: Map<string, {
        correct: number;
        total: number;
    }>;
    actionEffectiveness: Map<string, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
    bestOutreachTimes: Array<{
        hour: number;
        dayOfWeek: number;
        successRate: number;
    }>;
    lastUpdated: number;
}
/** Reward signal for an action */
export interface RewardSignal {
    predictionId: string;
    outcome: OutcomeType;
    reward: number;
    context?: {
        responseTimeMinutes?: number;
        sentimentChange?: number;
        engagementDuration?: number;
    };
}
/**
 * Track a prediction for later outcome measurement
 *
 * @param userId - User the prediction is for
 * @param prediction - The prediction made
 * @param expectedOutcome - What we expect to happen
 * @returns Tracking ID
 */
export declare function trackPrediction(userId: string, prediction: FusedPrediction, expectedOutcome?: OutcomeType): string;
/**
 * Record an action taken based on a prediction
 *
 * @param predictionId - ID of the prediction
 * @param action - Action that was taken
 */
export declare function recordAction(predictionId: string, action: TrackedPrediction['actionTaken']): void;
/**
 * Record the outcome of a prediction
 *
 * @param predictionId - ID of the tracked prediction
 * @param outcome - What actually happened
 * @param feedback - Optional user feedback
 */
export declare function recordOutcome(predictionId: string, outcome: OutcomeType, feedback?: string): void;
/**
 * Record a reward signal (for RL-style learning)
 *
 * @param reward - The reward signal
 */
export declare function recordReward(reward: RewardSignal): void;
/**
 * Get learning statistics for a user
 *
 * @param userId - User to get stats for
 * @returns Learning statistics or null if not enough data
 */
export declare function getLearningStats(userId: string): LearningStats | null;
/**
 * Get calibration adjustment for a confidence level
 *
 * Based on historical calibration, should we adjust this confidence?
 *
 * @param userId - User to check
 * @param confidence - Raw confidence
 * @returns Adjusted confidence
 */
export declare function getCalibratedConfidence(userId: string, confidence: number): number;
/**
 * Get the best time slots for outreach
 *
 * @param userId - User to check
 * @param limit - Max slots to return
 * @returns Best time slots by success rate
 */
export declare function getBestOutreachTimes(userId: string, limit?: number): Array<{
    hour: number;
    dayOfWeek: number;
    successRate: number;
}>;
/**
 * Get which signals are most accurate for a user
 *
 * @param userId - User to check
 * @returns Signals sorted by accuracy
 */
export declare function getMostAccurateSignals(userId: string): Array<{
    signal: string;
    accuracy: number;
    total: number;
}>;
/**
 * Clean up old predictions and mark timeouts as 'ignored'
 */
export declare function cleanupOldPredictions(): void;
/**
 * Get reinforcement learning data for persistence (called by persistence layer)
 */
export declare function getReinforcementDataForPersistence(userId: string): ReinforcementPersistenceData | null;
/**
 * Load reinforcement state from Firestore (async, called on first access)
 */
export declare function loadReinforcementFromFirestore(userId: string): Promise<void>;
declare const _default: {
    trackPrediction: typeof trackPrediction;
    recordAction: typeof recordAction;
    recordOutcome: typeof recordOutcome;
    recordReward: typeof recordReward;
    getLearningStats: typeof getLearningStats;
    getCalibratedConfidence: typeof getCalibratedConfidence;
    getBestOutreachTimes: typeof getBestOutreachTimes;
    getMostAccurateSignals: typeof getMostAccurateSignals;
    cleanupOldPredictions: typeof cleanupOldPredictions;
    getReinforcementDataForPersistence: typeof getReinforcementDataForPersistence;
    loadReinforcementFromFirestore: typeof loadReinforcementFromFirestore;
};
export default _default;
//# sourceMappingURL=reinforcement-learner.d.ts.map