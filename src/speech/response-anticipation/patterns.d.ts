/**
 * Response Anticipation Patterns
 *
 * Cached patterns for common user inputs, ordered by specificity.
 *
 * IMPORTANT: Templates should be empty for patterns where character matters.
 * The LLM should handle these with the persona's voice, not generic cached responses.
 * Templates are only for very simple, universal responses where character doesn't matter.
 *
 * @module response-anticipation/patterns
 */
import type { CachedPattern, IntentCategory } from './types.js';
/**
 * Patterns for common user inputs (ordered by specificity)
 *
 * NOTE: Most patterns have EMPTY templates intentionally!
 * This lets the LLM respond with proper character voice instead of generic cached text.
 * The contextHint guides the LLM on how to respond.
 */
export declare const CACHED_PATTERNS: CachedPattern[];
/**
 * Predict intent from partial transcript
 *
 * @param partialTranscript - User's partial speech
 * @returns Predicted intent with confidence
 */
export declare function predictIntent(partialTranscript: string): {
    intent: IntentCategory;
    confidence: number;
    pattern?: CachedPattern;
};
//# sourceMappingURL=patterns.d.ts.map