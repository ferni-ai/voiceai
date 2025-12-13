/**
 * Humanizer - Conversation Orchestration Layer
 *
 * Coordinates all humanizing features to create natural conversations:
 * - Integrates speech naturalization
 * - Active listening behaviors
 * - Conversational memory
 * - Question diversity
 * - Emotional responsiveness
 *
 * ⚠️ MIGRATION NOTICE:
 * For POST-LLM humanization in the voice agent, use the unified API instead:
 *
 * ```typescript
 * // New unified API (preferred for voice agent)
 * import {
 *   initConversationSession,
 *   humanizeAgentResponse,
 *   cleanupConversationSession,
 * } from './agents/integrations/conversation-session-integration.js';
 * ```
 *
 * This file is still used for:
 * - PRE-LLM context building (processUserMessage, getPreResponseActions)
 * - Context builders (conversation-humanizing.ts)
 * - Legacy integrations
 *
 * @see unified-integration.ts for the new unified POST-LLM API
 */

import { getLogger } from '../utils/safe-logger.js';

// SSML sanitization - ensures stage directions like "*chuckles*" or "[gentle chuckle]" are handled
import { sanitizeSsml } from '../ssml/core.js';

// Import all conversation modules
import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';

// Advanced Humanization Orchestrator - voice learning, breathing sync, emotional leading
import { getActiveListeningEngine, type BackchannelContext } from './active-listening.js';

// 🧠 SUPERHUMAN INTELLIGENCE - "Better Than Human" capabilities
import { applyDeliveryPacing, shouldApplyDeliveryPacing } from './content-delivery-pacing.js';
import { getConversationalMemory } from './conversational-memory.js';
import {
  classifyTopicWeight,
  detectAdviceGiving,
  detectBreakthrough,
  detectDisengagement,
  detectEvidence,
  detectHighEngagement,
  getDeepHumanizationEngine,
  type HumanizationContext as DeepContext,
  type SessionMemory,
} from './deep-humanization.js';
// 🌟 BETTER THAN HUMAN - Advanced superhuman capabilities
import { getEmotionalArcTracker, type EmotionalResponse } from './emotional-arc.js';
import {
  getHumanizationOrchestrator,
  humanizationAnalytics,
  humanizationConfig,
  type HumanizationContext as OrchestratorContext,
} from './humanization/index.js';
import { getQuestionPatternEngine, type QuestionContext } from './question-patterns.js';
import { getResponseDynamicsEngine } from './response-dynamics.js';
import {
  getSessionIntelligence,
  type SessionIntelligenceContext,
  type SessionIntelligenceInsight,
} from './session-intelligence.js';
import { getSilencePresenceEngine } from './silence-presence.js';
import { getSpeechNaturalizer, type NaturalizationContext } from './speech-naturalizer.js';
import {
  getBetterThanHuman,
  type BetterThanHumanContext,
  type BetterThanHumanInsight,
} from './superhuman/index.js';
import { detectUserEnergy, humanizeVocals, type VocalContext } from './vocal-humanization.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationContext {
  personaId: string;
  turnNumber: number;
  userMessage: string;
  userEmotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  wasPersonalSharing?: boolean;
  silenceDurationMs?: number;
  /** Session data for anticipation/running jokes */
  sessionData?: SessionMemory;
  /** Relationship stage for deeper humanization */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

export interface HumanizedResponse {
  // The humanized text
  text: string;
  ssml: string;

  // What was applied
  appliedFeatures: string[];

  // Guidance for delivery
  emotionalGuidance: EmotionalResponse | null;
  pacing: 'faster' | 'normal' | 'slower';

  // Optional additions
  backchannel?: { text: string; ssml: string };
  memoryCallback?: { text: string; ssml: string };
  followUpQuestion?: { text: string; ssml: string };
}

export interface PreResponseActions {
  backchannel?: { text: string; ssml: string };
  silenceAction?: 'wait' | 'gentle_prompt' | 'continue' | 'backchannel';
  acknowledgment?: string;
  topicChange?: { detected: boolean; transitionPhrase?: string };
}

export interface ContextGuidance {
  source: string;
  content: string;
  priority: 'high' | 'standard' | 'hint';
}

// ============================================================================
// HUMANIZER
// ============================================================================

export class ConversationHumanizer {
  private personaId: string;
  private naturalizer = getSpeechNaturalizer();
  private listening = getActiveListeningEngine();
  private memory = getConversationalMemory();
  private questions = getQuestionPatternEngine();
  private emotional = getEmotionalArcTracker();
  private dynamics = getResponseDynamicsEngine();
  private deepHumanization = getDeepHumanizationEngine('ferni'); // Will be set by personaId
  private silencePresence = getSilencePresenceEngine();

  // Track if last response included a memory callback
  private lastResponseHadCallback = false;

  // Session time tracking
  private sessionStartTime = Date.now();

  // 🧠 Session intelligence - real-time within-session intelligence
  private sessionId: string;
  private userId?: string;
  private lastSessionInsight: SessionIntelligenceInsight | null = null;

  // 🌟 Better Than Human - advanced capabilities
  private sessionCount = 0;
  private lastBetterThanHumanInsight: BetterThanHumanInsight | null = null;

  constructor(personaId: string, sessionId?: string, userId?: string, sessionCount?: number) {
    this.personaId = personaId;
    this.sessionId = sessionId || `humanizer-${personaId}-${Date.now()}`;
    this.userId = userId;
    this.sessionCount = sessionCount || 0;
    this.deepHumanization = getDeepHumanizationEngine(personaId);
    this.sessionStartTime = Date.now();
    getLogger().debug(
      { personaId, sessionId: this.sessionId, sessionCount: this.sessionCount },
      'ConversationHumanizer initialized'
    );
  }

  /**
   * Set session and user IDs for session intelligence
   */
  setSessionContext(sessionId: string, userId?: string): void {
    this.sessionId = sessionId;
    this.userId = userId;
    getLogger().debug({ sessionId, userId }, 'Session context updated');
  }

  /**
   * Get the last session insight (for external use)
   */
  getLastSessionInsight(): SessionIntelligenceInsight | null {
    return this.lastSessionInsight;
  }

  /**
   * Get the last Better Than Human insight (for external use)
   */
  getLastBetterThanHumanInsight(): BetterThanHumanInsight | null {
    return this.lastBetterThanHumanInsight;
  }

  /**
   * Set session count (for Better Than Human capabilities)
   */
  setSessionCount(count: number): void {
    this.sessionCount = count;
  }

  /**
   * Get session duration in minutes
   */
  getSessionMinutes(): number {
    return Math.floor((Date.now() - this.sessionStartTime) / (1000 * 60));
  }

  /**
   * Reset session start time (for new sessions)
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
    getLogger().debug({ personaId: this.personaId }, 'Session timer reset');
  }

  /**
   * Record user reaction to a memory callback (if one was given)
   * Call this after processing user's response following a callback
   */
  recordUserReactionToCallback(userResponseLength: number, wasEngaged: boolean): void {
    if (this.lastResponseHadCallback) {
      // Positive reaction = longer response or engagement signals
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
   * Check if last response had a memory callback
   */
  wasLastResponseCallback(): boolean {
    return this.lastResponseHadCallback;
  }

  /**
   * Process incoming user message
   * Records context and returns pre-response actions
   */
  processUserMessage(context: HumanizationContext): PreResponseActions {
    const actions: PreResponseActions = {};

    // Record in conversational memory
    this.memory.recordUserMessage(context.userMessage, {
      topic: context.topic,
      emotion: context.userEmotion,
      isQuestion: context.userMessage.includes('?'),
      wasPersonal: context.wasPersonalSharing,
    });

    // Record in response dynamics
    this.dynamics.recordMessage(
      'user',
      context.userMessage,
      context.topic ? [context.topic] : undefined
    );

    // Check for topic change
    const topicChange = this.memory.analyzeTopicChange(context.userMessage);
    if (topicChange.detected) {
      actions.topicChange = {
        detected: true,
        transitionPhrase: topicChange.transitionPhrase,
      };
    }

    // Check if we should backchannel
    const backchannelContext: BackchannelContext = {
      userEmotion: context.userEmotion,
      topicSeriousness: context.isSeriousContext ? 'serious' : 'casual',
      userJustSharedSomethingPersonal: context.wasPersonalSharing,
      userAskedQuestion: context.userMessage.includes('?'),
      randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:backchannel`,
    };

    // Only backchannel during longer user turns
    if (
      context.userMessage.length > 100 &&
      this.shouldTrigger(context.turnNumber, 'backchannel', 0.3)
    ) {
      const backchannel = this.listening.getBackchannel(this.personaId, backchannelContext);
      if (backchannel) {
        actions.backchannel = {
          text: backchannel.verbal,
          ssml: backchannel.ssml,
        };
      }
    }

    // Handle silence if present
    if (context.silenceDurationMs && context.silenceDurationMs > 2000) {
      const silenceEval = this.listening.evaluateSilence(context.silenceDurationMs, {
        userJustSharedPersonal: context.wasPersonalSharing,
        emotionalIntensity: context.userEmotion ? 'high' : 'low',
      });
      actions.silenceAction = silenceEval.action;

      if (silenceEval.action === 'gentle_prompt') {
        actions.acknowledgment = this.listening.getGentlePrompt({
          lastTopic: context.topic,
          userEmotion: context.userEmotion,
        });
      }
    }

    // Check for emotional echo opportunity
    if (context.userEmotion && context.wasPersonalSharing) {
      actions.acknowledgment = this.listening.generateEmotionalEcho(
        context.userEmotion,
        context.userMessage,
        'medium'
      );
    }

    return actions;
  }

  /**
   * Generate context guidance for LLM prompt injection
   * This is the unified source of all conversational guidance
   */
  generateContextGuidance(context: HumanizationContext): ContextGuidance[] {
    const guidance: ContextGuidance[] = [];
    const topic = context.topic || this.memory.getCurrentTopic() || 'general';

    // 1. Response length guidance
    const lengthGuidance = this.dynamics.getLengthGuidance();
    if (lengthGuidance) {
      guidance.push({
        source: 'response_dynamics',
        content: lengthGuidance,
        priority: 'standard',
      });
    }

    // 2. Emotional arc guidance
    const emotionalResponse = this.emotional.getResponseRecommendation();
    if (emotionalResponse.guidance) {
      guidance.push({
        source: 'emotional_arc',
        content: `[EMOTIONAL GUIDANCE] ${emotionalResponse.guidance}`,
        priority: emotionalResponse.suggestedTone === 'support' ? 'high' : 'standard',
      });
    }

    // 3. Emotional shift detection
    const transitionPhrase = this.emotional.getTransitionPhrase();
    if (transitionPhrase) {
      guidance.push({
        source: 'emotional_arc',
        content: `[EMOTIONAL SHIFT DETECTED] Consider acknowledging: "${transitionPhrase}"`,
        priority: 'standard',
      });
    }

    // 4. Memory callback opportunities
    if (context.turnNumber > 4) {
      const callback = this.memory.getMemoryCallback(topic, context.turnNumber);
      if (callback) {
        guidance.push({
          source: 'conversational_memory',
          content: `[CONVERSATION CALLBACK] You could reference something from earlier: "${callback.phrase}"`,
          priority: 'hint',
        });
      }
    }

    // 5. Unresolved threads
    const unresolvedThreads = this.memory.getUnresolvedThreads();
    if (unresolvedThreads.length > 0 && context.turnNumber > 6) {
      const threadTopics = unresolvedThreads
        .slice(0, 2)
        .map((t) => t.topic)
        .join(', ');
      guidance.push({
        source: 'conversational_memory',
        content: `[OPEN THREADS] Topics you could circle back to: ${threadTopics}`,
        priority: 'hint',
      });
    }

    // 6. Question diversity suggestion
    if (
      !context.userMessage.includes('?') &&
      this.shouldTrigger(context.turnNumber, 'guidance_question_suggestion', 0.4)
    ) {
      const questionContext: QuestionContext = {
        topic,
        userEmotion: context.userEmotion,
        previousUserStatement: context.userMessage,
        personaId: this.personaId,
        conversationDepth:
          context.turnNumber > 8 ? 'deep' : context.turnNumber > 4 ? 'medium' : 'surface',
      };
      const suggestedQuestion = this.questions.generateQuestion(questionContext);
      guidance.push({
        source: 'question_patterns',
        content: `[QUESTION SUGGESTION] Consider ending with a ${suggestedQuestion.type} question. Purpose: ${suggestedQuestion.purpose}`,
        priority: 'hint',
      });
    }

    // 7. Thinking cue for complex questions
    // NOTE: Removed literal phrase injection - the LLM was copying "Good question" verbatim
    // which made it sound like Ferni was complimenting himself. Instead, we now guide
    // the LLM to THINK before responding, without providing specific phrases to parrot.
    const isComplexQuestion =
      context.userMessage.includes('?') &&
      (context.userMessage.length > 100 ||
        /how (do|should|can|would)/i.test(context.userMessage) ||
        /what (should|do you think|would)/i.test(context.userMessage));
    if (isComplexQuestion) {
      // Don't inject literal phrases - just guide the behavior
      guidance.push({
        source: 'speech_naturalizer',
        content: `[THINKING CUE] This is a thoughtful question. Take a brief pause to consider it before responding - don't rush to answer.`,
        priority: 'hint',
      });
    }

    // 8. Active listening - emotional echo for personal sharing
    // NOTE: Removed literal phrase injection - the LLM was copying the exact echo phrase
    // which sounded robotic. Now we guide the LLM to be empathetic without scripting it.
    const needsEmotionalSupport =
      context.wasPersonalSharing ||
      (context.userEmotion &&
        ['worried', 'anxious', 'sad', 'frustrated', 'overwhelmed'].includes(
          context.userEmotion.toLowerCase()
        ));
    if (needsEmotionalSupport && context.userEmotion) {
      guidance.push({
        source: 'active_listening',
        content: `[EMPATHETIC ECHO] The user seems ${context.userEmotion}. Acknowledge this feeling before offering any advice - show you heard them.`,
        priority: 'standard',
      });
    }

    // 9. Contradiction detection
    const contradiction = this.memory.checkForContradiction(context.userMessage, topic);
    if (contradiction) {
      const acknowledgment = this.memory.generateContradictionAcknowledgment(contradiction);
      guidance.push({
        source: 'conversational_memory',
        content: `[POSSIBLE CONTRADICTION] User said something different earlier. Consider gently exploring: "${acknowledgment}"`,
        priority: 'hint',
      });
    }

    // 10. 🧠 SESSION INTELLIGENCE guidance
    // Include guidance from concern detection, proactive memory, and predictions
    if (this.lastSessionInsight) {
      const insight = this.lastSessionInsight;

      // Concern-based guidance (HIGH PRIORITY)
      if (insight.concern.level === 'elevated' || insight.concern.level === 'crisis') {
        guidance.push({
          source: 'superhuman_concern',
          content: `[⚠️ CONCERN DETECTED: ${insight.concern.level.toUpperCase()}] ${insight.concern.responseGuidance}`,
          priority: 'high',
        });
      } else if (insight.concern.level === 'moderate') {
        guidance.push({
          source: 'superhuman_concern',
          content: `[CONCERN DETECTED] ${insight.concern.responseGuidance}`,
          priority: 'standard',
        });
      }

      // Need prediction guidance
      if (insight.predictions.need.confidence > 0.6) {
        guidance.push({
          source: 'superhuman_prediction',
          content: `[PREDICTED NEED: ${insight.predictions.need.primaryNeed}] ${insight.predictions.need.responseGuidance}`,
          priority: insight.predictions.need.confidence > 0.75 ? 'standard' : 'hint',
        });
      }

      // Voice state guidance
      if (
        insight.predictions.voiceState.acknowledgment &&
        insight.predictions.voiceState.confidence > 0.6
      ) {
        guidance.push({
          source: 'superhuman_voice',
          content: `[VOICE STATE: ${insight.predictions.voiceState.state}] Consider acknowledging: "${insight.predictions.voiceState.acknowledgment}"`,
          priority: 'hint',
        });
      }

      // Proactive memory suggestions
      if (insight.memorySuggestions.length > 0) {
        const topSuggestion = insight.memorySuggestions[0];
        if (topSuggestion.priority > 0.5) {
          guidance.push({
            source: 'superhuman_memory',
            content: `[PROACTIVE MEMORY] ${topSuggestion.reason}: "${topSuggestion.phrase}"`,
            priority: topSuggestion.priority > 0.7 ? 'standard' : 'hint',
          });
        }
      }

      // Overall approach guidance
      if (insight.responseGuidance.approach !== 'normal') {
        const avoidStr =
          insight.responseGuidance.avoid.length > 0
            ? ` Avoid: ${insight.responseGuidance.avoid.join(', ')}.`
            : '';
        guidance.push({
          source: 'superhuman_guidance',
          content: `[APPROACH: ${insight.responseGuidance.approach}] Pacing: ${insight.responseGuidance.pacing}, Energy: ${insight.responseGuidance.energy}.${avoidStr}`,
          priority: 'standard',
        });
      }
    }

    getLogger().debug(
      { personaId: this.personaId, turnNumber: context.turnNumber, guidanceCount: guidance.length },
      'Generated context guidance'
    );

    return guidance;
  }

  /**
   * Format context guidance for prompt injection
   */
  formatGuidanceForPrompt(guidance: ContextGuidance[]): string {
    if (guidance.length === 0) return '';

    const lines: string[] = [];
    const high = guidance.filter((g) => g.priority === 'high');
    const standard = guidance.filter((g) => g.priority === 'standard');
    const hints = guidance.filter((g) => g.priority === 'hint');

    if (high.length > 0) {
      lines.push('=== IMPORTANT ===');
      high.forEach((g) => lines.push(g.content));
    }

    if (standard.length > 0) {
      lines.push('=== GUIDANCE ===');
      standard.forEach((g) => lines.push(g.content));
    }

    if (hints.length > 0) {
      lines.push('=== OPTIONAL ===');
      hints.forEach((g) => lines.push(g.content));
    }

    return lines.join('\n');
  }

  /**
   * Humanize a response before sending
   * Applies naturalization, adds callbacks, suggests follow-ups
   */
  humanizeResponse(rawResponse: string, context: HumanizationContext): HumanizedResponse {
    const appliedFeatures: string[] = [];
    let text = rawResponse;
    let ssml = rawResponse;

    // Get emotional guidance
    const emotionalGuidance = this.emotional.getResponseRecommendation();

    // Get response length recommendation
    const lengthRec = this.dynamics.getResponseLengthRecommendation();

    // Get pacing
    const pacing = this.dynamics.getPacingAnalysis();

    // 0. Update deep humanization mood tracking
    const topicWeight = classifyTopicWeight(context.userMessage, context.userEmotion);
    this.deepHumanization.updateMood({
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

    // 3. Apply deep humanization (async but fire-and-forget for sync method)
    // Note: For full deep humanization, use humanizeResponseAsync
    // This provides basic mood tracking in sync flow

    // 4. Check for memory callback opportunity
    let memoryCallback: HumanizedResponse['memoryCallback'];
    if (context.turnNumber > 4 && this.shouldTrigger(context.turnNumber, 'memory_callback', 0.2)) {
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
        this.lastResponseHadCallback = true; // Track for reaction analysis
      }
    }

    // 5. Consider adding a follow-up question
    let followUpQuestion: HumanizedResponse['followUpQuestion'];
    if (
      !context.userMessage.includes('?') &&
      this.shouldTrigger(context.turnNumber, 'follow_up_question', 0.55)
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

    // 6. Add hedging for uncertainty if appropriate
    if (this.shouldAddUncertainty(text, context)) {
      text = this.naturalizer.addUncertainty(text, this.personaId, 'medium', {
        randomSeed: `${this.sessionId}:${this.personaId}:${context.turnNumber}:uncertainty`,
      });
      appliedFeatures.push('uncertainty_hedge');
    }

    // 7. Apply content delivery pacing for longer content
    // This makes reading web results, lists, and long material feel natural
    if (shouldApplyDeliveryPacing(text)) {
      ssml = applyDeliveryPacing(text, {
        personaId: this.personaId,
        isDirectResponse: context.userMessage.includes('?'),
      });
      appliedFeatures.push('content_delivery_pacing');
    }

    // 8. Apply vocal humanization - "Better Than Human" voice processing
    // Energy matching, pitch variation, contractions, intake breath, emotion bleeding
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

    // 9. Apply SSML enhancements based on emotional guidance
    ssml = this.applySsmlEnhancements(ssml, emotionalGuidance);

    // Record agent message
    this.memory.recordAgentMessage(text);
    this.dynamics.recordMessage('agent', text, context.topic ? [context.topic] : undefined);

    return {
      text: this.stripSsml(text),
      // Sanitize SSML to handle stage directions that may have been injected
      ssml: sanitizeSsml(ssml),
      appliedFeatures,
      emotionalGuidance,
      pacing: pacing.suggestedAgentPacing,
      memoryCallback,
      followUpQuestion,
    };
  }

  /**
   * Humanize a response with full deep humanization (async)
   * Includes mood drift, spontaneous thoughts, physical presence, etc.
   * Now also includes SUPERHUMAN INTELLIGENCE capabilities.
   *
   * @deprecated For voice agent POST-LLM humanization, use the unified API instead:
   * ```typescript
   * import { humanizeAgentResponse } from './agents/integrations/conversation-session-integration.js';
   * const result = await humanizeAgentResponse(sessionId, rawResponse, context);
   * ```
   * This method is still available for legacy integrations and context builders.
   */
  async humanizeResponseAsync(
    rawResponse: string,
    context: HumanizationContext
  ): Promise<HumanizedResponse> {
    // =========================================================================
    // 🧠 SESSION INTELLIGENCE - Run first to inform everything else
    // Real-time within-session analysis (concern detection, predictions, memory)
    // =========================================================================
    const sessionIntelligence = getSessionIntelligence(this.sessionId, this.userId);

    // Build session intelligence context
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

    // Get session intelligence insight
    const insight = sessionIntelligence.analyze(sessionContext);
    this.lastSessionInsight = insight;

    // Log significant insights
    if (insight.confidence > 0.6) {
      getLogger().debug(
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

    // Detect signals for deep humanization
    const signals = {
      userPresentedEvidence: detectEvidence(context.userMessage),
      isBreakthroughMoment: detectBreakthrough(context.userMessage),
      isGivingAdvice: detectAdviceGiving(rawResponse),
      isDisengaged: detectDisengagement(context.userMessage),
      isHighlyEngaged: detectHighEngagement(context.userMessage),
    };

    // 🌉 Emit signals to frontend for immediate EQ response
    // These fire BEFORE the text is processed, so frontend can anticipate
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

    // Get deep humanization injections
    const injections = await this.deepHumanization.getHumanizationInjections(deepContext, signals);

    // Apply injections to the text
    let enhancedText = baseResult.text;
    let enhancedSsml = baseResult.ssml;
    const additionalFeatures: string[] = [];

    if (injections.length > 0) {
      enhancedText = this.deepHumanization.applyInjections(enhancedText, injections);
      enhancedSsml = this.deepHumanization.applyInjections(enhancedSsml, injections);
      additionalFeatures.push(...injections.map((i) => `deep_${i.type}`));
    }

    // 🤫 SILENCE AS PRESENCE
    // Check if we should use intentional silence before responding
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
      // Apply silence to response
      const { text: withSilence, ssml: ssmlWithSilence } = this.silencePresence.applyToResponse(
        enhancedText,
        silenceDecision
      );
      enhancedText = withSilence;
      enhancedSsml = silenceDecision.ssml + ssmlWithSilence;
      additionalFeatures.push(`silence_${silenceDecision.reason}`);

      getLogger().debug(
        { reason: silenceDecision.reason, duration: silenceDecision.duration },
        'Applied silence presence to response'
      );
    }

    // =========================================================================
    // 🌟 BETTER THAN HUMAN - Advanced superhuman capabilities
    // Emotional bonds, anticipatory presence, protective instincts, inside jokes,
    // team coherence, temporal intelligence, meta-relationship, and more.
    // =========================================================================
    let betterThanHumanInsight: BetterThanHumanInsight | null = null;
    try {
      if (this.userId) {
        const betterThanHuman = getBetterThanHuman(
          this.userId,
          this.sessionId,
          this.personaId,
          this.sessionCount
        );

        // Build Better Than Human context
        const bthContext: BetterThanHumanContext = {
          userMessage: context.userMessage,
          turnCount: context.turnNumber,
          sessionCount: this.sessionCount,
          topic: context.topic,
          emotion: context.userEmotion,
          isSessionStart: context.turnNumber <= 1,
          relationshipStage: this.mapRelationshipStage(context.relationshipStage),
          personaId: this.personaId,
          userId: this.userId,
          sessionId: this.sessionId,
          draftResponse: enhancedText,
          timeOfDay: this.getTimeOfDay(),
          dayOfWeek: new Date().getDay(),
        };

        // Get insight
        betterThanHumanInsight = betterThanHuman.analyze(bthContext);
        this.lastBetterThanHumanInsight = betterThanHumanInsight;

        // Apply insights (max 2 actions to avoid over-processing)
        if (betterThanHumanInsight.prioritizedActions.length > 0) {
          enhancedText = betterThanHuman.applyInsights(enhancedText, betterThanHumanInsight, 2);
          enhancedSsml = betterThanHuman.applyInsights(enhancedSsml, betterThanHumanInsight, 2);

          const appliedTypes = betterThanHumanInsight.prioritizedActions
            .slice(0, 2)
            .map((a) => `bth_${a.type}`);
          additionalFeatures.push(...appliedTypes);

          getLogger().debug(
            {
              bondWarmth: betterThanHumanInsight.emotionalBond.warmth.toFixed(2),
              appliedActions: appliedTypes,
              relationshipStage: betterThanHumanInsight.emotionalBond
                ? this.mapRelationshipStage(context.relationshipStage)
                : 'unknown',
            },
            '🌟 Better Than Human insights applied'
          );
        }
      }
    } catch (bthError) {
      // Non-fatal - continue without Better Than Human
      getLogger().debug({ error: String(bthError) }, 'Better Than Human failed (non-fatal)');
    }

    // =========================================================================
    // ADVANCED HUMANIZATION ORCHESTRATOR
    // Applies voice learning-based features: self-correction, disfluencies,
    // emotional leading, voice insights, cross-session acknowledgments
    // =========================================================================
    try {
      // Get session ID from context (use personaId as fallback for session scoping)
      const sessionId =
        (context.sessionData as { sessionId?: string } | undefined)?.sessionId ||
        `humanizer-${this.personaId}`;

      // Check if advanced humanization is enabled
      if (
        humanizationConfig.isEnabled('selfCorrection') ||
        humanizationConfig.isEnabled('disfluency') ||
        humanizationConfig.isEnabled('emotionalLeading')
      ) {
        const orchestrator = getHumanizationOrchestrator(sessionId);

        // Build orchestrator context from our context
        // Map energy level (subdued -> low)
        const rawEnergy = detectUserEnergy(context.userMessage);
        const userEnergy: 'high' | 'medium' | 'low' = rawEnergy === 'subdued' ? 'low' : rawEnergy;

        const orchestratorContext: Omit<OrchestratorContext, 'responseText' | 'responseWordCount'> =
          {
            userMessage: context.userMessage,
            userWordCount: context.userMessage.split(/\s+/).length,
            userEnergy,
            userEmotion: context.userEmotion,
            turnCount: context.turnNumber,
            sessionMinutes: this.getSessionMinutes(),
            comfortLevel: this.getComfortLevel(context.relationshipStage),
            relationshipStage: context.relationshipStage || 'acquaintance',
            personaId: this.personaId,
            recentTopics: context.topic ? [context.topic] : [],
            recentHumanizations: [],
            isEmotionalContent: context.wasPersonalSharing || false,
            responseComplexity: enhancedText.split(/\s+/).length > 50 ? 0.7 : 0.3,
            isGivingAdvice: signals.isGivingAdvice,
          };

        // Apply orchestrator humanization
        const orchestratorResult = orchestrator.humanize(enhancedText, orchestratorContext);

        // Use orchestrator result if it made changes
        if (orchestratorResult.appliedHumanizations.length > 0) {
          enhancedText = orchestratorResult.text;
          enhancedSsml = orchestratorResult.ssml || enhancedSsml;
          additionalFeatures.push(
            ...orchestratorResult.appliedHumanizations.map((h) => `adv_${h.type}`)
          );

          // Track in analytics
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

          getLogger().debug(
            {
              applied: orchestratorResult.appliedHumanizations.map((h) => h.type),
              skipped: orchestratorResult.skippedFeatures.length,
            },
            '🎭 Advanced humanization applied'
          );
        }
      }
    } catch (orchestratorErr) {
      // Non-fatal - continue without advanced humanization
      getLogger().debug(
        { error: String(orchestratorErr) },
        'Advanced humanization failed (non-fatal)'
      );
    }

    // =========================================================================
    // 🧠 SESSION INTELLIGENCE MODIFICATIONS
    // Apply concern validation, voice acknowledgments, proactive memory, etc.
    // These are within-session intelligence capabilities.
    // =========================================================================
    if (insight.responseModifications.length > 0) {
      enhancedText = sessionIntelligence.applyModifications(enhancedText, insight);
      enhancedSsml = sessionIntelligence.applyModifications(enhancedSsml, insight);
      additionalFeatures.push(...insight.responseModifications.map((m) => `session_${m.type}`));

      getLogger().debug(
        {
          modifications: insight.responseModifications.map((m) => m.type),
          approach: insight.responseGuidance.approach,
        },
        '🧠 Session intelligence modifications applied'
      );
    }

    // Add session intelligence opening if this is session start
    if (insight.suggestedOpening && context.turnNumber <= 1) {
      // Replace the first sentence with the suggested opening
      const firstSentenceEnd = enhancedText.search(/[.!?]\s/) + 1;
      if (firstSentenceEnd > 0) {
        enhancedText = `${insight.suggestedOpening} ${enhancedText.slice(firstSentenceEnd).trim()}`;
        enhancedSsml = `${insight.suggestedOpening} ${enhancedSsml.slice(firstSentenceEnd).trim()}`;
      }
      additionalFeatures.push('session_opening');
    }

    return {
      ...baseResult,
      text: this.stripSsml(enhancedText),
      // CRITICAL: Sanitize SSML to convert stage directions like "[gentle chuckle]" to [laughter]
      // Without this, breath sounds from persona JSON files would be spoken literally
      ssml: sanitizeSsml(enhancedSsml),
      appliedFeatures: [...baseResult.appliedFeatures, ...additionalFeatures],
    };
  }

  /**
   * Get comfort level from relationship stage
   */
  private getComfortLevel(stage?: string): number {
    const levels: Record<string, number> = {
      stranger: 0.25,
      acquaintance: 0.45,
      friend: 0.65,
      trusted_advisor: 0.85,
    };
    return levels[stage || 'acquaintance'] || 0.45;
  }

  /**
   * Map relationship stage to Better Than Human format
   */
  private mapRelationshipStage(
    stage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
  ): 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend' {
    const mapping: Record<
      string,
      'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend'
    > = {
      stranger: 'new_acquaintance',
      acquaintance: 'getting_to_know',
      friend: 'trusted_advisor',
      trusted_advisor: 'old_friend',
    };
    return mapping[stage || 'acquaintance'] || 'getting_to_know';
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Get the current conversation mood from deep humanization
   */
  getMood() {
    return this.deepHumanization.getMood();
  }

  /**
   * Get a thinking phrase when processing
   *
   * @param type - Type of thinking phrase
   * @param turnNumber - Turn number for coordination (prevents duplicate phrases)
   */
  getThinkingPhrase(
    type: 'processing' | 'recalling' | 'considering' | 'uncertain' = 'processing',
    turnNumber?: number
  ): {
    text: string;
    ssml: string;
  } {
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
   * Generate an echo question from user statement
   */
  generateEchoQuestion(userStatement: string): { text: string; ssml: string } {
    const question = this.questions.generateEchoQuestion(userStatement);
    return {
      text: question.text,
      ssml: question.ssml,
    };
  }

  /**
   * Get a conversation callback for circling back to a topic
   */
  getCircleBackPhrase(topic: string): string {
    return this.memory.generateCircleBack(topic);
  }

  /**
   * Get unresolved conversation threads
   */
  getUnresolvedThreads(): string[] {
    return this.memory.getUnresolvedThreads().map((t) => t.topic);
  }

  /**
   * Mark a topic as resolved
   */
  resolveThread(topic: string): void {
    this.memory.resolveThread(topic);
  }

  /**
   * Get conversation summary for persistence
   */
  getConversationSummary(): ReturnType<typeof this.memory.getConversationSummary> {
    return this.memory.getConversationSummary();
  }

  /**
   * Change persona
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Reset all state for new conversation
   */
  reset(): void {
    this.naturalizer.reset();
    this.listening.reset();
    this.memory.reset();
    this.questions.reset();
    this.silencePresence.reset();
    getLogger().debug('ConversationHumanizer reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Deterministic probability gate for stable, human-feeling behavior.
   *
   * Avoids `Math.random()` so the same session/turn tends to behave consistently,
   * and tests remain reliable.
   */
  private shouldTrigger(turnNumber: number, feature: string, probability: number): boolean {
    const p = Math.max(0, Math.min(1, probability));
    if (p === 0) return false;
    if (p === 1) return true;

    const key = `${this.sessionId}:${this.personaId}:${turnNumber}:${feature}`;
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    const roll = hash / 0xffffffff;
    return roll < p;
  }

  private shouldAddUncertainty(text: string, context: HumanizationContext): boolean {
    // Don't add uncertainty to questions
    if (text.trim().endsWith('?')) return false;

    // Don't add to very short responses
    if (text.length < 30) return false;

    // Add more uncertainty early in conversation
    if (context.turnNumber < 3)
      return this.shouldTrigger(context.turnNumber, 'uncertainty_early', 0.3);

    // Add uncertainty when giving advice
    const advicePatterns = /you should|you need to|you have to|try to|consider/i;
    if (advicePatterns.test(text)) {
      return this.shouldTrigger(context.turnNumber, 'uncertainty_advice', 0.25);
    }

    // Add uncertainty when making predictions
    const predictionPatterns = /will probably|likely|might|could be/i;
    if (predictionPatterns.test(text)) {
      return this.shouldTrigger(context.turnNumber, 'uncertainty_prediction', 0.2);
    }

    return this.shouldTrigger(context.turnNumber, 'uncertainty_default', 0.1);
  }

  private stripSsml(text: string): string {
    const withoutTags = text.replace(/<[^>]+>/g, '');
    return withoutTags.replace(/\s+/g, ' ').trim();
  }

  private applySsmlEnhancements(text: string, guidance: EmotionalResponse | null): string {
    if (!guidance) return text;

    let ssml = text;

    // Add opening break
    ssml = `<break time="100ms"/>${ssml}`;

    // Add emotion if specified
    if (guidance.suggestedEmotion && guidance.suggestedEmotion !== 'neutral') {
      ssml = `<emotion value="${guidance.suggestedEmotion}"/>${ssml}`;
    }

    // Add volume adjustment for support
    if (guidance.warmthLevel === 'high') {
      // Cartesia uses ratio (0.5-2.0), not level
      ssml = `<volume ratio="0.75"/>${ssml}`;
    }

    // Add breaks for pause frequency
    if (guidance.pauseFrequency === 'more') {
      // Add breaks after sentences
      ssml = ssml.replace(/\.(\s)/g, '.<break time="200ms"/>$1');
    }

    return ssml;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const humanizers = new Map<string, ConversationHumanizer>();

export function getConversationHumanizer(personaId: string): ConversationHumanizer {
  let humanizer = humanizers.get(personaId);
  if (!humanizer) {
    humanizer = new ConversationHumanizer(personaId);
    humanizers.set(personaId, humanizer);
  }
  return humanizer;
}

export function resetConversationHumanizer(personaId?: string): void {
  if (personaId) {
    const humanizer = humanizers.get(personaId);
    if (humanizer) {
      humanizer.reset();
    }
    humanizers.delete(personaId);
  } else {
    for (const humanizer of humanizers.values()) {
      humanizer.reset();
    }
    humanizers.clear();
  }
}

export default ConversationHumanizer;
