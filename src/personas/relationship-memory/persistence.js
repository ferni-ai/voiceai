/**
 * Relationship Memory Persistence
 *
 * > "Your best friend forgets. We don't."
 *
 * Firestore persistence layer for relationship memories.
 * Saves and loads the complete relationship history between users and personas.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = getLogger();
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION_NAME = 'relationship_memories';
// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================
/**
 * Convert Date objects to Firestore Timestamps for storage
 */
function serializeForFirestore(memory) {
    return {
        userId: memory.userId,
        personaId: memory.personaId,
        stage: memory.stage,
        trustScore: memory.trustScore,
        trustFactors: memory.trustFactors,
        // Serialize arrays with dates
        sharedMoments: memory.sharedMoments.map((m) => ({
            ...m,
            timestamp: m.timestamp.toISOString(),
            lastCallback: m.lastCallback?.toISOString(),
        })),
        insideJokes: memory.insideJokes.map((j) => ({
            ...j,
            createdAt: j.createdAt.toISOString(),
            lastUsed: j.lastUsed?.toISOString(),
        })),
        insideJokeSeeds: memory.insideJokeSeeds.map((s) => ({
            ...s,
            timestamp: s.timestamp.toISOString(),
        })),
        // Filter out undefined values that Firestore rejects
        milestones: memory.milestones.map((m) => {
            const milestone = { ...m };
            // Convert dates to ISO strings, but only if they exist
            if (m.reachedAt) {
                milestone.reachedAt = m.reachedAt.toISOString();
            }
            else {
                delete milestone.reachedAt;
            }
            if (m.acknowledgedAt) {
                milestone.acknowledgedAt = m.acknowledgedAt.toISOString();
            }
            else {
                delete milestone.acknowledgedAt;
            }
            return milestone;
        }),
        callbackAttempts: memory.callbackAttempts.map((c) => ({
            ...c,
            timestamp: c.timestamp.toISOString(),
        })),
        callbackEffectiveness: memory.callbackEffectiveness.map((e) => ({
            ...e,
            lastAttempt: e.lastAttempt.toISOString(),
        })),
        temporalPatterns: memory.temporalPatterns,
        emotionalTrajectory: {
            ...memory.emotionalTrajectory,
            recentSessions: memory.emotionalTrajectory.recentSessions.map((s) => ({
                ...s,
                date: s.date.toISOString(),
            })),
            concerns: memory.emotionalTrajectory.concerns.map((c) => ({
                ...c,
                firstNoticed: c.firstNoticed.toISOString(),
            })),
            growthAreas: memory.emotionalTrajectory.growthAreas.map((g) => ({
                ...g,
                firstNoticed: g.firstNoticed.toISOString(),
            })),
        },
        // Meta dates
        firstConversation: memory.firstConversation.toISOString(),
        lastConversation: memory.lastConversation.toISOString(),
        totalSessions: memory.totalSessions,
        totalTurns: memory.totalTurns,
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Convert Firestore document back to RelationshipMemory
 */
function deserializeFromFirestore(data) {
    return {
        userId: data.userId,
        personaId: data.personaId,
        stage: data.stage,
        trustScore: data.trustScore,
        trustFactors: data.trustFactors,
        sharedMoments: (data.sharedMoments || []).map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
            lastCallback: m.lastCallback ? new Date(m.lastCallback) : undefined,
        })),
        insideJokes: (data.insideJokes || []).map((j) => ({
            ...j,
            createdAt: new Date(j.createdAt),
            lastUsed: j.lastUsed ? new Date(j.lastUsed) : undefined,
        })),
        insideJokeSeeds: (data.insideJokeSeeds || []).map((s) => ({
            ...s,
            timestamp: new Date(s.timestamp),
        })),
        milestones: (data.milestones || []).map((m) => ({
            ...m,
            reachedAt: m.reachedAt ? new Date(m.reachedAt) : undefined,
            acknowledgedAt: m.acknowledgedAt ? new Date(m.acknowledgedAt) : undefined,
        })),
        callbackAttempts: (data.callbackAttempts || []).map((c) => ({
            ...c,
            timestamp: new Date(c.timestamp),
        })),
        callbackEffectiveness: (data.callbackEffectiveness || []).map((e) => ({
            ...e,
            lastAttempt: new Date(e.lastAttempt),
        })),
        temporalPatterns: data.temporalPatterns,
        emotionalTrajectory: {
            recentSessions: (data.emotionalTrajectory?.recentSessions || []).map((s) => ({
                ...s,
                date: new Date(s.date),
            })),
            trendDirection: data.emotionalTrajectory
                ?.trendDirection,
            trendConfidence: data.emotionalTrajectory
                ?.trendConfidence,
            concerns: (data.emotionalTrajectory?.concerns || []).map((c) => ({
                ...c,
                firstNoticed: new Date(c.firstNoticed),
            })),
            growthAreas: (data.emotionalTrajectory?.growthAreas || []).map((g) => ({
                ...g,
                firstNoticed: new Date(g.firstNoticed),
            })),
        },
        firstConversation: new Date(data.firstConversation),
        lastConversation: new Date(data.lastConversation),
        totalSessions: data.totalSessions,
        totalTurns: data.totalTurns,
        updatedAt: new Date(data.updatedAt),
    };
}
// ============================================================================
// PERSISTENCE CLASS
// ============================================================================
/**
 * Firestore persistence for relationship memories
 */
export class RelationshipMemoryPersistence {
    db = null;
    initPromise = null;
    constructor(firestore) {
        if (firestore) {
            this.db = firestore;
        }
    }
    /**
     * Initialize Firestore connection (lazy)
     */
    async ensureInitialized() {
        if (this.db)
            return this.db;
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        await this.initPromise;
        if (!this.db) {
            throw new Error('Failed to initialize Firestore');
        }
        return this.db;
    }
    async initialize() {
        try {
            const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
            this.db = new FirestoreClass({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            log.info('RelationshipMemoryPersistence initialized');
        }
        catch (error) {
            log.error({ error }, 'Failed to initialize Firestore for relationship memory');
            throw error;
        }
    }
    /**
     * Generate document ID for user-persona pair
     */
    getDocId(userId, personaId) {
        return `${userId}_${personaId}`;
    }
    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================
    /**
     * Save relationship memory to Firestore
     */
    async save(memory) {
        const db = await this.ensureInitialized();
        const docId = this.getDocId(memory.userId, memory.personaId);
        try {
            const data = serializeForFirestore(memory);
            await db.collection(COLLECTION_NAME).doc(docId).set(cleanForFirestore(data), { merge: true });
            log.debug({
                userId: memory.userId,
                personaId: memory.personaId,
                stage: memory.stage,
                trustScore: memory.trustScore,
            }, 'Saved relationship memory');
        }
        catch (error) {
            log.error({ error, userId: memory.userId, personaId: memory.personaId }, 'Failed to save relationship memory');
            throw error;
        }
    }
    /**
     * Load relationship memory from Firestore
     */
    async load(userId, personaId) {
        const db = await this.ensureInitialized();
        const docId = this.getDocId(userId, personaId);
        try {
            const doc = await db.collection(COLLECTION_NAME).doc(docId).get();
            if (!doc.exists) {
                log.debug({ userId, personaId }, 'No existing relationship memory found');
                return null;
            }
            const data = doc.data();
            if (!data)
                return null;
            const memory = deserializeFromFirestore(data);
            log.debug({
                userId,
                personaId,
                stage: memory.stage,
                totalSessions: memory.totalSessions,
            }, 'Loaded relationship memory');
            return memory;
        }
        catch (error) {
            log.error({ error, userId, personaId }, 'Failed to load relationship memory');
            throw error;
        }
    }
    /**
     * Delete relationship memory
     */
    async delete(userId, personaId) {
        const db = await this.ensureInitialized();
        const docId = this.getDocId(userId, personaId);
        try {
            await db.collection(COLLECTION_NAME).doc(docId).delete();
            log.info({ userId, personaId }, 'Deleted relationship memory');
        }
        catch (error) {
            log.error({ error, userId, personaId }, 'Failed to delete relationship memory');
            throw error;
        }
    }
    /**
     * Load all relationship memories for a user (across all personas)
     */
    async loadAllForUser(userId) {
        const db = await this.ensureInitialized();
        try {
            const snapshot = await db.collection(COLLECTION_NAME).where('userId', '==', userId).get();
            if (snapshot.empty) {
                return [];
            }
            const memories = snapshot.docs
                .map((doc) => {
                const data = doc.data();
                return data ? deserializeFromFirestore(data) : null;
            })
                .filter((m) => m !== null);
            log.debug({ userId, count: memories.length }, 'Loaded all relationship memories for user');
            return memories;
        }
        catch (error) {
            log.error({ error, userId }, 'Failed to load all relationship memories');
            throw error;
        }
    }
    /**
     * Check if relationship exists
     */
    async exists(userId, personaId) {
        const db = await this.ensureInitialized();
        const docId = this.getDocId(userId, personaId);
        try {
            const doc = await db.collection(COLLECTION_NAME).doc(docId).get();
            return doc.exists;
        }
        catch (error) {
            log.error({ error, userId, personaId }, 'Failed to check relationship existence');
            return false;
        }
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let persistenceInstance = null;
/**
 * Get the singleton persistence instance
 */
export function getRelationshipPersistence() {
    if (!persistenceInstance) {
        persistenceInstance = new RelationshipMemoryPersistence();
    }
    return persistenceInstance;
}
/**
 * Save relationship memory (convenience function)
 */
export async function saveRelationshipMemory(memory) {
    return getRelationshipPersistence().save(memory);
}
/**
 * Load relationship memory (convenience function)
 */
export async function loadRelationshipMemory(userId, personaId) {
    return getRelationshipPersistence().load(userId, personaId);
}
/**
 * Load all relationship memories for a user (convenience function)
 */
export async function loadAllRelationshipMemories(userId) {
    return getRelationshipPersistence().loadAllForUser(userId);
}
export default RelationshipMemoryPersistence;
//# sourceMappingURL=persistence.js.map