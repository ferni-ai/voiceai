/**
 * Nonverbal Sound Module
 *
 * Adds natural nonverbal sounds to responses for more human speech.
 *
 * IMPORTANT: Cartesia Sonic-3 ONLY supports [laughter] as a bracket notation.
 * [sigh], [cough], [hmm] etc. are NOT currently supported (planned for future).
 *
 * Strategy for unsupported sounds:
 * - [laughter] → Use [laughter] bracket notation (supported)
 * - Thinking sounds → Use plain text "Hmm..." (synthesized with persona voice)
 * - Sighs → Skip or use plain text (bracket notation not supported)
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 */
/**
 * Simplified context for nonverbal sound decisions
 * (doesn't require full SpeechContext)
 */
export interface NonverbalContext {
    /** User's current emotion */
    userEmotion?: string;
    /** Current turn count */
    turnCount?: number;
}
/**
 * Supported nonverbal sounds in Cartesia
 */
export declare const NONVERBALS: {
    readonly laughter: "haha";
    readonly softLaugh: "heh";
    readonly sigh: "";
    readonly hmm: "Hmm...";
};
export interface NonverbalOptions {
    /** Maximum nonverbal sounds to add (default: 1) */
    maxSounds?: number;
    /** Skip if response already has nonverbal sounds */
    skipIfHasSounds?: boolean;
    /** User's current emotional state */
    userEmotion?: string;
}
/**
 * Add appropriate nonverbal sounds to response text.
 *
 * Analyzes the response content and emotional context to add
 * natural nonverbal sounds that make speech more human.
 *
 * @param text - The response text
 * @param context - Simple context with emotional info
 * @param options - Configuration options
 * @returns Text with nonverbal sounds added
 */
export declare function addNonverbalSounds(text: string, context?: NonverbalContext, options?: NonverbalOptions): string;
/**
 * Check if text already contains nonverbal sounds
 */
export declare function hasNonverbalSounds(text: string): boolean;
//# sourceMappingURL=nonverbal-sounds.d.ts.map