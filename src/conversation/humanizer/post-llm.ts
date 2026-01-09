/**
 * Post-LLM Processing
 *
 * Handles humanization after the LLM generates a response:
 * - Speech naturalization
 * - Deep humanization (mood, presence, reactions)
 * - Session intelligence modifications
 * - Better Than Human capabilities
 * - Vocal humanization
 *
 * @module @ferni/conversation/humanizer/post-llm
 */

import { createLogger } from '../../utils/safe-logger.js';
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';
import { sanitizeSsml } from '../../ssml/core.js';
import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';

// Conversation modules
import { getActiveListeningEngine } from '../active-listening.js';
import { getConversationalMemory } from '../conversational-memory.js';
import { applyDeliveryPacing, shouldApplyDeliveryPacing } from '../content-delivery-pacing.js';
import {
  applyDeepHumanization,
  getMoodTracker,
  type HumanizationContext as DeepContext,
} from '../deep-humanization/index.js';
import { getEmotionalArcTracker, type EmotionalResponse } from '../emotional-arc.js';
import {
  getHumanizationOrchestrator,
  humanizationAnalytics,
  humanizationConfig,
  type HumanizationContext as OrchestratorContext,
} from '../humanization/index.js';
import { getQuestionPatternEngine, type QuestionContext } from '../question-patterns.js';
import { getResponseDynamicsEngine } from '../response-dynamics.js';
import {
  getSessionIntelligence,
  type SessionIntelligenceContext,
  type SessionIntelligenceInsight,
} from '../session-intelligence.js';
import { getSilencePresenceEngine } from '../silence-presence.js';
import { getSpeechNaturalizer, type NaturalizationContext } from '../speech-naturalizer.js';
import {
  getBetterThanHuman,
  type BetterThanHumanContext,
  type BetterThanHumanInsight,
} from '../superhuman/index.js';
import { classifyTopicWeight } from '../utils/detection.js';
import {
  detectAdviceGiving,
  detectBreakthrough,
  detectDisengagement,
  detectEvidence,
  detectHighEngagement,
} from '../utils/detection.js';
import { detectUserEnergy, humanizeVocals, type VocalContext } from '../vocal-humanization.js';

// Local utilities
import type { HumanizationContext, HumanizedResponse, HumanizationSignals } from './types.js';
import {
  applySsmlEnhancements,
  createDeterministicTrigger,
  getComfortLevel,
  getTimeOfDay,
  mapRelationshipStage,
  shouldAddUncertainty,
  stripSsml,
} from './utils.js';

const log = createLogger({ module: 'PostLlmProcessor' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// POST-LLM PROCESSOR
// ============================================================================

/**
 * Processes responses after LLM generation
 */
export class PostLlmProcessor {
  private personaId: string;
  private sessionId: string;
  private userId?: string;
  private sessionCount: number;
  private sessionStartTime: number;

  // Engines
  private naturalizer = getSpeechNaturalizer();
  private listening = getActiveListeningEngine();
  private memory = getConversationalMemory();
  private questions = getQuestionPatternEngine();
  private emotional = getEmotionalArcTracker();
  private dynamics = getResponseDynamicsEngine();
  private silencePresence = getSilencePresenceEngine();

  // Tracking
  private lastResponseHadCallback = false;
  private lastSessionInsight: SessionIntelligenceInsight | null = null;
  private lastBetterThanHumanInsight: BetterThanHumanInsight | null = null;

  constructor(
    personaId: string,
    sessionId: string,
    userId?: string,
    sessionCount = 0,
    sessionStartTime?: number
  ) {
    this.personaId = personaId;
    this.sessionId = sessionId;
    this.userId = userId;
    this.sessionCount = sessionCount;
    this.sessionStartTime = sessionStartTime || Date.now();
  }

  /**
   * Get session duration in minutes
   */
  getSessionMinutes(): number {
    return Math.floor((Date.now() - this.sessionStartTime) / (1000 * 60));
  }

  /**
   * Get the last session insight
   */
  getLastSessionInsight(): SessionIntelligenceInsight | null {
    return this.lastSessionInsight;
  }

  /**
   * Get the last Better Than Human insight
   */
  getLastBetterThanHumanInsight(): BetterThanHumanInsight | null {
    return this.lastBetterThanHumanInsight;
  }

  /**
   * Synchronous humanization (basic features only)
   */
  humanizeResponse(rawResponse: string, context: HumanizationContext): HumanizedResponse {
    const appliedFeatures: string[] = [];
    let text = rawResponse;
    let ssml = rawResponse;
    const shouldTrigger = createDeterministicTrigger(this.sessionId, this.personaId);

    // Get emotional guidance
    const emotionalGuidance = this.emotional.getResponseRecommendation();

    // Get pacing
    const pacing = this.dynamics.getPacingAnalysis();

    // Update mood tracking
    const topicWeight = classifyTopicWeight(context.userMessage, context.userEmotion);
    getMoodTracker(this.personaId).update({
      userEmotion: context.userEmotion,
      topicWeight,
      userEngagement: context.userMessage.length > 100 ? 'high' : 'medium',
      turnCount: context.turnNumber,
    });

    // 1. Apply speech naturalization
    const naturalizationContext: NaturalizationContext = {
      emotion: context.userEmotion,
      topic: context.topic,
      isSeriousContext: context.isSeriousContext,
      turnNumber: context.turnNumber,
      randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:naturalize`,
    };

    text = this.naturalizer.naturalize(text, this.personaId, naturalizationContext);
    ssml = text;
    appliedFeatures.push('speech_naturalization');

    // 2. Try vocabulary mirroring
    const mirrored = this.listening.mirrorUserVocabulary(context.userMessage, text);
    if (mirrored) {
      text = mirrored.mirrored;
      ssml = text;
      appliedFeatures.push('vocabulary_mirroring');
    }

    // 3. Check for memory callback opportunity
    let memoryCallback: HumanizedResponse['memoryCallback'];
    if (context.turnNumber > 4 && shouldTrigger(context.turnNumber, 'memory_callback', 0.2)) {
      const callback = this.memory.getMemoryCallback(
        context.topic || 'general',
        context.turnNumber
      );
      if (callback) {
        memoryCallback = {
          text: callback.phrase,
          ssml: callback.ssml,
        };
        appliedFeatures.push('memory_callback');
        this.lastResponseHadCallback = true;
      }
    }

    // 4. Consider adding a follow-up question
    let followUpQuestion: HumanizedResponse['followUpQuestion'];
    if (
      !context.userMessage.includes('?') &&
      shouldTrigger(context.turnNumber, 'follow_up_question', 0.55)
    ) {
      const questionContext: QuestionContext = {
        topic: context.topic,
        userEmotion: context.userEmotion,
        previousUserStatement: context.userMessage,
        personaId: this.personaId,
        conversationDepth:
          context.turnNumber > 8 ? 'deep' : context.turnNumber > 4 ? 'medium' : 'surface',
        randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:followup:${context.userMessage}`,
      };
      const question = this.questions.generateQuestion(questionContext);
      followUpQuestion = {
        text: question.text,
        ssml: question.ssml,
      };
      appliedFeatures.push('follow_up_question');
    }

    // 5. Add hedging for uncertainty if appropriate
    if (shouldAddUncertainty(text, context, shouldTrigger)) {
      text = this.naturalizer.addUncertainty(text, this.personaId, 'medium', {
        randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:uncertainty`,
      });
      appliedFeatures.push('uncertainty_hedge');
    }

    // 6. Apply content delivery pacing for longer content
    if (shouldApplyDeliveryPacing(text)) {
      ssml = applyDeliveryPacing(text, {
        personaId: this.personaId,
        isDirectResponse: context.userMessage.includes('?'),
      });
      appliedFeatures.push('content_delivery_pacing');
    }

    // 7. Apply vocal humanization
    const vocalContext: VocalContext = {
      userEnergy: detectUserEnergy(context.userMessage),
      emotion: context.userEmotion,
      isQuestion: text.trim().endsWith('?'),
      isHeavyContent: context.isSeriousContext,
      turnNumber: context.turnNumber,
      isMeaningfulMoment: context.wasPersonalSharing,
      userMessage: context.userMessage,
      randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:vocal`,
    };
    const vocalResult = humanizeVocals(ssml, vocalContext);
    ssml = vocalResult.ssml;
    appliedFeatures.push(...vocalResult.appliedFeatures);

    // 8. Apply SSML enhancements based on emotional guidance
    ssml = applySsmlEnhancements(ssml, emotionalGuidance);

    // Record agent message
    this.memory.recordAgentMessage(text);
    this.dynamics.recordMessage('agent', text, context.topic ? [context.topic] : undefined);

    return {
      text: stripSsml(text),
      ssml: sanitizeSsml(ssml),
      appliedFeatures,
      emotionalGuidance,
      pacing: pacing.suggestedAgentPacing,
      memoryCallback,
      followUpQuestion,
    };
  }

  /**
   * Full async humanization with all capabilities
   */
  async humanizeResponseAsync(
    rawResponse: string,
    context: HumanizationContext
  ): Promise<HumanizedResponse> {
    // =========================================================================
    // SESSION INTELLIGENCE
    // =========================================================================
    const sessionIntelligence = getSessionIntelligence(this.sessionId, this.userId);

    const sessionContext: SessionIntelligenceContext = {
      sessionId: this.sessionId,
      userId: this.userId,
      turnCount: context.turnNumber,
      userMessage: context.userMessage,
      topic: context.topic,
      emotion: context.userEmotion,
      wasVulnerable: context.wasPersonalSharing,
      isSessionStart: context.turnNumber <= 1,
      engagementLevel: context.userMessage.length > 100 ? 0.8 : 0.5,
    };

    const insight = sessionIntelligence.analyze(sessionContext);
    this.lastSessionInsight = insight;

    if (insight.confidence > 0.6) {
      log.debug(
        {
          concernLevel: insight.concern.level,
          predictedNeed: insight.predictions.need.primaryNeed,
          modifications: insight.responseModifications.length,
          voiceState: insight.predictions.voiceState.state,
        },
        '🧠 Session insight applied'
      );
    }

    // First apply the standard humanization
    const baseResult = this.humanizeResponse(rawResponse, context);

    // Build deep humanization context
    const deepContext: DeepContext = {
      personaId: this.personaId,
      turnCount: context.turnNumber,
      sessionMinutes: this.getSessionMinutes(),
      currentHour: new Date().getHours(),
      userMessage: context.userMessage,
      lastAgentMessage: undefined,
      recentTopics: context.topic ? [context.topic] : [],
      relationshipStage: context.relationshipStage ?? 'acquaintance',
      sessionData: context.sessionData,
    };

    // Detect signals
    const signals: HumanizationSignals = {
      userPresentedEvidence: detectEvidence(context.userMessage),
      isBreakthroughMoment: detectBreakthrough(context.userMessage),
      isGivingAdvice: detectAdviceGiving(rawResponse),
      isDisengaged: detectDisengagement(context.userMessage),
      isHighlyEngaged: detectHighEngagement(context.userMessage),
    };

    // Emit signals to frontend
    this.emitSignals(signals);

    // Apply deep humanization
    let enhancedText = baseResult.text;
    let enhancedSsml = baseResult.ssml;
    const additionalFeatures: string[] = [];

    const deepResult = await applyDeepHumanization(enhancedText, deepContext);
    if (deepResult.appliedEffects.length > 0) {
      enhancedText = deepResult.text;
      const ssmlResult = await applyDeepHumanization(enhancedSsml, deepContext);
      enhancedSsml = ssmlResult.text;
      additionalFeatures.push(...deepResult.appliedEffects.map((e) => `deep_${e}`));
    }

    // Apply silence presence
    const silenceResult = this.applySilencePresence(enhancedText, enhancedSsml, context);
    enhancedText = silenceResult.text;
    enhancedSsml = silenceResult.ssml;
    if (silenceResult.feature) {
      additionalFeatures.push(silenceResult.feature);
    }

    // Apply Better Than Human
    const bthResult = this.applyBetterThanHuman(enhancedText, enhancedSsml, context);
    enhancedText = bthResult.text;
    enhancedSsml = bthResult.ssml;
    additionalFeatures.push(...bthResult.features);

    // Apply advanced humanization orchestrator
    const advResult = await this.applyAdvancedHumanization(
      enhancedText,
      enhancedSsml,
      context,
      signals
    );
    enhancedText = advResult.text;
    enhancedSsml = advResult.ssml;
    additionalFeatures.push(...advResult.features);

    // Apply session intelligence modifications
    if (insight.responseModifications.length > 0) {
      enhancedText = sessionIntelligence.applyModifications(enhancedText, insight);
      enhancedSsml = sessionIntelligence.applyModifications(enhancedSsml, insight);
      additionalFeatures.push(...insight.responseModifications.map((m) => `session_${m.type}`));

      log.debug(
        {
          modifications: insight.responseModifications.map((m) => m.type),
          approach: insight.responseGuidance.approach,
        },
        '🧠 Session intelligence modifications applied'
      );
    }

    // Add session intelligence opening if this is session start
    if (insight.suggestedOpening && context.turnNumber <= 1) {
      const firstSentenceEnd = enhancedText.search(/[.!?]\s/) + 1;
      if (firstSentenceEnd > 0) {
        enhancedText = `${insight.suggestedOpening} ${enhancedText.slice(firstSentenceEnd).trim()}`;
        enhancedSsml = `${insight.suggestedOpening} ${enhancedSsml.slice(firstSentenceEnd).trim()}`;
      }
      additionalFeatures.push('session_opening');
    }

    return {
      ...baseResult,
      text: stripSsml(enhancedText),
      ssml: sanitizeSsml(enhancedSsml),
      appliedFeatures: [...baseResult.appliedFeatures, ...additionalFeatures],
    };
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private emitSignals(signals: HumanizationSignals): void {
    if (signals.userPresentedEvidence) {
      void humanizationSignalEmitter.evidencePresented();
    }
    if (signals.isBreakthroughMoment) {
      void humanizationSignalEmitter.breakthrough(0.8);
    }
    if (signals.isDisengaged) {
      void humanizationSignalEmitter.disengagement();
    }
    if (signals.isHighlyEngaged) {
      void humanizationSignalEmitter.highEngagement(0.8);
    }
  }

  private applySilencePresence(
    text: string,
    ssml: string,
    context: HumanizationContext
  ): { text: string; ssml: string; feature?: string } {
    const topicWeight = classifyTopicWeight(context.userMessage, context.userEmotion);
    const silenceDecision = this.silencePresence.decideSilence({
      userMessage: context.userMessage,
      userEmotion: context.userEmotion,
      turnCount: context.turnNumber,
      wasPersonalSharing: context.wasPersonalSharing,
      conversationDepth:
        context.turnNumber > 8 ? 'deep' : context.turnNumber > 4 ? 'medium' : 'surface',
      topicWeight,
      randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:silence`,
    });

    if (silenceDecision.useSilence) {
      const { text: withSilence, ssml: ssmlWithSilence } = this.silencePresence.applyToResponse(
        text,
        silenceDecision
      );
      log.debug(
        { reason: silenceDecision.reason, duration: silenceDecision.duration },
        'Applied silence presence to response'
      );
      return {
        text: withSilence,
        ssml: silenceDecision.ssml + ssmlWithSilence,
        feature: `silence_${silenceDecision.reason}`,
      };
    }

    return { text, ssml };
  }

  private applyBetterThanHuman(
    text: string,
    ssml: string,
    context: HumanizationContext
  ): { text: string; ssml: string; features: string[] } {
    const features: string[] = [];

    try {
      if (!this.userId) {
        return { text, ssml, features };
      }

      const betterThanHuman = getBetterThanHuman(
        this.userId,
        this.sessionId,
        this.personaId,
        this.sessionCount
      );

      const bthContext: BetterThanHumanContext = {
        userMessage: context.userMessage,
        turnCount: context.turnNumber,
        sessionCount: this.sessionCount,
        topic: context.topic,
        emotion: context.userEmotion,
        isSessionStart: context.turnNumber <= 1,
        relationshipStage: mapRelationshipStage(context.relationshipStage),
        personaId: this.personaId,
        userId: this.userId,
        sessionId: this.sessionId,
        draftResponse: text,
        timeOfDay: getTimeOfDay(),
        dayOfWeek: new Date().getDay(),
      };

      const insight = betterThanHuman.analyze(bthContext);
      this.lastBetterThanHumanInsight = insight;

      if (insight.prioritizedActions.length > 0) {
        text = betterThanHuman.applyInsights(text, insight, 2);
        ssml = betterThanHuman.applyInsights(ssml, insight, 2);

        const appliedTypes = insight.prioritizedActions.slice(0, 2).map((a) => `bth_${a.type}`);
        features.push(...appliedTypes);

        log.debug(
          {
            bondWarmth: insight.emotionalBond.warmth.toFixed(2),
            appliedActions: appliedTypes,
          },
          '🌟 Better Than Human insights applied'
        );
      }
    } catch (bthError) {
      log.debug({ error: String(bthError) }, 'Better Than Human failed (non-fatal)');
    }

    return { text, ssml, features };
  }

  private async applyAdvancedHumanization(
    text: string,
    ssml: string,
    context: HumanizationContext,
    signals: HumanizationSignals
  ): Promise<{ text: string; ssml: string; features: string[] }> {
    const features: string[] = [];

    try {
      const sessionId =
        (context.sessionData as { sessionId?: string } | undefined)?.sessionId ||
        `humanizer-${this.personaId}`;

      if (
        !humanizationConfig.isEnabled('selfCorrection') &&
        !humanizationConfig.isEnabled('disfluency') &&
        !humanizationConfig.isEnabled('emotionalLeading')
      ) {
        return { text, ssml, features };
      }

      const orchestrator = getHumanizationOrchestrator(sessionId);

      const rawEnergy = detectUserEnergy(context.userMessage);
      const userEnergy: 'high' | 'medium' | 'low' = rawEnergy === 'subdued' ? 'low' : rawEnergy;

      const orchestratorContext: Omit<OrchestratorContext, 'responseText' | 'responseWordCount'> = {
        userMessage: context.userMessage,
        userWordCount: RUST_COUNTING_AVAILABLE
          ? countWordsRust(context.userMessage)
          : context.userMessage.split(/\s+/).length,
        userEnergy,
        userEmotion: context.userEmotion,
        turnCount: context.turnNumber,
        sessionMinutes: this.getSessionMinutes(),
        comfortLevel: getComfortLevel(context.relationshipStage),
        relationshipStage: context.relationshipStage || 'acquaintance',
        personaId: this.personaId,
        recentTopics: context.topic ? [context.topic] : [],
        recentHumanizations: [],
        isEmotionalContent: context.wasPersonalSharing || false,
        responseComplexity:
          (RUST_COUNTING_AVAILABLE ? countWordsRust(text) : text.split(/\s+/).length) > 50
            ? 0.7
            : 0.3,
        isGivingAdvice: signals.isGivingAdvice,
      };

      const orchestratorResult = orchestrator.humanize(text, orchestratorContext);

      if (orchestratorResult.appliedHumanizations.length > 0) {
        text = orchestratorResult.text;
        ssml = orchestratorResult.ssml || ssml;
        features.push(...orchestratorResult.appliedHumanizations.map((h) => `adv_${h.type}`));

        for (const humanization of orchestratorResult.appliedHumanizations) {
          humanizationAnalytics.recordApplied(
            sessionId,
            humanization.type as Parameters<typeof humanizationAnalytics.recordApplied>[1],
            { placement: humanization.placement },
            {
              turnCount: context.turnNumber,
              comfortLevel: orchestratorContext.comfortLevel,
              emotionalContext: context.userEmotion,
            }
          );
        }

        log.debug(
          {
            applied: orchestratorResult.appliedHumanizations.map((h) => h.type),
            skipped: orchestratorResult.skippedFeatures.length,
          },
          '🎭 Advanced humanization applied'
        );
      }
    } catch (orchestratorErr) {
      log.debug({ error: String(orchestratorErr) }, 'Advanced humanization failed (non-fatal)');
    }

    return { text, ssml, features };
  }

  /**
   * Get thinking phrase
   */
  getThinkingPhrase(
    type: 'processing' | 'recalling' | 'considering' | 'uncertain' = 'processing',
    turnNumber?: number
  ): { text: string; ssml: string } {
    const pattern = this.naturalizer.getThinkingPhrase(this.personaId, type, {
      randomSeed: `${this.sessionId}:${this.personaId}:${type}:thinking_phrase`,
      sessionId: this.sessionId,
      turnNumber,
    });
    return {
      text: pattern.phrase,
      ssml: pattern.ssml,
    };
  }

  /**
   * Get the current conversation mood
   */
  getMood() {
    return getMoodTracker(this.personaId).getMood();
  }

  /**
   * Check if last response had callback
   */
  wasLastResponseCallback(): boolean {
    return this.lastResponseHadCallback;
  }

  /**
   * Record user reaction to callback
   */
  recordUserReactionToCallback(userResponseLength: number, wasEngaged: boolean): void {
    if (this.lastResponseHadCallback) {
      const positiveReaction = wasEngaged || userResponseLength > 30;
      this.memory.recordCallbackReaction(positiveReaction);
      this.lastResponseHadCallback = false;
    }
  }

  /**
   * Record backchannel reaction
   */
  recordBackchannelReaction(wasPositive: boolean): void {
    this.listening.recordBackchannelReaction(wasPositive);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.naturalizer.reset();
    this.silencePresence.reset();
    this.lastResponseHadCallback = false;
    this.lastSessionInsight = null;
    this.lastBetterThanHumanInsight = null;
  }
}
