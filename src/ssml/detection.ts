/**
 * SSML Detection
 * 
 * Functions for detecting emotion, pacing, volume, and vocal cues in text.
 */

import {
  EMOTION_KEYWORDS,
  SLOW_PACE_KEYWORDS,
  FAST_PACE_KEYWORDS,
  EMPHASIS_KEYWORDS,
  WHISPER_KEYWORDS,
  LAUGHTER_PATTERNS,
  SIGH_PATTERNS,
  DISFLUENCY_PATTERNS,
  REPETITION_PATTERNS,
  SARCASTIC_PATTERNS,
} from './constants.js';
import type { DetectedPacing, DetectedVolume, DetectedVocalCues } from './types.js';

// =============================================================================
// EMOTION DETECTION
// =============================================================================

/**
 * Detect the primary emotion in text
 */
export function detectEmotion(text: string): string {
  const lowerText = text.toLowerCase();
  const emotionCounts: Record<string, number> = {};

  for (const [keyword, emotion] of Object.entries(EMOTION_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    }
  }

  // Find dominant emotion
  let maxCount = 0;
  let dominantEmotion = 'neutral';

  for (const [emotion, count] of Object.entries(emotionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  return dominantEmotion;
}

// =============================================================================
// PACING DETECTION
// =============================================================================

/**
 * Detect appropriate pacing for text
 */
export function detectPacing(text: string): DetectedPacing {
  const lowerText = text.toLowerCase();
  let speed = 1.0;
  let reason = 'normal';

  // Check for slow pace indicators
  const slowMatches = SLOW_PACE_KEYWORDS.filter((kw) => lowerText.includes(kw));
  if (slowMatches.length > 0) {
    speed = 0.9 - slowMatches.length * 0.02;
    reason = `slow: ${slowMatches[0]}`;
  }

  // Check for fast pace indicators
  const fastMatches = FAST_PACE_KEYWORDS.filter((kw) => lowerText.includes(kw));
  if (fastMatches.length > 0 && fastMatches.length > slowMatches.length) {
    speed = 1.1 + fastMatches.length * 0.02;
    reason = `fast: ${fastMatches[0]}`;
  }

  // Questions often have slightly different pacing
  if (/\?/.test(text)) {
    speed *= 0.98;
    reason += ', question';
  }

  // Exclamations can be faster
  if (/!/.test(text)) {
    speed *= 1.02;
    reason += ', exclamation';
  }

  // Longer sentences naturally slow down
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 30) {
    speed *= 0.98;
    reason += ', long sentence';
  }

  return { speed: Math.max(0.6, Math.min(1.5, speed)), reason };
}

// =============================================================================
// VOLUME DETECTION
// =============================================================================

/**
 * Detect appropriate volume for text
 */
export function detectVolume(text: string): DetectedVolume {
  const lowerText = text.toLowerCase();
  let volume = 1.0;
  let hasEmphasis = false;
  let hasWhisper = false;

  // Check for emphasis keywords
  const emphasisMatches = EMPHASIS_KEYWORDS.filter((kw) => lowerText.includes(kw));
  if (emphasisMatches.length > 0) {
    volume = 1.1 + emphasisMatches.length * 0.05;
    hasEmphasis = true;
  }

  // Check for whisper keywords
  const whisperMatches = WHISPER_KEYWORDS.filter((kw) => lowerText.includes(kw));
  if (whisperMatches.length > 0) {
    volume = 0.7 - whisperMatches.length * 0.03;
    hasWhisper = true;
  }

  // All caps increases volume
  const capsWords = text.match(/\b[A-Z]{2,}\b/g) || [];
  if (capsWords.length > 0 && capsWords.some((w) => w.length > 3)) {
    volume *= 1.1;
    hasEmphasis = true;
  }

  // Exclamation marks increase volume
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    volume *= 1 + exclamationCount * 0.05;
    hasEmphasis = true;
  }

  return {
    volume: Math.max(0.5, Math.min(2.0, volume)),
    hasEmphasis,
    hasWhisper,
  };
}

// =============================================================================
// VOCAL CUE DETECTION
// =============================================================================

/**
 * Detect vocal cues in text (laughter, sighs, disfluencies, etc.)
 */
export function detectVocalCues(text: string): DetectedVocalCues {
  // Count laughter occurrences
  let laughterCount = 0;
  for (const pattern of LAUGHTER_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      laughterCount += matches.length;
    }
  }
  
  const hasLaughter = laughterCount > 0;
  const hasSigh = SIGH_PATTERNS.some((pattern) => pattern.test(text));
  const hasDisfluency = DISFLUENCY_PATTERNS.some((pattern) => pattern.test(text));
  const hasRepetition = REPETITION_PATTERNS.some((pattern) => pattern.test(text));
  const hasSarcasm = SARCASTIC_PATTERNS.some((pattern) => pattern.test(text));

  // Reset lastIndex for all patterns (they have /g flag)
  [...LAUGHTER_PATTERNS, ...SIGH_PATTERNS, ...DISFLUENCY_PATTERNS, 
   ...REPETITION_PATTERNS, ...SARCASTIC_PATTERNS].forEach((p) => {
    p.lastIndex = 0;
  });

  return {
    hasLaughter,
    hasSigh,
    hasDisfluency,
    hasRepetition,
    hasSarcasm,
    laughterCount,
  };
}

