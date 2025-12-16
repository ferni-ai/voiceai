/**
 * Speech Filler Effect
 *
 * Adds natural speech imperfections - um, uh, like, you know - that
 * make the agent sound authentically human rather than robotic.
 *
 * @module @ferni/conversation/effects/naturalness/speech-filler
 */

import { getPersonaTuning, getEffectiveProbability } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// PERSONA-SPECIFIC FILLERS
// ============================================================================

const PERSONA_FILLERS: Record<string, string[]> = {
  ferni: ['You know...', 'I mean...', "It's like..."],
  'nayan-patel': ['Now...', 'You see...', 'Look...'],
  'peter-john': ['You know...', 'So...', 'I mean...', 'Look...'],
  'maya-santos': ['So...', 'Like...', 'You know...'],
  'alex-chen': ['So...', 'Right...', 'Okay...'],
  'jordan-taylor': ['Oh!', 'So...', 'Like...', 'You know...'],
};

const DEFAULT_FILLERS = ['Um...', 'Uh...', 'So...'];

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create speech filler effect for a persona
 */
export function createSpeechFillerEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const baseFrequency = tuning.naturalness.baseFrequency;
  const fillerProbability = baseFrequency * tuning.naturalness.fillerProbability;

  return {
    id: 'speech_filler',
    name: 'Speech Filler',
    capability: 'naturalness',
    placement: 'prefix',
    config: {
      probability: fillerProbability,
      cooldownTurns: 2, // Don't filler every turn
      maxPerSession: 8, // Keep it natural, not annoying
    },

    isApplicable(context: EffectContext): boolean {
      // Get effective probability with context modifiers
      const effectiveProb = getEffectiveProbability(fillerProbability, {
        isSeriousContext: context.isSeriousContext,
        isDistressedUser: context.mood.inEmotionalMoment,
        turnNumber: context.turnNumber,
        personaId,
      });

      // Skip if probability is too low after modifiers
      return effectiveProb > 0.02;
    },

    generate(context: EffectContext): EffectResult | null {
      const fillers = PERSONA_FILLERS[personaId] ?? DEFAULT_FILLERS;

      // Track recent fillers to avoid repetition (simple approach)
      const seed = `${context.sessionId}:${context.turnNumber}:filler`;
      const hash = simpleHash(seed);
      const index = hash % fillers.length;
      const filler = fillers[index];

      return {
        content: filler,
        ssml: `<break time="50ms"/>${filler}`,
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
