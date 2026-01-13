/**
 * Persona Speech Traits Loader
 *
 * Dynamically loads and applies persona-specific speech traits.
 * This bridges the persona bundles with the alive-voice SSML pipeline.
 *
 * ## Architecture
 *
 * Two complementary systems work together:
 * 1. **Hardcoded Traits** (speech-traits.ts): Regex-based SSML injection for key phrases
 * 2. **JSON Behaviors** (speech-imperfections.json): Probabilistic human behaviors
 *
 * The JSON system provides "Better Than Human" naturalness by injecting:
 * - Speech imperfections (trailing off, self-corrections)
 * - Thinking sounds (hmm, processing)
 * - Backchannels (mm-hmm, I see)
 *
 * Each persona has unique speech patterns:
 * - **Peter John (Jack Bogle)**: Grandfatherly warmth, financial wisdom, elderly pauses
 * - **Maya Santos**: Habit vocabulary, encouragement warmth, practical wisdom
 * - **Alex Chen**: Efficiency emphasis, clear instructions, hidden warmth
 * - **Jordan Taylor**: Life arc language, celebration energy, forward-looking
 * - **Nayan Patel**: Philosophical vocabulary, profound pauses, paradoxes
 *
 * @module speech/adaptive-ssml/persona-speech-traits-loader
 */
/**
 * Context for applying speech traits
 */
export interface SpeechTraitContext {
    /** Detected emotion in the text */
    emotion: string;
    /** Base speech speed */
    baseSpeed: number;
    /** Count of laughter in text */
    laughterCount: number;
    /** Turn number (behaviors more likely after rapport built) */
    turnNumber?: number;
    /** Random seed for deterministic testing */
    randomSeed?: string;
    /** User's original message (for callback detection) */
    userText?: string;
    /** Total conversation count with this user */
    conversationCount?: number;
}
/**
 * Function signature for persona speech trait processors
 */
export type SpeechTraitProcessor = (text: string, emotion: string, baseSpeed: number, laughterCount: number) => string;
/**
 * Speech trait configuration for a persona
 */
export interface PersonaSpeechTraitConfig {
    /** Base speech speed */
    baseSpeed: number;
    /** Main processor function */
    apply: SpeechTraitProcessor;
}
/**
 * Preload all persona speech traits for synchronous access.
 * Call this during application startup.
 *
 * This preloads BOTH:
 * - Layer 1: Hardcoded traits (speech-traits.ts)
 * - Layer 2: JSON behaviors (speech-imperfections.json, etc.)
 */
export declare function preloadAllTraits(): Promise<void>;
/**
 * Get speech traits synchronously (requires preload).
 * Returns null if not preloaded or persona not found.
 */
export declare function getPersonaTraitsSync(personaId: string): PersonaSpeechTraitConfig | null;
/**
 * Apply persona speech traits to text (async).
 *
 * This function applies TWO layers of humanization:
 * 1. Hardcoded traits (speech-traits.ts) - Regex-based SSML for key phrases
 * 2. JSON behaviors (speech-imperfections.json) - Probabilistic human behaviors
 *
 * @param text - Text to process
 * @param personaId - Persona ID
 * @param context - Speech context (emotion, baseSpeed, turnNumber, etc.)
 * @returns Enhanced text with persona speech patterns
 */
export declare function applyPersonaSpeechTraits(text: string, personaId: string, context?: Partial<SpeechTraitContext>): Promise<string>;
/**
 * Apply persona speech traits synchronously (requires preload).
 *
 * This function applies TWO layers of humanization (sync versions):
 * 1. Hardcoded traits (speech-traits.ts) - Regex-based SSML for key phrases
 * 2. JSON behaviors (speech-imperfections.json) - Probabilistic human behaviors
 *
 * IMPORTANT: Call preloadAllTraits() AND preloadAllSpeechProfiles() at startup.
 *
 * @param text - Text to process
 * @param personaId - Persona ID
 * @param context - Speech context
 * @returns Enhanced text with persona speech patterns
 */
export declare function applyPersonaSpeechTraitsSync(text: string, personaId: string, context?: Partial<SpeechTraitContext>): string;
/**
 * Check if a persona has custom speech traits.
 */
export declare function hasCustomSpeechTraits(personaId: string): boolean;
/**
 * Get list of personas with custom speech traits.
 */
export declare function getPersonasWithSpeechTraits(): string[];
/**
 * Clear the trait registry (for testing).
 */
export declare function clearTraitRegistry(): void;
//# sourceMappingURL=persona-speech-traits-loader.d.ts.map