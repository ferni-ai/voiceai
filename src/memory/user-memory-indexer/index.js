/**
 * User Memory Indexer
 *
 * Vectorizes all user profile data for semantic search.
 * Enables "better than human" recall across all memory domains.
 *
 * @see USER-MEMORY-VECTORIZATION.md for full strategy
 * @module memory/user-memory-indexer
 */
import { getLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../firestore-vector-store.js';
import { getVectorStore } from '../vector-store.js';
// Import profile indexers
import { indexKeyMoments, indexPeople, indexOpenThreads, indexFollowUps, indexLifeEvents, indexGoals, indexPersonaMemories, indexSharedContent, indexPreferences, indexEntertainment, } from './profile-indexers.js';
// Import human memory indexers
import { indexHumanMemory } from './human-memory-indexers.js';
const log = getLogger().child({ module: 'UserMemoryIndexer' });
// ============================================================================
// RE-EXPORTS
// ============================================================================
export { generateDocId } from './types.js';
// Re-export all individual indexers for granular use
export * from './profile-indexers.js';
export * from './human-memory-indexers.js';
export * from './extended-indexers.js';
// ============================================================================
// MAIN INDEXING FUNCTION
// ============================================================================
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
export async function indexUserMemories(userId, profile, options) {
    const store = options?.vectorStore || getActiveVectorStore();
    const categories = options?.categories;
    const result = {
        indexed: 0,
        skipped: 0,
        errors: 0,
        categories: {},
    };
    const shouldIndex = (cat) => !categories || categories.includes(cat);
    try {
        // Key Moments (P0)
        if (shouldIndex('key_moment') && profile.keyMoments?.length) {
            const count = await indexKeyMoments(userId, profile.keyMoments, store);
            result.indexed += count;
            result.categories['key_moment'] = count;
        }
        // People (P0)
        if (shouldIndex('person') && profile.familyMembers?.length) {
            const count = await indexPeople(userId, profile.name, profile.familyMembers, store);
            result.indexed += count;
            result.categories['person'] = count;
        }
        // Open Threads (P0)
        if (shouldIndex('thread')) {
            const count = await indexOpenThreads(userId, profile.openThreads, store);
            result.indexed += count;
            result.categories['thread'] = count;
        }
        // Follow-ups (P0)
        if (shouldIndex('followup')) {
            const count = await indexFollowUps(userId, profile.pendingFollowUps, store);
            result.indexed += count;
            result.categories['followup'] = count;
        }
        // Life Events (P1)
        if (shouldIndex('life_event') && profile.lifeEvents?.length) {
            const count = await indexLifeEvents(userId, profile.lifeEvents, store);
            result.indexed += count;
            result.categories['life_event'] = count;
        }
        // Goals (P1)
        if (shouldIndex('goal') && profile.goals?.length) {
            const count = await indexGoals(userId, profile.goals, store);
            result.indexed += count;
            result.categories['goal'] = count;
        }
        // Per-Persona Memories (P1)
        if (shouldIndex('persona_learning')) {
            const count = await indexPersonaMemories(userId, profile.personaMemories, store);
            result.indexed += count;
            result.categories['persona_learning'] = count;
        }
        // Shared Content (P2)
        if (shouldIndex('shared_content')) {
            const count = await indexSharedContent(userId, profile.sharedStories, profile.humanizingState, store);
            result.indexed += count;
            result.categories['shared_content'] = count;
        }
        // Preferences (P2)
        if (shouldIndex('preference')) {
            const count = await indexPreferences(userId, profile, store);
            result.indexed += count;
            result.categories['preference'] = count;
        }
        // Entertainment (P3)
        if (shouldIndex('entertainment')) {
            const count = await indexEntertainment(userId, profile.musicMemory, profile.gameMemory, store);
            result.indexed += count;
            result.categories['entertainment'] = count;
        }
        // ========================================================================
        // HUMAN-CENTRIC MEMORY (The texture of relationship)
        // ========================================================================
        // Index all human memory domains if available
        if (profile.humanMemory) {
            const humanMemoryCounts = await indexHumanMemory(userId, profile.humanMemory, store);
            // Merge counts into result
            for (const [cat, count] of Object.entries(humanMemoryCounts)) {
                result.indexed += count;
                result.categories[cat] = count;
            }
        }
        log.info({ userId, ...result }, `Indexed ${result.indexed} user memory documents`);
    }
    catch (error) {
        log.error({ error, userId }, 'User memory indexing failed');
        result.errors++;
    }
    return result;
}
// ============================================================================
// REMOVAL FUNCTION
// ============================================================================
/**
 * Remove all indexed memories for a user (for deletion/GDPR)
 */
export async function removeUserMemories(userId, vectorStore) {
    const store = vectorStore || getActiveVectorStore();
    let removed = 0;
    // Find all documents for this user by searching with a broad query
    try {
        const results = await store.search('*', {
            topK: 1000, // Get all user documents
            filter: {
                source: 'user_memory',
                userId,
            },
            minScore: 0,
        });
        // Remove each document
        for (const result of results) {
            try {
                await store.removeDocument(result.document.id);
                removed++;
            }
            catch (err) {
                log.debug({ error: err, docId: result.document.id }, 'Failed to remove document');
            }
        }
    }
    catch (err) {
        log.debug({ error: err, userId }, 'Failed to search for user memory documents');
    }
    log.info({ userId, removed }, 'Removed user memory documents');
    return removed;
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
/**
 * Batch index all users' memories (for migrations)
 *
 * @param store - Memory store to read profiles from
 * @param options - Batch options
 */
export async function batchIndexUserMemories(store, options) {
    const maxUsers = options?.limit || 500;
    const categories = options?.categories;
    const result = {
        totalUsers: 0,
        totalDocuments: 0,
        errors: 0,
        categoryCounts: {},
    };
    try {
        const profiles = await store.listProfiles({ limit: maxUsers, cursor: options?.cursor });
        for (const profile of profiles) {
            try {
                const indexResult = await indexUserMemories(profile.id, profile, { categories });
                result.totalUsers++;
                result.totalDocuments += indexResult.indexed;
                result.errors += indexResult.errors;
                // Aggregate category counts
                for (const [cat, count] of Object.entries(indexResult.categories)) {
                    result.categoryCounts[cat] = (result.categoryCounts[cat] || 0) + count;
                }
                options?.onProgress?.(result.totalUsers, profiles.length);
            }
            catch (err) {
                log.warn({ error: err, userId: profile.id }, 'Failed to index user memories');
                result.errors++;
            }
        }
        log.info({
            totalUsers: result.totalUsers,
            totalDocuments: result.totalDocuments,
            errors: result.errors,
        }, 'Batch user memory indexing complete');
    }
    catch (error) {
        log.error({ error }, 'Batch indexing failed');
        result.errors++;
    }
    return result;
}
// ============================================================================
// STATISTICS
// ============================================================================
/**
 * Get indexing statistics for a user
 */
export async function getUserMemoryStats(userId, vectorStore) {
    const store = vectorStore || getActiveVectorStore();
    const stats = {
        totalDocuments: 0,
        byCategory: {},
        lastIndexed: undefined,
    };
    // Search for all user memory documents
    try {
        const results = await store.search('*', {
            topK: 1000,
            filter: {
                source: 'user_memory',
                userId,
            },
            minScore: 0, // Include all
        });
        stats.totalDocuments = results.length;
        // Count by category
        for (const result of results) {
            const category = result.document.metadata.category || 'unknown';
            stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
            // Track most recent
            const timestamp = result.document.metadata.timestamp;
            if (timestamp && (!stats.lastIndexed || timestamp > stats.lastIndexed)) {
                stats.lastIndexed = timestamp;
            }
        }
    }
    catch (err) {
        log.debug({ error: err, userId }, 'Failed to get user memory stats');
    }
    return stats;
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Get the active vector store (with fallback)
 */
function getActiveVectorStore() {
    // Try Firestore first in production
    if (process.env.NODE_ENV === 'production' || process.env.GOOGLE_CLOUD_PROJECT) {
        return getFirestoreVectorStore();
    }
    return getVectorStore();
}
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default {
    indexUserMemories,
    removeUserMemories,
    batchIndexUserMemories,
    getUserMemoryStats,
};
//# sourceMappingURL=index.js.map