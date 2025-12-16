/**
 * Excitement Interruption Effect
 *
 * When the user has a breakthrough or says something insight-worthy,
 * the agent gets genuinely excited and shows it.
 *
 * @module @ferni/conversation/effects/reactions/excitement-interruption
 */

import { getPersonaTuning } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// EXCITEMENT PHRASES
// ============================================================================

const EXCITEMENT_BREAKS = [
  'Wait— yes!',
  "Oh! That's it!",
  "Hold on— that's exactly right!",
  'Yes! Say more about that!',
  "That's huge!",
  'Oh wow, yes!',
];

const CAPTURING_INSIGHT = [
  'I want to pause on what you just said.',
  "Can we stay with that for a second? That's important.",
  'Wait, say that again. That was really good.',
  "I don't want to lose that thought.",
];

const ENTHUSIASTIC_AGREEMENT = [
  'Yes! A hundred percent.',
  "That's exactly what I was thinking!",
  'You nailed it.',
  "That's so spot on.",
];

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create excitement interruption effect for a persona
 */
export function createExcitementInterruptionEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const config = tuning.reactions.excitementInterruption;

  return {
    id: 'excitement_interruption',
    name: 'Excitement Interruption',
    capability: 'reactions',
    placement: 'interrupt', // Interrupts with emphasis
    config: {
      probability: config.probability,
      cooldownTurns: config.cooldownTurns,
      maxPerSession: config.maxPerSession,
    },

    isApplicable(context: EffectContext): boolean {
      // Only trigger on breakthrough moments
      return context.signals.isBreakthrough;
    },

    generate(context: EffectContext): EffectResult | null {
      // Choose category based on context
      const seed = `${context.sessionId}:${context.turnNumber}:excitement`;
      const hash = simpleHash(seed);

      let phrases: string[];
      const categoryRoll = (hash % 100) / 100;

      if (categoryRoll < 0.4) {
        phrases = EXCITEMENT_BREAKS;
      } else if (categoryRoll < 0.7) {
        phrases = CAPTURING_INSIGHT;
      } else {
        phrases = ENTHUSIASTIC_AGREEMENT;
      }

      const index = Math.floor(hash / 100) % phrases.length;
      const phrase = phrases[index];

      return {
        content: phrase,
        ssml: `<break time="100ms"/><prosody rate="105%">${phrase}</prosody><break time="200ms"/>`,
        metadata: {
          category:
            categoryRoll < 0.4 ? 'excitement' : categoryRoll < 0.7 ? 'capture' : 'agreement',
        },
      };
    },
  };
}

// ============================================================================
// UTILITY
// ============================================================================

function simpleHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
