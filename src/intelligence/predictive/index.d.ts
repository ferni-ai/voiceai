/**
 * TRUE Predictive Intelligence Module - Better Than Human v4
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module provides REAL machine learning-based prediction, not just rules.
 * With v4, we add 8 SUPERHUMAN capabilities that go beyond what any human
 * friend or therapist can provide.
 *
 * CORE COMPONENTS:
 * - MARKOV: Learn behavioral sequences (what follows what)
 * - TIME SERIES: Forecast continuous values (mood, energy over time)
 * - MULTI-SIGNAL: Fuse weak signals into strong predictions
 * - REINFORCEMENT: Learn from outcomes to improve
 * - LLM DEEP ANALYSIS: Gemini-powered batch insights
 *
 * BETTER THAN HUMAN v4 - 8 SUPERHUMAN CAPABILITIES:
 * 1. AVOIDANCE PREDICTION: Track what they DON'T say and when it'll surface
 * 2. BREAKTHROUGH PROXIMITY: Detect when insights are forming
 * 3. PRE-TRAJECTORY DETECTION: Predict emotional shifts before symptoms
 * 4. CONVERSATION PREPARATION: Know what they'll need before they do
 * 5. COGNITIVE FINGERPRINT: Learn their unique cognitive signature
 * 6. RIPPLE EFFECT PREDICTION: See how one change cascades through life
 * 7. LIFE PHASE PREDICTION: Know their personal season, not just calendar
 * 8. INTERVENTION TIMING: Optimal moment for each type of support
 *
 * @module intelligence/predictive
 */
export * from './markov-sequence-predictor.js';
export * from './time-series-forecaster.js';
export * from './multi-signal-fusion.js';
export * from './reinforcement-learner.js';
export * from './llm-deep-analysis.js';
export * from './persistence.js';
export * from './avoidance-prediction.js';
export * from './breakthrough-proximity.js';
export * from './pre-trajectory-detection.js';
export * from './conversation-preparation.js';
export * from './cognitive-fingerprint.js';
export * from './ripple-effect-prediction.js';
export * from './life-phase-prediction.js';
export * from './intervention-timing.js';
export * from './signal-integration.js';
export * from './superhuman-persistence.js';
export * from './embeddings/index.js';
import { recordTransition, recordSecondOrderTransition, predictNextStates, extractStatesFromTurn, type SequencePrediction, type ObservableState } from './markov-sequence-predictor.js';
import { recordObservation, forecast, findOptimalTimes, analyzeTrend, type Forecast, type TimeSeriesPoint } from './time-series-forecaster.js';
import { fusePrediction, recordPredictionOutcome, type FusedPrediction, type PredictionTarget, type SignalSource } from './multi-signal-fusion.js';
import { trackPrediction, recordAction, recordOutcome, recordReward, getLearningStats, getCalibratedConfidence, getBestOutreachTimes, getMostAccurateSignals, cleanupOldPredictions, type LearningStats, type OutcomeType, type RewardSignal } from './reinforcement-learner.js';
import { runDeepAnalysis, getLatestDeepAnalysis, getDeepAnalysisContextForTurn, runBatchDeepAnalysis, recordDeepAnalysisFeedback, type DeepAnalysisResult, type SemanticInsight, type PredictiveHypothesis, type OutreachSuggestion } from './llm-deep-analysis.js';
import { avoidancePrediction, buildAvoidanceContext, type AvoidanceSurfacingPrediction, type AvoidableTopic } from './avoidance-prediction.js';
import { breakthroughProximity, buildBreakthroughContext, type BreakthroughProximity, type BreakthroughType } from './breakthrough-proximity.js';
import { preTrajectoryDetection, buildPreTrajectoryContext, type TrajectoryPrediction, type EmotionalTrajectory } from './pre-trajectory-detection.js';
import { conversationPreparation, buildConversationPrepContext, type ConversationPreparation, type ConversationNeed } from './conversation-preparation.js';
import { cognitiveFingerprint, buildFingerprintContext, type CognitiveFingerprint, type DecisionStyle } from './cognitive-fingerprint.js';
import { rippleEffectPrediction, buildRippleContext, type RipplePrediction, type LifeDomain } from './ripple-effect-prediction.js';
import { lifePhasePrediction, buildPhaseContext, type PhasePrediction, type LifePhase } from './life-phase-prediction.js';
import { interventionTiming, buildInterventionTimingContext, type TimingRecommendation, type InterventionType } from './intervention-timing.js';
import { signalIntegration, processTurnForSuperhumanLearning, recordInterventionFromTurn, recordBreakthroughMoment, recordLifeEvent, recordDecisionMade, recordStressObserved, recordVulnerabilityMoment, processSessionStart, processSessionEnd } from './signal-integration.js';
import { superhumanPersistence, markSuperhumanDirty, flushSuperhumanState } from './superhuman-persistence.js';
/**
 * Process a conversation turn for learning
 *
 * This should be called after every turn to feed the prediction system.
 *
 * @param userId - User ID
 * @param text - User's message
 * @param emotion - Detected emotion (if any)
 * @param topic - Detected topic (if any)
 * @param mood - Normalized mood (0-1)
 * @param energy - Normalized energy (0-1)
 */
export declare function processConversationForLearning(userId: string, params: {
    text: string;
    emotion?: string;
    topic?: string;
    mood?: number;
    energy?: number;
    timestamp?: Date;
    previousEmotion?: string;
    previousTopic?: string;
}): Promise<void>;
/**
 * Get a comprehensive prediction for a user
 *
 * @param userId - User to predict for
 * @param target - What we're predicting
 * @param context - Current context
 * @returns Fused prediction with all intelligence combined
 */
export declare function getPrediction(userId: string, target: PredictionTarget, context?: {
    currentEmotion?: string;
    currentTopic?: string;
    timestamp?: Date;
    recentText?: string;
}): Promise<FusedPrediction & {
    calibratedConfidence: number;
}>;
/**
 * Get predictions for multiple targets at once
 *
 * @param userId - User to predict for
 * @param context - Current context
 * @returns Map of target to prediction
 */
export declare function getAllPredictions(userId: string, context?: {
    currentEmotion?: string;
    currentTopic?: string;
    timestamp?: Date;
    recentText?: string;
}): Promise<Map<PredictionTarget, FusedPrediction>>;
/**
 * Find the best time to reach out to a user
 *
 * Combines Thompson Sampling (engagement) with Time Series (mood/energy)
 *
 * @param userId - User to find optimal time for
 * @param daysAhead - How many days to look ahead
 * @returns Best times ranked by predicted success
 */
export declare function findBestOutreachTime(userId: string, daysAhead?: number): Promise<Array<{
    time: Date;
    confidence: number;
    reasoning: string;
    moodForecast: number;
    energyForecast: number;
}>>;
/**
 * Get learning statistics summary for a user
 *
 * @param userId - User to get stats for
 * @returns Summary of learning progress
 */
export declare function getLearningSummary(userId: string): {
    hasEnoughData: boolean;
    overallAccuracy: number;
    bestSignals: string[];
    calibrationStatus: 'well_calibrated' | 'overconfident' | 'underconfident' | 'unknown';
    recommendedImprovements: string[];
};
/**
 * Initialize the predictive intelligence system
 *
 * This starts:
 * - Periodic cleanup of old predictions
 * - Periodic flush of ML model state to Firestore
 */
export declare function initializePredictiveIntelligence(): Promise<void>;
/**
 * Shutdown the predictive intelligence system
 *
 * Flushes all pending state to Firestore before shutdown.
 */
export declare function shutdownPredictiveIntelligence(): Promise<void>;
/**
 * Flush ML state for a specific user (e.g., on session end)
 */
export declare function flushUserMLState(userId: string): Promise<void>;
/**
 * Get comprehensive predictive context for a conversation turn
 *
 * Combines:
 * - Statistical predictions (fast, real-time)
 * - Deep analysis insights (pre-computed by Gemini)
 * - BETTER THAN HUMAN v4 - 8 Superhuman capabilities
 *
 * This is what gets injected into the LLM context during turn processing.
 */
export declare function getPredictiveIntelligenceContext(userId: string, context?: {
    currentEmotion?: string;
    currentTopic?: string;
}): Promise<string>;
/**
 * Get just the superhuman capabilities context (for targeted injection)
 *
 * Use this when you want only the v4 Better Than Human capabilities
 * without the core predictive intelligence.
 */
export declare function getSuperhumanPredictiveContext(userId: string, context?: {
    currentEmotion?: string;
    currentTopic?: string;
}): string;
export { recordTransition, recordSecondOrderTransition, predictNextStates, extractStatesFromTurn, recordObservation, forecast, findOptimalTimes, analyzeTrend, fusePrediction, recordPredictionOutcome, trackPrediction, recordAction, recordOutcome, recordReward, getLearningStats, getCalibratedConfidence, getBestOutreachTimes, getMostAccurateSignals, cleanupOldPredictions, runDeepAnalysis, getLatestDeepAnalysis, getDeepAnalysisContextForTurn, runBatchDeepAnalysis, recordDeepAnalysisFeedback, avoidancePrediction, buildAvoidanceContext, breakthroughProximity, buildBreakthroughContext, preTrajectoryDetection, buildPreTrajectoryContext, conversationPreparation, buildConversationPrepContext, cognitiveFingerprint, buildFingerprintContext, rippleEffectPrediction, buildRippleContext, lifePhasePrediction, buildPhaseContext, interventionTiming, buildInterventionTimingContext, signalIntegration, processTurnForSuperhumanLearning, recordInterventionFromTurn, recordBreakthroughMoment, recordLifeEvent, recordDecisionMade, recordStressObserved, recordVulnerabilityMoment, processSessionStart, processSessionEnd, superhumanPersistence, markSuperhumanDirty, flushSuperhumanState, };
export type { SequencePrediction, ObservableState, Forecast, TimeSeriesPoint, FusedPrediction, PredictionTarget, SignalSource, LearningStats, OutcomeType, RewardSignal, DeepAnalysisResult, SemanticInsight, PredictiveHypothesis, OutreachSuggestion, AvoidanceSurfacingPrediction, AvoidableTopic, BreakthroughProximity, BreakthroughType, TrajectoryPrediction, EmotionalTrajectory, ConversationPreparation, ConversationNeed, CognitiveFingerprint, DecisionStyle, RipplePrediction, LifeDomain, PhasePrediction, LifePhase, TimingRecommendation, InterventionType, };
//# sourceMappingURL=index.d.ts.map