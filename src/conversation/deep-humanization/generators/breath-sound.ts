/**
 * Breath Sound Generator
 *
 * Generates subtle breath sounds that make speech feel more natural.
 * Breath sounds indicate thinking, transitions, and emotional moments.
 *
 * @module @ferni/conversation/deep-humanization/generators/breath-sound
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
// BREATH SOUND TEMPLATES
// ============================================================================

const BREATH_SOUNDS = {
  thinking: ['*inhales*', '*takes a breath*', '*breathes*'],
  emotional: ['*exhales slowly*', '*takes a deep breath*', '*sighs softly*'],
  transition: ['*takes a breath*', '*inhales*', '*breathes*'],
  relieved: ['*exhales*', '*breathes out*', '*sighs with relief*'],
};

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a contextually appropriate breath sound
 */
export async function generateBreathSound(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  const probability = HUMANIZATION_CONFIG.probabilities.breathSound;

  if (!seededChance(`${Date.now()}:1`, probability)) {
    return null;
  }

  // Choose breath type based on context
  let type: keyof typeof BREATH_SOUNDS;

  if (mood.inEmotionalMoment || signals.userSharedVulnerability) {
    type = 'emotional';
  } else if (signals.isBreakthroughMoment) {
    type = 'relieved';
  } else if (context.turnCount <= 2) {
    // Early turns - thinking breath
    type = 'thinking';
  } else {
    type = 'transition';
  }

  const sounds = BREATH_SOUNDS[type];
  const content = seededPick(`${Date.now()}:63`, sounds) ?? sounds[0];

  return {
    type: 'breath_sound',
    content,
    placement: 'prefix',
    probability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.breathSound,
  };
}
