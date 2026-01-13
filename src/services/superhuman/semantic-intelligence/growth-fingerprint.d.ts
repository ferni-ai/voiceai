/**
 * Semantic Growth Fingerprint - Better Than Human Service
 *
 * "Show them how they've evolved"
 *
 * Computes semantic diff of how user's language, topics, and emotional
 * range have shifted over time:
 *   - "6 months ago, 40% of your words were about stress. Now it's 15%."
 *   - "You used to catastrophize. Now you problem-solve."
 *
 * @module services/superhuman/semantic-intelligence/growth-fingerprint
 */
import type { GrowthFingerprint, SemanticSnapshot } from './types.js';
/**
 * Record data for the current snapshot period.
 *
 * Call this after each conversation:
 * - Topics discussed
 * - Emotions detected
 * - Language patterns observed
 */
export declare function recordConversationData(userId: string, data: {
    topics?: string[];
    emotion?: string;
    messageText?: string;
    cognitivePattern?: 'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion';
}): Promise<void>;
/**
 * Get the growth fingerprint for a user.
 */
export declare function getGrowthFingerprint(userId: string): Promise<GrowthFingerprint | null>;
/**
 * Get growth comparison between two time periods.
 */
export declare function getGrowthComparison(userId: string, weeksAgo: number): Promise<{
    then: SemanticSnapshot | null;
    now: SemanticSnapshot | null;
    changes: string[];
} | null>;
/**
 * Build context string for LLM injection.
 */
export declare function buildGrowthContext(userId: string): Promise<string>;
/**
 * Clear growth cache for a user.
 */
export declare function clearGrowthCache(userId?: string): void;
/**
 * Force create a snapshot (for testing or manual triggers).
 */
export declare function forceCreateSnapshot(userId: string): Promise<void>;
export declare const growthFingerprint: {
    recordData: typeof recordConversationData;
    getFingerprint: typeof getGrowthFingerprint;
    getComparison: typeof getGrowthComparison;
    buildContext: typeof buildGrowthContext;
    forceSnapshot: typeof forceCreateSnapshot;
    clearCache: typeof clearGrowthCache;
};
//# sourceMappingURL=growth-fingerprint.d.ts.map