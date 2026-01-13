/**
 * Smart Emphasis Module
 *
 * Adds natural speech emphasis using Cartesia-compatible SSML.
 *
 * IMPORTANT: Cartesia does NOT support <emphasis> or <prosody> tags!
 * Instead, we use micro-pauses and slight speed variations to create
 * natural emphasis on important words.
 *
 * Technique: A tiny pause before an important word + slight slowdown
 * creates the perception of emphasis without unsupported tags.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */
export interface EmphasisOptions {
    /** Maximum number of emphasis pauses to add (default: 2) */
    maxEmphasis?: number;
    /** Add emphasis pause before user's name */
    userName?: string;
    /** Skip if response already has many pauses */
    skipIfHasManyBreaks?: boolean;
}
/**
 * Apply smart emphasis using Cartesia-compatible micro-pauses.
 *
 * Instead of unsupported <emphasis> tags, we add subtle pauses
 * before important words, which creates natural speech emphasis.
 *
 * @param text - The response text (may already have SSML tags)
 * @param options - Emphasis options
 * @returns Text with micro-pauses for emphasis
 */
export declare function applySmartEmphasis(text: string, options?: EmphasisOptions): string;
//# sourceMappingURL=smart-emphasis.d.ts.map