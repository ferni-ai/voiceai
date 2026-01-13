/**
 * Firestore Persistence for Semantic Router
 *
 * Provides persistent storage for:
 * - Routing corrections (active learning)
 * - User personalization profiles
 * - Routing analytics/events
 * - A/B test results
 *
 * Uses the same Firestore instance as the memory module.
 *
 * @module tools/semantic-router/persistence/firestore-persistence
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
const log = createLogger({ module: 'semantic-router:persistence' });
// ============================================================================
// COLLECTION NAMES
// ============================================================================
export const COLLECTIONS = {
    CORRECTIONS: 'semantic_router_corrections',
    USER_PROFILES: 'user_tool_profiles',
    ROUTING_EVENTS: 'semantic_router_events',
    AB_TESTS: 'semantic_router_ab_tests',
    LEARNING_STATE: 'semantic_router_learning',
    TOOL_EMBEDDINGS: 'semantic_router_tool_embeddings',
};
// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================
let firestoreInstance = null;
let initializationPromise = null;
/**
 * Initialize the Firestore connection for semantic router
 * Reuses existing Firestore instance from memory module if available
 */
export async function initializeFirestorePersistence() {
    if (firestoreInstance)
        return;
    if (initializationPromise) {
        await initializationPromise;
        return;
    }
    initializationPromise = doInitialize();
    await initializationPromise;
    initializationPromise = null;
}
async function doInitialize() {
    try {
        // Try to get Firestore from the memory module's store factory
        const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
        const store = getFirestoreStore();
        // The store has a private db property - we need to access it
        // This is a bit hacky, but avoids creating a second Firestore connection
        if (store && store.db) {
            firestoreInstance = store.db;
            log.info('Using existing Firestore connection from memory module');
            return;
        }
    }
    catch {
        log.debug('Memory module Firestore not available, initializing standalone');
    }
    // Fall back to initializing our own connection
    try {
        const hasGCP = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
        if (!hasGCP) {
            log.warn('No GOOGLE_CLOUD_PROJECT - semantic router persistence disabled');
            return;
        }
        const { Firestore } = await import('@google-cloud/firestore');
        firestoreInstance = new Firestore({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        });
        log.info('Firestore persistence initialized for semantic router');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to initialize Firestore - using in-memory only');
    }
}
/**
 * Get the Firestore instance (null if not initialized)
 */
export function getFirestore() {
    return firestoreInstance;
}
/**
 * Check if persistence is available
 */
export function isPersistenceAvailable() {
    return firestoreInstance !== null;
}
/**
 * Save a routing correction to Firestore
 */
export async function saveCorrection(correction) {
    if (!firestoreInstance) {
        log.debug('Firestore not available - correction not persisted');
        return;
    }
    try {
        await firestoreInstance
            .collection(COLLECTIONS.CORRECTIONS)
            .doc(correction.id)
            .set(cleanForFirestore({
            ...correction,
            timestamp: correction.timestamp,
            _createdAt: new Date(),
        }));
        log.debug({ correctionId: correction.id }, 'Correction persisted to Firestore');
    }
    catch (error) {
        log.error({ error: String(error), correctionId: correction.id }, 'Failed to persist correction');
    }
}
/**
 * Load corrections from Firestore
 */
export async function loadCorrections(options) {
    if (!firestoreInstance) {
        return [];
    }
    try {
        let query = firestoreInstance.collection(COLLECTIONS.CORRECTIONS);
        if (options?.userId) {
            query = query.where('userId', '==', options.userId);
        }
        if (options?.since) {
            query = query.where('timestamp', '>=', options.since);
        }
        query = query.orderBy('timestamp', 'desc');
        if (options?.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                timestamp: data.timestamp?.toDate?.() ||
                    new Date(data.timestamp),
            };
        });
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to load corrections');
        return [];
    }
}
/**
 * Save user profile to Firestore
 */
export async function saveUserProfile(profile) {
    if (!firestoreInstance) {
        log.debug('Firestore not available - profile not persisted');
        return;
    }
    try {
        await firestoreInstance
            .collection(COLLECTIONS.USER_PROFILES)
            .doc(profile.userId)
            .set(cleanForFirestore({
            ...profile,
            lastUpdated: profile.lastUpdated,
            _updatedAt: new Date(),
        }));
        log.debug({ userId: profile.userId }, 'User profile persisted to Firestore');
    }
    catch (error) {
        log.error({ error: String(error), userId: profile.userId }, 'Failed to persist user profile');
    }
}
/**
 * Load user profile from Firestore
 */
export async function loadUserProfile(userId) {
    if (!firestoreInstance) {
        return null;
    }
    try {
        const doc = await firestoreInstance.collection(COLLECTIONS.USER_PROFILES).doc(userId).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return {
            ...data,
            userId: doc.id,
            lastUpdated: data.lastUpdated?.toDate?.() || new Date(),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load user profile');
        return null;
    }
}
/**
 * Save routing event to Firestore
 * Uses date-partitioned subcollections for efficient querying
 */
export async function saveRoutingEvent(event) {
    if (!firestoreInstance) {
        return;
    }
    try {
        const dateStr = event.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
        await firestoreInstance
            .collection(COLLECTIONS.ROUTING_EVENTS)
            .doc(dateStr)
            .collection('events')
            .doc(event.id)
            .set(cleanForFirestore({
            ...event,
            timestamp: event.timestamp,
        }));
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to persist routing event');
    }
}
/**
 * Load routing events from Firestore
 */
export async function loadRoutingEvents(options) {
    if (!firestoreInstance) {
        return [];
    }
    try {
        let query = firestoreInstance
            .collection(COLLECTIONS.ROUTING_EVENTS)
            .doc(options.date)
            .collection('events');
        if (options.userId) {
            query = query.where('userId', '==', options.userId);
        }
        query = query.orderBy('timestamp', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                timestamp: data.timestamp?.toDate?.() || new Date(),
            };
        });
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to load routing events');
        return [];
    }
}
/**
 * Save A/B test to Firestore
 */
export async function saveABTest(test) {
    if (!firestoreInstance) {
        return;
    }
    try {
        await firestoreInstance
            .collection(COLLECTIONS.AB_TESTS)
            .doc(test.testId)
            .set(cleanForFirestore({
            ...test,
            startDate: test.startDate,
            endDate: test.endDate || null,
            _updatedAt: new Date(),
        }));
    }
    catch (error) {
        log.error({ error: String(error), testId: test.testId }, 'Failed to persist A/B test');
    }
}
/**
 * Load A/B tests from Firestore
 */
export async function loadABTests(options) {
    if (!firestoreInstance) {
        return [];
    }
    try {
        let query = firestoreInstance.collection(COLLECTIONS.AB_TESTS);
        if (options?.status) {
            query = query.where('status', '==', options.status);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                testId: doc.id,
                startDate: data.startDate?.toDate?.() || new Date(),
                endDate: data.endDate ? data.endDate?.toDate?.() : undefined,
            };
        });
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to load A/B tests');
        return [];
    }
}
/**
 * Save tool embedding index to Firestore
 * Uses version-partitioned storage for easy migrations
 */
export async function saveToolEmbedding(index) {
    if (!firestoreInstance) {
        return;
    }
    try {
        // Store under version/toolId path for easy version migrations
        const docId = `${index.version}:${index.toolId}`;
        await firestoreInstance
            .collection(COLLECTIONS.TOOL_EMBEDDINGS)
            .doc(docId)
            .set(cleanForFirestore({
            ...index,
            createdAt: index.createdAt,
            _updatedAt: new Date(),
        }));
        log.debug({ toolId: index.toolId, version: index.version }, 'Tool embedding index persisted');
    }
    catch (error) {
        log.debug({ error: String(error), toolId: index.toolId }, 'Failed to persist tool embedding');
    }
}
/**
 * Load a specific tool embedding index from Firestore
 */
export async function loadToolEmbedding(toolId, version) {
    if (!firestoreInstance) {
        return null;
    }
    try {
        const docId = `${version}:${toolId}`;
        const doc = await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(docId).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return {
            toolId: data.toolId,
            version: data.version,
            descriptionEmbedding: data.descriptionEmbedding,
            exampleEmbeddings: data.exampleEmbeddings,
            embeddingModel: data.embeddingModel,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            toolHash: data.toolHash,
        };
    }
    catch (error) {
        log.debug({ error: String(error), toolId, version }, 'Failed to load tool embedding');
        return null;
    }
}
/**
 * Load all tool embeddings for a version from Firestore
 */
export async function loadAllToolEmbeddings(version) {
    if (!firestoreInstance) {
        return [];
    }
    try {
        const query = firestoreInstance
            .collection(COLLECTIONS.TOOL_EMBEDDINGS)
            .where('version', '==', version);
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                toolId: data.toolId,
                version: data.version,
                descriptionEmbedding: data.descriptionEmbedding,
                exampleEmbeddings: data.exampleEmbeddings,
                embeddingModel: data.embeddingModel,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                toolHash: data.toolHash,
            };
        });
    }
    catch (error) {
        log.debug({ error: String(error), version }, 'Failed to load tool embeddings');
        return [];
    }
}
/**
 * Delete old tool embedding versions (cleanup)
 */
export async function deleteToolEmbeddingVersion(version) {
    if (!firestoreInstance) {
        return 0;
    }
    try {
        const query = firestoreInstance
            .collection(COLLECTIONS.TOOL_EMBEDDINGS)
            .where('version', '==', version)
            .limit(500);
        const snapshot = await query.get();
        let deleted = 0;
        for (const doc of snapshot.docs) {
            await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(doc.id).delete();
            deleted++;
        }
        log.info({ version, deleted }, 'Deleted old tool embedding version');
        return deleted;
    }
    catch (error) {
        log.error({ error: String(error), version }, 'Failed to delete tool embedding version');
        return 0;
    }
}
/**
 * Save learning state to Firestore
 */
export async function saveLearningState(state) {
    if (!firestoreInstance) {
        return;
    }
    try {
        await firestoreInstance
            .collection(COLLECTIONS.LEARNING_STATE)
            .doc('global')
            .set(cleanForFirestore({
            ...state,
            lastRetrainTime: state.lastRetrainTime || null,
            _updatedAt: new Date(),
        }));
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to persist learning state');
    }
}
/**
 * Load learning state from Firestore
 */
export async function loadLearningState() {
    if (!firestoreInstance) {
        return null;
    }
    try {
        const doc = await firestoreInstance.collection(COLLECTIONS.LEARNING_STATE).doc('global').get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return {
            confusionMatrix: data.confusionMatrix,
            lastRetrainTime: data.lastRetrainTime
                ? data.lastRetrainTime?.toDate?.()
                : undefined,
            accuracyHistory: data.accuracyHistory?.map((h) => ({
                timestamp: h.timestamp?.toDate?.() || new Date(),
                accuracy: h.accuracy,
            })) || [],
        };
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to load learning state');
        return null;
    }
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Clean up old data (run periodically)
 */
export async function cleanupOldData(options) {
    if (!firestoreInstance) {
        return { deletedCorrections: 0, deletedEvents: 0 };
    }
    const correctionCutoff = new Date();
    correctionCutoff.setDate(correctionCutoff.getDate() - (options.correctionRetentionDays || 90));
    const eventCutoff = new Date();
    eventCutoff.setDate(eventCutoff.getDate() - (options.eventRetentionDays || 30));
    let deletedCorrections = 0;
    const deletedEvents = 0;
    try {
        // Delete old corrections
        const oldCorrections = await firestoreInstance
            .collection(COLLECTIONS.CORRECTIONS)
            .where('timestamp', '<', correctionCutoff)
            .limit(500)
            .get();
        for (const doc of oldCorrections.docs) {
            await firestoreInstance.collection(COLLECTIONS.CORRECTIONS).doc(doc.id).delete();
            deletedCorrections++;
        }
        // Delete old event date partitions
        const cutoffDateStr = eventCutoff.toISOString().split('T')[0];
        // Note: This is simplified - in production you'd list and delete old date docs
        log.info({ cutoffDate: cutoffDateStr }, 'Would delete event partitions before this date');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Cleanup failed');
    }
    return { deletedCorrections, deletedEvents };
}
// ============================================================================
// FIRESTORE PERSISTENCE CLASS (convenience wrapper)
// ============================================================================
/**
 * Class wrapper for Firestore persistence operations
 * Provides a unified interface for all persistence operations
 */
export class FirestorePersistence {
    initPromise = null;
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = initializeFirestorePersistence();
        await this.initPromise;
    }
    isAvailable() {
        return isPersistenceAvailable();
    }
    // Corrections
    async saveCorrection(correction) {
        return saveCorrection(correction);
    }
    async loadCorrections(options) {
        return loadCorrections(options);
    }
    // User Profiles
    async saveUserProfile(profile) {
        return saveUserProfile(profile);
    }
    async loadUserProfile(userId) {
        return loadUserProfile(userId);
    }
    // Routing Events
    async saveRoutingEvent(event) {
        return saveRoutingEvent(event);
    }
    async loadRoutingEvents(options) {
        return loadRoutingEvents(options);
    }
    // A/B Tests
    async saveABTest(test) {
        return saveABTest(test);
    }
    async loadABTests(options) {
        return loadABTests(options);
    }
    // Tool Embeddings
    async saveToolEmbedding(index) {
        return saveToolEmbedding(index);
    }
    async loadToolEmbedding(toolId, version) {
        return loadToolEmbedding(toolId, version);
    }
    async loadAllToolEmbeddings(version) {
        return loadAllToolEmbeddings(version);
    }
    async deleteToolEmbeddingVersion(version) {
        return deleteToolEmbeddingVersion(version);
    }
    // Learning State
    async saveLearningState(state) {
        return saveLearningState(state);
    }
    async loadLearningState() {
        return loadLearningState();
    }
    // Cleanup
    async cleanup(options) {
        return cleanupOldData(options);
    }
}
// Singleton instance
let persistenceInstance = null;
/**
 * Get the singleton FirestorePersistence instance
 */
export function getFirestorePersistence() {
    if (!persistenceInstance) {
        persistenceInstance = new FirestorePersistence();
    }
    return persistenceInstance;
}
//# sourceMappingURL=firestore-persistence.js.map