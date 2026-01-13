/**
 * Cross-Session Semantic Threading - Better Than Human Service
 *
 * "Connect conversations the user doesn't realize are connected"
 *
 * Finds semantically related topics across sessions that user
 * didn't explicitly connect:
 *   - Session 12: "I feel like I'm not good enough at work"
 *   - Session 47: "My dad always pushed perfection"
 *   - Ferni notices: These have 0.87 semantic similarity but
 *     user never connected them
 *
 * @module services/superhuman/semantic-intelligence/cross-session-threading
 */
import type { SemanticThread } from './types.js';
/**
 * Record a significant moment that could be part of a thread.
 *
 * Call this when a meaningful statement is made:
 * - Deep personal revelations
 * - Emotional expressions
 * - Core beliefs expressed
 * - Recurring themes
 */
export declare function recordMoment(userId: string, moment: {
    content: string;
    emotion?: string;
    topic?: string;
    significance?: 'low' | 'medium' | 'high';
}): Promise<SemanticThread | null>;
/**
 * Get all threads for a user.
 */
export declare function getThreads(userId: string): Promise<SemanticThread[]>;
/**
 * Get threads relevant to current conversation.
 */
export declare function getRelevantThreads(userId: string, context: {
    currentContent?: string;
    currentTopic?: string;
    currentEmotion?: string;
}): Promise<SemanticThread[]>;
/**
 * Get threads by awareness level.
 */
export declare function getUnconsciousConnections(userId: string): Promise<SemanticThread[]>;
/**
 * Mark a thread as surfaced to user.
 */
export declare function markThreadSurfaced(userId: string, threadId: string, reaction?: 'resonated' | 'surprised' | 'dismissed' | 'explored'): Promise<void>;
/**
 * Build context string for LLM injection.
 */
export declare function buildThreadingContext(userId: string, currentContext?: {
    content?: string;
    topic?: string;
}): Promise<string>;
/**
 * Clear thread cache for a user.
 */
export declare function clearThreadCache(userId?: string): void;
export declare const crossSessionThreading: {
    recordMoment: typeof recordMoment;
    getThreads: typeof getThreads;
    getRelevantThreads: typeof getRelevantThreads;
    getUnconsciousConnections: typeof getUnconsciousConnections;
    markSurfaced: typeof markThreadSurfaced;
    buildContext: typeof buildThreadingContext;
    clearCache: typeof clearThreadCache;
};
//# sourceMappingURL=cross-session-threading.d.ts.map