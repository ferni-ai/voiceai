/**
 * Advanced Humanization System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module orchestrates all advanced humanization features to create
 * natural, human-like conversations. It coordinates:
 *
 * - **Self-Correction**: Natural restarts and refinements
 * - **Disfluencies**: Strategic "um", "well", "you know"
 * - **Phonetic Mirroring**: Match user's speech patterns
 * - **Catching Yourself**: Meta-awareness moments
 *
 * The key insight: humans don't speak perfectly. These imperfections
 * make speech feel authentic and create subconscious rapport.
 *
 * @module @ferni/humanization
 */

import { createLogger } from '../../utils/safe-logger.js';

import { seededChance } from '../utils/rng.js';

// Shared detection utilities
import {
  classifyTopicWeight,
  detectAdviceGiving as sharedDetectAdviceGiving,
  detectEmotionalContent as sharedDetectEmotionalContent,
} from '../utils/detection.js';

// Sub-modules
import {
  SelfCorrectionEngine,
  getSelfCorrectionEngine,
  resetSelfCorrectionEngine,
} from './self-correction.js';

import {
  DisfluencyEngine,
  getDisfluencyEngine,
  resetDisfluencyEngine,
} from './disfluency-injection.js';

import {
  PhoneticMirroringEngine,
  getPhoneticMirroringEngine,
  resetPhoneticMirroringEngine,
} from './phonetic-mirroring.js';

import {
  CatchingYourselfEngine,
  getCatchingYourselfEngine,
  resetCatchingYourselfEngine,
} from './catching-yourself.js';

// Phase 2: Session Dynamics
import {
  VocalFatigueEngine,
  getVocalFatigueEngine,
  resetVocalFatigueEngine,
} from './vocal-fatigue.js';

import {
  SessionDynamicsEngine,
  getSessionDynamicsEngine,
  resetSessionDynamicsEngine,
} from './session-dynamics.js';

import {
  ComfortProgressionEngine,
  getComfortProgressionEngine,
  resetComfortProgressionEngine,
} from './comfort-progression.js';

// Phase 3: Advanced Listening
import { VoicePrintEngine, getVoicePrintEngine, resetVoicePrintEngine } from './voice-print.js';

import {
  AmbientAwarenessEngine,
  getAmbientAwarenessEngine,
  resetAmbientAwarenessEngine,
} from './ambient-awareness.js';

// Phase 4: Emotional Leadership
import {
  EmotionalLeadingEngine,
  getEmotionalLeadingEngine,
  resetEmotionalLeadingEngine,
} from './emotional-leading.js';

import {
  BreathingSyncEngine,
  getBreathingSyncEngine,
  resetBreathingSyncEngine,
} from './breathing-sync.js';

// Phase 5: Cross-Session Intelligence
import { CrossSessionVoiceEngine, getCrossSessionVoiceEngine } from './cross-session-voice.js';

// Phase 6: Voice Pattern Learning (cross-session preference learning)
import {
  getVoicePatternEngine,
  resetVoicePatternEngine,
} from './voice-pattern-learning.js';

// Phase 7: Rapport Scoring (conversational health tracking)
import { resetRapportScorer } from '../rapport/index.js';

// Types
import type { HumanizationConfig, HumanizationContext, HumanizedResponseResult } from './types.js';

// Analytics & Config (for orchestrator use)
import { getHumanizationAnalytics } from './analytics.js';
import { getHumanizationConfig } from './config.js';

// Re-export all modules
export * from './ambient-awareness.js';
export * from './breathing-sync.js';
export * from './catching-yourself.js';
export * from './comfort-progression.js';
export * from './cross-session-voice.js';
export * from './disfluency-injection.js';
export * from './emotional-leading.js';
export * from './phonetic-mirroring.js';
export * from './self-correction.js';
export * from './session-dynamics.js';
export * from './types.js';
export * from './vocal-fatigue.js';
export * from './voice-print.js';

// Rapport scoring - conversational health tracking
export {
  getActiveRapportScorerCount,
  getAvailableStrategies,
  getRapportScorer,
  getStrategyContextInjection,
  getStrategyTtsAdjustments,
  RAPPORT_CONFIG,
  RapportScorer,
  rapportScorer,
  resetRapportScorer,
  selectRepairStrategy,
  type EngagementObservation,
  type EmotionalAlignmentObservation,
  type FlowContinuityObservation,
  type InterruptionObservation,
  type RapportLevel,
  type RapportScore,
  type RapportScorerState,
  type RapportSignal,
  type RepairState,
  type RepairStrategy,
  type RepairStrategyType,
  type TrustSignalObservation,
  type TurnBalanceObservation,
  type TurnObservation,
} from '../rapport/index.js';

// Voice pattern learning - cross-session preference learning
export {
  getActiveVoicePatternEngineCount,
  getCurrentTimeOfDay,
  getRecommendedAgentWpm,
  getRecommendedTurnGap,
  getVoicePatternEngine,
  getVoicePatterns,
  initializeVoicePatterns,
  loadVoicePatterns,
  persistVoicePatterns,
  recordVoiceObservation,
  resetVoicePatternEngine,
  saveVoicePatterns,
  voicePatternLearning,
  VOICE_PATTERN_CONFIG,
  type TimeOfDay,
  type TimeOfDayPattern,
  type VoiceObservation,
  type VoicePatternData,
  type VoicePatternEngine,
} from './voice-pattern-learning.js';

// Prosody bridge - connects voice agent audio to humanization
export {
  cleanupProsodyBridge,
  getBridgeState,
  getCrossSessionInsight,
  getVoiceStateInsight,
  inferAmbientFromProsody,
  initProsodyBridge,
  processProsodyForHumanization,
  prosodyToBreathPattern,
  prosodyToVoiceSnapshot,
  type BridgeState,
} from './prosody-bridge.js';

// Persistence - save/load humanization state
export {
  clearHumanizationData,
  initializeFromPersistence,
  loadAllHumanizationData,
  loadComfortState,
  loadCrossSessionMemory,
  loadVoicePrint,
  persistOnSessionEnd,
  saveAllHumanizationData,
  saveComfortState,
  saveCrossSessionMemory,
  saveVoicePrint,
  type HumanizationPersistenceBundle,
} from './persistence.js';

// Analytics - track humanization performance
export {
  getHumanizationAnalytics,
  humanizationAnalytics,
  resetHumanizationAnalytics,
  type FeatureStats,
  type GlobalAnalytics,
  type HumanizationEvent,
  type HumanizationEventType,
  type HumanizationFeature,
  type SessionAnalytics,
} from './analytics.js';

// Configuration - tunable thresholds and probabilities
export {
  CONSERVATIVE_CONFIG,
  DEFAULT_HUMANIZATION_CONFIG,
  EXPRESSIVE_CONFIG,
  MINIMAL_CONFIG,
  getHumanizationConfig,
  humanizationConfig,
  resetHumanizationConfig,
  type HumanizationConfig,
} from './config.js';

// Voice agent integration - import specific exports to avoid conflicts
export {
  applyBreathingSync,
  createVoiceSnapshot,
  detectVoiceState,
  getAmbientAcknowledgment,
  getAmbientContext,
  getBreathingSyncAdjustments,
  getConversationPhase,
  getCrossSessionAcknowledgment,
  getEmotionalLeadingGuidance,
  getEngineStates,
  getPhaseBehavior,
  getSessionState,
  humanizeResponse,
  isBehaviorUnlocked,
  markCrossSessionAcknowledged,
  onSessionEnd,
  onSessionStart,
  processUserMessage,
  recordComfortEvent,
  simulateBreathFromEmotion,
  type HumanizationSessionState,
} from './voice-agent-integration.js';

const logger = createLogger({ module: 'Humanization' });

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationEngines {
  // Phase 1: Natural Imperfection
  selfCorrection: SelfCorrectionEngine;
  disfluency: DisfluencyEngine;
  phoneticMirroring: PhoneticMirroringEngine;
  catchingYourself: CatchingYourselfEngine;
  // Phase 2: Session Dynamics
  vocalFatigue: VocalFatigueEngine;
  sessionDynamics: SessionDynamicsEngine;
  comfortProgression: ComfortProgressionEngine;
  // Phase 3: Advanced Listening
  voicePrint: VoicePrintEngine;
  ambientAwareness: AmbientAwarenessEngine;
  // Phase 4: Emotional Leadership
  emotionalLeading: EmotionalLeadingEngine;
  breathingSync: BreathingSyncEngine;
  // Phase 5: Cross-Session Intelligence
  crossSessionVoice: CrossSessionVoiceEngine;
}

export interface HumanizationOrchestratorConfig {
  /** Maximum total humanizations per response */
  maxPerResponse: number;

  /** Maximum total humanizations per session */
  maxPerSession: number;

  /** Feature-specific configs */
  features: Partial<HumanizationConfig>;

  /** Debug mode - logs all decisions */
  debug: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_ORCHESTRATOR_CONFIG: HumanizationOrchestratorConfig = {
  maxPerResponse: 2, // Don't over-humanize
  maxPerSession: 15,
  features: {},
  debug: false,
};

// ============================================================================
// HUMANIZATION ORCHESTRATOR
// ============================================================================

export class HumanizationOrchestrator {
  private sessionId: string;
  private userId: string;
  private engines: HumanizationEngines;
  private config: HumanizationOrchestratorConfig;
  private sessionHumanizationCount = 0;
  private currentTurn = 0;

  constructor(
    sessionId: string,
    config: Partial<HumanizationOrchestratorConfig> = {},
    userId?: string
  ) {
    this.sessionId = sessionId;
    this.userId = userId || sessionId; // Fallback to sessionId if no userId
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.engines = {
      // Phase 1: Natural Imperfection
      selfCorrection: getSelfCorrectionEngine(sessionId),
      disfluency: getDisfluencyEngine(sessionId),
      phoneticMirroring: getPhoneticMirroringEngine(sessionId),
      catchingYourself: getCatchingYourselfEngine(sessionId),
      // Phase 2: Session Dynamics
      vocalFatigue: getVocalFatigueEngine(sessionId),
      sessionDynamics: getSessionDynamicsEngine(sessionId),
      comfortProgression: getComfortProgressionEngine(sessionId),
      // Phase 3: Advanced Listening
      voicePrint: getVoicePrintEngine(this.userId),
      ambientAwareness: getAmbientAwarenessEngine(sessionId),
      // Phase 4: Emotional Leadership
      emotionalLeading: getEmotionalLeadingEngine(sessionId),
      breathingSync: getBreathingSyncEngine(sessionId),
      // Phase 5: Cross-Session Intelligence
      crossSessionVoice: getCrossSessionVoiceEngine(this.userId),
    };

    logger.debug({ sessionId, userId: this.userId }, '🎭 HumanizationOrchestrator initialized');
  }

  /**
   * Record a user message for learning
   */
  recordUserMessage(message: string): void {
    const wordCount = message.split(/\s+/).length;

    // Learn phonetic patterns
    this.engines.phoneticMirroring.analyzeMessage(message);

    // Update catching yourself metrics
    this.engines.catchingYourself.recordUserMessage(wordCount);
  }

  /**
   * Apply humanization to a response
   *
   * This is the main entry point for humanizing agent responses.
   */
  humanize(
    response: string,
    context: Omit<HumanizationContext, 'responseText' | 'responseWordCount'>
  ): HumanizedResponseResult {
    this.currentTurn = context.turnCount;

    // Get global config for probability thresholds
    const globalConfig = getHumanizationConfig().getConfig();

    // Check if humanization is globally enabled
    if (!globalConfig.enabled) {
      return {
        original: response,
        text: response,
        ssml: response,
        appliedHumanizations: [],
        skippedFeatures: [{ feature: 'all', reason: 'Humanization disabled' }],
      };
    }

    // Build full context
    const fullContext: HumanizationContext = {
      ...context,
      responseText: response,
      responseWordCount: response.split(/\s+/).length,
      responseComplexity: this.estimateComplexity(response),
      isGivingAdvice: this.detectAdviceGiving(response),
      isEmotionalContent: context.isEmotionalContent ?? this.detectEmotionalContent(response),
    };

    const result: HumanizedResponseResult = {
      original: response,
      text: response,
      ssml: response,
      appliedHumanizations: [],
      skippedFeatures: [],
    };

    // Check if we've hit session limit
    if (this.sessionHumanizationCount >= this.config.maxPerSession) {
      result.skippedFeatures.push({
        feature: 'all',
        reason: 'Session humanization limit reached',
      });
      return result;
    }

    // Check comfort threshold for advanced features
    const comfortLevel = context.comfortLevel || 0.25;

    // Track how many humanizations we apply this response
    let appliedThisResponse = 0;

    // ========================================================================
    // 1. PHONETIC MIRRORING (always apply if learned)
    // ========================================================================
    const { text: mirroredText, appliedMirrorings } = this.engines.phoneticMirroring.mirror(
      result.text
    );
    if (appliedMirrorings.length > 0) {
      result.text = mirroredText;
      result.ssml = mirroredText; // Will be further processed
      result.appliedHumanizations.push({
        type: 'phonetic_mirroring',
        content: appliedMirrorings.join(', '),
        ssml: '',
        placement: 'opening', // Not really applicable
        reason: `Mirrored: ${appliedMirrorings.join(', ')}`,
      });
      // Phonetic mirroring doesn't count against limit (it's subtle)
    }

    // ========================================================================
    // 2. SELF-CORRECTION (opening)
    // ========================================================================
    if (
      appliedThisResponse < this.config.maxPerResponse &&
      globalConfig.features.selfCorrection &&
      comfortLevel >= globalConfig.comfortThresholds.allowSelfCorrection
    ) {
      // Apply config-based probability boost
      const baseProbability = globalConfig.probabilities.selfCorrection;
      const shouldTry = seededChance(`${this.sessionId}:${context.turnCount}:selfCorrection`, baseProbability + 0.5);

      if (shouldTry) {
        const selfCorrection = this.engines.selfCorrection.generate(fullContext);
        if (selfCorrection) {
          const applied = this.engines.selfCorrection.apply(result.text, selfCorrection);
          result.text = applied.text;
          result.ssml = applied.ssml;
          result.appliedHumanizations.push(selfCorrection);
          appliedThisResponse++;
          this.sessionHumanizationCount++;

          // Track in analytics
          getHumanizationAnalytics().recordApplied(this.sessionId, 'self_correction', {
            correctionType: selfCorrection.correctionType,
            turnCount: context.turnCount,
          });
        } else {
          result.skippedFeatures.push({
            feature: 'self_correction',
            reason:
              this.engines.selfCorrection.getState().usageCount >= 4
                ? 'Max per session'
                : 'Did not trigger',
          });
          getHumanizationAnalytics().recordSkipped(this.sessionId, 'self_correction');
        }
      } else {
        result.skippedFeatures.push({
          feature: 'self_correction',
          reason: 'Below comfort threshold or config probability',
        });
      }
    } else if (appliedThisResponse >= this.config.maxPerResponse) {
      result.skippedFeatures.push({
        feature: 'self_correction',
        reason: 'Max per response reached',
      });
    }

    // ========================================================================
    // 3. DISFLUENCY (opening, if no self-correction)
    // ========================================================================
    if (
      appliedThisResponse < this.config.maxPerResponse &&
      !result.appliedHumanizations.some((h) => h.type === 'self_correction') &&
      globalConfig.features.disfluency &&
      comfortLevel >= globalConfig.comfortThresholds.allowDisfluency
    ) {
      const baseProbability = globalConfig.probabilities.disfluency;
      const shouldTry = seededChance(`${this.sessionId}:${context.turnCount}:disfluency`, baseProbability + 0.5);

      if (shouldTry) {
        const disfluency = this.engines.disfluency.generate(fullContext);
        if (disfluency) {
          const applied = this.engines.disfluency.apply(result.text, disfluency);
          result.text = applied.text;
          result.ssml = applied.ssml;
          result.appliedHumanizations.push(disfluency);
          appliedThisResponse++;
          this.sessionHumanizationCount++;

          // Track in analytics
          getHumanizationAnalytics().recordApplied(this.sessionId, 'disfluency', {
            disfluencyType: disfluency.disfluencyType,
            turnCount: context.turnCount,
          });
        } else {
          result.skippedFeatures.push({
            feature: 'disfluency',
            reason: 'Did not trigger',
          });
          getHumanizationAnalytics().recordSkipped(this.sessionId, 'disfluency');
        }
      } else {
        result.skippedFeatures.push({
          feature: 'disfluency',
          reason: 'Below comfort threshold or config probability',
        });
      }
    }

    // ========================================================================
    // 4. CATCHING YOURSELF (closing)
    // ========================================================================
    if (
      appliedThisResponse < this.config.maxPerResponse &&
      globalConfig.features.catchingYourself
    ) {
      const baseProbability = globalConfig.probabilities.catchingYourself;
      const shouldTry = seededChance(`${this.sessionId}:${context.turnCount}:catchingYourself`, baseProbability + 0.5);

      if (shouldTry) {
        // Update catching yourself state
        this.engines.catchingYourself.setCurrentTurn(context.turnCount);
        this.engines.catchingYourself.recordAgentResponse(
          fullContext.responseWordCount,
          context.recentTopics
        );

        const catching = this.engines.catchingYourself.generate(fullContext);
        if (catching) {
          const applied = this.engines.catchingYourself.apply(result.text, catching);
          result.text = applied.text;
          result.ssml = applied.ssml;
          result.appliedHumanizations.push(catching);
          appliedThisResponse++;
          this.sessionHumanizationCount++;

          // Track in analytics
          getHumanizationAnalytics().recordApplied(this.sessionId, 'catching_yourself', {
            turnCount: context.turnCount,
          });
        } else {
          result.skippedFeatures.push({
            feature: 'catching_yourself',
            reason: 'Did not trigger',
          });
          getHumanizationAnalytics().recordSkipped(this.sessionId, 'catching_yourself');
        }
      }
    }

    // ========================================================================
    // 5. PHASE 2: SESSION DYNAMICS
    // ========================================================================

    // Update session dynamics
    this.engines.sessionDynamics.update({
      turnCount: context.turnCount,
      userEnergy: context.userEnergy,
      topicWeight: this.detectTopicWeight(context.userMessage),
    });

    // Update vocal fatigue
    this.engines.vocalFatigue.update({
      turnCount: context.turnCount,
      topicWeight: this.detectTopicWeight(context.userMessage),
      userEmotion: context.userEmotion,
      userEnergy: context.userEnergy,
      responseWordCount: fullContext.responseWordCount,
      wasEmotionalSupport: fullContext.isEmotionalContent,
    });

    // Apply vocal fatigue to SSML
    if (this.engines.vocalFatigue.isSignificant()) {
      result.ssml = this.engines.vocalFatigue.applyToSsml(result.ssml);
      result.appliedHumanizations.push({
        type: 'vocal_fatigue',
        content: `Fatigue level: ${this.engines.vocalFatigue.getFatigueCategory()}`,
        ssml: '',
        placement: 'opening',
        reason: `Session ${this.engines.vocalFatigue.getState().sessionMinutes}min, fatigue ${(this.engines.vocalFatigue.getState().fatigueLevel * 100).toFixed(0)}%`,
      });
    }

    // ========================================================================
    // LOG RESULTS
    // ========================================================================
    if (this.config.debug || result.appliedHumanizations.length > 0) {
      logger.debug(
        {
          turn: context.turnCount,
          appliedCount: result.appliedHumanizations.length,
          applied: result.appliedHumanizations.map((h) => h.type),
          sessionTotal: this.sessionHumanizationCount,
          phase: this.engines.sessionDynamics.getState().phase,
          comfort: this.engines.comfortProgression.getComfortLevel().toFixed(2),
          fatigue: this.engines.vocalFatigue.getState().fatigueLevel.toFixed(2),
        },
        '🎭 Humanization applied'
      );
    }

    return result;
  }

  /**
   * Record a comfort-building event
   */
  recordComfortEvent(event: string, turnCount: number): void {
    // This is a passthrough to the comfort engine
    // @ts-expect-error - event types are validated in the engine
    this.engines.comfortProgression.recordEvent(event, turnCount);
  }

  /**
   * Check if a behavior is unlocked at current comfort level
   */
  isBehaviorUnlocked(behaviorName: string): boolean {
    return this.engines.comfortProgression.isBehaviorUnlocked(behaviorName);
  }

  /**
   * Get current conversation phase
   */
  getConversationPhase(): string {
    return this.engines.sessionDynamics.getState().phase;
  }

  /**
   * Get phase-specific behavior guidance
   */
  getPhaseBehavior() {
    return this.engines.sessionDynamics.getPhaseBehavior();
  }

  /**
   * Get all engine states for debugging
   */
  getEngineStates(): Record<string, unknown> {
    return {
      // Phase 1
      selfCorrection: this.engines.selfCorrection.getState(),
      disfluency: this.engines.disfluency.getState(),
      phoneticMirroring: this.engines.phoneticMirroring.getProfile(),
      catchingYourself: this.engines.catchingYourself.getState(),
      // Phase 2
      vocalFatigue: this.engines.vocalFatigue.getState(),
      sessionDynamics: this.engines.sessionDynamics.getState(),
      comfortProgression: this.engines.comfortProgression.getState(),
      // Phase 3
      voicePrint: {
        calibrated: this.engines.voicePrint.isCalibrated(),
        progress: this.engines.voicePrint.getCalibrationProgress(),
      },
      ambientAwareness: this.engines.ambientAwareness.getCurrentContext(),
      // Phase 4
      emotionalLeading: this.engines.emotionalLeading.getState(),
      breathingSync: this.engines.breathingSync.getState(),
      // Phase 5
      crossSessionVoice: this.engines.crossSessionVoice.getHistorySummary(),
      // Orchestrator
      sessionTotal: this.sessionHumanizationCount,
      currentTurn: this.currentTurn,
    };
  }

  /**
   * Get emotional leading decision
   */
  getEmotionalLeadingDecision(
    userState: {
      valence: number;
      arousal: number;
      emotion: string;
      distressLevel: number;
      energy: 'high' | 'medium' | 'low';
      inCrisis: boolean;
    },
    userMessage: string
  ) {
    return this.engines.emotionalLeading.decideLeading(
      { ...userState, negativeSpiralIndicators: 0 },
      userMessage,
      {
        turnCount: this.currentTurn,
        comfortLevel: this.engines.comfortProgression.getComfortLevel(),
        recentTopics: [],
      }
    );
  }

  /**
   * Get ambient awareness context
   */
  getAmbientContext() {
    return this.engines.ambientAwareness.getCurrentContext();
  }

  /**
   * Get cross-session acknowledgment if available
   */
  getCrossSessionAcknowledgment(currentVoice: {
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchVariance: number;
    speechRate: number;
    pauseRate: number;
    avgPauseDuration: number;
    energyMean: number;
    energyVariance: number;
    breathiness: number;
    roughness: number;
    strain: number;
    valence: number;
    arousal: number;
    timestamp: Date;
  }) {
    return this.engines.crossSessionVoice.generateAcknowledgment(currentVoice);
  }

  /**
   * Reset all engines for new session
   */
  reset(): void {
    // Phase 1
    this.engines.selfCorrection.reset();
    this.engines.disfluency.reset();
    this.engines.phoneticMirroring.reset();
    this.engines.catchingYourself.reset();
    // Phase 2
    this.engines.vocalFatigue.reset();
    this.engines.sessionDynamics.reset();
    this.engines.comfortProgression.reset();
    // Phase 3 (session-based only)
    this.engines.voicePrint.resetSession();
    this.engines.ambientAwareness.reset();
    // Phase 4
    this.engines.emotionalLeading.reset();
    this.engines.breathingSync.reset();
    // Phase 5 - don't reset cross-session memory
    // Orchestrator
    this.sessionHumanizationCount = 0;
    this.currentTurn = 0;
    logger.debug({ sessionId: this.sessionId }, '🎭 HumanizationOrchestrator reset');
  }

  // ==========================================================================
  // TOPIC WEIGHT DETECTION (uses shared utilities)
  // ==========================================================================

  private detectTopicWeight(userMessage: string): 'light' | 'medium' | 'heavy' {
    return classifyTopicWeight(userMessage);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private estimateComplexity(text: string): number {
    let complexity = 0.3;

    const wordCount = text.split(/\s+/).length;
    if (wordCount > 50) complexity += 0.1;
    if (wordCount > 80) complexity += 0.15;
    if (wordCount > 120) complexity += 0.15;

    const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim()).length;
    if (sentenceCount > 2) complexity += 0.1;

    // Complex vocabulary
    if (/\b(however|therefore|furthermore|consequently)\b/i.test(text)) {
      complexity += 0.1;
    }

    return Math.min(1, complexity);
  }

  private detectAdviceGiving(text: string): boolean {
    return sharedDetectAdviceGiving(text);
  }

  private detectEmotionalContent(text: string): boolean {
    return sharedDetectEmotionalContent(text);
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const orchestrators = new Map<string, HumanizationOrchestrator>();

/**
 * Get or create a humanization orchestrator for a session
 */
export function getHumanizationOrchestrator(
  sessionId: string,
  config?: Partial<HumanizationOrchestratorConfig>,
  userId?: string
): HumanizationOrchestrator {
  if (!orchestrators.has(sessionId)) {
    orchestrators.set(sessionId, new HumanizationOrchestrator(sessionId, config, userId));
  }
  return orchestrators.get(sessionId)!;
}

/**
 * Reset humanization for a session
 */
export function resetHumanization(sessionId: string, userId?: string): void {
  const orchestrator = orchestrators.get(sessionId);
  if (orchestrator) {
    orchestrator.reset();
    orchestrators.delete(sessionId);
  }

  // Also reset individual engines
  // Phase 1
  resetSelfCorrectionEngine(sessionId);
  resetDisfluencyEngine(sessionId);
  resetPhoneticMirroringEngine(sessionId);
  resetCatchingYourselfEngine(sessionId);
  // Phase 2
  resetVocalFatigueEngine(sessionId);
  resetSessionDynamicsEngine(sessionId);
  resetComfortProgressionEngine(sessionId);
  // Phase 3
  if (userId) {
    resetVoicePrintEngine(userId);
  }
  resetAmbientAwarenessEngine(sessionId);
  // Phase 4
  resetEmotionalLeadingEngine(sessionId);
  resetBreathingSyncEngine(sessionId);
  // Phase 5 - don't reset cross-session by default
  // Phase 6 - Voice pattern learning (session-scoped engine)
  resetVoicePatternEngine(sessionId);
  // Phase 7 - Rapport scoring (conversational health)
  resetRapportScorer(sessionId);
}

/**
 * Reset all humanization instances
 */
export function resetAllHumanization(): void {
  for (const orchestrator of orchestrators.values()) {
    orchestrator.reset();
  }
  orchestrators.clear();
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

export default HumanizationOrchestrator;
