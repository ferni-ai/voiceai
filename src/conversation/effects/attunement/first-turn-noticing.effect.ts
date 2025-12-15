/**
 * First Turn Noticing Effect
 *
 * The "they see me" moment - detecting hesitation, deflection, or surface-level
 * responses in early turns and calling it out gently.
 *
 * This is THE moment that creates connection. When someone says "I'm fine"
 * and Ferni says "You hesitated. What's underneath?" - that's when they
 * realize this is different. This is real.
 *
 * @module @ferni/conversation/effects/attunement/first-turn-noticing
 */

import { getPersonaTuning } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// NOTICING PHRASES
// ============================================================================

const FIRST_TURN_OBSERVATIONS = [
  'I noticed you hesitated there.',
  'There was a pause before you answered.',
  "Something tells me there's more to that.",
  "That came out quickly. What's underneath?",
  "I'm curious about what you didn't say.",
  "There's something in how you said that.",
  'You said fine, but I heard something else.',
  "That sounded practiced. What's the real version?",
];

const HESITATION_PATTERNS = [
  // Deflection - the classic "I'm fine" response
  /^(fine|okay|good|not bad|alright|ok)\.?$/i,
  /^(i'?m? )?(doing )?(fine|okay|good|alright)/i,
  /nothing (much|really|special)/i,
  /just (wanted to|thought i'd|checking in)/i,
  // Minimizing
  /not that (big|important|bad)/i,
  /no big deal/i,
  /it'?s? (nothing|fine|whatever)/i,
  /doesn'?t (matter|bother)/i,
  // Hedging
  /i guess/i,
  /maybe i/i,
  /i don'?t (really )?know/i,
  /sort of/i,
  /kind of/i,
  /probably/i,
  // Trailing off
  /\.\.\.$/,
  /anyway\s*\.?$/i,
  // Vague responses
  /^(um|uh|hmm)/i,
  /^just.*$/i,
];

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create first-turn noticing effect for a persona
 */
export function createFirstTurnNoticingEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const config = tuning.attunement.firstTurnNoticing;

  return {
    id: 'first_turn_noticing',
    name: 'First Turn Noticing',
    capability: 'attunement',
    placement: 'suffix', // After their response, before we continue
    config: {
      // Turn 1 gets boosted probability
      probability: config.probability,
      cooldownTurns: 3, // Only once per conversation start
      maxPerSession: 1, // This is a one-time moment
    },

    isApplicable(context: EffectContext): boolean {
      // Only works in first few turns - the magic window
      if (context.turnNumber > config.maxTurn) {
        return false;
      }

      const userMessage = context.userMessage.toLowerCase();

      // Detect hesitation signals
      const hasHesitation = HESITATION_PATTERNS.some((pattern) => pattern.test(userMessage));
      const isVeryShort = userMessage.split(' ').length <= 5;
      const hasLowEnergy = userMessage.length < 20;
      const lacksEnthusiasm = !userMessage.includes('!');

      // Be more aggressive on turn 1 - this is our shot
      const isTurnOne = context.turnNumber === 1;
      return (
        hasHesitation ||
        (isVeryShort && lacksEnthusiasm) ||
        (isTurnOne && hasLowEnergy)
      );
    },

    generate(context: EffectContext): EffectResult | null {
      // Boost probability on turn 1
      const isTurnOne = context.turnNumber === 1;
      const effectiveProbability = isTurnOne
        ? Math.min(0.70, config.probability + config.turnOneBoost)
        : config.probability;

      // Deterministic selection
      const seed = `${context.sessionId}:${context.turnNumber}:first_notice`;
      const hash = simpleHash(seed);

      // Additional probability check (coordinator already did one, but we have turn-based boost)
      if ((hash / 0xffffffff) > effectiveProbability && !isTurnOne) {
        return null;
      }

      const index = hash % FIRST_TURN_OBSERVATIONS.length;
      const phrase = FIRST_TURN_OBSERVATIONS[index];

      return {
        content: phrase,
        ssml: `<break time="300ms"/>${phrase}`,
        metadata: {
          turnOneBoost: isTurnOne,
          effectiveProbability,
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

