/**
 * Pre-LLM Processing
 *
 * Handles processing before the LLM generates a response:
 * - User message analysis
 * - Context guidance generation
 * - Pre-response actions (backchannels, silence handling)
 *
 * @module @ferni/conversation/humanizer/pre-llm
 */

import { getActiveListeningEngine, type BackchannelContext } from '../active-listening.js';
import { getConversationalMemory } from '../conversational-memory.js';
import { getEmotionalArcTracker } from '../emotional-arc.js';
import { getQuestionPatternEngine, type QuestionContext } from '../question-patterns.js';
import { getResponseDynamicsEngine } from '../response-dynamics.js';
import type { SessionIntelligenceInsight } from '../session-intelligence.js';

import type { ContextGuidance, HumanizationContext, PreResponseActions } from './types.js';

import { createDeterministicTrigger } from './utils.js';

// ============================================================================
// PRE-LLM PROCESSOR
// ============================================================================

/**
 * Processes user messages before LLM response generation
 */
export class PreLlmProcessor {
  private personaId: string;
  private sessionId: string;
  private listening = getActiveListeningEngine();
  private memory = getConversationalMemory();
  private emotional = getEmotionalArcTracker();
  private dynamics = getResponseDynamicsEngine();
  private questions = getQuestionPatternEngine();

  constructor(personaId: string, sessionId: string) {
    this.personaId = personaId;
    this.sessionId = sessionId;
  }

  /**
   * Process incoming user message
   * Records context and returns pre-response actions
   */
  processUserMessage(context: HumanizationContext): PreResponseActions {
    const actions: PreResponseActions = {};
    const shouldTrigger = createDeterministicTrigger(this.sessionId, this.personaId);

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
    if (context.userMessage.length > 100 && shouldTrigger(context.turnNumber, 'backchannel', 0.3)) {
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
   */
  generateContextGuidance(
    context: HumanizationContext,
    sessionInsight: SessionIntelligenceInsight | null
  ): ContextGuidance[] {
    const guidance: ContextGuidance[] = [];
    const topic = context.topic || this.memory.getCurrentTopic() || 'general';
    const shouldTrigger = createDeterministicTrigger(this.sessionId, this.personaId);

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
      shouldTrigger(context.turnNumber, 'guidance_question_suggestion', 0.4)
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
    const isComplexQuestion =
      context.userMessage.includes('?') &&
      (context.userMessage.length > 100 ||
        /how (do|should|can|would)/i.test(context.userMessage) ||
        /what (should|do you think|would)/i.test(context.userMessage));
    if (isComplexQuestion) {
      guidance.push({
        source: 'speech_naturalizer',
        content: `[THINKING CUE] This is a thoughtful question. Take a brief pause to consider it before responding - don't rush to answer.`,
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

    // 10. Session intelligence guidance
    this.addSessionIntelligenceGuidance(guidance, sessionInsight);

    return guidance;
  }

  /**
   * Add session intelligence guidance to the list
   */
  private addSessionIntelligenceGuidance(
    guidance: ContextGuidance[],
    insight: SessionIntelligenceInsight | null
  ): void {
    if (!insight) return;

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
   * Get memory reference for conversation context
   */
  getMemory() {
    return this.memory;
  }

  /**
   * Get dynamics engine
   */
  getDynamics() {
    return this.dynamics;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.listening.reset();
    this.memory.reset();
    this.questions.reset();
  }
}
