/**
 * Deep Humanization Module
 *
 * Makes AI conversations feel ALIVE through mood tracking, spontaneous
 * moments, physical presence cues, and emotional responsiveness.
 *
 * ## Architecture
 *
 * ```
 * deep-humanization/
 * ├── types.ts           # Type definitions
 * ├── mood-tracker.ts    # Conversation mood tracking
 * ├── behavior-loader.ts # Load persona-specific behaviors
 * ├── generators/        # Individual humanization generators
 * │   ├── mood-signal.ts
 * │   ├── breath-sound.ts
 * │   ├── physical-presence.ts
 * │   ├── spontaneous-thought.ts
 * │   ├── excitement-interruption.ts
 * │   ├── live-reaction.ts
 * │   ├── playfulness.ts
 * │   └── first-turn-notice.ts
 * └── index.ts           # This file - orchestrates everything
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { applyDeepHumanization, resetDeepHumanization } from './deep-humanization/index.js';
 *
 * // Apply humanization to a response
 * const result = await applyDeepHumanization(response, context);
 *
 * // Reset for new session
 * resetDeepHumanization('ferni');
 * ```
 *
 * @module @ferni/conversation/deep-humanization
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getMoodTracker, resetMoodTracker, resetAllMoodTrackers } from './mood-tracker.js';
import {
  generateMoodSignal,
  generateSpontaneousThought,
  generatePhysicalPresence,
  generateBreathSound,
  generateExcitementInterruption,
  generateLiveReaction,
  generatePlayfulness,
  generateFirstTurnNotice,
  canFire,
  recordFired,
  resetGenerators,
} from './generators/index.js';
import {
  detectDisengagement,
  detectHighEngagement,
  detectBreakthrough,
  detectEvidence,
  classifyTopicWeight,
  detectUserEnergy,
} from '../utils/detection.js';
import { HUMANIZATION_CONFIG } from '../humanization-tuning.js';

import type {
  HumanizationContext,
  HumanizationInjection,
  HumanizationSignals,
} from './types.js';

// Re-export types
export type {
  HumanizationContext,
  HumanizationInjection,
  HumanizationSignals,
  ConversationMood,
  HumanizationType,
  SessionMemory,
} from './types.js';

// Re-export mood tracker for direct access
export { getMoodTracker, resetMoodTracker } from './mood-tracker.js';

const log = createLogger({ module: 'DeepHumanization' });

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Apply deep humanization to a response
 *
 * This is the main entry point for adding human-like qualities to responses.
 * It coordinates mood tracking, signal detection, and generator selection.
 *
 * @param response - The raw response to humanize
 * @param context - Context for humanization decisions
 * @returns The humanized response with any injections applied
 */
export async function applyDeepHumanization(
  response: string,
  context: HumanizationContext
): Promise<{ text: string; appliedEffects: string[] }> {
  // Update mood based on conversation state
  const moodTracker = getMoodTracker(context.personaId);
  const topicWeight = classifyTopicWeight(context.userMessage);
  const userEnergy = detectUserEnergy(context.userMessage);

  moodTracker.update({
    userEmotion: userEnergy === 'subdued' ? 'subdued' : undefined,
    topicWeight,
    userEngagement: detectHighEngagement(context.userMessage) ? 'high' :
      detectDisengagement(context.userMessage) ? 'low' : 'medium',
    turnCount: context.turnCount,
  });

  const mood = moodTracker.getMood();

  // Detect signals from user message
  const signals: HumanizationSignals = {
    userPresentedEvidence: detectEvidence(context.userMessage),
    isBreakthroughMoment: detectBreakthrough(context.userMessage),
    isGivingAdvice: /\b(you should|I'd recommend|try to|consider)\b/i.test(response),
    isDisengaged: detectDisengagement(context.userMessage),
    isHighlyEngaged: detectHighEngagement(context.userMessage),
    userTriggeredSurprise: /\b(wow|whoa|oh my|really|seriously)\b/i.test(context.userMessage),
    userSharedVulnerability: mood.inEmotionalMoment,
  };

  // Collect applicable injections
  const injections: HumanizationInjection[] = [];
  const appliedEffects: string[] = [];

  // Run generators in priority order
  const generators = [
    // High priority - responds to user state
    { fn: generateFirstTurnNotice, type: 'first_turn_notice' },
    { fn: generateExcitementInterruption, type: 'excitement_interruption' },

    // Medium priority - contextual additions
    { fn: generateBreathSound, type: 'breath_sound' },
    { fn: generatePhysicalPresence, type: 'physical_presence' },
    { fn: generateLiveReaction, type: 'live_reaction' },

    // Lower priority - ambient humanization
    { fn: generateMoodSignal, type: 'mood_signal' },
    { fn: generateSpontaneousThought, type: 'spontaneous_thought' },
    { fn: generatePlayfulness, type: 'playfulness' },
  ] as const;

  // Respect global max effects per turn
  const maxEffects = HUMANIZATION_CONFIG.global.maxEffectsPerTurn;

  for (const { fn, type } of generators) {
    if (injections.length >= maxEffects) break;

    // Check cooldowns
    if (!canFire(type, context.turnCount)) continue;

    try {
      const result = await fn(context, mood, signals);
      if (result) {
        injections.push(result);
        appliedEffects.push(type);
        recordFired(type, context.turnCount);
      }
    } catch (error) {
      log.warn({ error: String(error), generator: type }, 'Generator failed');
    }
  }

  // Apply injections to response
  const humanizedText = applyInjections(response, injections);

  log.debug({
    personaId: context.personaId,
    turnCount: context.turnCount,
    appliedEffects,
    mood: { energy: mood.energy, engagement: mood.engagement },
  }, 'Deep humanization applied');

  return { text: humanizedText, appliedEffects };
}

// ============================================================================
// INJECTION APPLICATION
// ============================================================================

/**
 * Apply injections to a response based on their placement
 */
function applyInjections(
  response: string,
  injections: HumanizationInjection[]
): string {
  let result = response;

  // Sort by placement priority
  const prefixes = injections.filter((i) => i.placement === 'prefix');
  const suffixes = injections.filter((i) => i.placement === 'suffix');
  const interrupts = injections.filter((i) => i.placement === 'interrupt');
  const standalones = injections.filter((i) => i.placement === 'standalone');

  // Apply prefixes
  if (prefixes.length > 0) {
    const prefixText = prefixes.map((i) => i.content).join(' ');
    result = `${prefixText} ${result}`;
  }

  // Apply interrupts (insert after first sentence)
  if (interrupts.length > 0) {
    const interruptText = interrupts.map((i) => i.content).join(' ');
    const firstSentenceEnd = result.search(/[.!?]\s/);
    if (firstSentenceEnd > 0) {
      result = result.slice(0, firstSentenceEnd + 1) +
        ` ${interruptText} ` +
        result.slice(firstSentenceEnd + 2);
    } else {
      // No sentence break found, prepend instead
      result = `${interruptText} ${result}`;
    }
  }

  // Apply suffixes
  if (suffixes.length > 0) {
    const suffixText = suffixes.map((i) => i.content).join(' ');
    result = `${result} ${suffixText}`;
  }

  // Standalones replace the response entirely
  if (standalones.length > 0) {
    result = standalones[0].content;
  }

  return result;
}

// ============================================================================
// RESET FUNCTIONS
// ============================================================================

/**
 * Reset deep humanization state for a persona
 */
export function resetDeepHumanization(personaId: string): void {
  resetMoodTracker(personaId);
  resetGenerators();
}

/**
 * Reset all deep humanization state
 */
export function resetAllDeepHumanization(): void {
  resetAllMoodTrackers();
  resetGenerators();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyDeepHumanization,
  resetDeepHumanization,
  resetAllDeepHumanization,
  getMoodTracker,
};

