/**
 * Cognitive Learning Persistence
 *
 * > "Perfect memory. Zero judgment. Full presence."
 *
 * Firestore persistence for cognitive learning data.
 * Tracks which reasoning approaches work best for each user-persona pair,
 * what topics they're expert vs novice in, and knowledge state to avoid
 * re-explaining concepts they already understand.
 *
 * This is what makes Ferni "learn" over time - not just remember facts,
 * but remember HOW to communicate with each person.
 */
import { getFirestoreDatabase, getGCPProjectId } from '../config/environment.js';
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
const log = createLogger({ module: 'CognitivePersistence' });
// Module-level Firestore instance (lazy initialized)
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================
/**
 * Get Firestore connection (lazy initialized)
 */
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: getGCPProjectId(),
            databaseId: getFirestoreDatabase(),
        });
        log.info('Cognitive persistence Firestore initialized');
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available for cognitive persistence');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// COGNITIVE LEARNING PERSISTENCE
// ============================================================================
const COGNITIVE_LEARNING_COLLECTION = 'cognitive_learning';
/**
 * Save cognitive learning data for a user-persona pair
 */
export async function saveCognitiveLearning(data) {
    const firestore = await getFirestore();
    if (!firestore) {
        log.warn('Firestore not available, cognitive learning not persisted');
        return;
    }
    try {
        const docId = `${data.userId}_${data.personaId}`;
        await firestore
            .collection('bogle_users')
            .doc(data.userId)
            .collection(COGNITIVE_LEARNING_COLLECTION)
            .doc(docId)
            .set(cleanForFirestore({
            ...data,
            updatedAt: new Date().toISOString(),
        }), { merge: true });
        log.debug({
            userId: data.userId,
            personaId: data.personaId,
            totalInteractions: data.totalInteractions,
            preferredStyle: data.userPreferredStyle,
        }, 'Saved cognitive learning data');
    }
    catch (error) {
        log.error({ error, userId: data.userId, personaId: data.personaId }, 'Failed to save cognitive learning');
    }
}
/**
 * Load cognitive learning data for a user-persona pair
 */
export async function loadCognitiveLearning(userId, personaId) {
    const firestore = await getFirestore();
    if (!firestore)
        return null;
    try {
        const docId = `${userId}_${personaId}`;
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection(COGNITIVE_LEARNING_COLLECTION)
            .doc(docId)
            .get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        log.debug({
            userId,
            personaId,
            totalInteractions: data.totalInteractions,
            preferredStyle: data.userPreferredStyle,
        }, 'Loaded cognitive learning data');
        return data;
    }
    catch (error) {
        log.error({ error, userId, personaId }, 'Failed to load cognitive learning');
        return null;
    }
}
/**
 * Load all cognitive learning data for a user (across all personas)
 */
export async function loadAllCognitiveLearning(userId) {
    const firestore = await getFirestore();
    if (!firestore)
        return [];
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection(COGNITIVE_LEARNING_COLLECTION)
            .get();
        if (snapshot.empty)
            return [];
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to load all cognitive learning');
        return [];
    }
}
// ============================================================================
// KNOWLEDGE STATE PERSISTENCE
// ============================================================================
const KNOWLEDGE_STATE_COLLECTION = 'knowledge_state';
/**
 * Save knowledge state for a user
 */
export async function saveKnowledgeState(data) {
    const firestore = await getFirestore();
    if (!firestore) {
        log.warn('Firestore not available, knowledge state not persisted');
        return;
    }
    try {
        await firestore
            .collection('bogle_users')
            .doc(data.userId)
            .collection(KNOWLEDGE_STATE_COLLECTION)
            .doc('state')
            .set(cleanForFirestore({
            ...data,
            updatedAt: new Date().toISOString(),
        }), { merge: true });
        log.debug({
            userId: data.userId,
            topicsCount: Object.keys(data.topicsExplained).length,
            skipCount: data.skipExplanationFor.length,
        }, 'Saved knowledge state');
    }
    catch (error) {
        log.error({ error, userId: data.userId }, 'Failed to save knowledge state');
    }
}
/**
 * Load knowledge state for a user
 */
export async function loadKnowledgeState(userId) {
    const firestore = await getFirestore();
    if (!firestore)
        return null;
    try {
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection(KNOWLEDGE_STATE_COLLECTION)
            .doc('state')
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        log.debug({
            userId,
            topicsCount: Object.keys(data.topicsExplained).length,
        }, 'Loaded knowledge state');
        return data;
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to load knowledge state');
        return null;
    }
}
// ============================================================================
// TRACKER INTEGRATION HELPERS
// ============================================================================
/**
 * Convert CognitiveLearning (in-memory Map-based) to PersistedCognitiveLearning
 */
export function toPersistableLearning(userId, personaId, learning) {
    // Convert Map to Record
    const effectiveApproaches = {
        analytical: 0.5,
        intuitive: 0.5,
        empathetic: 0.5,
        systematic: 0.5,
        narrative: 0.5,
        pragmatic: 0.5,
    };
    for (const [approach, score] of learning.effectiveApproaches) {
        effectiveApproaches[approach] = score;
    }
    return {
        userId,
        personaId,
        effectiveApproaches,
        userPreferredStyle: learning.userPreferredStyle,
        breakthroughApproaches: [...learning.breakthroughApproaches],
        ineffectiveApproaches: [...learning.ineffectiveApproaches],
        expertiseTopics: [...learning.expertiseTopics],
        noviceTopics: [...learning.noviceTopics],
        totalInteractions: learning.totalInteractions,
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Convert PersistedCognitiveLearning back to in-memory format
 */
export function fromPersistedLearning(data) {
    return {
        effectiveApproaches: new Map(Object.entries(data.effectiveApproaches)),
        userPreferredStyle: data.userPreferredStyle,
        breakthroughApproaches: [...data.breakthroughApproaches],
        ineffectiveApproaches: [...data.ineffectiveApproaches],
        expertiseTopics: [...data.expertiseTopics],
        noviceTopics: [...data.noviceTopics],
        totalInteractions: data.totalInteractions,
    };
}
/**
 * Convert UserKnowledgeState (in-memory Map-based) to PersistedKnowledgeState
 */
export function toPersistableKnowledge(userId, state) {
    const topicsExplained = {};
    for (const [topic, info] of state.topicsExplained) {
        topicsExplained[topic] = {
            firstExplained: info.firstExplained.toISOString(),
            timesRevisited: info.timesRevisited,
            understandingLevel: info.understandingLevel,
            lastAssessedConfidence: info.lastAssessedConfidence,
            personaWhoExplained: info.personaWhoExplained,
        };
    }
    return {
        userId,
        topicsExplained,
        skipExplanationFor: [...state.skipExplanationFor],
        confusionTopics: [...state.confusionTopics],
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Convert PersistedKnowledgeState back to in-memory format
 */
export function fromPersistedKnowledge(data) {
    const topicsExplained = new Map();
    for (const [topic, info] of Object.entries(data.topicsExplained)) {
        topicsExplained.set(cleanForFirestore(topic), {
            firstExplained: new Date(info.firstExplained),
            timesRevisited: info.timesRevisited,
            understandingLevel: info.understandingLevel,
            lastAssessedConfidence: info.lastAssessedConfidence,
            personaWhoExplained: info.personaWhoExplained,
        });
    }
    return {
        userId: data.userId,
        topicsExplained,
        skipExplanationFor: [...data.skipExplanationFor],
        confusionTopics: [...data.confusionTopics],
    };
}
export default {
    saveCognitiveLearning,
    loadCognitiveLearning,
    loadAllCognitiveLearning,
    saveKnowledgeState,
    loadKnowledgeState,
    toPersistableLearning,
    fromPersistedLearning,
    toPersistableKnowledge,
    fromPersistedKnowledge,
};
//# sourceMappingURL=cognitive-persistence.js.map