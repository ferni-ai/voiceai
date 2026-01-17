/**
 * Speech Orchestrator
 *
 * Single entry point for all speech humanization and listening analysis.
 * Coordinates all speech services to produce natural, human-like voice output.
 *
 * This orchestrator follows clean architecture principles:
 * - Single responsibility for callers (one API to learn)
 * - Correct ordering of humanization steps guaranteed
 * - Easier testing and feature flags per step
 * - Centralized session management
 *
 * @module speech/orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getBackchannelEngine, signalNewTurn } from '../backchanneling/index.js';
import { canAddFeedback, recordFeedback, type FeedbackType } from '../feedback-coordinator.js';
import { getHumanListeningPipeline } from '../human-listening-pipeline.js';
import type {
  HumanListeningResult,
  QuickAnalysisResult,
} from '../human-listening-pipeline/types.js';
import {
  getAcknowledgmentPrefix,
  getCatchphraseWithSsml,
  getContextAwareThinkingFiller,
  normalizePersonaId,
} from '../persona-phrases.js';
import { hasVoiceDataLoaded, loadPersonaVoiceData } from '../persona-voice-loader.js';
import {
  processPartialTranscript as sesameProcessPartial,
  getPreparedResponse,
  type PartialTranscript,
} from '../sesame-inspired/index.js';
import type {
  AnticipatedResult,
  AnticipationContext,
  BackchannelRequest,
  BackchannelResponse,
  HumanizationOptions,
  HumanizedResponse,
  ListeningAnalysisOptions,
  ListeningAnalysisResult,
  SpeechOrchestratorContext,
} from './types.js';

const log = createLogger({ module: 'SpeechOrchestrator' });

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

const DEFAULT_HUMANIZATION_OPTIONS: HumanizationOptions = {
  applyPersonaFingerprint: true,
  applyEmotionArcs: true,
  applyDynamicPauses: true,
  applySpeedVariation: true,
  applyDisfluencies: false, // Conservative default
  applyMicroReactions: true,
  applyContextualLaughter: false, // Opt-in
  applyAcknowledgmentPrefix: true,
  applyCatchphrases: false, // Sparse usage
};

// Map our feedback types to the FeedbackType union
const FEEDBACK_TYPE_MAP: Record<string, FeedbackType> = {
  acknowledgmentPrefix: 'prefix',
  catchphrase: 'filler', // Use filler as closest match
  backchannel: 'backchannel',
  laugh: 'laugh',
};

// ============================================================================
// SPEECH ORCHESTRATOR CLASS
// ============================================================================

/**
 * Central orchestrator for all speech humanization
 */
export class SpeechOrchestrator {
  private readonly sessionId: string;
  private personaId: string;
  private turnNumber = 0;
  private voiceDataLoaded = false;

  constructor(sessionId: string, personaId = 'ferni') {
    this.sessionId = sessionId;
    this.personaId = normalizePersonaId(personaId);
  }

  /**
   * Initialize the orchestrator (preload persona voice data)
   */
  async initialize(): Promise<void> {
    if (!hasVoiceDataLoaded(this.personaId)) {
      await loadPersonaVoiceData(this.personaId);
    }
    this.voiceDataLoaded = true;
    log.debug(
      { sessionId: this.sessionId, personaId: this.personaId },
      'SpeechOrchestrator initialized'
    );
  }

  /**
   * Switch to a different persona
   */
  async switchPersona(personaId: string): Promise<void> {
    this.personaId = normalizePersonaId(personaId);
    if (!hasVoiceDataLoaded(this.personaId)) {
      await loadPersonaVoiceData(this.personaId);
    }
    log.debug({ sessionId: this.sessionId, personaId: this.personaId }, 'Switched persona');
  }

  /**
   * Signal start of a new turn
   */
  newTurn(): void {
    this.turnNumber++;
    signalNewTurn(this.sessionId);
  }

  /**
   * Get current turn number
   */
  getTurnNumber(): number {
    return this.turnNumber;
  }

  // ==========================================================================
  // MAIN HUMANIZATION API
  // ==========================================================================

  /**
   * Humanize a response text with all appropriate enhancements
   *
   * This is the main entry point for making agent speech sound natural.
   * It applies persona fingerprints, emotion arcs, dynamic pauses, and more.
   *
   * @param text - Raw response text from LLM
   * @param context - Conversation context
   * @param options - Humanization options (optional)
   * @returns Humanized response with SSML
   */
  async humanize(
    text: string,
    context: Partial<SpeechOrchestratorContext>,
    options: Partial<HumanizationOptions> = {}
  ): Promise<HumanizedResponse> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_HUMANIZATION_OPTIONS, ...options };
    const appliedFeatures: string[] = [];

    // Build full context
    const fullContext: SpeechOrchestratorContext = {
      sessionId: this.sessionId,
      personaId: this.personaId,
      turnNumber: context.turnNumber ?? this.turnNumber,
      topicWeight: context.topicWeight ?? 'medium',
      userEmotion: context.userEmotion,
      isEmotionalMoment: context.isEmotionalMoment,
      recentUserContent: context.recentUserContent,
      userWPM: context.userWPM,
    };

    let ssml = text;
    let microReaction: string | undefined;
    let acknowledgmentPrefix: string | undefined;
    let catchphrase: string | undefined;

    // 1. Check for prepared anticipatory response
    const prepared = getPreparedResponse(this.sessionId);
    let speedMultiplier = 1.0;
    let pauseMultiplier = 1.0;
    let emotion: string | undefined;

    if (prepared && prepared.confidence > 0.5) {
      speedMultiplier = prepared.speedMultiplier;
      pauseMultiplier = prepared.pauseMultiplier;
      emotion = prepared.anticipatedEmotion ?? undefined;

      if (opts.applyMicroReactions && prepared.microReactionSsml) {
        microReaction = prepared.microReactionSsml;
        appliedFeatures.push('anticipatory_micro_reaction');
      }
    }

    // 2. Apply acknowledgment prefix (if appropriate)
    if (opts.applyAcknowledgmentPrefix && this.shouldAddAcknowledgment(fullContext)) {
      const mood = this.determineAcknowledgmentMood(fullContext);
      acknowledgmentPrefix = getAcknowledgmentPrefix(this.personaId, mood);
      if (acknowledgmentPrefix) {
        ssml = acknowledgmentPrefix + ssml;
        appliedFeatures.push('acknowledgment_prefix');
        recordFeedback(this.sessionId, FEEDBACK_TYPE_MAP.acknowledgmentPrefix);
      }
    }

    // 3. Apply catchphrase (sparingly)
    if (opts.applyCatchphrases && this.shouldAddCatchphrase(fullContext)) {
      catchphrase = getCatchphraseWithSsml(this.personaId) ?? undefined;
      if (catchphrase) {
        // Append catchphrase to end
        ssml = ssml.trim() + ' ' + catchphrase;
        appliedFeatures.push('catchphrase');
        recordFeedback(this.sessionId, FEEDBACK_TYPE_MAP.catchphrase);
      }
    }

    // 4. Add micro-reaction prefix if we have one
    if (microReaction) {
      ssml = microReaction + ssml;
    }

    const processingTimeMs = Date.now() - startTime;

    log.debug(
      {
        sessionId: this.sessionId,
        appliedFeatures,
        processingTimeMs,
        speedMultiplier,
      },
      'Response humanized'
    );

    return {
      ssml,
      originalText: text,
      appliedFeatures,
      metadata: {
        speedMultiplier,
        pauseMultiplier,
        emotion,
        microReaction,
        acknowledgmentPrefix,
        catchphrase,
        processingTimeMs,
      },
    };
  }

  // ==========================================================================
  // LISTENING ANALYSIS API
  // ==========================================================================

  /**
   * Analyze user speech to understand emotional undercurrent (full analysis)
   *
   * Use this for comprehensive analysis at turn boundaries.
   *
   * @param options - Analysis options including text and/or audio
   * @returns Comprehensive listening analysis
   */
  async analyzeFull(options: ListeningAnalysisOptions): Promise<ListeningAnalysisResult> {
    const startTime = Date.now();

    const pipeline = getHumanListeningPipeline(this.sessionId);

    const result = await pipeline.analyze({
      sessionId: this.sessionId,
      text: options.text ?? '',
      turnNumber: this.turnNumber,
      audioSamples: options.audioSamples,
      sampleRate: options.sampleRate,
    });

    const processingTimeMs = Date.now() - startTime;

    return this.mapFullResult(result, processingTimeMs);
  }

  /**
   * Quick analysis for real-time use (text only, faster)
   *
   * Use this during conversation for quick decisions.
   *
   * @param text - User's text to analyze
   * @returns Quick analysis result
   */
  analyzeQuick(text: string): ListeningAnalysisResult {
    const startTime = Date.now();

    const pipeline = getHumanListeningPipeline(this.sessionId);
    const result = pipeline.quickAnalyze(text, this.turnNumber);

    const processingTimeMs = Date.now() - startTime;

    return this.mapQuickResult(result, processingTimeMs);
  }

  private mapFullResult(
    result: HumanListeningResult,
    processingTimeMs: number
  ): ListeningAnalysisResult {
    return {
      emotionalUndercurrent: {
        primary: result.emotionalUndercurrent?.primary ?? 'neutral',
        intensity: result.emotionalUndercurrent?.confidence ?? 0.5,
        trajectory: 'stable', // Not available in HumanListeningResult
      },
      agentGuidance: {
        shouldSlowDown: result.shouldSlowDown ?? false,
        shouldSoften: result.shouldGiveSpace ?? false,
        shouldAddPause: result.possibleDistress ?? false,
        shouldBackchannel: false,
        suggestedBackchannel: undefined,
      },
      ssmlSuggestions: {
        speedMultiplier: result.ssmlSuggestions?.speedMultiplier ?? 1.0,
        volumeMultiplier: result.ssmlSuggestions?.volumeLevel === 'softer' ? 0.8 : 1.0,
        pauseMultiplier: result.ssmlSuggestions?.pauseMultiplier ?? 1.0,
      },
      audio: result.audio
        ? {
            breathPattern: result.audio.breath?.dominantPattern,
            voiceStability: result.audio.tremor?.primaryType,
            energyLevel: result.audio.energyDynamics?.withinUtterance,
          }
        : undefined,
      text: result.text
        ? {
            cognitiveLoad: result.text.cognitiveLoad?.level === 'high' ? 0.8 : 0.4,
            hedgingLevel: result.text.hedging?.confidence ?? 0,
            selfSoothingDetected: result.text.selfSoothing?.detected ?? false,
          }
        : undefined,
      processingTimeMs,
    };
  }

  private mapQuickResult(
    result: QuickAnalysisResult,
    processingTimeMs: number
  ): ListeningAnalysisResult {
    return {
      emotionalUndercurrent: {
        primary: 'neutral',
        intensity: 0.5,
        trajectory: 'stable',
      },
      agentGuidance: {
        shouldSlowDown: result.shouldSlowDown,
        shouldSoften: result.hedging?.confidence > 0.5,
        shouldAddPause: result.cognitiveLoad?.level === 'high',
        shouldBackchannel: false,
      },
      ssmlSuggestions: {
        speedMultiplier: result.shouldSlowDown ? 0.9 : 1.0,
        volumeMultiplier: 1.0,
        pauseMultiplier: result.cognitiveLoad?.level === 'high' ? 1.2 : 1.0,
      },
      text: {
        cognitiveLoad: result.cognitiveLoad?.level === 'high' ? 0.8 : 0.4,
        hedgingLevel: result.hedging?.confidence ?? 0,
        selfSoothingDetected: result.selfSoothing?.detected ?? false,
      },
      processingTimeMs,
    };
  }

  // ==========================================================================
  // BACKCHANNELING API
  // ==========================================================================

  /**
   * Get a backchanneling decision
   *
   * @param request - Backchannel context
   * @returns Decision on whether to backchannel and what phrase to use
   */
  getBackchannel(request: BackchannelRequest): BackchannelResponse {
    const engine = getBackchannelEngine(this.sessionId, 'adaptive');

    const decision = engine.decide({
      sessionId: request.sessionId,
      personaId: request.personaId,
      userSpeechDuration: request.userSpeechDuration,
      currentPauseDuration: request.currentPauseDuration,
      userEmotion: request.userEmotion,
      topicWeight: request.topicWeight,
      turnCount: request.turnNumber,
      backchannelCountThisTurn: 0, // Engine tracks internally
      lastBackchannelTime: engine.getLastBackchannelTime(),
      isBreathPause: request.isBreathPause,
      isEmotionalMoment: request.isEmotionalMoment,
      recentContent: request.recentContent,
    });

    return {
      shouldEmit: decision.shouldEmit,
      phrase: decision.phrase,
      ssml: decision.ssml,
      timing: decision.timing,
      volumeRatio: decision.volumeRatio,
      allowOverlap: decision.allowOverlap,
      reason: decision.reason,
    };
  }

  // ==========================================================================
  // ANTICIPATION API
  // ==========================================================================

  /**
   * Process partial transcript for anticipatory response preparation
   *
   * Call this DURING user speech, not after, to prepare the response prosody
   * before they finish speaking. This is what makes the agent feel responsive.
   *
   * @param context - Partial transcript and context
   * @returns Anticipated response parameters
   */
  anticipate(context: AnticipationContext): AnticipatedResult | null {
    const partialTranscript: PartialTranscript = {
      text: context.partialTranscript,
      isSpeaking: true,
      tone: context.tone,
      userSpeechRate: context.userSpeechRate,
      silenceMs: context.silenceMs,
    };

    const prepared = sesameProcessPartial(context.sessionId, partialTranscript);

    if (!prepared) {
      return null;
    }

    return {
      anticipatedEmotion: prepared.anticipatedEmotion ?? 'neutral',
      microReactionSsml: prepared.microReactionSsml ?? null,
      speedMultiplier: prepared.speedMultiplier,
      volumeMultiplier: prepared.volumeMultiplier,
      pauseMultiplier: prepared.pauseMultiplier,
      softerDelivery: prepared.softerDelivery,
      confidence: prepared.confidence,
      reason: prepared.reason,
    };
  }

  // ==========================================================================
  // THINKING FILLER API
  // ==========================================================================

  /**
   * Get a natural thinking filler for LLM processing delays
   *
   * Uses ProcessingIntelligence for context-aware phrase composition.
   *
   * @param options - Optional context for phrase composition
   * @returns SSML-formatted thinking filler
   */
  getThinkingFiller(options?: {
    type?: 'thinking' | 'emotional' | 'tool_call' | 'memory_recall';
    weight?: 'light' | 'medium' | 'heavy';
    emotionalState?: { primary: string; intensity: number };
    hourOfDay?: number;
  }): string {
    return getContextAwareThinkingFiller(this.personaId, {
      type: options?.type ?? 'thinking',
      weight: options?.weight ?? 'medium',
      emotionalState: options?.emotionalState,
      hourOfDay: options?.hourOfDay ?? new Date().getHours(),
    });
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private shouldAddAcknowledgment(context: SpeechOrchestratorContext): boolean {
    // Check feedback budget
    if (
      !canAddFeedback(this.sessionId, FEEDBACK_TYPE_MAP.acknowledgmentPrefix, context.turnNumber)
    ) {
      return false;
    }

    // First turn always gets acknowledgment
    if (context.turnNumber <= 1) {
      return true;
    }

    // Heavy topics get acknowledgment
    if (context.topicWeight === 'heavy') {
      return true;
    }

    // Emotional moments get acknowledgment
    if (context.isEmotionalMoment) {
      return true;
    }

    // ~40% chance otherwise
    return Math.random() < 0.4;
  }

  private shouldAddCatchphrase(context: SpeechOrchestratorContext): boolean {
    // Check feedback budget
    if (!canAddFeedback(this.sessionId, FEEDBACK_TYPE_MAP.catchphrase, context.turnNumber)) {
      return false;
    }

    // Very sparse - ~10% chance on heavy topics only
    if (context.topicWeight === 'heavy' && Math.random() < 0.1) {
      return true;
    }

    // ~5% chance on positive outcomes
    if (
      context.userEmotion?.primary === 'joy' &&
      context.userEmotion.confidence > 0.6 &&
      Math.random() < 0.05
    ) {
      return true;
    }

    return false;
  }

  private determineAcknowledgmentMood(
    context: SpeechOrchestratorContext
  ): 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful' {
    if (!context.userEmotion) return 'neutral';

    if (context.topicWeight === 'heavy' || context.userEmotion.distressLevel > 0.5) {
      return 'empathetic';
    }

    if (context.userEmotion.primary === 'joy' && context.userEmotion.confidence > 0.6) {
      return 'excited';
    }

    if (context.userEmotion.intensity > 0.6) {
      return 'engaged';
    }

    if (
      context.recentUserContent &&
      /\?|what do you think|should I/i.test(context.recentUserContent)
    ) {
      return 'thoughtful';
    }

    return 'neutral';
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const orchestrators = new Map<string, SpeechOrchestrator>();

/**
 * Get or create a SpeechOrchestrator for a session
 */
export function getOrchestrator(sessionId: string, personaId = 'ferni'): SpeechOrchestrator {
  let orchestrator = orchestrators.get(sessionId);
  if (!orchestrator) {
    orchestrator = new SpeechOrchestrator(sessionId, personaId);
    orchestrators.set(sessionId, orchestrator);
  }
  return orchestrator;
}

/**
 * Reset orchestrator for a session
 */
export function resetOrchestrator(sessionId: string): void {
  orchestrators.delete(sessionId);
}

/**
 * Reset all orchestrators
 */
export function resetAllOrchestrators(): void {
  orchestrators.clear();
}

/**
 * Get active orchestrator count
 */
export function getActiveOrchestratorCount(): number {
  return orchestrators.size;
}
