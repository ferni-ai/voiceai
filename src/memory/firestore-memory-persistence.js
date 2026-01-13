/**
 * Firestore Memory Persistence
 *
 * Persists associative memory and behavioral patterns to Firestore.
 * Used by the MemoryOrchestrator to maintain state across sessions.
 *
 * Schema:
 * - bogle_users/{userId}/associative_memory/{memoryId}  → AssociativeTrigger[]
 * - bogle_users/{userId}/behavioral_patterns/{patternType} → BehavioralPattern
 * - bogle_users/{userId}/communication_preferences → CommunicationPreferences
 * - bogle_users/{userId}/emotional_threads/{threadId} → EmotionalThread
 *
 * @module memory/firestore-memory-persistence
 */
import { createLogger } from '../utils/safe-logger.js';
import { QUERY_LIMITS, MEMORY_TIMEOUTS } from './performance-limits.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
const log = createLogger({ module: 'FirestoreMemoryPersistence' });
// ============================================================================
// FIRESTORE MEMORY PERSISTENCE
// ============================================================================
export class FirestoreMemoryPersistence {
    db = null;
    USERS_COLLECTION = 'bogle_users';
    constructor() {
        // Will be initialized lazily
    }
    /**
     * Initialize Firestore connection
     */
    async initialize() {
        if (this.db)
            return;
        try {
            const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
            this.db = new FirestoreClass({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            log.info('Firestore memory persistence initialized');
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Firestore not available, using in-memory fallback');
        }
    }
    /**
     * Check if Firestore is available
     */
    isAvailable() {
        return this.db !== null;
    }
    // ============================================================================
    // ASSOCIATIVE MEMORY
    // ============================================================================
    /**
     * Save associative memory triggers for a user
     */
    async saveAssociativeTriggers(userId, memoryId, triggers, memory) {
        if (!this.db)
            return;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            const triggerDoc = userDoc.collection('associative_memory').doc(memoryId);
            const serialized = triggers.map((t) => ({
                ...t,
                createdAt: t.createdAt.toISOString(),
                lastFired: t.lastFired.toISOString(),
            }));
            const data = {
                triggers: serialized,
                updatedAt: new Date().toISOString(),
            };
            if (memory) {
                data.memory = {
                    ...memory,
                    timestamp: memory.timestamp.toISOString(),
                };
            }
            await triggerDoc.set(cleanForFirestore(data), { merge: true });
            log.debug({ userId, memoryId, triggerCount: triggers.length }, 'Saved associative triggers');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save associative triggers');
        }
    }
    /**
     * Load associative memory triggers for a user
     *
     * PERFORMANCE: Limited to QUERY_LIMITS.ASSOCIATIVE_TRIGGERS (50) items
     * ordered by most recently updated for relevance
     */
    async loadAssociativeTriggers(userId, limit) {
        const result = new Map();
        if (!this.db)
            return result;
        const queryLimit = limit ?? QUERY_LIMITS.ASSOCIATIVE_TRIGGERS;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            // PERFORMANCE FIX: Add limit and order by recency
            const query = userDoc
                .collection('associative_memory')
                .orderBy('updatedAt', 'desc')
                .limit(queryLimit);
            // Add timeout to prevent slow queries from blocking
            const snapshot = await Promise.race([
                query.get(),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Query timeout')), MEMORY_TIMEOUTS.SINGLE_QUERY);
                }),
            ]);
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data?.triggers) {
                    const triggers = data.triggers.map((t) => ({
                        ...t,
                        createdAt: new Date(t.createdAt),
                        lastFired: new Date(t.lastFired),
                    }));
                    let memory;
                    if (data.memory) {
                        memory = {
                            ...data.memory,
                            timestamp: new Date(data.memory.timestamp),
                        };
                    }
                    result.set(doc.id, { triggers, memory });
                }
            }
            log.debug({ userId, memoryCount: result.size, limit: queryLimit }, 'Loaded associative triggers');
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to load associative triggers (using empty fallback)');
        }
        return result;
    }
    // ============================================================================
    // BEHAVIORAL PATTERNS
    // ============================================================================
    /**
     * Save behavioral patterns for a user
     */
    async saveBehavioralPatterns(userId, patterns) {
        if (!this.db)
            return;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            for (const pattern of patterns) {
                const patternDoc = userDoc.collection('behavioral_patterns').doc(pattern.patternType);
                const serialized = {
                    ...pattern,
                    firstObserved: pattern.firstObserved.toISOString(),
                    lastObserved: pattern.lastObserved.toISOString(),
                    examples: pattern.examples.map((e) => ({
                        ...e,
                        timestamp: e.timestamp.toISOString(),
                    })),
                };
                await patternDoc.set(cleanForFirestore(serialized));
            }
            log.debug({ userId, patternCount: patterns.length }, 'Saved behavioral patterns');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save behavioral patterns');
        }
    }
    /**
     * Load behavioral patterns for a user
     *
     * PERFORMANCE: Limited to QUERY_LIMITS.BEHAVIORAL_PATTERNS (20) items
     * ordered by most recently observed
     */
    async loadBehavioralPatterns(userId, limit) {
        if (!this.db)
            return [];
        const queryLimit = limit ?? QUERY_LIMITS.BEHAVIORAL_PATTERNS;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            // PERFORMANCE FIX: Add limit and order by recency
            const query = userDoc
                .collection('behavioral_patterns')
                .orderBy('lastObserved', 'desc')
                .limit(queryLimit);
            // Add timeout
            const snapshot = await Promise.race([
                query.get(),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Query timeout')), MEMORY_TIMEOUTS.SINGLE_QUERY);
                }),
            ]);
            const patterns = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data) {
                    patterns.push({
                        ...data,
                        firstObserved: new Date(data.firstObserved),
                        lastObserved: new Date(data.lastObserved),
                        examples: data.examples.map((e) => ({
                            ...e,
                            timestamp: new Date(e.timestamp),
                        })),
                    });
                }
            }
            log.debug({ userId, patternCount: patterns.length, limit: queryLimit }, 'Loaded behavioral patterns');
            return patterns;
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to load behavioral patterns (using empty fallback)');
            return [];
        }
    }
    // ============================================================================
    // EMOTIONAL THREADS
    // ============================================================================
    /**
     * Save emotional threads for a user
     */
    async saveEmotionalThreads(userId, threads) {
        if (!this.db)
            return;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            for (const thread of threads) {
                const threadDoc = userDoc.collection('emotional_threads').doc(thread.id);
                const serialized = {
                    ...thread,
                    firstMentioned: thread.firstMentioned.toISOString(),
                    lastMentioned: thread.lastMentioned.toISOString(),
                };
                await threadDoc.set(cleanForFirestore(serialized));
            }
            log.debug({ userId, threadCount: threads.length }, 'Saved emotional threads');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save emotional threads');
        }
    }
    /**
     * Load emotional threads for a user
     */
    async loadEmotionalThreads(userId) {
        if (!this.db)
            return [];
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            const snapshot = await userDoc.collection('emotional_threads').get();
            const threads = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data) {
                    threads.push({
                        ...data,
                        firstMentioned: new Date(data.firstMentioned),
                        lastMentioned: new Date(data.lastMentioned),
                    });
                }
            }
            log.debug({ userId, threadCount: threads.length }, 'Loaded emotional threads');
            return threads;
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load emotional threads');
            return [];
        }
    }
    // ============================================================================
    // COMMUNICATION PREFERENCES
    // ============================================================================
    /**
     * Save communication preferences for a user
     */
    async saveCommunicationPreferences(userId, preferences) {
        if (!this.db)
            return;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            const prefDoc = userDoc.collection('memory_systems').doc('communication_preferences');
            const data = {
                preferences,
                lastUpdated: new Date().toISOString(),
            };
            await prefDoc.set(cleanForFirestore(data));
            log.debug({ userId, prefCount: preferences.length }, 'Saved communication preferences');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save communication preferences');
        }
    }
    /**
     * Load communication preferences for a user
     */
    async loadCommunicationPreferences(userId) {
        if (!this.db)
            return [];
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            const prefDoc = userDoc.collection('memory_systems').doc('communication_preferences');
            const snapshot = await prefDoc.get();
            if (snapshot.exists) {
                const data = snapshot.data();
                if (data?.preferences) {
                    log.debug({ userId, prefCount: data.preferences.length }, 'Loaded communication preferences');
                    return data.preferences;
                }
            }
            return [];
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load communication preferences');
            return [];
        }
    }
    // ============================================================================
    // CLEANUP
    // ============================================================================
    /**
     * Delete all memory data for a user (GDPR compliance)
     * FIX: Now handles individual delete failures gracefully and reports them
     */
    async deleteUserMemoryData(userId) {
        if (!this.db)
            return;
        try {
            const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
            // Batch fetch all collections in parallel (3x faster)
            const [assocSnapshot, patternSnapshot, threadSnapshot] = await Promise.all([
                userDoc.collection('associative_memory').get(),
                userDoc.collection('behavioral_patterns').get(),
                userDoc.collection('emotional_threads').get(),
            ]);
            // FIX: Track errors from individual deletes to ensure GDPR compliance
            const errors = [];
            let deleted = 0;
            // Collect all delete operations with individual error handling
            const deleteOps = [];
            for (const doc of assocSnapshot.docs) {
                deleteOps.push(doc.ref
                    .delete()
                    .then(() => {
                    deleted++;
                })
                    .catch((err) => {
                    errors.push(`associative_memory/${doc.id}: ${err}`);
                }));
            }
            for (const doc of patternSnapshot.docs) {
                deleteOps.push(doc.ref
                    .delete()
                    .then(() => {
                    deleted++;
                })
                    .catch((err) => {
                    errors.push(`behavioral_patterns/${doc.id}: ${err}`);
                }));
            }
            for (const doc of threadSnapshot.docs) {
                deleteOps.push(doc.ref
                    .delete()
                    .then(() => {
                    deleted++;
                })
                    .catch((err) => {
                    errors.push(`emotional_threads/${doc.id}: ${err}`);
                }));
            }
            // Delete communication preferences
            deleteOps.push(userDoc
                .collection('memory_systems')
                .doc('communication_preferences')
                .delete()
                .then(() => {
                deleted++;
            })
                .catch((err) => {
                errors.push(`communication_preferences: ${err}`);
            }));
            // Execute all deletes in parallel (individual failures won't kill the batch)
            await Promise.all(deleteOps);
            // FIX: Report partial failures for GDPR compliance tracking
            if (errors.length > 0) {
                log.error({ userId, errors, deleted, failed: errors.length }, 'GDPR deletion partially failed - some documents could not be deleted');
            }
            else {
                log.info({ userId, deleted }, 'Deleted all user memory data');
            }
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to delete user memory data');
        }
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let persistence = null;
/**
 * Get the Firestore memory persistence instance
 */
export async function getFirestoreMemoryPersistence() {
    if (!persistence) {
        persistence = new FirestoreMemoryPersistence();
        await persistence.initialize();
    }
    return persistence;
}
/**
 * Reset the persistence instance (for testing)
 */
export function resetFirestoreMemoryPersistence() {
    persistence = null;
}
export default {
    FirestoreMemoryPersistence,
    getFirestoreMemoryPersistence,
    resetFirestoreMemoryPersistence,
};
//# sourceMappingURL=firestore-memory-persistence.js.map