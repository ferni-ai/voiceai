/**
 * Semantic Correlation Mining - Better Than Human Service
 *
 * "Connect dots the user can't see"
 *
 * Cross-correlates semantically related patterns across different domains
 * to surface insights humans miss:
 *   - "Monday stress" + "coffee spike" + "sleep complaints" →
 *     "Sunday night insomnia causes Monday productivity spiral"
 *
 * @module services/superhuman/semantic-intelligence/correlation-mining
 */
import type { SemanticCorrelation, CorrelationDomain } from './types.js';
/**
 * Record an observation that can be correlated with others.
 *
 * Call this whenever you detect a meaningful pattern:
 * - Emotion detected in conversation
 * - Topic mentioned
 * - Person referenced
 * - Energy level observed
 * - Time of day pattern
 */
export declare function recordObservation(userId: string, observation: {
    domain: CorrelationDomain;
    pattern: string;
    context?: string;
}): Promise<void>;
/**
 * Get active correlations relevant to current context.
 */
export declare function getRelevantCorrelations(userId: string, context: {
    currentTopics?: string[];
    currentEmotion?: string;
    currentPerson?: string;
    timeOfDay?: string;
}): Promise<SemanticCorrelation[]>;
/**
 * Build context string for LLM injection.
 */
export declare function buildCorrelationContext(userId: string, context?: {
    currentTopics?: string[];
    currentEmotion?: string;
    currentPerson?: string;
}): Promise<string>;
/**
 * Clear correlation cache for a user.
 */
export declare function clearCorrelationCache(userId?: string): void;
export declare const correlationMining: {
    recordObservation: typeof recordObservation;
    getRelevantCorrelations: typeof getRelevantCorrelations;
    buildContext: typeof buildCorrelationContext;
    clearCache: typeof clearCorrelationCache;
};
//# sourceMappingURL=correlation-mining.d.ts.map