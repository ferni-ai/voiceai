/**
 * Rhythm Intelligence Constants
 *
 * Default profiles, thresholds, and mappings.
 *
 * @module @ferni/conversation/rhythm-intelligence/constants
 */

import type { ConversationalRhythm, RhythmPreference } from './types.js';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default rhythm preference
 */
export const DEFAULT_RHYTHM_PREFERENCE: RhythmPreference = {
  length: 'moderate',
  energy: 'moderate',
  sampleSize: 0,
};

/**
 * Default rhythm profile
 */
export const DEFAULT_RHYTHM_PROFILE: Omit<ConversationalRhythm, 'userId' | 'updatedAt'> = {
  preferredResponseLength: 'moderate',
  preferredPace: 'moderate',
  avgWordsPerTurn: 25,
  optimalResponseLength: 50,
  preferredPauseMs: 500,
  timePatterns: {
    morning: { ...DEFAULT_RHYTHM_PREFERENCE },
    afternoon: { ...DEFAULT_RHYTHM_PREFERENCE },
    evening: { ...DEFAULT_RHYTHM_PREFERENCE },
    lateNight: { ...DEFAULT_RHYTHM_PREFERENCE, energy: 'low' },
  },
  topicPreferences: [],
  turnsAnalyzed: 0,
};

// ============================================================================
// WORD COUNT RANGES
// ============================================================================

/**
 * Word count ranges by preference
 */
export const WORD_RANGES = {
  brief: { min: 10, max: 30 },
  moderate: { min: 30, max: 70 },
  detailed: { min: 70, max: 150 },
} as const;

/**
 * User turn length to preference mapping
 */
export const USER_TURN_TO_RESPONSE: Record<string, { min: number; max: number }> = {
  veryShort: { min: 10, max: 25 }, // < 10 words → brief
  short: { min: 20, max: 40 }, // 10-25 words → brief-moderate
  moderate: { min: 35, max: 70 }, // 25-50 words → moderate
  detailed: { min: 50, max: 100 }, // 50-100 words → moderate-detailed
  lengthy: { min: 60, max: 120 }, // > 100 words → detailed
};

// ============================================================================
// PAUSE TIMING
// ============================================================================

/**
 * Pause timing by pace preference (ms)
 */
export const PAUSE_TIMING = {
  quick: 300,
  moderate: 500,
  leisurely: 800,
} as const;

/**
 * Pause timing by emotional state (ms)
 */
export const EMOTIONAL_PAUSE_ADJUSTMENT: Record<string, number> = {
  sad: 300,
  anxious: -100,
  happy: 0,
  calm: 200,
  excited: -200,
  thoughtful: 400,
  vulnerable: 500,
};

// ============================================================================
// THRESHOLDS
// ============================================================================

export const THRESHOLDS = {
  /** Minimum turns for reliable profile */
  minTurnsForProfile: 10,

  /** Minimum turns for topic preference */
  minTurnsForTopicPref: 5,

  /** Confidence threshold for using learned rhythm */
  minConfidence: 0.6,

  /** Very short turn threshold (words) */
  veryShortTurnWords: 10,

  /** Short turn threshold (words) */
  shortTurnWords: 25,

  /** Moderate turn threshold (words) */
  moderateTurnWords: 50,

  /** Detailed turn threshold (words) */
  detailedTurnWords: 100,
};

// ============================================================================
// TIME OF DAY
// ============================================================================

/**
 * Get time of day from hour
 */
export function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'lateNight' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'lateNight';
}

/**
 * Default energy by time of day
 */
export const TIME_OF_DAY_ENERGY: Record<
  'morning' | 'afternoon' | 'evening' | 'lateNight',
  'low' | 'moderate' | 'high'
> = {
  morning: 'moderate',
  afternoon: 'high',
  evening: 'moderate',
  lateNight: 'low',
};

// ============================================================================
// ENERGY DETECTION
// ============================================================================

/**
 * High energy indicators
 */
export const HIGH_ENERGY_PATTERNS = [
  /!+/,
  /\b(amazing|awesome|excited|fantastic|great|love|wonderful)\b/i,
  /\b(can't wait|so excited|so happy)\b/i,
];

/**
 * Low energy indicators
 */
export const LOW_ENERGY_PATTERNS = [
  /\.{3,}/,
  /\b(tired|exhausted|drained|meh|whatever|idk|idc)\b/i,
  /\b(I guess|I suppose|maybe)\b/i,
];
