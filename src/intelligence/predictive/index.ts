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

// ============================================================================
// CORE COMPONENTS
// ============================================================================

export * from './markov-sequence-predictor.js';
export * from './time-series-forecaster.js';
export * from './multi-signal-fusion.js';
export * from './reinforcement-learner.js';
export * from './llm-deep-analysis.js';
export * from './persistence.js';

// ============================================================================
// BETTER THAN HUMAN v4 - SUPERHUMAN CAPABILITIES
// ============================================================================

export * from './avoidance-prediction.js';
export * from './breakthrough-proximity.js';
export * from './pre-trajectory-detection.js';
export * from './conversation-preparation.js';
export * from './cognitive-fingerprint.js';
export * from './ripple-effect-prediction.js';
export * from './life-phase-prediction.js';
export * from './intervention-timing.js';

// Integration & Persistence
export * from './signal-integration.js';
export * from './superhuman-persistence.js';

// Persona Pattern Integration (Core Principle #5: Presence Over Performance)
export * from './persona-patterns.js';

// Embedding-Powered Intelligence
export * from './embeddings/index.js';

// Import for unified interface
import {
  recordTransition,
  recordSecondOrderTransition,
  predictNextStates,
  extractStatesFromTurn,
  type SequencePrediction,
  type ObservableState,
} from './markov-sequence-predictor.js';

import {
  recordObservation,
  forecast,
  findOptimalTimes,
  analyzeTrend,
  type Forecast,
  type TimeSeriesPoint,
} from './time-series-forecaster.js';

import {
  fusePrediction,
  recordPredictionOutcome,
  type FusedPrediction,
  type PredictionTarget,
  type SignalSource,
} from './multi-signal-fusion.js';

import {
  trackPrediction,
  recordAction,
  recordOutcome,
  recordReward,
  getLearningStats,
  getCalibratedConfidence,
  getBestOutreachTimes,
  getMostAccurateSignals,
  cleanupOldPredictions,
  type LearningStats,
  type OutcomeType,
  type RewardSignal,
} from './reinforcement-learner.js';

// LLM Deep Analysis (Tier 3 - Batch, scheduled)
import {
  runDeepAnalysis,
  getLatestDeepAnalysis,
  getDeepAnalysisContextForTurn,
  runBatchDeepAnalysis,
  recordDeepAnalysisFeedback,
  type DeepAnalysisResult,
  type SemanticInsight,
  type PredictiveHypothesis,
  type OutreachSuggestion,
} from './llm-deep-analysis.js';

// Persistence layer for ML models
import {
  initializePersistence,
  shutdownPersistence,
  flushDirtyUsers,
  forceFlushUser,
} from './persistence.js';

// Persistence data getters
import { getMarkovDataForPersistence } from './markov-sequence-predictor.js';
import { getTimeSeriesDataForPersistence } from './time-series-forecaster.js';
import { getReinforcementDataForPersistence } from './reinforcement-learner.js';

// ============================================================================
// BETTER THAN HUMAN v4 - SUPERHUMAN CAPABILITIES IMPORTS
// ============================================================================

import {
  avoidancePrediction,
  buildAvoidanceContext,
  type AvoidanceSurfacingPrediction,
  type AvoidableTopic,
} from './avoidance-prediction.js';

import {
  breakthroughProximity,
  buildBreakthroughContext,
  type BreakthroughProximity,
  type BreakthroughType,
} from './breakthrough-proximity.js';

import {
  preTrajectoryDetection,
  buildPreTrajectoryContext,
  type TrajectoryPrediction,
  type EmotionalTrajectory,
} from './pre-trajectory-detection.js';

import {
  conversationPreparation,
  buildConversationPrepContext,
  type ConversationPreparation,
  type ConversationNeed,
} from './conversation-preparation.js';

import {
  cognitiveFingerprint,
  buildFingerprintContext,
  type CognitiveFingerprint,
  type DecisionStyle,
} from './cognitive-fingerprint.js';

import {
  rippleEffectPrediction,
  buildRippleContext,
  type RipplePrediction,
  type LifeDomain,
} from './ripple-effect-prediction.js';

import {
  lifePhasePrediction,
  buildPhaseContext,
  type PhasePrediction,
  type LifePhase,
} from './life-phase-prediction.js';

import {
  interventionTiming,
  buildInterventionTimingContext,
  type TimingRecommendation,
  type InterventionType,
} from './intervention-timing.js';

// Signal Integration
import {
  signalIntegration,
  processTurnForSuperhumanLearning,
  recordInterventionFromTurn,
  recordBreakthroughMoment,
  recordLifeEvent,
  recordDecisionMade,
  recordStressObserved,
  recordVulnerabilityMoment,
  processSessionStart,
  processSessionEnd,
} from './signal-integration.js';

// Superhuman Persistence
import {
  superhumanPersistence,
  markSuperhumanDirty,
  flushSuperhumanState,
} from './superhuman-persistence.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PredictiveIntelligence' });

// ============================================================================
// UNIFIED INTERFACE
// ============================================================================

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
export async function processConversationForLearning(
  userId: string,
  params: {
    text: string;
    emotion?: string;
    topic?: string;
    mood?: number;
    energy?: number;
    timestamp?: Date;
    previousEmotion?: string;
    previousTopic?: string;
  }
): Promise<void> {
  const now = params.timestamp || new Date();

  try {
    // 1. Extract observable states
    const states = extractStatesFromTurn(params.text, params.emotion, params.topic, now);

    // 2. Record Markov transitions (if we have previous states)
    if (params.previousEmotion || params.previousTopic) {
      const previousStates = extractStatesFromTurn(
        '',
        params.previousEmotion,
        params.previousTopic,
        now
      );

      for (const prev of previousStates) {
        for (const curr of states) {
          recordTransition(userId, prev, curr);
        }
      }
    }

    // 3. Record time series observations
    if (params.mood !== undefined) {
      recordObservation(userId, 'mood', params.mood, now, {
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        topic: params.topic,
      });
    }

    if (params.energy !== undefined) {
      recordObservation(userId, 'energy', params.energy, now, {
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        topic: params.topic,
      });
    }

    // 4. Record engagement (they're talking = engaged)
    recordObservation(userId, 'engagement', 0.8, now, {
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
    });

    log.debug(
      { userId, stateCount: states.length, topic: params.topic, emotion: params.emotion },
      '🧠 Processed conversation for learning'
    );
  } catch (error) {
    log.warn({ error, userId }, 'Failed to process conversation for learning');
  }
}

/**
 * Get a comprehensive prediction for a user
 *
 * @param userId - User to predict for
 * @param target - What we're predicting
 * @param context - Current context
 * @returns Fused prediction with all intelligence combined
 */
export async function getPrediction(
  userId: string,
  target: PredictionTarget,
  context: {
    currentEmotion?: string;
    currentTopic?: string;
    timestamp?: Date;
    recentText?: string;
  } = {}
): Promise<FusedPrediction & { calibratedConfidence: number }> {
  const prediction = await fusePrediction(userId, target, context);

  // Apply calibration from learning
  const calibratedConfidence = getCalibratedConfidence(userId, prediction.confidence);

  return {
    ...prediction,
    calibratedConfidence,
  };
}

/**
 * Get predictions for multiple targets at once
 *
 * @param userId - User to predict for
 * @param context - Current context
 * @returns Map of target to prediction
 */
export async function getAllPredictions(
  userId: string,
  context: {
    currentEmotion?: string;
    currentTopic?: string;
    timestamp?: Date;
    recentText?: string;
  } = {}
): Promise<Map<PredictionTarget, FusedPrediction>> {
  const targets: PredictionTarget[] = [
    'needs_support_now',
    'will_struggle_soon',
    'ready_for_challenge',
    'optimal_outreach_window',
    'burnout_risk',
  ];

  const results = new Map<PredictionTarget, FusedPrediction>();

  await Promise.all(
    targets.map(async (target) => {
      const prediction = await fusePrediction(userId, target, context);
      results.set(target, prediction);
    })
  );

  return results;
}

/**
 * Find the best time to reach out to a user
 *
 * Combines Thompson Sampling (engagement) with Time Series (mood/energy)
 *
 * @param userId - User to find optimal time for
 * @param daysAhead - How many days to look ahead
 * @returns Best times ranked by predicted success
 */
export async function findBestOutreachTime(
  userId: string,
  daysAhead: number = 3
): Promise<
  Array<{
    time: Date;
    confidence: number;
    reasoning: string;
    moodForecast: number;
    energyForecast: number;
  }>
> {
  const results: Array<{
    time: Date;
    confidence: number;
    reasoning: string;
    moodForecast: number;
    energyForecast: number;
  }> = [];

  // Get learned best times
  const learnedBestTimes = getBestOutreachTimes(userId, 10);

  // Get time series optimal times
  const moodOptimal = findOptimalTimes(userId, 'mood', daysAhead);
  const energyOptimal = findOptimalTimes(userId, 'energy', daysAhead);

  // Create a map of time -> scores
  const timeScores = new Map<
    string,
    { time: Date; moodScore: number; energyScore: number; learnedScore: number }
  >();

  // Add mood optimal times
  for (const { time, forecast } of moodOptimal.slice(0, 20)) {
    const key = time.toISOString();
    timeScores.set(key, {
      time,
      moodScore: forecast.predictedValue,
      energyScore: 0.5,
      learnedScore: 0.5,
    });
  }

  // Add energy scores
  for (const { time, forecast } of energyOptimal.slice(0, 20)) {
    const key = time.toISOString();
    const existing = timeScores.get(key);
    if (existing) {
      existing.energyScore = forecast.predictedValue;
    }
  }

  // Add learned time bonuses
  for (const [key, scores] of timeScores.entries()) {
    const time = new Date(key);
    const hour = time.getHours();
    const dow = time.getDay();

    const learned = learnedBestTimes.find((t) => t.hour === hour && t.dayOfWeek === dow);
    if (learned) {
      scores.learnedScore = learned.successRate;
    }
  }

  // Calculate combined scores and build results
  for (const [_, scores] of timeScores.entries()) {
    const combinedScore =
      scores.moodScore * 0.3 + scores.energyScore * 0.3 + scores.learnedScore * 0.4;

    const reasons: string[] = [];
    if (scores.moodScore > 0.6) reasons.push('predicted positive mood');
    if (scores.energyScore > 0.6) reasons.push('predicted good energy');
    if (scores.learnedScore > 0.6) reasons.push('historically good engagement');

    results.push({
      time: scores.time,
      confidence: combinedScore,
      reasoning: reasons.length > 0 ? reasons.join(', ') : 'general availability',
      moodForecast: scores.moodScore,
      energyForecast: scores.energyScore,
    });
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results.slice(0, 10);
}

/**
 * Get learning statistics summary for a user
 *
 * @param userId - User to get stats for
 * @returns Summary of learning progress
 */
export function getLearningSummary(userId: string): {
  hasEnoughData: boolean;
  overallAccuracy: number;
  bestSignals: string[];
  calibrationStatus: 'well_calibrated' | 'overconfident' | 'underconfident' | 'unknown';
  recommendedImprovements: string[];
} {
  const stats = getLearningStats(userId);

  if (!stats) {
    return {
      hasEnoughData: false,
      overallAccuracy: 0,
      bestSignals: [],
      calibrationStatus: 'unknown',
      recommendedImprovements: ['Need more interactions to learn your patterns'],
    };
  }

  // Get best signals
  const signalAccuracies = getMostAccurateSignals(userId);
  const bestSignals = signalAccuracies.slice(0, 3).map((s) => s.signal);

  // Determine calibration status
  let calibrationStatus: 'well_calibrated' | 'overconfident' | 'underconfident' | 'unknown' =
    'unknown';
  if (stats.calibration.length >= 3) {
    const avgError =
      stats.calibration.reduce((sum, b) => sum + b.calibrationError, 0) / stats.calibration.length;
    if (Math.abs(avgError) < 0.1) calibrationStatus = 'well_calibrated';
    else if (avgError > 0.1) calibrationStatus = 'overconfident';
    else calibrationStatus = 'underconfident';
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (stats.overallAccuracy < 0.6) {
    recommendations.push('More data needed for accurate predictions');
  }
  if (calibrationStatus === 'overconfident') {
    recommendations.push("I'm learning to be more careful with confidence");
  }
  if (signalAccuracies.length < 3) {
    recommendations.push('Building up signal reliability data');
  }

  return {
    hasEnoughData: true,
    overallAccuracy: stats.overallAccuracy,
    bestSignals,
    calibrationStatus,
    recommendedImprovements: recommendations.length > 0 ? recommendations : ['Looking good!'],
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize the predictive intelligence system
 *
 * This starts:
 * - Periodic cleanup of old predictions
 * - Periodic flush of ML model state to Firestore
 */
export async function initializePredictiveIntelligence(): Promise<void> {
  if (initialized) return;

  log.info('🧠 Initializing Predictive Intelligence System');

  // Initialize persistence layer with data getters
  initializePersistence(
    getMarkovDataForPersistence,
    getTimeSeriesDataForPersistence,
    getReinforcementDataForPersistence
  );

  // Start periodic cleanup
  setInterval(
    () => {
      cleanupOldPredictions();
    },
    60 * 60 * 1000
  ); // Every hour

  initialized = true;
  log.info('✅ Predictive Intelligence System ready');
}

/**
 * Shutdown the predictive intelligence system
 *
 * Flushes all pending state to Firestore before shutdown.
 */
export async function shutdownPredictiveIntelligence(): Promise<void> {
  if (!initialized) return;

  log.info('🧠 Shutting down Predictive Intelligence System');

  // Flush all pending state
  await shutdownPersistence(
    getMarkovDataForPersistence,
    getTimeSeriesDataForPersistence,
    getReinforcementDataForPersistence
  );

  initialized = false;
  log.info('✅ Predictive Intelligence System shut down');
}

/**
 * Flush ML state for a specific user (e.g., on session end)
 */
export async function flushUserMLState(userId: string): Promise<void> {
  await forceFlushUser(
    userId,
    getMarkovDataForPersistence,
    getTimeSeriesDataForPersistence,
    getReinforcementDataForPersistence
  );
}

// ============================================================================
// COMBINED CONTEXT FOR TURN PROCESSING
// ============================================================================

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
export async function getPredictiveIntelligenceContext(
  userId: string,
  context: {
    currentEmotion?: string;
    currentTopic?: string;
  } = {}
): Promise<string> {
  const sections: string[] = [];

  try {
    // 1. Get deep analysis insights (pre-computed)
    const deepContext = await getDeepAnalysisContextForTurn(userId);
    if (deepContext) {
      sections.push(deepContext);
    }

    // 2. Get real-time predictions
    const predictions = await getAllPredictions(userId, context);

    const needsSupport = predictions.get('needs_support_now');
    const burnoutRisk = predictions.get('burnout_risk');
    const readyForChallenge = predictions.get('ready_for_challenge');

    const highConfidencePredictions: string[] = [];

    if (needsSupport && needsSupport.confidence > 0.6) {
      highConfidencePredictions.push(
        `• May need extra support: ${needsSupport.explanation.slice(0, 100)}`
      );
    }

    if (burnoutRisk && burnoutRisk.confidence > 0.5) {
      highConfidencePredictions.push(
        `• Burnout risk detected: ${burnoutRisk.explanation.slice(0, 100)}`
      );
    }

    if (readyForChallenge && readyForChallenge.confidence > 0.7) {
      highConfidencePredictions.push(
        `• Seems ready for growth challenge: ${readyForChallenge.explanation.slice(0, 100)}`
      );
    }

    if (highConfidencePredictions.length > 0) {
      sections.push('\n[REAL-TIME PREDICTIONS]');
      sections.push(...highConfidencePredictions);
    }

    // 3. Get sequence predictions (if we have current emotion state)
    if (context.currentEmotion) {
      // Map emotion string to ObservableState (string union type like 'emotion:anxious')
      const emotionMap: Record<string, ObservableState | undefined> = {
        anxious: 'emotion:anxious',
        stressed: 'emotion:stressed',
        calm: 'emotion:calm',
        happy: 'emotion:happy',
        sad: 'emotion:sad',
        frustrated: 'emotion:frustrated',
        excited: 'emotion:excited',
        overwhelmed: 'emotion:overwhelmed',
        neutral: 'emotion:neutral',
      };

      const currentState = emotionMap[context.currentEmotion.toLowerCase()];
      if (currentState) {
        const sequencePrediction = predictNextStates(userId, currentState);

        if (sequencePrediction.predictions.length > 0 && sequencePrediction.isReliable) {
          const topPrediction = sequencePrediction.predictions[0];
          if (topPrediction.confidence === 'high' || topPrediction.confidence === 'very_high') {
            sections.push(`\n[BEHAVIORAL PREDICTION]`);
            sections.push(`• Likely next: ${topPrediction.state} (${topPrediction.reasoning})`);
          }
        }
      }
    }

    // ========================================================================
    // BETTER THAN HUMAN v4 - SUPERHUMAN CAPABILITIES
    // ========================================================================

    // 4. Avoidance Intelligence - What they're NOT saying
    const avoidanceContext = buildAvoidanceContext(userId);
    if (avoidanceContext) {
      sections.push('');
      sections.push(avoidanceContext);
    }

    // 5. Breakthrough Intelligence - Insights forming
    const breakthroughContext = buildBreakthroughContext(userId);
    if (breakthroughContext) {
      sections.push('');
      sections.push(breakthroughContext);
    }

    // 6. Pre-Trajectory Intelligence - Weather before the storm
    const trajectoryContext = buildPreTrajectoryContext(userId);
    if (trajectoryContext) {
      sections.push('');
      sections.push(trajectoryContext);
    }

    // 7. Life Phase Intelligence - Their personal season
    const phaseContext = buildPhaseContext(userId);
    if (phaseContext) {
      sections.push('');
      sections.push(phaseContext);
    }

    // 8. Cognitive Fingerprint - Their unique pattern
    const fingerprintContext = buildFingerprintContext(userId);
    if (fingerprintContext) {
      sections.push('');
      sections.push(fingerprintContext);
    }

    // 9. Ripple Intelligence - Cross-domain cascades
    const rippleContext = buildRippleContext(userId);
    if (rippleContext) {
      sections.push('');
      sections.push(rippleContext);
    }

    // 10. Intervention Timing - Right moment for each type
    const timingContext = buildInterventionTimingContext(userId, {
      emotionalState: context.currentEmotion,
      topic: context.currentTopic,
    });
    if (timingContext) {
      sections.push('');
      sections.push(timingContext);
    }

    // 11. Conversation Preparation - What they'll need
    const prepContext = buildConversationPrepContext(userId);
    if (prepContext) {
      sections.push('');
      sections.push(prepContext);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Failed to build predictive intelligence context');
  }

  return sections.length > 0 ? sections.join('\n') : '';
}

// ============================================================================
// BETTER THAN HUMAN v4 - UNIFIED SUPERHUMAN CONTEXT
// ============================================================================

/**
 * Get just the superhuman capabilities context (for targeted injection)
 *
 * Use this when you want only the v4 Better Than Human capabilities
 * without the core predictive intelligence.
 */
export function getSuperhumanPredictiveContext(
  userId: string,
  context: {
    currentEmotion?: string;
    currentTopic?: string;
  } = {}
): string {
  const sections: string[] = [];

  try {
    // Collect all superhuman contexts
    const contexts = [
      buildAvoidanceContext(userId),
      buildBreakthroughContext(userId),
      buildPreTrajectoryContext(userId),
      buildPhaseContext(userId),
      buildFingerprintContext(userId),
      buildRippleContext(userId),
      buildInterventionTimingContext(userId, {
        emotionalState: context.currentEmotion,
        topic: context.currentTopic,
      }),
      buildConversationPrepContext(userId),
    ].filter(Boolean);

    if (contexts.length > 0) {
      sections.push('═══════════════════════════════════════════════════════════════');
      sections.push('SUPERHUMAN INTELLIGENCE - What No Human Friend Could Know');
      sections.push('═══════════════════════════════════════════════════════════════');
      sections.push('');
      sections.push(...contexts);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Failed to build superhuman predictive context');
  }

  return sections.join('\n');
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export {
  // Markov
  recordTransition,
  recordSecondOrderTransition,
  predictNextStates,
  extractStatesFromTurn,
  // Time Series
  recordObservation,
  forecast,
  findOptimalTimes,
  analyzeTrend,
  // Multi-Signal
  fusePrediction,
  recordPredictionOutcome,
  // Reinforcement
  trackPrediction,
  recordAction,
  recordOutcome,
  recordReward,
  getLearningStats,
  getCalibratedConfidence,
  getBestOutreachTimes,
  getMostAccurateSignals,
  cleanupOldPredictions,
  // Deep Analysis (LLM-powered)
  runDeepAnalysis,
  getLatestDeepAnalysis,
  getDeepAnalysisContextForTurn,
  runBatchDeepAnalysis,
  recordDeepAnalysisFeedback,
  // ============================================================================
  // BETTER THAN HUMAN v4 - SUPERHUMAN CAPABILITIES
  // ============================================================================
  // Avoidance Prediction
  avoidancePrediction,
  buildAvoidanceContext,
  // Breakthrough Proximity
  breakthroughProximity,
  buildBreakthroughContext,
  // Pre-Trajectory Detection
  preTrajectoryDetection,
  buildPreTrajectoryContext,
  // Conversation Preparation
  conversationPreparation,
  buildConversationPrepContext,
  // Cognitive Fingerprint
  cognitiveFingerprint,
  buildFingerprintContext,
  // Ripple Effect Prediction
  rippleEffectPrediction,
  buildRippleContext,
  // Life Phase Prediction
  lifePhasePrediction,
  buildPhaseContext,
  // Intervention Timing
  interventionTiming,
  buildInterventionTimingContext,
  // Signal Integration
  signalIntegration,
  processTurnForSuperhumanLearning,
  recordInterventionFromTurn,
  recordBreakthroughMoment,
  recordLifeEvent,
  recordDecisionMade,
  recordStressObserved,
  recordVulnerabilityMoment,
  processSessionStart,
  processSessionEnd,
  // Superhuman Persistence
  superhumanPersistence,
  markSuperhumanDirty,
  flushSuperhumanState,
};

// Types
export type {
  SequencePrediction,
  ObservableState,
  Forecast,
  TimeSeriesPoint,
  FusedPrediction,
  PredictionTarget,
  SignalSource,
  LearningStats,
  OutcomeType,
  RewardSignal,
  // Deep Analysis types
  DeepAnalysisResult,
  SemanticInsight,
  PredictiveHypothesis,
  OutreachSuggestion,
  // ============================================================================
  // BETTER THAN HUMAN v4 - TYPES
  // ============================================================================
  // Avoidance Prediction
  AvoidanceSurfacingPrediction,
  AvoidableTopic,
  // Breakthrough Proximity
  BreakthroughProximity,
  BreakthroughType,
  // Pre-Trajectory Detection
  TrajectoryPrediction,
  EmotionalTrajectory,
  // Conversation Preparation
  ConversationPreparation,
  ConversationNeed,
  // Cognitive Fingerprint
  CognitiveFingerprint,
  DecisionStyle,
  // Ripple Effect Prediction
  RipplePrediction,
  LifeDomain,
  // Life Phase Prediction
  PhasePrediction,
  LifePhase,
  // Intervention Timing
  TimingRecommendation,
  InterventionType,
};
