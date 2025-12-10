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
 * This is the high-level API for making AI conversations feel human.
 */

import { getLogger } from '../utils/safe-logger.js';

// Import all conversation modules
import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { getActiveListeningEngine, type BackchannelContext } from './active-listening.js';
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
import { getEmotionalArcTracker, type EmotionalResponse } from './emotional-arc.js';
import { getQuestionPatternEngine, type QuestionContext } from './question-patterns.js';
import { getResponseDynamicsEngine } from './response-dynamics.js';
import { getSilencePresenceEngine } from './silence-presence.js';
import { getSpeechNaturalizer, type NaturalizationContext } from './speech-naturalizer.js';
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

  constructor(personaId: string) {
    this.personaId = personaId;
    this.deepHumanization = getDeepHumanizationEngine(personaId);
    this.sessionStartTime = Date.now();
    getLogger().debug({ personaId }, 'ConversationHumanizer initialized');
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
    };

    // Only backchannel during longer user turns
    if (context.userMessage.length > 100 && Math.random() < 0.3) {
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
    if (!context.userMessage.includes('?') && Math.random() < 0.4) {
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
    const isComplexQuestion =
      context.userMessage.includes('?') &&
      (context.userMessage.length > 100 ||
        /how (do|should|can|would)/i.test(context.userMessage) ||
        /what (should|do you think|would)/i.test(context.userMessage));
    if (isComplexQuestion) {
      const thinkingPhrase = this.naturalizer.getThinkingPhrase(this.personaId, 'processing');
      guidance.push({
        source: 'speech_naturalizer',
        content: `[THINKING CUE] For complex questions, you might open with: "${thinkingPhrase.phrase}"`,
        priority: 'hint',
      });
    }

    // 8. Active listening - emotional echo for personal sharing
    const needsEmotionalSupport =
      context.wasPersonalSharing ||
      (context.userEmotion &&
        ['worried', 'anxious', 'sad', 'frustrated', 'overwhelmed'].includes(
          context.userEmotion.toLowerCase()
        ));
    if (needsEmotionalSupport && context.userEmotion) {
      const echo = this.listening.generateEmotionalEcho(
        context.userEmotion,
        context.userMessage,
        'medium'
      );
      guidance.push({
        source: 'active_listening',
        content: `[EMPATHETIC ECHO] Consider opening with: "${echo}"`,
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
    };

    text = this.naturalizer.naturalize(text, this.personaId, naturalizationContext);
    appliedFeatures.push('speech_naturalization');

    // 2. Try vocabulary mirroring
    const mirrored = this.listening.mirrorUserVocabulary(context.userMessage, text);
    if (mirrored) {
      text = mirrored.mirrored;
      appliedFeatures.push('vocabulary_mirroring');
    }

    // 3. Apply deep humanization (async but fire-and-forget for sync method)
    // Note: For full deep humanization, use humanizeResponseAsync
    // This provides basic mood tracking in sync flow

    // 4. Check for memory callback opportunity
    let memoryCallback: HumanizedResponse['memoryCallback'];
    if (context.turnNumber > 4 && Math.random() < 0.2) {
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
    if (!context.userMessage.includes('?') && Math.random() < 0.35) {
      const questionContext: QuestionContext = {
        topic: context.topic,
        userEmotion: context.userEmotion,
        previousUserStatement: context.userMessage,
        personaId: this.personaId,
        conversationDepth:
          context.turnNumber > 8 ? 'deep' : context.turnNumber > 4 ? 'medium' : 'surface',
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
      text = this.naturalizer.addUncertainty(text, this.personaId, 'medium');
      appliedFeatures.push('uncertainty_hedge');
    }

    // 7. Apply content delivery pacing for longer content
    // This makes reading web results, lists, and long material feel natural
    if (shouldApplyDeliveryPacing(text)) {
      text = applyDeliveryPacing(text, {
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
    };
    const vocalResult = humanizeVocals(text, vocalContext);
    text = vocalResult.ssml;
    appliedFeatures.push(...vocalResult.appliedFeatures);

    // 9. Apply SSML enhancements based on emotional guidance
    ssml = this.applySsmlEnhancements(text, emotionalGuidance);

    // Record agent message
    this.memory.recordAgentMessage(text);
    this.dynamics.recordMessage('agent', text, context.topic ? [context.topic] : undefined);

    return {
      text,
      ssml,
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
   */
  async humanizeResponseAsync(
    rawResponse: string,
    context: HumanizationContext
  ): Promise<HumanizedResponse> {
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

    return {
      ...baseResult,
      text: enhancedText,
      ssml: enhancedSsml,
      appliedFeatures: [...baseResult.appliedFeatures, ...additionalFeatures],
    };
  }

  /**
   * Get the current conversation mood from deep humanization
   */
  getMood() {
    return this.deepHumanization.getMood();
  }

  /**
   * Get a thinking phrase when processing
   */
  getThinkingPhrase(
    type: 'processing' | 'recalling' | 'considering' | 'uncertain' = 'processing'
  ): {
    text: string;
    ssml: string;
  } {
    const pattern = this.naturalizer.getThinkingPhrase(this.personaId, type);
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

  private shouldAddUncertainty(text: string, context: HumanizationContext): boolean {
    // Don't add uncertainty to questions
    if (text.trim().endsWith('?')) return false;

    // Don't add to very short responses
    if (text.length < 30) return false;

    // Add more uncertainty early in conversation
    if (context.turnNumber < 3) return Math.random() < 0.3;

    // Add uncertainty when giving advice
    const advicePatterns = /you should|you need to|you have to|try to|consider/i;
    if (advicePatterns.test(text)) return Math.random() < 0.25;

    // Add uncertainty when making predictions
    const predictionPatterns = /will probably|likely|might|could be/i;
    if (predictionPatterns.test(text)) return Math.random() < 0.2;

    return Math.random() < 0.1;
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
      ssml = `<volume level="soft"/>${ssml}`;
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
