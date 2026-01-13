/**
 * Stage Direction Sanitization Constants
 * Keywords and patterns for removing LLM-generated stage directions from speech
 *
 * These are words/phrases that LLMs often emit as "stage directions" that should
 * NOT be spoken aloud. The sanitizer removes these to prevent awkward TTS output
 * like "asterisk chuckles asterisk".
 *
 * @module ssml/constants/stage-directions
 */
/**
 * Comprehensive list of stage direction keywords to remove from TTS output
 *
 * Categories:
 * - Breathing/physical sounds
 * - Facial expressions
 * - Head/body movements
 * - Mental actions (not spoken)
 * - Manner/tone adverbs (describe HOW, not WHAT to say)
 * - Tone/attitude descriptors
 * - Emotions as stage directions
 * - Energy/state descriptors
 * - Voice descriptions
 * - Miscellaneous stage cues
 */
export declare const STAGE_DIRECTION_KEYWORDS: string[];
/**
 * Patterns for matching stage directions in various formats
 * Used by sanitizeSsml() in core.ts
 */
export declare const STAGE_DIRECTION_PATTERNS: {
    /** Stage directions wrapped in asterisks: *chuckles* */
    asterisk: RegExp;
    /** Stage directions in parentheses: (laughs) */
    parenthesis: RegExp;
    /** Stage directions in brackets: [sighs] */
    bracket: RegExp;
    /** Stage directions in em dashes: — pauses — */
    emDash: RegExp;
    /** Stage directions with colons: action: description */
    colonPrefix: RegExp;
    /** Standalone action verbs at start of line */
    standaloneAction: RegExp;
};
/**
 * Keywords that should CONVERT to [laughter] (not just remove)
 * Only "laughter" is supported by Cartesia Sonic-3
 */
export declare const LAUGHTER_CONVERSION_KEYWORDS: string[];
/**
 * Keywords that should be REMOVED entirely (no conversion)
 * These have no supported nonverbal equivalent in Cartesia
 */
export declare const UNSUPPORTED_NONVERBALS: string[];
//# sourceMappingURL=stage-directions.d.ts.map