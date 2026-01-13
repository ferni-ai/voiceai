/**
 * Coaching Memory Loader
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module loads user memories in a format optimized for coaching questions:
 * - Recent topics with days since mentioned
 * - Unfinished threads
 * - Important moments
 * - Relationship milestones
 *
 * The goal: Enable memory-grounded questions like
 * "Last time you mentioned X. How's that going?"
 */
export interface CoachingMemory {
    topic: string;
    daysAgo: number;
    summary: string;
    type: 'topic' | 'moment' | 'thread' | 'milestone';
    context?: string;
    lastDiscussed: Date;
}
export interface CoachingMemoryContext {
    memories: CoachingMemory[];
    totalConversations: number;
    relationshipDays: number;
    recentTopics: string[];
    suggestedFollowUps: string[];
}
/**
 * Load memories formatted for coaching questions
 *
 * This aggregates from multiple memory sources and formats them
 * for the coaching question system.
 */
export declare function loadCoachingMemories(userId: string, personaId: string): Promise<CoachingMemoryContext>;
/**
 * Get memories relevant to a specific topic
 */
export declare function getMemoriesForTopic(userId: string, topic: string): Promise<CoachingMemory[]>;
/**
 * Get follow-up suggestions based on memories
 */
export declare function getSuggestedFollowUps(userId: string, currentTopic?: string): Promise<string[]>;
declare const _default: {
    loadCoachingMemories: typeof loadCoachingMemories;
    getMemoriesForTopic: typeof getMemoriesForTopic;
    getSuggestedFollowUps: typeof getSuggestedFollowUps;
};
export default _default;
//# sourceMappingURL=memory-loader.d.ts.map