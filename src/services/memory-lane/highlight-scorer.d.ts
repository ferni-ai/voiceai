/**
 * Memory Lane - Highlight Scorer
 *
 * Scores and ranks memory highlights for surfacing. Uses multiple factors:
 * - Emotional weight (how significant the moment felt)
 * - Uniqueness (how distinctive vs everyday conversation)
 * - Growth indicator (shows personal progress)
 * - Temporal relevance (anniversary boost, recency for new users)
 * - Topic relevance (matches current conversation)
 * - User preferences (previously loved memories get boost)
 *
 * @module services/memory-lane/highlight-scorer
 */
import type { MemoryHighlight, MemoryScoringContext, ScoringWeights, MemoryQueryOptions, MemoryQueryResult } from './types.js';
/**
 * Calculate the overall score for a memory highlight
 */
export declare function scoreMemory(memory: MemoryHighlight, context: MemoryScoringContext, weights?: ScoringWeights): number;
/**
 * Get scored and ranked memory highlights
 */
export declare function getHighlights(userId: string, options?: MemoryQueryOptions): Promise<MemoryQueryResult>;
/**
 * Get "On This Day" memories (anniversaries)
 */
export declare function getOnThisDayHighlights(userId: string, options?: {
    limit?: number;
}): Promise<MemoryQueryResult>;
/**
 * Mark a memory as surfaced
 */
export declare function markMemorySurfaced(userId: string, memoryId: string, context?: string): Promise<boolean>;
/**
 * Record a user reaction to a memory
 */
export declare function recordReaction(userId: string, memoryId: string, reaction: 'loved' | 'dismissed' | 'shared' | 'revisited', context?: string): Promise<boolean>;
export declare const highlightScorer: {
    scoreMemory: typeof scoreMemory;
    getHighlights: typeof getHighlights;
    getOnThisDayHighlights: typeof getOnThisDayHighlights;
    markMemorySurfaced: typeof markMemorySurfaced;
    recordReaction: typeof recordReaction;
};
//# sourceMappingURL=highlight-scorer.d.ts.map