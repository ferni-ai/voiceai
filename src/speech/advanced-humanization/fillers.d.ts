/**
 * Natural Filler Injection
 *
 * DEPRECATED: Static filler injection replaced by LLM behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * The new architecture:
 * - Don't inject static fillers ("um", "well", "you know")
 * - Let the LLM generate natural speech rhythms based on context
 * - The LLM knows WHEN and HOW to use natural speech patterns
 *
 * Static filler injection was problematic because:
 * - "Let me see" / "Let me think" sound robotic when repeated
 * - Starting with "Well..." is an anti-pattern
 * - Random filler injection sounds artificial
 *
 * The injectNaturalFillers function now returns text unchanged.
 * The LLM generates appropriate speech patterns naturally.
 *
 * @module advanced-humanization/fillers
 * @deprecated Use LLM behavioral guidance instead
 */
import { type FillerConfig } from './types.js';
/**
 * Fillers categorized by their conversational function
 *
 * HUMANIZATION FIX: Removed "Let me see/think" - too robotic.
 * Keep only natural conversational sounds.
 */
export declare const FILLERS: {
    /** Thinking/hesitation fillers - natural sounds only */
    readonly thinking: readonly ["Hmm", "Um", "Mm", "Hm"];
    /** Transition fillers */
    readonly transition: readonly ["So", "Okay so", "Alright"];
    /** Connection/engagement fillers */
    readonly connection: readonly ["You know", "I mean", "Actually"];
    /** Consideration fillers - removed "Well" at start (anti-pattern) */
    readonly consideration: readonly ["I think", "It seems like", "Maybe"];
};
/**
 * Filler category type
 */
export type FillerCategory = keyof typeof FILLERS;
/**
 * Persona-specific filler preferences
 */
export declare const PERSONA_FILLER_PREFERENCES: Record<string, FillerCategory[]>;
/**
 * Inject natural fillers into text
 *
 * @deprecated DISABLED - LLM generates natural speech patterns from behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * This function now returns text unchanged. The LLM generates contextually
 * appropriate speech rhythms naturally based on:
 * 1. What the user said
 * 2. The persona's identity and voice
 * 3. Behavioral guidance from dynamic-speech-guidance.ts
 *
 * @param text - The text (returned unchanged)
 * @param _config - Unused
 * @param _personaId - Unused
 * @returns Text unchanged
 */
export declare function injectNaturalFillers(text: string, _config?: FillerConfig, _personaId?: string): string;
//# sourceMappingURL=fillers.d.ts.map