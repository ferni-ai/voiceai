/**
 * User Memory Indexer
 *
 * Vectorizes all user profile data for semantic search.
 * Enables "better than human" recall across all memory domains.
 *
 * @see USER-MEMORY-VECTORIZATION.md for full strategy
 * @module memory/user-memory-indexer
 */
import type { UserProfile } from '../../types/user-profile.js';
import { type AnyVectorStore, type IndexingResult, type UserMemoryCategory } from './types.js';
export { generateDocId } from './types.js';
export type { UserMemoryCategory, IndexingResult, AnyVectorStore } from './types.js';
export * from './profile-indexers.js';
export * from './human-memory-indexers.js';
export * from './extended-indexers.js';
/**
 * Index all user memory data into the vector store
 *
 * Call this:
 * - After conversation ends (incremental)
 * - When profile is loaded (full)
 * - On user migration (full)
 *
 * @param userId - User ID
 * @param profile - User profile data
 * @param options - Indexing options
 */
export declare function indexUserMemories(userId: string, profile: UserProfile, options?: {
    /** Only index specific categories */
    categories?: UserMemoryCategory[];
    /** Vector store to use (defaults to active store) */
    vectorStore?: AnyVectorStore;
    /** Skip if already indexed recently */
    skipIfRecent?: boolean;
}): Promise<IndexingResult>;
/**
 * Remove all indexed memories for a user (for deletion/GDPR)
 */
export declare function removeUserMemories(userId: string, vectorStore?: AnyVectorStore): Promise<number>;
/**
 * Batch index all users' memories (for migrations)
 *
 * @param store - Memory store to read profiles from
 * @param options - Batch options
 */
export declare function batchIndexUserMemories(store: {
    listProfiles: (opts: {
        limit: number;
        cursor?: string;
    }) => Promise<UserProfile[]>;
}, options?: {
    /** Max users to process */
    limit?: number;
    /** Starting cursor */
    cursor?: string;
    /** Categories to index */
    categories?: UserMemoryCategory[];
    /** Callback on progress */
    onProgress?: (processed: number, total: number) => void;
}): Promise<{
    totalUsers: number;
    totalDocuments: number;
    errors: number;
    categoryCounts: Record<string, number>;
}>;
/**
 * Get indexing statistics for a user
 */
export declare function getUserMemoryStats(userId: string, vectorStore?: AnyVectorStore): Promise<{
    totalDocuments: number;
    byCategory: Record<string, number>;
    lastIndexed?: Date;
}>;
declare const _default: {
    indexUserMemories: typeof indexUserMemories;
    removeUserMemories: typeof removeUserMemories;
    batchIndexUserMemories: typeof batchIndexUserMemories;
    getUserMemoryStats: typeof getUserMemoryStats;
};
export default _default;
//# sourceMappingURL=index.d.ts.map