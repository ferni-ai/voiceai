/**
 * Live Reaction Generator
 *
 * Generates genuine in-the-moment reactions that show the agent is
 * actively processing and responding to what the user is saying.
 *
 * @module @ferni/conversation/deep-humanization/generators/live-reaction
 */

import { seededChance, seededIndex, seededPick } from '../../utils/random-generator.js';
import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';

// ============================================================================
// LIVE REACTION TEMPLATES
// ============================================================================

const REACTIONS = {
  thinking: ['Hmm...', 'Let me think about that...', 'Okay...', 'Interesting...'],
  processing: ['Right, right...', 'I see...', 'Mm-hmm...', 'Yeah...'],
  affirming: ['Absolutely.', 'Totally.', 'One hundred percent.', 'Makes sense.'],
  empathizing: ['Oh...', 'Aw...', 'I hear you.', 'Yeah, that is real.'],
  surprised: ['Oh wow.', 'Huh!', 'Oh!', 'Really?'],
  delighted: ['Ha!', 'Love that.', 'Nice!', 'Ooh!'],
};

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a live reaction
 */
export async function generateLiveReaction(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  const probability = HUMANIZATION_CONFIG.probabilities.liveReaction;

  if (!seededChance(`${Date.now()}:1`, probability)) {
    return null;
  }

  // Choose reaction type based on context
  let reactions: string[];

  if (mood.inEmotionalMoment || signals.userSharedVulnerability) {
    reactions = REACTIONS.empathizing;
  } else if (signals.userTriggeredSurprise) {
    reactions = REACTIONS.surprised;
  } else if (signals.isBreakthroughMoment) {
    reactions = REACTIONS.delighted;
  } else if (signals.isHighlyEngaged) {
    reactions = REACTIONS.affirming;
  } else if (context.userMessage.endsWith('?')) {
    reactions = REACTIONS.thinking;
  } else {
    reactions = REACTIONS.processing;
  }

  const content = seededPick(`${Date.now()}:67`, reactions) ?? reactions[0];

  return {
    type: 'live_reaction',
    content,
    placement: 'prefix',
    probability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.liveReaction,
  };
}
