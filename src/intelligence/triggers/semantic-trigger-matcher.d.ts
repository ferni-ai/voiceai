/**
 * Semantic Trigger Matcher
 *
 * Combines semantic (embedding-based) matching with pattern matching
 * for the ultimate "Better than Human" trigger detection.
 *
 * Philosophy: Keywords catch explicit signals; embeddings catch
 * emotional undertones and implicit meanings that humans miss.
 *
 * @module SemanticTriggerMatcher
 */
import type { TriggerContext, SemanticMatch, HybridMatchResult, HybridMatchConfig, ProactiveTrigger, TriggerCategory } from './types.js';
/**
 * Perform hybrid semantic + pattern matching on user text
 */
export declare function matchTriggersHybrid(userText: string, context: TriggerContext, triggers: Record<string, ProactiveTrigger>, personaId: string, config?: Partial<HybridMatchConfig>): Promise<HybridMatchResult>;
/**
 * Quick semantic similarity check (useful for filtering)
 */
export declare function getSemanticSimilarity(userText: string, triggerText: string): Promise<number>;
/**
 * Check if triggers should be skipped based on never_when
 */
export declare function shouldSkipTriggers(neverWhen: string[] | undefined, context: TriggerContext): boolean;
/**
 * Calculate probability boost from more_likely_when
 */
export declare function getTriggerProbabilityBoost(moreLikelyWhen: string[] | undefined, context: TriggerContext, match: SemanticMatch | null): number;
interface SemanticAnalytics {
    totalHybridMatches: number;
    totalSemanticOnly: number;
    totalPatternOnly: number;
    averageSemanticScore: number;
    averagePatternScore: number;
    averageProcessingMs: number;
    byCategory: Map<TriggerCategory, {
        count: number;
        avgScore: number;
    }>;
}
/**
 * Record a match for analytics
 */
export declare function recordSemanticMatch(result: HybridMatchResult): void;
/**
 * Get semantic matching analytics
 */
export declare function getSemanticAnalytics(): SemanticAnalytics & {
    byCategoryArray: Array<{
        category: TriggerCategory;
        count: number;
        avgScore: number;
    }>;
};
/**
 * Reset analytics
 */
export declare function resetSemanticAnalytics(): void;
declare const _default: {
    matchTriggersHybrid: typeof matchTriggersHybrid;
    getSemanticSimilarity: typeof getSemanticSimilarity;
    shouldSkipTriggers: typeof shouldSkipTriggers;
    getTriggerProbabilityBoost: typeof getTriggerProbabilityBoost;
    recordSemanticMatch: typeof recordSemanticMatch;
    getSemanticAnalytics: typeof getSemanticAnalytics;
    resetSemanticAnalytics: typeof resetSemanticAnalytics;
};
export default _default;
//# sourceMappingURL=semantic-trigger-matcher.d.ts.map