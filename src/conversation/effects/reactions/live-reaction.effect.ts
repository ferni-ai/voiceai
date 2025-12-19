/**
 * Live Reaction Effect
 *
 * Generates genuine in-the-moment reactions that show the agent is
 * actively processing and responding to what the user is saying.
 *
 * @module @ferni/conversation/effects/reactions/live-reaction
 */

import { getPersonaTuning } from '../../humanization-tuning.js';
import type { EffectContext, EffectResult, HumanizationEffect } from '../types.js';

// ============================================================================
// LIVE REACTION LIBRARIES
// ============================================================================

// "Better Than Human" Philosophy:
// - No questions without context ("Really?" sounds like asking something we don't know)
// - Soft presence sounds, not performative reactions
const REACTIONS = {
  thinking: ['Hmm...', 'Let me think about that...', 'Okay...'],
  processing: ['Mm-hmm...', 'Yeah...', 'I see...'],
  affirming: ['Absolutely.', 'Yeah.', 'Makes sense.'],
  empathizing: ['Mm...', 'I hear you.', 'Yeah...'],
  surprised: ['Oh wow.', 'Oh.', 'Hm.'],
  delighted: ['Ha!', 'Love that.', 'Nice!'],
};

// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================

/**
 * Create live reaction effect for a persona
 */
export function createLiveReactionEffect(personaId: string): HumanizationEffect {
  const tuning = getPersonaTuning(personaId);
  const config = tuning.reactions.liveReaction;

  return {
    id: 'live_reaction',
    name: 'Live Reaction',
    capability: 'reactions',
    placement: 'prefix',
    config: {
      probability: config.probability,
      cooldownTurns: config.cooldownTurns,
      maxPerSession: config.maxPerSession,
    },

    isApplicable(context: EffectContext): boolean {
      // Apply for emotional moments, breakthroughs, high engagement, or questions
      return (
        context.mood.inEmotionalMoment ||
        context.signals.isBreakthrough ||
        context.signals.userTriggeredSurprise ||
        context.signals.isHighlyEngaged ||
        context.userMessage.endsWith('?')
      );
    },

    generate(context: EffectContext): EffectResult | null {
      const { mood, signals, userMessage, turnNumber } = context;

      // Choose reaction type based on context
      let reactions: string[];
      let category: string;

      if (mood.inEmotionalMoment || signals.userSharedVulnerability) {
        reactions = REACTIONS.empathizing;
        category = 'empathizing';
      } else if (signals.userTriggeredSurprise) {
        reactions = REACTIONS.surprised;
        category = 'surprised';
      } else if (signals.isBreakthrough) {
        reactions = REACTIONS.delighted;
        category = 'delighted';
      } else if (signals.isHighlyEngaged) {
        reactions = REACTIONS.affirming;
        category = 'affirming';
      } else if (userMessage.endsWith('?')) {
        reactions = REACTIONS.thinking;
        category = 'thinking';
      } else {
        reactions = REACTIONS.processing;
        category = 'processing';
      }

      // Deterministic selection
      const seed = `${context.sessionId}:${turnNumber}:reaction`;
      const index = simpleHash(seed) % reactions.length;
      const content = reactions[index];

      return {
        content,
        ssml: `<break time="50ms"/>${content}<break time="100ms"/>`,
        metadata: { reactionCategory: category },
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

