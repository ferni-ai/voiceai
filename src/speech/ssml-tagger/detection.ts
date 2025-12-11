/**
 * SSML Detection Functions
 * Detects emotion, pacing, volume, and vocal cues from text
 */

import {
  EMOTION_KEYWORDS,
  SLOW_PACE_KEYWORDS,
  FAST_PACE_KEYWORDS,
  EMPHASIS_KEYWORDS,
  WHISPER_KEYWORDS,
  CONTRASTIVE_PATTERNS,
  LAUGHTER_PATTERNS,
  SIGH_PATTERNS,
} from './constants.js';

/**
 * Detect emotion from text with nuanced analysis
 */
export function detectEmotion(text: string): string {
  const lowerText = text.toLowerCase();

  // Check for emotion keywords (longer phrases first for specificity)
  const sortedKeywords = Object.entries(EMOTION_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, emotion] of sortedKeywords) {
    if (lowerText.includes(phrase)) {
      return emotion;
    }
  }

  // Default to affectionate for warm personality
  return 'affectionate';
}

/**
 * Detect pacing with sophisticated analysis
 * Returns speed ratio and reason
 */
export function detectPacing(text: string): { speed: number; reason: string } {
  const lowerText = text.toLowerCase();

  const slowMatches = SLOW_PACE_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
  const fastMatches = FAST_PACE_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;

  const hasQuestion = text.includes('?');
  const hasExclamation = text.includes('!');
  const hasEllipsis = text.includes('...') || text.includes('…');

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
      : text.length;

  const hasComplexStructure = /(,|;|:|—|–)/.test(text);
  const clauseCount = (text.match(/,/g) || []).length;

  // Natural pacing variation (±5%)
  const variation = 0.95 + Math.random() * 0.1;

  // Cartesia speed range: 0.6 - 1.5 (we stay in the 0.68-0.85 range)
  if (hasEllipsis || slowMatches > fastMatches + 1) {
    return { speed: 0.68 * variation, reason: 'thoughtful' };
  }

  if (hasExclamation && fastMatches > 0) {
    return { speed: 0.85 * variation, reason: 'enthusiastic' };
  }

  if (hasQuestion) {
    return { speed: 0.78 * variation, reason: 'inquisitive' };
  }

  if (avgSentenceLength > 120 || clauseCount > 3) {
    return { speed: 0.72 * variation, reason: 'complex' };
  }

  if (hasComplexStructure && clauseCount > 1) {
    return { speed: 0.78 * variation, reason: 'structured' };
  }

  return { speed: 0.8 * variation, reason: 'conversational' };
}

/**
 * Detect volume with nuanced analysis
 */
export function detectVolume(text: string): {
  volume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
} {
  const lowerText = text.toLowerCase();

  const hasEmphasis = EMPHASIS_KEYWORDS.some((kw) => lowerText.includes(kw));
  const hasWhisper = WHISPER_KEYWORDS.some((kw) => lowerText.includes(kw));
  const hasAllCaps = /[A-Z]{3,}/.test(text);
  const hasContrast = CONTRASTIVE_PATTERNS.some((pattern) => pattern.test(text));

  if (hasWhisper) {
    return { volume: 0.68, hasEmphasis: false, hasWhisper: true };
  }

  if (hasEmphasis || hasAllCaps || hasContrast) {
    return { volume: 1.18, hasEmphasis: true, hasWhisper: false };
  }

  return { volume: 1.0, hasEmphasis: false, hasWhisper: false };
}

/**
 * Detect vocal cues (laughter, sighs)
 */
export function detectVocalCues(text: string): {
  hasLaughter: boolean;
  hasSigh: boolean;
  laughterCount: number;
} {
  const hasLaughter = LAUGHTER_PATTERNS.some((pattern) => pattern.test(text));
  const hasSigh = SIGH_PATTERNS.some((pattern) => pattern.test(text));

  const laughterCount = LAUGHTER_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);

  return { hasLaughter, hasSigh, laughterCount };
}
