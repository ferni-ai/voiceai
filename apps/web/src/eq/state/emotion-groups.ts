/**
 * Emotion Groups - Hierarchical Emotion Organization
 *
 * Groups emotions into logical categories for easier management
 * and smoother transitions within groups.
 *
 * @module @ferni/eq/state/emotion-groups
 */

import type { EmotionId } from '../../emotion/emotion-state.js';

// ============================================================================
// EMOTION GROUPS
// ============================================================================

/**
 * Emotions grouped by category
 */
export const EMOTION_GROUPS = {
  /** Core listening states - Ferni's superpower */
  listening: ['attentive', 'absorbing', 'receiving', 'curiousLean', 'listening'] as const,

  /** Warmth gradient - nuanced positive emotions */
  warmth: ['warm', 'pleased', 'delighted', 'proud', 'celebrating', 'happy'] as const,

  /** Presence states - quality of "being with" */
  presence: ['present', 'holding', 'accompanying', 'waiting', 'holdingSpace'] as const,

  /** Coaching emotions - active guidance */
  coaching: ['encouraging', 'challenging', 'reflecting', 'recognizing'] as const,

  /** Relational moments - connection depth */
  relational: ['remembering', 'reconnecting', 'insider', 'growing'] as const,

  /** Transition states - smooth emotional flow */
  transition: ['processing', 'realizing', 'shifting', 'settling'] as const,

  /** Cognitive states - thinking and processing */
  cognitive: ['thinking', 'contemplative', 'curious', 'noticing'] as const,

  /** Negative states - concern and distress responses */
  negative: ['sad', 'frustrated'] as const,

  /** High energy states */
  energetic: ['excited', 'celebrating'] as const,

  /** Calm states */
  calm: ['calm', 'neutral', 'settling', 'present'] as const,
} as const;

export type EmotionGroupId = keyof typeof EMOTION_GROUPS;

// ============================================================================
// GROUP UTILITIES
// ============================================================================

/**
 * Get the group an emotion belongs to
 */
export function getEmotionGroup(emotionId: EmotionId): EmotionGroupId | null {
  for (const [groupId, emotions] of Object.entries(EMOTION_GROUPS)) {
    if ((emotions as readonly string[]).includes(emotionId)) {
      return groupId as EmotionGroupId;
    }
  }
  return null;
}

/**
 * Check if two emotions are in the same group
 */
export function areEmotionsInSameGroup(emotion1: EmotionId, emotion2: EmotionId): boolean {
  const group1 = getEmotionGroup(emotion1);
  const group2 = getEmotionGroup(emotion2);
  return group1 !== null && group1 === group2;
}

/**
 * Get all emotions in a group
 */
export function getEmotionsInGroup(groupId: EmotionGroupId): readonly EmotionId[] {
  return EMOTION_GROUPS[groupId] as readonly EmotionId[];
}

/**
 * Get a random emotion from a group
 */
export function getRandomEmotionFromGroup(groupId: EmotionGroupId): EmotionId {
  const emotions = EMOTION_GROUPS[groupId];
  const index = Math.floor(Math.random() * emotions.length);
  return emotions[index] as EmotionId;
}

/**
 * Get the next emotion in a group (circular)
 */
export function getNextEmotionInGroup(
  currentEmotion: EmotionId,
  groupId: EmotionGroupId
): EmotionId | null {
  const emotions = EMOTION_GROUPS[groupId] as readonly string[];
  const currentIndex = emotions.indexOf(currentEmotion);
  if (currentIndex === -1) return null;
  const nextIndex = (currentIndex + 1) % emotions.length;
  return emotions[nextIndex] as EmotionId;
}
