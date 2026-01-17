/**
 * Physical Presence Generator
 *
 * Generates cues that make the agent feel physically present.
 * These are the small gestures and body language that humans do naturally.
 *
 * @module @ferni/conversation/deep-humanization/generators/physical-presence
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
// PHYSICAL PRESENCE TEMPLATES
// ============================================================================

const PRESENCE_CUES = {
  attentive: ['*leans in*', '*looks at you*', '*meets your eyes*', '*turns toward you*'],
  thoughtful: ['*tilts head*', '*pauses to think*', '*considers*', '*reflects*'],
  warm: ['*smiles warmly*', '*nods encouragingly*', '*softens*', '*gentle look*'],
  supportive: ['*reaches out*', '*sits closer*', '*steadies*', '*present*'],
  energetic: ['*sits up*', '*brightens*', '*animates*', '*lights up*'],
  settling: ['*settles back*', '*relaxes*', '*exhales*', '*grounds*'],
};

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a physical presence cue
 */
export async function generatePhysicalPresence(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  const probability = HUMANIZATION_CONFIG.probabilities.physicalPresence;

  if (!seededChance(`${Date.now()}:1`, probability)) {
    return null;
  }

  // Choose presence type based on context
  let type: keyof typeof PRESENCE_CUES;

  if (signals.userSharedVulnerability || mood.inEmotionalMoment) {
    type = 'supportive';
  } else if (signals.isBreakthroughMoment || signals.userTriggeredSurprise) {
    type = 'energetic';
  } else if (mood.engagement > 0.8) {
    type = 'attentive';
  } else if (context.turnCount > 15 || mood.energy < 0.5) {
    type = 'settling';
  } else if (mood.energy > 0.7) {
    type = 'warm';
  } else {
    type = 'thoughtful';
  }

  const cues = PRESENCE_CUES[type];
  const content = seededPick(`${Date.now()}:68`, cues) ?? cues[0];

  return {
    type: 'physical_presence',
    content,
    placement: 'prefix',
    probability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.physicalPresence,
  };
}
