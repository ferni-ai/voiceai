/**
 * Advanced Memory Retrieval System
 *
 * "Better than human" memory that uses semantic understanding, temporal decay,
 * emotional salience, and relationship context to retrieve the most relevant
 * memories at the right time.
 *
 * Philosophy: A great friend remembers what matters - not everything, but the
 * things that shaped you, the commitments made, and the context needed to
 * continue where you left off.
 *
 * Features:
 * - Semantic similarity (meaning, not just keywords)
 * - Temporal decay (recent = more relevant, unless emotionally significant)
 * - Emotional salience (heavy moments persist longer)
 * - Relationship-aware (what this persona should remember)
 * - Contextual priming (conversation context influences recall)
 *
 * @module AdvancedRetrieval
 */
import type { UserProfile } from '../types/user-profile.js';
/**
 * A memory item that can be retrieved
 */
export interface MemoryItem {
    id: string;
    type: 'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event';
    content: string;
    timestamp: Date;
    emotionalWeight: number;
    relevanceDecay: number;
    baseImportance: number;
    topics?: string[];
    relatedPersonas?: string[];
    personMentioned?: string;
    commitment?: boolean;
    embedding?: number[];
    source: {
        collection: string;
        documentId: string;
    };
}
/**
 * Retrieved memory with relevance score
 */
export interface RetrievedMemory {
    item: MemoryItem;
    score: number;
    scoreBreakdown: {
        semantic: number;
        temporal: number;
        emotional: number;
        contextual: number;
    };
    reason: string;
}
/**
 * Query context for retrieval
 */
export interface RetrievalContext {
    query: string;
    currentTopic?: string;
    currentEmotion?: string;
    personaId?: string;
    conversationTurn?: number;
    recentTopics?: string[];
    userMood?: string;
}
/**
 * Configuration for retrieval scoring
 */
export interface RetrievalConfig {
    semanticWeight: number;
    temporalWeight: number;
    emotionalWeight: number;
    contextualWeight: number;
    temporalDecayHalfLifeDays: number;
    emotionalDecayResistance: number;
    maxResults: number;
    minScore: number;
    commitmentBoost: number;
    personMentionBoost: number;
    recentTopicBoost: number;
}
/**
 * Build memory index from user profile
 * Call this when profile is loaded or updated
 */
export declare function buildMemoryIndex(userId: string, profile: UserProfile): number;
/**
 * Retrieve relevant memories for a query
 *
 * Uses semantic caching to avoid redundant queries. If a similar query
 * was recently executed, returns cached results (~5ms vs ~200ms).
 */
export declare function retrieveMemories(userId: string, context: RetrievalContext, config?: Partial<RetrievalConfig>): Promise<RetrievedMemory[]>;
/**
 * Get memories specifically for conversation priming
 * Returns memories the persona should "naturally" reference
 */
export declare function getConversationPrimingMemories(userId: string, _personaId: string, options?: {
    maxMemories?: number;
    includeCommitments?: boolean;
    includeRecentTopics?: boolean;
    sessionCount?: number;
}): MemoryItem[];
/**
 * Get memories related to a specific person
 */
export declare function getPersonRelatedMemories(userId: string, personName: string): RetrievedMemory[];
/**
 * Search memories by topic/theme
 */
export declare function searchMemoriesByTopic(userId: string, topic: string): Promise<RetrievedMemory[]>;
/**
 * Pre-compute embeddings for all memories
 * Call this periodically or on profile save
 */
export declare function computeMemoryEmbeddings(userId: string): Promise<number>;
/**
 * Clear memory index for a user
 */
export declare function clearMemoryIndex(userId: string): void;
/**
 * Get memory index stats
 */
export declare function getIndexStats(): {
    userCount: number;
    totalMemories: number;
    memoriesWithEmbeddings: number;
};
declare const _default: {
    buildMemoryIndex: typeof buildMemoryIndex;
    retrieveMemories: typeof retrieveMemories;
    getConversationPrimingMemories: typeof getConversationPrimingMemories;
    getPersonRelatedMemories: typeof getPersonRelatedMemories;
    searchMemoriesByTopic: typeof searchMemoriesByTopic;
    computeMemoryEmbeddings: typeof computeMemoryEmbeddings;
    clearMemoryIndex: typeof clearMemoryIndex;
    getIndexStats: typeof getIndexStats;
};
export default _default;
//# sourceMappingURL=advanced-retrieval.d.ts.map