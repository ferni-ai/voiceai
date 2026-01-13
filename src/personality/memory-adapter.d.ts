/**
 * Memory Adapter for Human Personality System
 *
 * Integrates the personality system with the existing memory infrastructure:
 * - Firestore Vector Store for semantic search of personal moments
 * - SharedStory for tracking what personas have shared with users
 * - KeyMoment for callbacks (what users shared that we should follow up on)
 * - semantic-rag for fast relevance matching
 *
 * This is MUCH better than the keyword-based approach:
 * - Semantic similarity > keyword matching
 * - Persistent storage > in-memory
 * - Existing infrastructure > parallel systems
 *
 * @module personality/memory-adapter
 */
import type { SharedStory } from '../types/user-profile.js';
import type { PersonalMoment, PersonalMomentTopic, RelationshipStage, RelevanceMatch } from './types.js';
export { createCallbackKeyMoment, extractCallbackKeyMoments, formatCallbackForPrompt, getPendingCallbacksFromProfile, } from './callback-helpers.js';
/**
 * Find semantically relevant personal moments using embeddings
 * This is MUCH better than keyword matching
 */
export declare function findRelevantMomentSemantic(personaId: string, userMessage: string, options: {
    relationshipStage: RelationshipStage;
    sharedStories?: SharedStory[];
    minSimilarity?: number;
    maxResults?: number;
}): Promise<RelevanceMatch | null>;
/**
 * Create a SharedStory record when a persona shares a moment
 * This integrates with the existing UserProfile type
 */
export declare function createSharedStoryRecord(moment: PersonalMoment, context: string, userReaction?: 'positive' | 'neutral' | 'moved' | 'curious'): SharedStory;
/**
 * Check if a moment was already shared with this user
 */
export declare function wasMomentSharedWithUser(momentId: string, sharedStories: SharedStory[] | undefined): boolean;
/**
 * Get topics the user has discovered about this persona
 */
export declare function getDiscoveredTopicsFromStories(sharedStories: SharedStory[] | undefined): PersonalMomentTopic[];
/**
 * Warm up embeddings for a persona (call on session start)
 */
export declare function warmUpPersonaEmbeddings(personaId: string): Promise<void>;
/**
 * Warm up embeddings for all personas
 */
export declare function warmUpAllPersonaEmbeddings(): Promise<void>;
/**
 * Clear embedding cache (for testing)
 */
export declare function clearEmbeddingCache(): void;
declare const _default: {
    findRelevantMomentSemantic: typeof findRelevantMomentSemantic;
    createSharedStoryRecord: typeof createSharedStoryRecord;
    wasMomentSharedWithUser: typeof wasMomentSharedWithUser;
    getDiscoveredTopicsFromStories: typeof getDiscoveredTopicsFromStories;
    warmUpPersonaEmbeddings: typeof warmUpPersonaEmbeddings;
    warmUpAllPersonaEmbeddings: typeof warmUpAllPersonaEmbeddings;
    clearEmbeddingCache: typeof clearEmbeddingCache;
};
export default _default;
//# sourceMappingURL=memory-adapter.d.ts.map