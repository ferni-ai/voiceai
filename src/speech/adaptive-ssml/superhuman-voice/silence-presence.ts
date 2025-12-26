/**
 * Silence Presence Phrases
 *
 * Comfortable silence phrases by presence level.
 * These are phrases that can trail off into silence while maintaining presence.
 *
 * @module speech/adaptive-ssml/superhuman-voice/silence-presence
 */

import type { PresenceLevel } from '../../../conversation/superhuman/presence-mode.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Comfortable silence phrases by presence level.
 * These are phrases that can trail off into silence while maintaining presence.
 */
export const SILENCE_PRESENCE_PHRASES: Record<PresenceLevel, string[]> = {
  normal: [],
  gentle: [
    '<break time="200ms"/><speed ratio="0.9"/><volume ratio="0.9"/>I\'m here.<break time="400ms"/>',
    '<break time="150ms"/><speed ratio="0.88"/>Take your time.<break time="500ms"/>',
    '<break time="200ms"/><volume ratio="0.85"/>Mm.<break time="400ms"/>',
  ],
  holding: [
    '<break time="300ms"/><speed ratio="0.8"/><volume ratio="0.8"/>I\'m right here with you.<break time="600ms"/>',
    '<break time="400ms"/><speed ratio="0.75"/><volume ratio="0.75"/>...<break time="800ms"/>',
    '<break time="300ms"/><speed ratio="0.8"/><volume ratio="0.8"/>You don\'t have to say anything.<break time="700ms"/>',
    '<break time="350ms"/><volume ratio="0.75"/>Mm.<break time="600ms"/>',
  ],
  silent: [
    '<break time="500ms"/><speed ratio="0.7"/><volume ratio="0.65"/>...<break time="1000ms"/>',
    '<break time="600ms"/><volume ratio="0.6"/>I\'m here.<break time="1200ms"/>',
    '<break time="800ms"/>',
  ],
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get a silence presence phrase for the given level.
 */
export function getSilencePresencePhrase(level: PresenceLevel | undefined): string | null {
  const phrases = SILENCE_PRESENCE_PHRASES[level || 'normal'];
  if (phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

