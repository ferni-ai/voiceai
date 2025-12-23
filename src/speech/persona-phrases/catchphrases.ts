/**
 * Persona Phrases - Catchphrases
 *
 * Signature catchphrases for each persona.
 *
 * @module persona-phrases/catchphrases
 */

import { breakTag } from '../../ssml/cartesia.js';
import type { CatchphraseConfig } from './types.js';
import { normalizePersonaId, addPersonaAliases } from './helpers.js';

// ============================================================================
// CATCHPHRASES (Signature phrases for each persona)
// ============================================================================

export const PERSONA_CATCHPHRASES: Record<string, CatchphraseConfig> = {
  ferni: {
    phrases: [
      "You've got this.",
      "Let's figure this out together.",
      "I'm here for you.",
      'One step at a time.',
    ],
    emphasis: 'normal',
    ssmlWrapper: (phrase) =>
      `${breakTag('250ms')}<emotion value="affectionate">${phrase}</emotion>${breakTag('300ms')}`,
  },
  'nayan-patel': {
    phrases: [
      'Stay the course.',
      'Time in the market, not timing the market.',
      'Keep costs low.',
      "Don't look for the needle in the haystack. Buy the haystack.",
    ],
    emphasis: 'slow',
    ssmlWrapper: (phrase) =>
      `${breakTag('300ms')}<speed ratio="0.78"><emotion value="affectionate">${phrase}</emotion></speed>${breakTag('400ms')}`,
  },
  'peter-john': {
    phrases: [
      'Invest in what you know!',
      "Behind every stock is a company—find out what it's doing!",
      'Know what you own, and know why you own it!',
      'Everyone has the brainpower to follow the stock market!',
    ],
    emphasis: 'excited',
    ssmlWrapper: (phrase) =>
      `${breakTag('200ms')}<speed ratio="1.05"><emotion value="curious">${phrase}</emotion></speed>${breakTag('300ms')}`,
  },
  'maya-santos': {
    phrases: [
      'Progress, not perfection.',
      'Every dollar has a job.',
      "You're not alone in this.",
      'Small wins add up.',
    ],
    emphasis: 'normal',
    ssmlWrapper: (phrase) =>
      `${breakTag('250ms')}<emotion value="affectionate">${phrase}</emotion>${breakTag('300ms')}`,
  },
  'jordan-taylor': {
    phrases: [
      "Let's make it happen!",
      'The future you will thank you!',
      'This is exciting!',
      "We've got this!",
    ],
    emphasis: 'excited',
    ssmlWrapper: (phrase) =>
      `${breakTag('200ms')}<speed ratio="1.08"><emotion value="surprised">${phrase}</emotion></speed>${breakTag('250ms')}`,
  },
  'alex-chen': {
    phrases: ["Let's get this done.", 'Efficient and effective.', 'On it.'],
    emphasis: 'normal',
    ssmlWrapper: (phrase) => `${breakTag('150ms')}${phrase}${breakTag('200ms')}`,
  },
};

// Add backward compatibility aliases
addPersonaAliases(PERSONA_CATCHPHRASES);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get catchphrase with SSML wrapping
 */
export function getCatchphraseWithSsml(personaId: string): string | null {
  const normalized = normalizePersonaId(personaId);
  const config = PERSONA_CATCHPHRASES[normalized];
  if (!config) return null;
  const phrase = config.phrases[Math.floor(Math.random() * config.phrases.length)];
  return config.ssmlWrapper(phrase);
}
