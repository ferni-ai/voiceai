/**
 * Mood Conversion Utilities
 *
 * Provides unified mood format conversion between different journal storage systems.
 *
 * The Problem:
 * - Digital Twin Journal uses string mood IDs: 'happy', 'calm', 'anxious', etc.
 * - ProductivityStore uses numeric mood scores: 1-10 scale
 * - Trust Systems uses both moodScore (number) and mood (string)
 *
 * This module provides conversion helpers to maintain consistency across systems.
 *
 * @module mood-conversion
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'mood-conversion' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Canonical mood IDs used across the system
 * These map to Lucide icons and have consistent labels
 */
export type MoodId =
  | 'happy'
  | 'calm'
  | 'anxious'
  | 'sad'
  | 'angry'
  | 'grateful'
  | 'tired'
  | 'excited'
  | 'neutral'
  | 'overwhelmed'
  | 'hopeful'
  | 'reflective';

/**
 * Unified mood representation
 */
export interface UnifiedMood {
  /** String identifier for UI/display */
  id: MoodId;
  /** Human-readable label */
  label: string;
  /** Numeric score 1-10 for analytics */
  score: number;
  /** Valence: positive, negative, or neutral */
  valence: 'positive' | 'negative' | 'neutral';
  /** Lucide icon name */
  icon: string;
}

// ============================================================================
// MOOD DEFINITIONS
// ============================================================================

/**
 * Master mood definitions with all metadata
 * This is the single source of truth for mood data
 */
export const MOOD_DEFINITIONS: Record<MoodId, UnifiedMood> = {
  // Positive moods (score >= 7)
  happy: {
    id: 'happy',
    label: 'Happy',
    score: 8,
    valence: 'positive',
    icon: 'smile',
  },
  excited: {
    id: 'excited',
    label: 'Excited',
    score: 9,
    valence: 'positive',
    icon: 'star',
  },
  grateful: {
    id: 'grateful',
    label: 'Grateful',
    score: 9,
    valence: 'positive',
    icon: 'heart',
  },
  hopeful: {
    id: 'hopeful',
    label: 'Hopeful',
    score: 7,
    valence: 'positive',
    icon: 'sun',
  },
  calm: {
    id: 'calm',
    label: 'Calm',
    score: 7,
    valence: 'positive',
    icon: 'cloud',
  },

  // Neutral moods (score 4-6)
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    score: 5,
    valence: 'neutral',
    icon: 'minus',
  },
  reflective: {
    id: 'reflective',
    label: 'Reflective',
    score: 5,
    valence: 'neutral',
    icon: 'brain',
  },
  tired: {
    id: 'tired',
    label: 'Tired',
    score: 4,
    valence: 'neutral',
    icon: 'moon',
  },

  // Negative moods (score <= 3)
  anxious: {
    id: 'anxious',
    label: 'Anxious',
    score: 3,
    valence: 'negative',
    icon: 'alert-circle',
  },
  sad: {
    id: 'sad',
    label: 'Sad',
    score: 2,
    valence: 'negative',
    icon: 'frown',
  },
  angry: {
    id: 'angry',
    label: 'Frustrated',
    score: 3,
    valence: 'negative',
    icon: 'zap',
  },
  overwhelmed: {
    id: 'overwhelmed',
    label: 'Overwhelmed',
    score: 2,
    valence: 'negative',
    icon: 'cloud-rain',
  },
};

/**
 * Get all mood IDs as an array
 */
export const ALL_MOOD_IDS = Object.keys(MOOD_DEFINITIONS) as MoodId[];

// ============================================================================
// CONVERSION: String ID -> Numeric Score
// ============================================================================

/**
 * Convert a string mood ID to numeric score (1-10)
 *
 * @param moodId - The mood string ID (e.g., 'happy', 'anxious')
 * @returns Numeric score between 1-10, or 5 (neutral) if unknown
 *
 * @example
 * moodIdToScore('happy')  // 8
 * moodIdToScore('anxious') // 3
 * moodIdToScore('unknown') // 5 (fallback)
 */
export function moodIdToScore(moodId: string | undefined | null): number {
  if (!moodId) return 5;

  const normalized = moodId.toLowerCase().trim();
  const mood = MOOD_DEFINITIONS[normalized as MoodId];

  if (mood) {
    return mood.score;
  }

  // Try to match partial strings
  for (const [id, def] of Object.entries(MOOD_DEFINITIONS)) {
    if (normalized.includes(id) || id.includes(normalized)) {
      return def.score;
    }
  }

  log.debug({ moodId }, 'Unknown mood ID, using neutral score');
  return 5;
}

// ============================================================================
// CONVERSION: Numeric Score -> String ID
// ============================================================================

/**
 * Score ranges for mood estimation
 */
const SCORE_TO_MOOD_MAP: Array<{ min: number; max: number; mood: MoodId }> = [
  { min: 9, max: 10, mood: 'excited' },
  { min: 8, max: 8.99, mood: 'happy' },
  { min: 7, max: 7.99, mood: 'calm' },
  { min: 6, max: 6.99, mood: 'hopeful' },
  { min: 5, max: 5.99, mood: 'neutral' },
  { min: 4, max: 4.99, mood: 'tired' },
  { min: 3, max: 3.99, mood: 'anxious' },
  { min: 2, max: 2.99, mood: 'sad' },
  { min: 1, max: 1.99, mood: 'overwhelmed' },
];

/**
 * Convert a numeric mood score to string ID
 *
 * @param score - Numeric score (1-10)
 * @returns Best matching mood ID
 *
 * @example
 * scoreToMoodId(8)  // 'happy'
 * scoreToMoodId(3)  // 'anxious'
 * scoreToMoodId(5)  // 'neutral'
 */
export function scoreToMoodId(score: number | undefined | null): MoodId {
  if (score === undefined || score === null) return 'neutral';

  // Clamp to valid range
  const clamped = Math.max(1, Math.min(10, score));

  for (const range of SCORE_TO_MOOD_MAP) {
    if (clamped >= range.min && clamped <= range.max) {
      return range.mood;
    }
  }

  return 'neutral';
}

// ============================================================================
// MOOD INFORMATION GETTERS
// ============================================================================

/**
 * Get full mood definition by ID
 */
export function getMoodById(moodId: string | undefined | null): UnifiedMood {
  if (!moodId) return MOOD_DEFINITIONS.neutral;

  const normalized = moodId.toLowerCase().trim();
  return MOOD_DEFINITIONS[normalized as MoodId] || MOOD_DEFINITIONS.neutral;
}

/**
 * Get mood label from ID or score
 */
export function getMoodLabel(moodIdOrScore: string | number | undefined | null): string {
  if (typeof moodIdOrScore === 'number') {
    const id = scoreToMoodId(moodIdOrScore);
    return MOOD_DEFINITIONS[id].label;
  }
  return getMoodById(moodIdOrScore).label;
}

/**
 * Get mood icon name from ID or score
 */
export function getMoodIcon(moodIdOrScore: string | number | undefined | null): string {
  if (typeof moodIdOrScore === 'number') {
    const id = scoreToMoodId(moodIdOrScore);
    return MOOD_DEFINITIONS[id].icon;
  }
  return getMoodById(moodIdOrScore).icon;
}

/**
 * Get mood valence (positive/negative/neutral) from ID or score
 */
export function getMoodValence(
  moodIdOrScore: string | number | undefined | null
): 'positive' | 'negative' | 'neutral' {
  if (typeof moodIdOrScore === 'number') {
    const id = scoreToMoodId(moodIdOrScore);
    return MOOD_DEFINITIONS[id].valence;
  }
  return getMoodById(moodIdOrScore).valence;
}

// ============================================================================
// MOOD NORMALIZATION
// ============================================================================

/**
 * Normalize any mood representation to a consistent format
 *
 * Handles various input formats:
 * - String ID: 'happy', 'anxious'
 * - Numeric score: 1-10
 * - Full mood object: { mood: 'happy', moodScore: 8 }
 * - Legacy formats
 *
 * @returns Normalized mood with both ID and score
 */
export function normalizeMood(input: unknown): { id: MoodId; score: number } {
  // Handle string ID
  if (typeof input === 'string') {
    const id = input.toLowerCase().trim() as MoodId;
    if (MOOD_DEFINITIONS[id]) {
      return { id, score: MOOD_DEFINITIONS[id].score };
    }
    return { id: 'neutral', score: 5 };
  }

  // Handle number (score)
  if (typeof input === 'number') {
    const id = scoreToMoodId(input);
    return { id, score: input };
  }

  // Handle object with mood and/or moodScore
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;

    // Try to get mood ID
    const moodId = obj.mood || obj.moodId || obj.id;
    if (typeof moodId === 'string' && MOOD_DEFINITIONS[moodId.toLowerCase() as MoodId]) {
      const id = moodId.toLowerCase() as MoodId;
      const score = typeof obj.moodScore === 'number' ? obj.moodScore : MOOD_DEFINITIONS[id].score;
      return { id, score };
    }

    // Try to get mood score
    const moodScore = obj.moodScore || obj.score || obj.mood;
    if (typeof moodScore === 'number') {
      return { id: scoreToMoodId(moodScore), score: moodScore };
    }
  }

  // Default to neutral
  return { id: 'neutral', score: 5 };
}

// ============================================================================
// MOOD ANALYTICS HELPERS
// ============================================================================

/**
 * Calculate average mood from an array of mood values (mixed formats)
 */
export function calculateAverageMood(moods: Array<string | number | unknown>): {
  averageScore: number;
  averageId: MoodId;
  distribution: Record<MoodId, number>;
} {
  if (!moods.length) {
    return {
      averageScore: 5,
      averageId: 'neutral',
      distribution: {} as Record<MoodId, number>,
    };
  }

  const distribution: Record<MoodId, number> = {} as Record<MoodId, number>;
  let totalScore = 0;

  for (const mood of moods) {
    const normalized = normalizeMood(mood);
    totalScore += normalized.score;
    distribution[normalized.id] = (distribution[normalized.id] || 0) + 1;
  }

  const averageScore = totalScore / moods.length;
  const averageId = scoreToMoodId(averageScore);

  return { averageScore, averageId, distribution };
}

/**
 * Get mood trend (improving/declining/stable) from mood history
 */
export function getMoodTrend(
  recentMoods: Array<string | number | unknown>,
  olderMoods: Array<string | number | unknown>
): 'improving' | 'declining' | 'stable' {
  if (!recentMoods.length || !olderMoods.length) {
    return 'stable';
  }

  const recentAvg = calculateAverageMood(recentMoods).averageScore;
  const olderAvg = calculateAverageMood(olderMoods).averageScore;

  const diff = recentAvg - olderAvg;

  if (diff >= 1) return 'improving';
  if (diff <= -1) return 'declining';
  return 'stable';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  moodIdToScore,
  scoreToMoodId,
  getMoodById,
  getMoodLabel,
  getMoodIcon,
  getMoodValence,
  normalizeMood,
  calculateAverageMood,
  getMoodTrend,
  MOOD_DEFINITIONS,
  ALL_MOOD_IDS,
};
