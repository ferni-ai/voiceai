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
import { getMoodTracker } from './mood-tracker.js';
import type { HumanizationContext } from './types.js';
export type { HumanizationContext, HumanizationInjection, HumanizationSignals, ConversationMood, HumanizationType, SessionMemory, } from './types.js';
export { getMoodTracker, resetMoodTracker } from './mood-tracker.js';
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
export declare function applyDeepHumanization(response: string, context: HumanizationContext): Promise<{
    text: string;
    appliedEffects: string[];
}>;
/**
 * Reset deep humanization state for a persona
 */
export declare function resetDeepHumanization(personaId: string): void;
/**
 * Reset all deep humanization state
 */
export declare function resetAllDeepHumanization(): void;
declare const _default: {
    applyDeepHumanization: typeof applyDeepHumanization;
    resetDeepHumanization: typeof resetDeepHumanization;
    resetAllDeepHumanization: typeof resetAllDeepHumanization;
    getMoodTracker: typeof getMoodTracker;
};
export default _default;
//# sourceMappingURL=index.d.ts.map