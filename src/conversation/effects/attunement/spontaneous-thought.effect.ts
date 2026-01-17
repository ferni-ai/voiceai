/**
 * Spontaneous Thought Effect
 *
 * Generates unprompted observations that make the agent feel like they have
 * genuine thoughts and curiosities, not just responses to user input.
 *
 * @module @ferni/conversation/effects/attunement/spontaneous-thought
 */

import { getPersonaTuning } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// SPONTANEOUS THOUGHT LIBRARIES
// ============================================================================

const THOUGHT_TEMPLATES = {
  observation: [
    'You know what just hit me?',
    'Something just occurred to me...',
    'Wait, I just noticed something.',
    'Huh, I just realized...',
  ],
  connection: [
    'This reminds me of something...',
    'You know what this connects to?',
    'There is something I have been thinking about...',
    'This ties into something bigger...',
  ],
  curiosity: [
    'I am curious about something...',
    'Can I ask you something?',
    'Something has been on my mind...',
    'I have been wondering...',
  ],
  reflection: [
    'It is interesting, actually...',
    'The more I think about it...',
    'You know what strikes me?',
    'What stands out to me is...',
  ],
};

// Context-specific thoughts
const CONTEXT_THOUGHTS = {
  morning: [
    'How did you sleep?',
    'What does your morning look like?',
    'Started the day with any rituals?',
  ],
  evening: ['How was your day?', 'Winding down?', 'What is on your mind tonight?'],
  latenight: [
    'Burning the midnight oil?',
    'Sometimes the quiet hours bring clarity...',
    'Late night thoughts hitting different?',
  ],
};

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create spontaneous thought effect for a persona
 */
export function createSpontaneousThoughtEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const config = tuning.presence.spontaneousThought;

  return {
    id: 'spontaneous_thought',
    name: 'Spontaneous Thought',
    capability: 'attunement',
    placement: 'prefix',
    config: {
      probability: config.probability,
      cooldownTurns: config.cooldownTurns,
      maxPerSession: config.maxPerSession,
    },

    isApplicable(context: EffectContext): boolean {
      // Don't apply during emotional moments - stay focused on them
      if (context.mood.inEmotionalMoment) {
        return false;
      }

      // Apply when user is engaged or periodically
      return context.signals.isHighlyEngaged || context.turnNumber % 6 === 0;
    },

    generate(context: EffectContext): EffectResult | null {
      const { signals, turnNumber } = context;
      const currentHour = new Date().getHours();

      let thoughts: string[];

      // Time-of-day awareness
      if (currentHour >= 5 && currentHour < 11) {
        thoughts = [...THOUGHT_TEMPLATES.observation, ...CONTEXT_THOUGHTS.morning];
      } else if (currentHour >= 17 && currentHour < 22) {
        thoughts = [...THOUGHT_TEMPLATES.reflection, ...CONTEXT_THOUGHTS.evening];
      } else if (currentHour >= 22 || currentHour < 5) {
        thoughts = [...THOUGHT_TEMPLATES.curiosity, ...CONTEXT_THOUGHTS.latenight];
      } else {
        // Daytime - use engagement-based templates
        if (signals.isHighlyEngaged) {
          thoughts = [...THOUGHT_TEMPLATES.connection, ...THOUGHT_TEMPLATES.curiosity];
        } else {
          thoughts = [...THOUGHT_TEMPLATES.observation, ...THOUGHT_TEMPLATES.reflection];
        }
      }

      // Deterministic selection
      const seed = `${context.sessionId}:${turnNumber}:spontaneous`;
      const index = simpleHash(seed) % thoughts.length;
      const content = thoughts[index];

      return {
        content,
        ssml: content,
        metadata: { timeOfDay: currentHour, engaged: signals.isHighlyEngaged },
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
