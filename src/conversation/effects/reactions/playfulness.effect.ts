/**
 * Playfulness Effect
 *
 * Generates light, playful moments that make conversations feel human.
 * These are small jokes, teasing, and fun observations - but ONLY when appropriate.
 *
 * @module @ferni/conversation/effects/reactions/playfulness
 */

import { getPersonaTuning } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// PLAYFULNESS LIBRARIES
// ============================================================================

const PLAYFUL_OPENERS = [
  'Okay, I have to say it—',
  'Can we appreciate for a second—',
  'Not to be dramatic, but—',
  'I mean, look at you—',
  'Between you and me—',
];

const TEASING = [
  'Classic you.',
  'Why am I not surprised?',
  'There it is.',
  'Called it.',
  'Of course.',
];

const LIGHT_JOKES = [
  'No pressure or anything.',
  'Just a casual Tuesday, then.',
  'Totally normal.',
  'As one does.',
  'Obviously.',
];

const CELEBRATION_PLAYFUL = [
  'Look who is crushing it!',
  'Oh, we love to see it.',
  'That is what I am talking about!',
  'Get it!',
  'Yes!',
];

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create playfulness effect for a persona
 */
export function createPlayfulnessEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const config = tuning.reactions.playfulness;

  return {
    id: 'playfulness',
    name: 'Playfulness',
    capability: 'reactions',
    placement: 'prefix',
    config: {
      probability: config.probability,
      cooldownTurns: config.cooldownTurns,
      maxPerSession: config.maxPerSession,
    },

    isApplicable(context: EffectContext): boolean {
      // NEVER be playful during emotional/heavy moments
      if (context.mood.inEmotionalMoment || context.mood.emotionalLoad > 0.4) {
        return false;
      }

      // Only be playful with established relationships
      if (context.relationshipStage === 'stranger') {
        return false;
      }

      // Need minimum turns for rapport
      if (context.turnNumber < config.minTurn) {
        return false;
      }

      // Apply for breakthroughs, high engagement, or known patterns
      return Boolean(
        context.signals.isBreakthrough ||
        context.signals.isHighlyEngaged ||
        context.mood.energy > 0.7 ||
        (context.sessionData?.patterns && context.sessionData.patterns.length > 0)
      );
    },

    generate(context: EffectContext): EffectResult | null {
      const { signals, mood, sessionData, turnNumber } = context;

      // Choose playfulness type
      let phrases: string[];
      let playType: string;

      if (signals.isBreakthrough || signals.isHighlyEngaged) {
        // Celebratory playfulness
        phrases = CELEBRATION_PLAYFUL;
        playType = 'celebration';
      } else if (sessionData?.patterns && sessionData.patterns.length > 0) {
        // Teasing about known patterns
        phrases = TEASING;
        playType = 'teasing';
      } else if (mood.energy > 0.7) {
        // High energy playfulness
        phrases = [...PLAYFUL_OPENERS, ...LIGHT_JOKES];
        playType = 'opener';
      } else {
        // Default to light jokes
        phrases = LIGHT_JOKES;
        playType = 'light_joke';
      }

      // Deterministic selection
      const seed = `${context.sessionId}:${turnNumber}:playful`;
      const index = simpleHash(seed) % phrases.length;
      const content = phrases[index];

      return {
        content,
        ssml: content,
        metadata: { playType, relationshipStage: context.relationshipStage },
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

