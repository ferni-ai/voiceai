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
 * └── index.ts           # This file - reset functions and type re-exports
 * ```
 *
 * applyDeepHumanization, which ran the generators over a finished reply, was
 * only called by the post-LLM humanizer. That humanizer never ran on calls and
 * was removed, so the orchestrator went with it. Nothing on the live path runs
 * the generators or mood tracker today.
 *
 * @module @ferni/conversation/deep-humanization
 */

import { resetMoodTracker, resetAllMoodTrackers } from './mood-tracker.js';
import { resetGenerators } from './generators/index.js';

// Re-export types
export type {
  HumanizationContext,
  HumanizationInjection,
  HumanizationSignals,
  ConversationMood,
  HumanizationType,
  SessionMemory,
} from './types.js';

export { resetMoodTracker } from './mood-tracker.js';

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
  // Without persistence this clears the map synchronously and cannot reject.
  void resetAllMoodTrackers();
  resetGenerators();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  resetDeepHumanization,
  resetAllDeepHumanization,
};
