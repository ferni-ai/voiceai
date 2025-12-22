/**
 * Silence Handling
 *
 * Evaluates and handles comfortable silence in conversations.
 *
 * @module conversation/active-listening/silence-handling
 */

import { seededIndex } from '../utils/rng.js';

import type { SilenceEvaluation } from './types.js';

// ============================================================================
// SILENCE EVALUATION
// ============================================================================

/**
 * Evaluate if silence is comfortable in the given context
 */
export function evaluateSilence(
  silenceDurationMs: number,
  context: {
    userJustSharedPersonal?: boolean;
    userIsThinking?: boolean;
    emotionalIntensity?: 'high' | 'medium' | 'low';
  }
): SilenceEvaluation {
  // After personal sharing, give space
  if (context.userJustSharedPersonal && silenceDurationMs < 5000) {
    return {
      comfortable: true,
      action: 'wait',
      reason: 'Giving space after personal disclosure',
    };
  }

  // High emotional intensity deserves patience
  if (context.emotionalIntensity === 'high' && silenceDurationMs < 6000) {
    return {
      comfortable: true,
      action: 'wait',
      reason: 'Emotional moment - patient silence',
    };
  }

  // User appears to be thinking
  if (context.userIsThinking && silenceDurationMs < 4000) {
    return {
      comfortable: true,
      action: 'wait',
      reason: 'User processing - respectful pause',
    };
  }

  // Normal silence thresholds
  if (silenceDurationMs < 2500) {
    return { comfortable: true, action: 'wait', reason: 'Normal conversational pause' };
  }

  if (silenceDurationMs < 4000) {
    return {
      comfortable: false,
      action: 'backchannel',
      reason: 'Extended pause - light acknowledgment',
    };
  }

  return {
    comfortable: false,
    action: 'gentle_prompt',
    reason: 'Long silence - gentle re-engagement',
  };
}

// ============================================================================
// GENTLE PROMPTS
// ============================================================================

const GENTLE_PROMPTS = [
  '<break time="300ms"/>What\'s on your mind?',
  '<break time="200ms"/>Take your time.',
  '<break time="300ms"/>I\'m here.',
  '<break time="200ms"/>Is there more you want to share?',
  '<volume ratio="0.75"/><break time="300ms"/>No rush.',
];

/**
 * Get a gentle prompt for re-engaging after silence
 */
export function getGentlePrompt(context?: { lastTopic?: string; userEmotion?: string }): string {
  // Context-specific prompts
  if (context?.userEmotion === 'sad' || context?.userEmotion === 'overwhelmed') {
    return '<volume ratio="0.75"/><break time="400ms"/>I\'m here. Take your time.';
  }

  if (context?.lastTopic) {
    return `<break time="200ms"/>Still thinking about ${context.lastTopic}?`;
  }

  const seed = `gentle-prompt:${context?.userEmotion ?? ''}:${context?.lastTopic ?? ''}`;
  return GENTLE_PROMPTS[seededIndex(seed, GENTLE_PROMPTS.length)] ?? GENTLE_PROMPTS[0];
}

