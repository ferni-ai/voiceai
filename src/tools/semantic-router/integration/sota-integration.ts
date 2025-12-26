/**
 * SOTA (State of the Art) Feature Integration
 *
 * Wires the 4 SOTA semantic routing capabilities into the production pipeline:
 * 1. Dynamic Strategy Selection - Per-user optimal routing cascade
 * 2. User Segmentation - Cohort-based learning for cold-start
 * 3. Voice Prosody Integration - Real audio analysis -> routing
 * 4. Online Learning Loop - Continuous model improvement from corrections
 *
 * @module tools/semantic-router/integration/sota-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticRouterResult, ToolMatch } from '../types.js';

// SOTA Learning Systems
import {
  getDynamicStrategyEngine,
  type StrategySelection,
  type StrategyOutcome,
} from '../learning/dynamic-strategy.js';
import {
  getUserSegmentationEngine,
  type InteractionEvent,
} from '../learning/user-segmentation.js';
import { getOnlineLearningEngine } from '../learning/online-learning-loop.js';

// SOTA Voice Analysis
import {
  getProsodyRoutingEngine,
  type ProsodyRoutingAdjustment,
} from '../advanced/prosody-routing-integration.js';
import type { VoiceProsodySignals } from '../advanced/better-than-human.js';

const log = createLogger({ module: 'sota-integration' });

// ============================================================================
// TYPES
// ============================================================================

/** Context for SOTA-enhanced routing */
export interface SOTARoutingContext {
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  inputComplexity?: number;
  urgencySignal?: number;
  audioBuffer?: Float32Array;
  sampleRate?: number;
}

/** Result from SOTA-enhanced routing */
export interface SOTARoutingResult {
  /** Selected routing strategy */
  strategy: StrategySelection;
  /** Prosody-based adjustments */
  prosodyAdjustment: ProsodyRoutingAdjustment | null;
  /** User's cohort priors (for cold-start) */
  cohortPriors: {
    toolPreferences: Map<string, number>;
    strategyHint: string;
    inheritanceWeight: number;
  } | null;
  /** Combined confidence boost from SOTA systems */
  confidenceBoost: number;
  /** Whether this is a new user with limited data */
  isColdStart: boolean;
}

/** Outcome for tracking after tool execution */
export interface SOTAOutcome {
  userId: string;
  sessionId: string;
  toolId: string;
  toolCategory: string;
  wasCorrect: boolean;
  wasCorrected: boolean;
  correctedToToolId?: string;
  confidence: number;
  latencyMs: number;
  strategyUsed: string;
}

// ============================================================================
// PRE-ROUTING: APPLY SOTA ENHANCEMENTS
// ============================================================================

/**
 * Apply SOTA enhancements before routing decision.
 *
 * This should be called BEFORE routeUserInput() to:
 * 1. Select optimal routing strategy for this user
 * 2. Apply prosody signals from voice analysis
 * 3. Get cohort priors for cold-start users
 *
 * @param context - Routing context with user info and optional audio
 * @returns SOTA enhancements to apply to routing
 */
export async function applySOTAPreRouting(context: SOTARoutingContext): Promise<SOTARoutingResult> {
  const { userId, sessionId, inputComplexity, urgencySignal, audioBuffer, sampleRate } = context;

  try {
    // 1. Select optimal routing strategy for this user
    const strategyEngine = getDynamicStrategyEngine();
    const strategy = strategyEngine.selectStrategy(userId, {
      inputComplexity,
      urgencySignal,
    });

    // 2. Apply prosody analysis if audio is available
    let prosodyAnalysis: ReturnType<typeof getProsodyRoutingEngine.prototype.getFullAnalysis> | null =
      null;
    let emergencyDetected = false;
    if (audioBuffer) {
      try {
        const prosodyEngine = getProsodyRoutingEngine();
        // Process the audio chunk (3 args: userId, sessionId, samples)
        prosodyEngine.processAudio(userId, sessionId, audioBuffer);
        // Get current analysis
        prosodyAnalysis = prosodyEngine.getFullAnalysis(userId, sessionId);
        if (prosodyAnalysis) {
          // Check for emergency/crisis signals
          emergencyDetected =
            prosodyAnalysis.recentEmotionalState?.needsAttention === true ||
            prosodyAnalysis.allBoostedTools.some(
              (t: string) => t.includes('crisis') || t.includes('emergency')
            );
        }
      } catch (prosodyError) {
        log.debug({ error: String(prosodyError) }, 'Prosody analysis skipped');
      }
    }

    // 3. Get cohort priors for cold-start acceleration
    const segmentationEngine = getUserSegmentationEngine();
    const priors = segmentationEngine.getNewUserPriors(userId);
    const isColdStart = priors?.inheritanceWeight === 0;

    // Calculate combined confidence boost from SOTA systems
    let confidenceBoost = 0;
    if (emergencyDetected) {
      confidenceBoost += 0.2; // Emergency signals boost crisis tool confidence
    }
    if (priors && priors.inheritanceWeight > 0) {
      confidenceBoost += 0.1 * priors.inheritanceWeight; // Cohort knowledge boost
    }
    if (strategy.confidence > 0.7) {
      confidenceBoost += 0.05; // High strategy confidence adds small boost
    }

    log.debug(
      {
        userId,
        strategy: strategy.strategy,
        strategyConfidence: strategy.confidence,
        hasProsody: !!prosodyAnalysis,
        emergencyDetected,
        isColdStart,
        confidenceBoost,
      },
      'SOTA pre-routing applied'
    );

    return {
      strategy,
      prosodyAdjustment: prosodyAnalysis
        ? {
            originalMatches: [],
            adjustedMatches: [],
            boostedTools: prosodyAnalysis.allBoostedTools,
            suppressedTools: prosodyAnalysis.allSuppressedTools,
            emergencyDetected,
            prosodySignals: prosodyAnalysis.toolBoost.prosodySignals,
            prosodyConfidence: prosodyAnalysis.toolBoost.confidence,
            reason: prosodyAnalysis.toolBoost.reason,
          }
        : null,
      cohortPriors: priors
        ? {
            toolPreferences: priors.toolPriors,
            strategyHint: priors.strategyPrior,
            inheritanceWeight: priors.inheritanceWeight,
          }
        : null,
      confidenceBoost,
      isColdStart,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'SOTA pre-routing failed, using defaults');
    return {
      strategy: {
        strategy: 'balanced',
        confidence: 0.5,
        reason: 'SOTA systems unavailable',
        expectedLatencyMs: 50,
        expectedAccuracy: 0.8,
      },
      prosodyAdjustment: null,
      cohortPriors: null,
      confidenceBoost: 0,
      isColdStart: true,
    };
  }
}

/**
 * Apply SOTA confidence adjustments to routing matches.
 *
 * Modifies match confidences based on:
 * - Prosody signals (stress, urgency)
 * - Cohort preferences
 * - User's historical accuracy with specific tools
 *
 * @param matches - Raw routing matches
 * @param sotaResult - SOTA pre-routing result
 * @returns Adjusted matches with modified confidences
 */
export function applySOTAConfidenceAdjustments(
  matches: ToolMatch[],
  sotaResult: SOTARoutingResult
): ToolMatch[] {
  if (matches.length === 0) return matches;

  const adjustedMatches = matches.map((match) => {
    let adjustedConfidence = match.confidence;

    // Apply base confidence boost from SOTA analysis
    adjustedConfidence += sotaResult.confidenceBoost;

    // Apply cohort tool preferences
    if (sotaResult.cohortPriors && sotaResult.cohortPriors.toolPreferences.has(match.toolId)) {
      const cohortBoost = sotaResult.cohortPriors.toolPreferences.get(match.toolId)! * 0.1;
      adjustedConfidence += cohortBoost * sotaResult.cohortPriors.inheritanceWeight;
    }

    // Apply prosody-based adjustments
    if (sotaResult.prosodyAdjustment) {
      // Boost crisis tools if emergency detected
      if (
        sotaResult.prosodyAdjustment.emergencyDetected &&
        (match.toolId.includes('crisis') ||
          match.toolId.includes('emergency') ||
          match.toolId.includes('help'))
      ) {
        adjustedConfidence += 0.15;
      }

      // Boost tools that prosody analysis recommends
      if (sotaResult.prosodyAdjustment.boostedTools.includes(match.toolId)) {
        adjustedConfidence += 0.1 * sotaResult.prosodyAdjustment.prosodyConfidence;
      }

      // Suppress tools that prosody analysis discourages
      if (sotaResult.prosodyAdjustment.suppressedTools.includes(match.toolId)) {
        adjustedConfidence -= 0.1 * sotaResult.prosodyAdjustment.prosodyConfidence;
      }
    }

    // Clamp to valid range
    adjustedConfidence = Math.min(1, Math.max(0, adjustedConfidence));

    return {
      ...match,
      confidence: adjustedConfidence,
      metadata: {
        ...match.metadata,
        sotaAdjusted: true,
        originalConfidence: match.confidence,
      },
    };
  });

  // Re-sort by adjusted confidence
  return adjustedMatches.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// POST-ROUTING: RECORD OUTCOMES FOR LEARNING
// ============================================================================

/**
 * Record routing outcome for SOTA learning systems.
 *
 * Call this AFTER tool execution to:
 * 1. Update dynamic strategy beliefs (Thompson Sampling)
 * 2. Record interaction for user segmentation
 * 3. Feed correction signals to online learning
 *
 * @param outcome - Outcome of the tool execution
 * @param routeResult - Original routing result for context
 */
export function recordSOTAOutcome(
  outcome: SOTAOutcome,
  routeResult?: SemanticRouterResult
): void {
  const {
    userId,
    sessionId,
    toolId,
    toolCategory,
    wasCorrect,
    wasCorrected,
    correctedToToolId,
    confidence,
    latencyMs,
    strategyUsed,
  } = outcome;

  try {
    // 1. Update dynamic strategy beliefs
    const strategyEngine = getDynamicStrategyEngine();
    const strategyOutcome: StrategyOutcome = {
      strategy: strategyUsed as 'fast' | 'balanced' | 'accurate' | 'adaptive',
      latencyMs,
      wasCorrect,
      toolExecuted: true,
      timestamp: Date.now(),
    };
    strategyEngine.recordOutcome(userId, strategyOutcome);

    // 2. Record interaction for user segmentation
    const segmentationEngine = getUserSegmentationEngine();
    const interaction: InteractionEvent = {
      userId,
      sessionId,
      timestamp: Date.now(),
      toolId,
      toolCategory,
      wasCorrect,
      confidence,
      latencyMs,
      messageLength: 0, // Not available at this point
      isQuestion: false, // Not available at this point
      isFollowup: false, // Not available at this point
    };
    segmentationEngine.recordInteraction(interaction);

    // 3. Feed correction to online learning if applicable
    if (wasCorrected && correctedToToolId) {
      const learningEngine = getOnlineLearningEngine();
      // Use addCorrection which handles embedding generation internally
      learningEngine
        .addCorrection({
          query: '', // Query not available at this point
          predictedToolId: toolId,
          actualToolId: correctedToToolId,
          confidence,
          timestamp: Date.now(),
          source: 'explicit' as const,
          metadata: { userId, sessionId },
        })
        .catch((err) => {
          log.debug({ error: String(err) }, 'Failed to add correction to learning engine');
        });

      log.info(
        { userId, originalTool: toolId, correctedTo: correctedToToolId },
        'Correction recorded for online learning'
      );
    }

    log.debug(
      {
        userId,
        toolId,
        wasCorrect,
        wasCorrected,
        strategyUsed,
        latencyMs,
      },
      'SOTA outcome recorded'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record SOTA outcome');
  }
}

/**
 * Record an implicit correction (user rephrased and got different tool).
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param originalToolId - First tool that was routed to
 * @param correctedToolId - Tool that was routed to after rephrasing
 * @param originalQuery - Original user query
 * @param correctedQuery - Rephrased query
 */
export function recordImplicitCorrection(
  userId: string,
  sessionId: string,
  originalToolId: string,
  correctedToolId: string,
  originalQuery: string,
  _correctedQuery: string
): void {
  try {
    const learningEngine = getOnlineLearningEngine();
    // Use addCorrection which handles embedding generation internally
    learningEngine
      .addCorrection({
        query: originalQuery,
        predictedToolId: originalToolId,
        actualToolId: correctedToolId,
        confidence: 0.5, // Implicit corrections have medium confidence
        timestamp: Date.now(),
        source: 'implicit' as const,
        metadata: { userId, sessionId },
      })
      .catch((err) => {
        log.debug({ error: String(err) }, 'Failed to add implicit correction to learning engine');
      });

    log.info(
      {
        userId,
        originalTool: originalToolId,
        correctedTool: correctedToolId,
        originalQuery: originalQuery.slice(0, 50),
      },
      'Implicit correction recorded'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record implicit correction');
  }
}

// ============================================================================
// PROSODY INTEGRATION
// ============================================================================

/**
 * Start prosody tracking for a user session.
 *
 * Call this at session start to begin accumulating baseline prosody data.
 * Note: The prosody engine tracks sessions automatically when processAudio is called.
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 */
export function startProsodyTracking(userId: string, sessionId: string): void {
  // Prosody engine tracks sessions automatically - this is just for logging
  log.debug({ userId, sessionId }, 'Prosody tracking session registered');
}

/**
 * End prosody tracking for a user session.
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 */
export function endProsodyTracking(userId: string, sessionId: string): void {
  try {
    const prosodyEngine = getProsodyRoutingEngine();
    prosodyEngine.clearSession(userId, sessionId);
    log.debug({ userId, sessionId }, 'Prosody tracking ended');
  } catch (error) {
    log.debug({ error: String(error) }, 'Prosody tracking cleanup skipped');
  }
}

/**
 * Feed audio chunk to prosody analysis.
 *
 * Call this for each audio chunk received from the user's microphone.
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param audioBuffer - Audio samples (Float32Array)
 * @param _sampleRate - Sample rate in Hz (not currently used by prosody engine)
 */
export function feedAudioToProsody(
  userId: string,
  sessionId: string,
  audioBuffer: Float32Array,
  _sampleRate: number
): void {
  try {
    const prosodyEngine = getProsodyRoutingEngine();
    // processAudio takes 3 args: userId, sessionId, samples
    prosodyEngine.processAudio(userId, sessionId, audioBuffer);
  } catch (error) {
    // Prosody processing is best-effort, don't log spam
  }
}

// ============================================================================
// STATS & MONITORING
// ============================================================================

/** Get SOTA system statistics */
export function getSOTAStats(): {
  dynamicStrategy: { totalUsers: number; avgSamplesPerUser: number };
  userSegmentation: { totalUsers: number; assignedUsers: number };
  onlineLearning: { pendingExamples: number; adjustedTools: number };
  prosodyRouting: { enabled: boolean };
} {
  try {
    const strategyEngine = getDynamicStrategyEngine();
    const segmentationEngine = getUserSegmentationEngine();
    const learningEngine = getOnlineLearningEngine();
    const prosodyEngine = getProsodyRoutingEngine();

    const strategyStats = strategyEngine.getGlobalStats();
    const segmentationStats = segmentationEngine.getStats();
    const learningStats = learningEngine.getStats();

    return {
      dynamicStrategy: {
        totalUsers: strategyStats.totalUsers,
        avgSamplesPerUser: strategyStats.avgSamplesPerUser,
      },
      userSegmentation: {
        totalUsers: segmentationStats.totalUsers,
        assignedUsers: segmentationStats.assignedUsers,
      },
      onlineLearning: {
        pendingExamples: learningStats.pendingExamples,
        adjustedTools: learningStats.adjustedTools,
      },
      prosodyRouting: {
        enabled: prosodyEngine !== null,
      },
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get SOTA stats');
    return {
      dynamicStrategy: { totalUsers: 0, avgSamplesPerUser: 0 },
      userSegmentation: { totalUsers: 0, assignedUsers: 0 },
      onlineLearning: { pendingExamples: 0, adjustedTools: 0 },
      prosodyRouting: { enabled: false },
    };
  }
}
