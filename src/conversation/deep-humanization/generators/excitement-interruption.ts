/**
 * Excitement Interruption Generator
 *
 * Generates excited interruptions when users have breakthroughs or share
 * exciting news. Shows genuine engagement and emotional responsiveness.
 *
 * @module @ferni/conversation/deep-humanization/generators/excitement-interruption
 */

import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';
import { detectBreakthrough } from '../../utils/detection.js';

// ============================================================================
// EXCITEMENT TEMPLATES
// ============================================================================

const EXCITEMENT_REACTIONS = {
  breakthrough: [
    'Wait, wait, wait—',
    'Oh! Oh, that is huge!',
    'Stop—I need to hear more about that.',
    'Hold on—say that again?',
    'Wait, did you just—?!',
  ],
  success: [
    'Yes! Yes!',
    'I knew it!',
    'That is amazing!',
    'Look at you!',
    'Oh, that is wonderful!',
  ],
  realization: [
    'Oh... oh wow.',
    'Wait—do you hear yourself?',
    'That is... that is it.',
    'You just said something huge.',
    'Hold that thought—',
  ],
  surprise: [
    'What?! No way!',
    'Wait, seriously?!',
    'Oh my gosh!',
    'That is unexpected!',
    'Whoa!',
  ],
};

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate an excited interruption
 */
export async function generateExcitementInterruption(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  // Only fire if there is something to be excited about
  const isBreakthrough = signals.isBreakthroughMoment ||
    detectBreakthrough(context.userMessage);
  const hasHighEnergy = mood.energy > 0.6 && mood.engagement > 0.6;

  if (!isBreakthrough && !signals.userTriggeredSurprise) {
    return null;
  }

  const probability = HUMANIZATION_CONFIG.probabilities.excitementInterruption;

  // Boost probability for clear breakthroughs
  const adjustedProbability = isBreakthrough ? probability * 1.5 : probability;

  if (Math.random() > adjustedProbability) {
    return null;
  }

  // Skip during emotional/heavy moments - not appropriate
  if (mood.inEmotionalMoment || mood.emotionalLoad > 0.5) {
    return null;
  }

  // Choose reaction type
  let reactions: string[];

  if (isBreakthrough) {
    // Is it a realization or a success?
    const isRealization = /realized|figured|understand|see now|get it/i
      .test(context.userMessage);
    reactions = isRealization
      ? EXCITEMENT_REACTIONS.realization
      : EXCITEMENT_REACTIONS.breakthrough;
  } else if (signals.userTriggeredSurprise) {
    reactions = EXCITEMENT_REACTIONS.surprise;
  } else {
    reactions = EXCITEMENT_REACTIONS.success;
  }

  const content = reactions[Math.floor(Math.random() * reactions.length)];

  return {
    type: 'excitement_interruption',
    content,
    placement: 'interrupt',
    probability: adjustedProbability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.excitementInterruption,
  };
}

