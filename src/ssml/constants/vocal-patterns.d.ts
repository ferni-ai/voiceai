/**
 * Vocal Pattern Detection Constants
 * Regex patterns for detecting laughter, sighs, disfluencies, etc.
 *
 * @module ssml/constants/vocal-patterns
 */
/**
 * Patterns for detecting laughter in text
 * Note: Cartesia only supports [laughter] as a nonverbal sound
 */
export declare const LAUGHTER_PATTERNS: RegExp[];
/**
 * Patterns for detecting sighs
 * Note: Cartesia doesn't support [sigh] - these get removed
 */
export declare const SIGH_PATTERNS: RegExp[];
/**
 * Patterns for detecting speech disfluencies
 * Natural hesitations and filled pauses
 */
export declare const DISFLUENCY_PATTERNS: RegExp[];
/**
 * Patterns for detecting repetition (emphasis or hesitation)
 */
export declare const REPETITION_PATTERNS: RegExp[];
/**
 * Patterns for detecting sarcasm markers
 * Used to potentially invert emotional tone
 */
export declare const SARCASTIC_PATTERNS: RegExp[];
/**
 * Patterns for detecting thinking sounds
 * Used for humanization features
 */
export declare const THINKING_PATTERNS: RegExp[];
/**
 * Patterns for detecting reflective phrases
 * Used for breath group pacing
 */
export declare const REFLECTION_PHRASES: RegExp[];
/**
 * Patterns for detecting contemplative pauses
 */
export declare const CONTEMPLATIVE_PATTERNS: RegExp[];
/**
 * Patterns for transition phrases
 * Natural break points in speech
 */
export declare const TRANSITION_PATTERNS: RegExp[];
/**
 * Natural breath point patterns
 * Points where a pause sounds natural
 */
export declare const BREATH_POINT_PATTERNS: RegExp[];
/**
 * Contrastive emphasis patterns
 * Words that should get emphasis in context
 */
export declare const CONTRASTIVE_PATTERNS: RegExp[];
/**
 * Parenthetical patterns
 * Phrases that should be de-emphasized
 */
export declare const PARENTHETICAL_PATTERNS: RegExp[];
/**
 * List patterns (for rhythm/pacing)
 */
export declare const LIST_PATTERNS: RegExp[];
/**
 * Acronym patterns
 * Should be spelled out letter by letter
 */
export declare const ACRONYM_PATTERNS: RegExp[];
/**
 * Number patterns
 * May need special pronunciation handling
 */
export declare const NUMBER_PATTERNS: RegExp[];
//# sourceMappingURL=vocal-patterns.d.ts.map