/**
 * Semantic Prefetch
 *
 * Prefetch context hints for faster LLM response.
 *
 * @module response-anticipation/prefetch
 */

import type { PrefetchContext } from './types.js';

// ============================================================================
// TOPIC INDICATORS
// ============================================================================

/**
 * Topic detection patterns
 */
const TOPIC_INDICATORS = [
  { pattern: /\b(work|job|career|boss|colleague)\b/i, topic: 'work' },
  { pattern: /\b(family|parent|child|sibling|spouse|partner)\b/i, topic: 'relationships' },
  { pattern: /\b(health|exercise|sleep|eat|diet)\b/i, topic: 'health' },
  { pattern: /\b(money|budget|save|spend|financial)\b/i, topic: 'finances' },
  { pattern: /\b(goal|plan|future|dream|aspir)\b/i, topic: 'goals' },
  { pattern: /\b(stress|anxious|worried|overwhelm|burnout)\b/i, topic: 'stress' },
] as const;

/**
 * Emotion-based guidance
 */
const EMOTION_GUIDES: Record<string, string> = {
  stressed: 'User seems stressed. Validate feelings before problem-solving.',
  sad: 'User seems sad. Listen actively, offer presence.',
  anxious: 'User seems anxious. Grounding techniques may help.',
  happy: 'User seems happy. Mirror their positive energy.',
  frustrated: 'User seems frustrated. Acknowledge the frustration.',
};

// ============================================================================
// PREFETCH GENERATION
// ============================================================================

/**
 * Generate prefetch context based on conversation state
 *
 * @param recentUserMessages - Recent user messages
 * @param emotionalState - Detected emotional state
 * @param currentTopic - Current conversation topic
 * @returns Prefetch context for LLM
 */
export function generatePrefetchContext(
  recentUserMessages: string[],
  emotionalState: string | null,
  currentTopic: string | null
): PrefetchContext {
  // Analyze recent messages for patterns
  const allText = recentUserMessages.join(' ').toLowerCase();

  // Extract potential topics
  const topics: string[] = [];
  for (const indicator of TOPIC_INDICATORS) {
    if (indicator.pattern.test(allText)) {
      topics.push(indicator.topic);
    }
  }
  if (currentTopic && !topics.includes(currentTopic)) {
    topics.unshift(currentTopic);
  }

  // Build user history hint
  let userHistoryHint = '';
  if (topics.length > 0) {
    userHistoryHint = `Recent topics: ${topics.slice(0, 3).join(', ')}.`;
  }

  // Build emotional hint
  let emotionalHint = 'Neutral emotional state.';
  if (emotionalState) {
    emotionalHint = EMOTION_GUIDES[emotionalState] || `User seems ${emotionalState}.`;
  }

  // Suggest mode based on context
  let suggestedMode = 'conversational';
  if (topics.includes('stress') || emotionalState === 'stressed') {
    suggestedMode = 'supportive';
  } else if (topics.includes('goals')) {
    suggestedMode = 'coaching';
  }

  return {
    userHistoryHint,
    recentTopics: topics.slice(0, 5),
    emotionalHint,
    suggestedMode,
  };
}

