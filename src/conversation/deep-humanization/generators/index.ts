/**
 * Humanization Generators Index
 *
 * Registry of all available humanization generators.
 * Each generator creates a specific type of humanization effect.
 *
 * @module @ferni/conversation/deep-humanization/generators
 */

export { generateMoodSignal } from './mood-signal.js';
export { generateSpontaneousThought } from './spontaneous-thought.js';
export { generatePhysicalPresence } from './physical-presence.js';
export { generateBreathSound } from './breath-sound.js';
export { generateExcitementInterruption } from './excitement-interruption.js';
export { generateLiveReaction } from './live-reaction.js';
export { generatePlayfulness } from './playfulness.js';
export { generateFirstTurnNotice } from './first-turn-notice.js';

import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
  HumanizationType,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';

/**
 * Generator registry entry
 */
export interface GeneratorEntry {
  type: HumanizationType;
  generate: (
    context: HumanizationContext,
    mood: ConversationMood,
    signals: HumanizationSignals
  ) => Promise<GeneratorResult>;
  config: {
    cooldownTurns: number;
    maxPerSession: number;
    baseProbability: number;
  };
}

/**
 * Cooldown tracker per generator type
 */
const cooldowns = new Map<string, number>();
const sessionCounts = new Map<string, number>();

/**
 * Check if a generator can fire (respects cooldown and max per session)
 */
export function canFire(type: HumanizationType, turnCount: number): boolean {
  const lastFired = cooldowns.get(type) ?? -999;
  const count = sessionCounts.get(type) ?? 0;

  // Get config for this type
  const config = getConfigForType(type);

  const cooldownOk = turnCount - lastFired >= config.cooldownTurns;
  const maxOk = count < config.maxPerSession;

  return cooldownOk && maxOk;
}

/**
 * Record that a generator fired
 */
export function recordFired(type: HumanizationType, turnCount: number): void {
  cooldowns.set(type, turnCount);
  sessionCounts.set(type, (sessionCounts.get(type) ?? 0) + 1);
}

/**
 * Get config for a humanization type
 */
function getConfigForType(type: HumanizationType): {
  cooldownTurns: number;
  maxPerSession: number;
  baseProbability: number;
} {
  // Map humanization types to their config categories
  switch (type) {
    case 'breath_sound':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.breathSound,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.breathSound,
        baseProbability: HUMANIZATION_CONFIG.probabilities.breathSound,
      };
    case 'physical_presence':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.physicalPresence,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.physicalPresence,
        baseProbability: HUMANIZATION_CONFIG.probabilities.physicalPresence,
      };
    case 'spontaneous_thought':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.spontaneousThought,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.spontaneousThought,
        baseProbability: HUMANIZATION_CONFIG.probabilities.spontaneousThought,
      };
    case 'mood_signal':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.moodDrift,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.moodDrift,
        baseProbability: HUMANIZATION_CONFIG.probabilities.moodDrift,
      };
    case 'excitement_interruption':
    case 'live_reaction':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.excitementInterruption,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.excitementInterruption,
        baseProbability: HUMANIZATION_CONFIG.probabilities.excitementInterruption,
      };
    case 'playfulness':
    case 'running_joke':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.playfulness,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.playfulness,
        baseProbability: HUMANIZATION_CONFIG.probabilities.playfulness,
      };
    case 'first_turn_notice':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.firstTurnNotice,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.firstTurnNotice,
        baseProbability: HUMANIZATION_CONFIG.probabilities.firstTurnNotice,
      };
    case 'mind_change':
    case 'contradiction':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.mindChange,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.mindChange,
        baseProbability: HUMANIZATION_CONFIG.probabilities.mindChange,
      };
    case 'anticipation':
      return {
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.anticipation,
        maxPerSession: HUMANIZATION_CONFIG.maxPerSession.anticipation,
        baseProbability: HUMANIZATION_CONFIG.probabilities.anticipation,
      };
    default:
      return { cooldownTurns: 4, maxPerSession: 3, baseProbability: 0.15 };
  }
}

/**
 * Reset all generator state for a new session
 */
export function resetGenerators(): void {
  cooldowns.clear();
  sessionCounts.clear();
}

/**
 * Get statistics about generator usage
 */
export function getGeneratorStats(): {
  cooldowns: Record<string, number>;
  counts: Record<string, number>;
} {
  return {
    cooldowns: Object.fromEntries(cooldowns),
    counts: Object.fromEntries(sessionCounts),
  };
}
