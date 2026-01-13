/**
 * Semantic Advice Matching
 *
 * Uses embeddings to semantically match user statements to past advice.
 * This enables accurate counterfactual learning even when users don't
 * explicitly reference the advice:
 *
 * - "I tried getting more sleep" → matches "You should try getting more rest"
 * - "The thing you mentioned helped" → matches recent relevant advice
 * - "Remember when you said X?" → explicit reference to past advice
 *
 * @module services/superhuman/semantic-intelligence/advice-matcher
 */
export interface PastAdvice {
    id: string;
    adviceText: string;
    topic: string;
    timestamp: Date;
    embedding?: number[];
}
export interface AdviceMatch {
    advice: PastAdvice;
    similarity: number;
    matchType: 'semantic' | 'explicit' | 'topic';
    confidence: number;
}
/**
 * Patterns that indicate explicit reference to past advice.
 */
declare const EXPLICIT_REFERENCE_PATTERNS: RegExp[];
/**
 * Patterns for implicit advice following.
 */
declare const IMPLICIT_FOLLOW_PATTERNS: RegExp[];
/**
 * Find the best matching advice for a user statement.
 *
 * Uses a multi-strategy approach:
 * 1. Check for explicit references ("you said X")
 * 2. Semantic similarity using embeddings
 * 3. Topic matching as fallback
 *
 * @param userText - The user's current message
 * @param pastAdvice - Array of past advice to match against
 * @returns The best matching advice or null
 */
export declare function findMatchingAdvice(userText: string, pastAdvice: PastAdvice[]): Promise<AdviceMatch | null>;
/**
 * Pre-compute and cache embeddings for advice.
 * Call this when loading past advice to speed up matching.
 */
export declare function precomputeAdviceEmbeddings(advice: PastAdvice[]): Promise<void>;
/**
 * Clear the embedding cache.
 */
export declare function clearAdviceEmbeddingCache(): void;
export { EXPLICIT_REFERENCE_PATTERNS, IMPLICIT_FOLLOW_PATTERNS };
//# sourceMappingURL=advice-matcher.d.ts.map