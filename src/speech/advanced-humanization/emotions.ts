/**
 * Emotion Mapping for TTS
 *
 * Maps conversational contexts to appropriate Cartesia emotions
 * for natural, context-aware voice synthesis.
 *
 * @module advanced-humanization/emotions
 */

import type { CartesiaEmotion, EmotionContext } from './types.js';

// ============================================================================
// EMOTION CONTEXT MAPPING
// ============================================================================

/**
 * Map conversation context to appropriate Cartesia emotion
 *
 * Uses nuanced emotion selection based on:
 * - Agent's intent
 * - User's emotional state
 * - Topic weight
 * - Relationship depth
 *
 * @param context - The emotion context to map
 * @returns The most appropriate Cartesia emotion
 */
export function mapContextToEmotion(context: EmotionContext): CartesiaEmotion {
  const { agentIntent, userEmotion, topicWeight, relationshipStage } = context;

  // Heavy topics need gentler emotions
  if (topicWeight === 'heavy') {
    if (userEmotion === 'sad') return 'sympathetic';
    if (userEmotion === 'anxious') return 'calm';
    if (userEmotion === 'frustrated') return 'peaceful';
    return 'affectionate';
  }

  // Intent-based mapping
  switch (agentIntent) {
    case 'supportive':
      if (userEmotion === 'sad') return 'sympathetic';
      if (userEmotion === 'anxious') return 'calm';
      return 'affectionate';

    case 'thinking':
      return 'curious';

    case 'explaining':
      if (relationshipStage === 'trusted_advisor') return 'calm';
      return 'content';

    case 'celebrating':
      if (userEmotion === 'excited') return 'triumphant';
      return 'excited';

    case 'comforting':
      // Note: heavy topics handled at top, but for extra empathy on medium weight
      return userEmotion === 'sad' ? 'sympathetic' : 'affectionate';

    case 'joking':
      if (relationshipStage === 'stranger') return 'content'; // Don't overdo it
      return 'comedic';

    case 'remembering':
      return 'nostalgic';

    case 'questioning':
      return 'curious';

    case 'uncertain':
      return 'hesitant';

    case 'apologizing':
      return 'apologetic';

    case 'encouraging':
      if (userEmotion === 'anxious') return 'calm';
      return 'enthusiastic';

    case 'reflecting':
      return 'wistful';

    default:
      return 'content';
  }
}

// ============================================================================
// EMOTION TRANSITIONS
// ============================================================================

/**
 * Emotion groupings for smooth transitions
 */
const emotionGroups: Record<string, CartesiaEmotion[]> = {
  warm: ['affectionate', 'sympathetic', 'grateful', 'content', 'peaceful'],
  excited: ['excited', 'enthusiastic', 'triumphant', 'happy', 'elated'],
  thoughtful: ['curious', 'wistful', 'nostalgic', 'calm', 'serene'],
  uncertain: ['hesitant', 'confused', 'insecure', 'apologetic'],
  heavy: ['sad', 'melancholic', 'disappointed', 'sympathetic'],
};

/**
 * Get emotion transition for smoother delivery.
 *
 * Instead of jumping between emotions, we create a transition path
 * with appropriate pauses for more natural-sounding speech.
 *
 * @param fromEmotion - The starting emotion (or null if starting fresh)
 * @param toEmotion - The target emotion
 * @returns Array of emotion transitions with SSML break hints
 */
export function getEmotionTransition(
  fromEmotion: CartesiaEmotion | null,
  toEmotion: CartesiaEmotion
): Array<{ emotion: CartesiaEmotion; breakBefore: string }> {
  // If no previous emotion, just return target
  if (!fromEmotion) {
    return [{ emotion: toEmotion, breakBefore: '' }];
  }

  // Same emotion, no transition needed
  if (fromEmotion === toEmotion) {
    return [{ emotion: toEmotion, breakBefore: '' }];
  }

  // Find groups for each emotion
  let fromGroup: string | null = null;
  let toGroup: string | null = null;

  for (const [group, emotions] of Object.entries(emotionGroups)) {
    if (emotions.includes(fromEmotion)) fromGroup = group;
    if (emotions.includes(toEmotion)) toGroup = group;
  }

  // Same group = quick transition
  if (fromGroup === toGroup) {
    return [{ emotion: toEmotion, breakBefore: '<break time="200ms"/>' }];
  }

  // Different groups = pause and transition through neutral
  return [
    { emotion: 'calm', breakBefore: '<break time="300ms"/>' }, // Neutral transition
    { emotion: toEmotion, breakBefore: '<break time="150ms"/>' },
  ];
}

