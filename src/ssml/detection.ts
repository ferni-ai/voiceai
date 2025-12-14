/**
 * SSML Detection Functions
 *
 * Functions for detecting emotion, pacing, volume, and vocal cues in text.
 * These functions analyze text to determine appropriate SSML parameters.
 *
 * @module ssml/detection
 */

import {
  CONTRASTIVE_PATTERNS,
  DISFLUENCY_PATTERNS,
  EMOTION_KEYWORDS,
  EMPHASIS_KEYWORDS,
  FAST_PACE_KEYWORDS,
  LAUGHTER_PATTERNS,
  REPETITION_PATTERNS,
  SARCASTIC_PATTERNS,
  SIGH_PATTERNS,
  SLOW_PACE_KEYWORDS,
  WHISPER_KEYWORDS,
} from './constants.js';
import type { DetectedPacing, DetectedVocalCues, DetectedVolume } from './types.js';

// =============================================================================
// EMOTION DETECTION
// =============================================================================

/**
 * Detect the primary emotion in text using keyword analysis
 * @param text - Text to analyze
 * @returns Detected emotion string
 */
export function detectEmotion(text: string): string {
  const lowerText = text.toLowerCase();
  const emotionCounts: Record<string, number> = {};

  // Check for emotion keywords (longer phrases first for specificity)
  const sortedKeywords = Object.entries(EMOTION_KEYWORDS).sort((a, b) => b[0].length - a[0].length);

  for (const [keyword, emotion] of sortedKeywords) {
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
 * Detect appropriate speech pacing for text
 * Analyzes keywords, punctuation, and sentence structure
 * @param text - Text to analyze
 * @returns Speed ratio and reason
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

  // Punctuation analysis
  const hasQuestion = /\?/.test(text);
  const hasExclamation = /!/.test(text);
  const hasEllipsis = /\.{3}|…/.test(text);

  // Questions often have slightly different pacing
  if (hasQuestion) {
    speed *= 0.98;
    reason += ', question';
  }

  // Exclamations can be faster
  if (hasExclamation) {
    speed *= 1.02;
    reason += ', exclamation';
  }

  // Ellipsis suggests thoughtful pause
  if (hasEllipsis) {
    speed *= 0.95;
    reason += ', ellipsis';
  }

  // Longer sentences naturally slow down
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 30) {
    speed *= 0.98;
    reason += ', long sentence';
  }

  // Complex sentence structure
  const clauseCount = (text.match(/,/g) || []).length;
  if (clauseCount > 3) {
    speed *= 0.97;
    reason += ', complex';
  }

  // Clamp to valid range
  return {
    speed: Math.max(0.6, Math.min(1.5, speed)),
    reason,
  };
}

// =============================================================================
// VOLUME DETECTION
// =============================================================================

/**
 * Detect appropriate volume for text
 * Analyzes emphasis keywords, whisper indicators, and caps
 * @param text - Text to analyze
 * @returns Volume ratio and flags
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

  // Check for contrastive patterns
  const hasContrast = CONTRASTIVE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
  if (hasContrast) {
    volume *= 1.05;
    hasEmphasis = true;
  }

  // All caps increases volume (but only meaningful caps, not 2-3 letter words)
  const capsWords = text.match(/\b[A-Z]{4,}\b/g) || [];
  if (capsWords.length > 0) {
    volume *= 1.1;
    hasEmphasis = true;
  }

  // Exclamation marks increase volume
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    volume *= 1 + exclamationCount * 0.05;
    hasEmphasis = true;
  }

  // Clamp to valid range
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
 * @param text - Text to analyze
 * @returns Detection results for various vocal cues
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

  // Check for sighs
  const hasSigh = SIGH_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

  // Check for disfluencies
  const hasDisfluency = DISFLUENCY_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

  // Check for repetition
  const hasRepetition = REPETITION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

  // Check for sarcasm
  const hasSarcasm = SARCASTIC_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });

  // Reset lastIndex for all patterns (they have /g flag)
  [
    ...LAUGHTER_PATTERNS,
    ...SIGH_PATTERNS,
    ...DISFLUENCY_PATTERNS,
    ...REPETITION_PATTERNS,
    ...SARCASTIC_PATTERNS,
  ].forEach((p) => {
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
