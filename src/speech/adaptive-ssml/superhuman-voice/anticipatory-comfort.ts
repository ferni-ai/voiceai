/**
 * Anticipatory Comfort Sounds
 *
 * Soft sounds that can be interjected when we detect
 * the user is sharing something difficult.
 *
 * @module speech/adaptive-ssml/superhuman-voice/anticipatory-comfort
 */

import type { HeavyContentType } from './types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Anticipatory comfort sounds for heavy content.
 * These are soft sounds that can be interjected when we detect
 * the user is sharing something difficult.
 */
export const ANTICIPATORY_COMFORT_SOUNDS = {
  /** When heavy content is detected mid-sentence */
  heavyContent: [
    '<break time="50ms"/><volume ratio="0.7"/><speed ratio="0.85"/>Mm<break time="100ms"/>',
    '<break time="80ms"/><volume ratio="0.75"/>Oh<break time="100ms"/>',
    '<break time="60ms"/><volume ratio="0.7"/>...<break time="120ms"/>',
  ],

  /** When grief/loss is mentioned */
  grief: [
    '<break time="100ms"/><speed ratio="0.75"/><volume ratio="0.7"/><emotion value="sympathetic"/>Oh...<break time="200ms"/>',
    '<break time="150ms"/><volume ratio="0.65"/><speed ratio="0.7"/>Mm...<break time="200ms"/>',
  ],

  /** When fear/anxiety is expressed */
  fear: [
    '<break time="80ms"/><volume ratio="0.8"/><speed ratio="0.85"/>I hear you.<break time="150ms"/>',
    '<break time="100ms"/><volume ratio="0.75"/>Mm.<break time="150ms"/>',
  ],

  /** When frustration is expressed */
  frustration: [
    '<break time="60ms"/><volume ratio="0.85"/>Yeah.<break time="100ms"/>',
    '<break time="80ms"/>Ugh.<break time="100ms"/>',
  ],
} as const;

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get an anticipatory comfort sound based on content type.
 */
export function getAnticipatoryComfortSound(
  contentType: 'heavyContent' | 'grief' | 'fear' | 'frustration'
): string {
  const sounds = ANTICIPATORY_COMFORT_SOUNDS[contentType];
  return sounds[Math.floor(Math.random() * sounds.length)];
}

/**
 * Detect if text contains heavy content signals.
 */
export function detectHeavyContentType(text: string): HeavyContentType | null {
  const lowerText = text.toLowerCase();

  // Grief signals
  if (
    /\b(died|passed away|lost|gone|funeral|grieving|miss them|miss her|miss him)\b/i.test(lowerText)
  ) {
    return 'grief';
  }

  // Fear signals
  if (
    /\b(scared|terrified|afraid|anxious|panic|worried sick|can't stop thinking)\b/i.test(lowerText)
  ) {
    return 'fear';
  }

  // Frustration signals
  if (
    /\b(so frustrated|can't believe|fed up|sick of|tired of|keeps happening)\b/i.test(lowerText)
  ) {
    return 'frustration';
  }

  // General heavy content
  if (
    /\b(struggling|hard to|difficult|tough|breaking down|falling apart|don't know what)\b/i.test(
      lowerText
    )
  ) {
    return 'heavyContent';
  }

  return null;
}
