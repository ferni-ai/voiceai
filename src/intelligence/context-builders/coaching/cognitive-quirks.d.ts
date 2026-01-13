/**
 * Cognitive Quirks Context Builder
 *
 * Surfaces unique thinking patterns and cognitive quirks for each persona.
 * Makes each persona feel like a real person with distinctive mental habits.
 *
 * This builder complements the main cognitive builder by adding the
 * "personality layer" of cognition - the quirks, habits, and idiosyncrasies
 * that make each persona's thinking feel unique.
 *
 * Uses centralized SessionStateManager for session tracking.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build cognitive quirks context
 *
 * Uses centralized session state for tracking quirks/habits used.
 */
declare function buildCognitiveQuirksContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Clear session quirk tracking (for session end)
 * Now handled by centralized session state in session-state.ts
 */
export declare function clearCognitiveQuirksSession(_sessionKey: string): void;
export { buildCognitiveQuirksContext };
export default buildCognitiveQuirksContext;
//# sourceMappingURL=cognitive-quirks.d.ts.map