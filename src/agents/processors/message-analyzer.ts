/**
 * Message Analyzer
 *
 * Extracted from turn-processor.ts - handles message analysis
 * and conversation state updates.
 *
 * @module agents/processors/message-analyzer
 */

import { diag } from '../../services/diagnostic-logger.js';
import type { TurnContext, TurnAnalysisResult } from './types.js';

// ============================================================================
// PERFORMANCE: Module-level constants (avoid recreating every turn)
// ============================================================================

/** Emotions indicating positive sentiment */
const POSITIVE_EMOTIONS = new Set(['happy', 'excited', 'grateful', 'content']);

/** Emotions indicating negative sentiment */
const NEGATIVE_EMOTIONS = new Set(['sad', 'frustrated', 'angry', 'anxious']);

/** Phrases that signal user wants to end conversation */
const WRAP_UP_PHRASES = [
  'gotta go',
  'have to go',
  'need to go',
  'i should go',
  'bye',
  'goodbye',
  'see you',
  'talk later',
  'later',
  "that's all",
  "that's it",
  "i'm done",
  'thanks for',
] as const;

/** Pre-compiled regex for faster wrap-up detection */
const WRAP_UP_PATTERN = new RegExp(WRAP_UP_PHRASES.join('|'), 'i');

// ============================================================================
// ANALYSIS PHASE
// ============================================================================

/**
 * Analyze the user's message
 */
export function analyzeMessage(ctx: TurnContext): TurnAnalysisResult {
  const { userText, services, userData } = ctx;

  // Analyze the message - fallback to empty analysis if services.analyze not available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysis: any =
    services && typeof services.analyze === 'function'
      ? services.analyze(userText)
      : { topics: { detected: [], categories: [] }, state: {}, emotion: { primary: 'neutral', intensity: 0.5 } };

  // Track the user turn
  if (services && typeof services.addTurn === 'function') {
    services.addTurn('user', userText);
  }

  // Get topics
  const currentTopic = analysis.topics.detected[0];
  const previousTopic = userData.lastTopic;
  const topicChanged = !!(previousTopic && currentTopic && previousTopic !== currentTopic);

  return {
    analysis,
    currentTopic,
    previousTopic,
    topicChanged,
  };
}

// ============================================================================
// CONVERSATION STATE UPDATE
// ============================================================================

/**
 * Update conversation state manager with analysis results
 */
export function updateConversationState(ctx: TurnContext, analysisResult: TurnAnalysisResult): void {
  const { userData, userText } = ctx;
  const { analysis, currentTopic } = analysisResult;

  if (!userData.conversationState) return;

  const convState = userData.conversationState;

  // Increment turn count
  convState.incrementTurn();

  // Update emotional context
  const emotionMap: Record<
    string,
    'happy' | 'excited' | 'calm' | 'anxious' | 'frustrated' | 'sad' | 'confused' | 'grateful'
  > = {
    happy: 'happy',
    excited: 'excited',
    content: 'calm',
    neutral: 'calm',
    anxious: 'anxious',
    worried: 'anxious',
    frustrated: 'frustrated',
    angry: 'frustrated',
    sad: 'sad',
    confused: 'confused',
    grateful: 'grateful',
    thankful: 'grateful',
  };

  const mappedEmotion = emotionMap[analysis.emotion.primary.toLowerCase()];
  if (mappedEmotion) {
    convState.detectEmotion(mappedEmotion);
  }

  // Update sentiment (using module-level constants for O(1) lookup)
  const intensity = analysis.emotion.intensity || 0.5;
  let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
  const emotionLower = analysis.emotion.primary.toLowerCase();

  if (POSITIVE_EMOTIONS.has(emotionLower)) {
    sentiment = 'positive';
  } else if (NEGATIVE_EMOTIONS.has(emotionLower)) {
    sentiment = 'negative';
  } else if (intensity > 0.7) {
    sentiment = 'mixed';
  }
  convState.setEmotionalContext({ sentiment, confidence: intensity });

  // Update topic
  if (currentTopic) {
    convState.setCurrentTopic(currentTopic);
  }

  // Store key moment
  convState.addKeyMoment(
    `User said: ${userText.slice(0, 100)}${userText.length > 100 ? '...' : ''}`
  );

  // Check for wrap-up signals (using pre-compiled regex for performance)
  if (WRAP_UP_PATTERN.test(userText)) {
    convState.markUserWantsToLeave();
    diag.state('User wants to leave detected', { userText: userText.slice(0, 50) });
  }
}
