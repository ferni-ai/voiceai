/**
 * Message Analyzer
 *
 * Comprehensive message analysis combining emotion, intent, topic,
 * and conversation state detection.
 *
 * @module intelligence/core/message-analyzer
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getStateMachine,
  resetStateMachine,
  type ConversationState,
  type PhaseGuidance,
} from '../state/conversation.js';
import { getEmotionDetector, type EmotionResult } from '../detectors/emotion.js';
import { getIntentClassifier, type IntentResult } from '../detectors/intent.js';
import { getTopicTracker, type TopicExtractionResult } from '../detectors/topic.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Combined analysis result
 */
export interface ConversationAnalysis {
  emotion: EmotionResult;
  intent: IntentResult;
  topics: TopicExtractionResult;
  state: ConversationState;
  contextForPrompt: string;
  suggestedTone: string;
  priorityFocus: string;
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze a user message comprehensively
 */
export function analyzeMessage(
  message: string,
  options?: {
    userName?: string;
    isReturningUser?: boolean;
  }
): ConversationAnalysis {
  // Get or create components
  const emotionDetector = getEmotionDetector();
  const intentClassifier = getIntentClassifier();
  const topicTracker = getTopicTracker();
  const stateMachine = getStateMachine(options?.isReturningUser);

  // Run all analyses
  const emotion = emotionDetector.detect(message);
  const intent = intentClassifier.classify(message);
  const topics = topicTracker.extract(message);

  // Update state machine
  const state = stateMachine.processTurn({
    userMessage: message,
    emotion,
    intent,
    topics: topics.detected,
    userName: options?.userName,
  });

  // Build context for prompt injection
  const guidance = stateMachine.getGuidance();
  const contextForPrompt = buildContextForPrompt(emotion, intent, topics, state, guidance);

  // Determine suggested tone
  const suggestedTone = determineSuggestedTone(emotion, state);

  // Determine priority focus
  const priorityFocus = determinePriorityFocus(emotion, intent, state);

  getLogger().info(
    `Analysis: emotion=${emotion.primary}, intent=${intent.primary}, phase=${state.phase}`
  );

  return {
    emotion,
    intent,
    topics,
    state,
    contextForPrompt,
    suggestedTone,
    priorityFocus,
  };
}

/**
 * Build context string for prompt injection
 */
function buildContextForPrompt(
  emotion: EmotionResult,
  intent: IntentResult,
  topics: TopicExtractionResult,
  state: ConversationState,
  guidance: PhaseGuidance
): string {
  const sections: string[] = [];

  // Emotional awareness
  if (emotion.distressLevel > 0.5) {
    sections.push(
      `[PRIORITY] User appears distressed (${emotion.primary}, distress: ${emotion.distressLevel.toFixed(2)}). Focus on emotional support first.`
    );
  } else if (emotion.valence === 'positive') {
    sections.push(`[MOOD] User seems ${emotion.primary}. Match their energy.`);
  }

  // Intent guidance
  if (intent.requiresEmpathy) {
    sections.push(`[APPROACH] ${intent.suggestedApproach}`);
  }

  // Phase guidance
  sections.push(`[PHASE] ${state.phase} - ${guidance.focus}`);

  // Topic context
  if (topics.isTopicShift) {
    sections.push(`[TOPIC SHIFT] User is changing subjects. Acknowledge and follow.`);
  }
  if (state.topicsToCircleBack.length > 0 && state.turnCount % 5 === 0) {
    sections.push(`[CIRCLE BACK] Consider returning to: ${state.topicsToCircleBack[0]}`);
  }

  return sections.join('\n');
}

/**
 * Determine suggested tone based on emotion and conversation state
 */
function determineSuggestedTone(emotion: EmotionResult, state: ConversationState): string {
  // Distress overrides everything
  if (state.userNeedsSupport || emotion.distressLevel > 0.6) {
    return 'gentle';
  }

  // Phase-based
  switch (state.phase) {
    case 'greeting':
    case 'follow_up':
      return 'warm';
    case 'supporting':
      return 'gentle';
    case 'advising':
      return 'wise';
    case 'wrapping_up':
      return 'warm';
    default:
      return emotion.suggestedTone;
  }
}

/**
 * Determine priority focus for the response
 */
function determinePriorityFocus(
  emotion: EmotionResult,
  intent: IntentResult,
  state: ConversationState
): string {
  // Emotional support is always priority
  if (state.userNeedsSupport) {
    return 'Provide emotional support - acknowledge feelings before anything else';
  }

  // Intent-based
  if (intent.requiresEmpathy) {
    return `Validate their feelings about ${intent.primary}`;
  }

  if (intent.requiresAction) {
    return `Help with: ${intent.primary}`;
  }

  // Phase-based
  switch (state.phase) {
    case 'greeting':
      return 'Make genuine personal connection';
    case 'warming_up':
      return 'Get to know them as a person';
    case 'exploring':
      return 'Understand their complete picture';
    case 'advising':
      return 'Share relevant wisdom';
    case 'wrapping_up':
      return 'Leave them feeling supported';
    default:
      return 'Listen and respond naturally';
  }
}

/**
 * Reset all intelligence components (for new session)
 */
export function resetIntelligence(isReturningUser = false): void {
  getEmotionDetector().clearHistory();
  getTopicTracker().clear();
  resetStateMachine(isReturningUser);
  getLogger().info('Intelligence components reset');
}
