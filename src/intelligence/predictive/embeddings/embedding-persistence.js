/**
 * Embedding Intelligence Persistence
 *
 * Persists embedding-powered predictive data to Firestore.
 *
 * Similar to superhuman-persistence.ts but for the embedding capabilities:
 * - Semantic avoidance patterns
 * - Trajectory pattern library
 * - Breakthrough embeddings
 * - Cognitive fingerprints (community)
 * - Ripple embedding space
 * - Intervention situation library
 *
 * @module intelligence/predictive/embeddings/embedding-persistence
 */
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { embeddingObservability } from './embedding-observability.js';
const log = createLogger({ module: 'EmbeddingPersistence' });
// ============================================================================
// FIRESTORE ACCESS
// ============================================================================
let firestoreDb = null;
function getFirestoreDb() {
    if (firestoreDb)
        return firestoreDb;
    try {
        // Dynamic import to avoid circular dependencies
        const admin = require('firebase-admin');
        if (admin.apps.length > 0) {
            firestoreDb = admin.firestore();
            return firestoreDb;
        }
    }
    catch (e) {
        // Firebase not initialized
    }
    return null;
}
// ============================================================================
// DIRTY TRACKING
// ============================================================================
const dirtyUsers = new Set();
/**
 * Mark a user's embedding data as dirty (needs persistence)
 */
export function markEmbeddingDirty(userId) {
    dirtyUsers.add(userId);
}
/**
 * Check if user has dirty embedding data
 */
export function isEmbeddingDirty(userId) {
    return dirtyUsers.has(userId);
}
/**
 * Clear dirty flag after successful save
 */
function clearEmbeddingDirty(userId) {
    dirtyUsers.delete(userId);
}
// ============================================================================
// SAVE FUNCTIONS
// ============================================================================
async function saveToFirestore(userId, docName, data) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        log.debug({ userId, docName }, 'Firestore not available, skipping embedding save');
        return;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('embedding_intelligence')
            .doc(docName);
        const cleanedData = cleanForFirestore({
            ...data,
            updatedAt: new Date(),
        });
        await docRef.set(cleanedData, { merge: true });
        log.debug({ userId, docName }, 'Embedding data saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId, docName }, 'Failed to save embedding data');
    }
}
/**
 * Save semantic avoidance data
 */
export async function saveSemanticAvoidance(userId, data) {
    await saveToFirestore(userId, 'semantic_avoidance', data);
}
/**
 * Save trajectory patterns
 */
export async function saveTrajectoryPatterns(userId, data) {
    await saveToFirestore(userId, 'trajectory_patterns', data);
}
/**
 * Save breakthrough embeddings
 */
export async function saveBreakthroughEmbeddings(userId, data) {
    await saveToFirestore(userId, 'breakthrough_embeddings', data);
}
/**
 * Save ripple embedding space
 */
export async function saveRippleSpace(userId, data) {
    await saveToFirestore(userId, 'ripple_space', data);
}
/**
 * Save intervention situations
 */
export async function saveInterventionSituations(userId, data) {
    await saveToFirestore(userId, 'intervention_situations', data);
}
/**
 * Save cognitive fingerprint
 */
export async function saveCognitiveFingerprint(userId, data) {
    await saveToFirestore(userId, 'cognitive_fingerprint', data);
}
// ============================================================================
// LOAD FUNCTIONS
// ============================================================================
async function loadFromFirestore(userId, docName) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        return null;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('embedding_intelligence')
            .doc(docName);
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
    catch (error) {
        log.debug({ error: String(error), userId, docName }, 'Failed to load embedding data');
        return null;
    }
}
/**
 * Load semantic avoidance data
 */
export async function loadSemanticAvoidance(userId) {
    return loadFromFirestore(userId, 'semantic_avoidance');
}
/**
 * Load trajectory patterns
 */
export async function loadTrajectoryPatterns(userId) {
    return loadFromFirestore(userId, 'trajectory_patterns');
}
/**
 * Load breakthrough embeddings
 */
export async function loadBreakthroughEmbeddings(userId) {
    return loadFromFirestore(userId, 'breakthrough_embeddings');
}
/**
 * Load ripple embedding space
 */
export async function loadRippleSpace(userId) {
    return loadFromFirestore(userId, 'ripple_space');
}
/**
 * Load intervention situations
 */
export async function loadInterventionSituations(userId) {
    return loadFromFirestore(userId, 'intervention_situations');
}
/**
 * Load cognitive fingerprint
 */
export async function loadCognitiveFingerprint(userId) {
    return loadFromFirestore(userId, 'cognitive_fingerprint');
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
/**
 * Load all embedding data for a user
 */
export async function loadAllEmbeddingData(userId) {
    const [avoidance, trajectories, breakthroughs, rippleSpace, interventions, cognitive] = await Promise.all([
        loadSemanticAvoidance(userId),
        loadTrajectoryPatterns(userId),
        loadBreakthroughEmbeddings(userId),
        loadRippleSpace(userId),
        loadInterventionSituations(userId),
        loadCognitiveFingerprint(userId),
    ]);
    return { avoidance, trajectories, breakthroughs, rippleSpace, interventions, cognitive };
}
/**
 * Flush embedding state for a user - saves all in-memory data to Firestore
 */
export async function flushEmbeddingState(userId) {
    log.debug({ userId }, '💾 Flushing embedding state to Firestore...');
    try {
        // Import the modules to get current state
        const { semanticAvoidance } = await import('./semantic-avoidance.js');
        const { trajectoryPatterns } = await import('./trajectory-patterns.js');
        const { breakthroughEmbeddings } = await import('./breakthrough-embeddings.js');
        const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');
        const { interventionMatching } = await import('./intervention-matching.js');
        const { cognitiveSimilarity } = await import('./cognitive-similarity.js');
        // Get state from each module and save to Firestore
        const savePromises = [];
        // 1. Semantic Avoidance
        const avoidanceState = semanticAvoidance.getStateForPersistence(userId);
        if (avoidanceState.embeddings.length > 0 || avoidanceState.clusters.length > 0) {
            savePromises.push(saveSemanticAvoidance(userId, avoidanceState));
        }
        // 2. Trajectory Patterns
        const trajectoryState = trajectoryPatterns.getStateForPersistence(userId);
        if (trajectoryState.patterns.length > 0) {
            savePromises.push(saveTrajectoryPatterns(userId, { patterns: trajectoryState.patterns }));
        }
        // 3. Breakthrough Embeddings
        const breakthroughState = breakthroughEmbeddings.getStateForPersistence(userId);
        if (breakthroughState.breakthroughs.length > 0) {
            savePromises.push(saveBreakthroughEmbeddings(userId, { breakthroughs: breakthroughState.breakthroughs }));
        }
        // 4. Ripple Embedding Space
        const rippleState = rippleEmbeddingSpace.getStateForPersistence(userId);
        if (rippleState && rippleState.domains.length > 0) {
            savePromises.push(saveRippleSpace(userId, rippleState));
        }
        // 5. Intervention Matching
        const interventionState = interventionMatching.getStateForPersistence(userId);
        if (interventionState.situations.length > 0) {
            savePromises.push(saveInterventionSituations(userId, { situations: interventionState.situations }));
        }
        // 6. Cognitive Similarity (per-user fingerprint)
        const cognitiveState = cognitiveSimilarity.getStateForPersistence(userId);
        if (cognitiveState.fingerprint || cognitiveState.interventionOutcomes.length > 0) {
            savePromises.push(saveCognitiveFingerprint(userId, cognitiveState));
        }
        await Promise.all(savePromises);
        embeddingObservability.recordPersistence('flush', true);
        log.info({ userId, saveCount: savePromises.length }, '💾 Embedding state flushed');
    }
    catch (error) {
        embeddingObservability.recordPersistence('flush', false);
        log.warn({ error: String(error), userId }, 'Failed to flush embedding state');
    }
    clearEmbeddingDirty(userId);
}
/**
 * Flush all dirty users
 */
export async function flushAllDirtyEmbeddingUsers() {
    const users = Array.from(dirtyUsers);
    for (const userId of users) {
        try {
            await flushEmbeddingState(userId);
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to flush embedding state');
        }
    }
}
// ============================================================================
// SESSION LIFECYCLE
// ============================================================================
/**
 * Initialize embedding intelligence for a session
 */
export async function initializeEmbeddingSession(userId, sessionId) {
    log.debug({ userId, sessionId }, '🧠 Initializing embedding session...');
    const { conversationTrajectory } = await import('./conversation-trajectory.js');
    const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');
    const { semanticAvoidance } = await import('./semantic-avoidance.js');
    const { trajectoryPatterns } = await import('./trajectory-patterns.js');
    const { breakthroughEmbeddings } = await import('./breakthrough-embeddings.js');
    const { interventionMatching } = await import('./intervention-matching.js');
    const { cognitiveSimilarity } = await import('./cognitive-similarity.js');
    // Start conversation trajectory tracking (session-scoped, not persisted)
    conversationTrajectory.startTrajectory(sessionId, userId);
    // Load and hydrate persisted data
    try {
        const [avoidanceData, trajectoryData, breakthroughData, rippleData, interventionData, cognitiveData,] = await Promise.all([
            loadSemanticAvoidance(userId),
            loadTrajectoryPatterns(userId),
            loadBreakthroughEmbeddings(userId),
            loadRippleSpace(userId),
            loadInterventionSituations(userId),
            loadCognitiveFingerprint(userId),
        ]);
        let hydratedCount = 0;
        // Hydrate each module with persisted data
        if (avoidanceData) {
            semanticAvoidance.hydrateFromPersistence(userId, avoidanceData);
            hydratedCount++;
        }
        if (trajectoryData) {
            trajectoryPatterns.hydrateFromPersistence(userId, trajectoryData);
            hydratedCount++;
        }
        if (breakthroughData) {
            breakthroughEmbeddings.hydrateFromPersistence(userId, breakthroughData);
            hydratedCount++;
        }
        if (rippleData) {
            rippleEmbeddingSpace.hydrateFromPersistence(userId, rippleData);
            hydratedCount++;
        }
        else {
            // Initialize domain space if no persisted data
            await rippleEmbeddingSpace.initializeDomainSpace(userId);
        }
        if (interventionData) {
            interventionMatching.hydrateFromPersistence(userId, interventionData);
            hydratedCount++;
        }
        if (cognitiveData) {
            cognitiveSimilarity.hydrateFromPersistence(userId, cognitiveData);
            hydratedCount++;
        }
        embeddingObservability.recordPersistence('hydration', true);
        embeddingObservability.recordSession();
        log.info({ userId, sessionId, hydratedCount }, '🧠 Embedding session initialized with persisted data');
    }
    catch (error) {
        embeddingObservability.recordPersistence('hydration', false);
        log.warn({ error: String(error), userId }, 'Failed to load persisted embedding data, starting fresh');
        // Initialize fresh domain space
        await rippleEmbeddingSpace.initializeDomainSpace(userId);
    }
}
/**
 * Cleanup embedding intelligence for a session
 */
export async function cleanupEmbeddingSession(userId, sessionId) {
    const { conversationTrajectory } = await import('./conversation-trajectory.js');
    // End trajectory tracking
    const trajectory = conversationTrajectory.endTrajectory(sessionId);
    // Mark for persistence
    markEmbeddingDirty(userId);
    log.debug({ userId, sessionId, turns: trajectory?.turns.length ?? 0 }, '🧠 Embedding session cleaned up');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const embeddingPersistence = {
    markDirty: markEmbeddingDirty,
    isDirty: isEmbeddingDirty,
    flush: flushEmbeddingState,
    flushAll: flushAllDirtyEmbeddingUsers,
    initializeSession: initializeEmbeddingSession,
    cleanupSession: cleanupEmbeddingSession,
    save: {
        avoidance: saveSemanticAvoidance,
        trajectories: saveTrajectoryPatterns,
        breakthroughs: saveBreakthroughEmbeddings,
        rippleSpace: saveRippleSpace,
        interventions: saveInterventionSituations,
        cognitive: saveCognitiveFingerprint,
    },
    load: {
        avoidance: loadSemanticAvoidance,
        trajectories: loadTrajectoryPatterns,
        breakthroughs: loadBreakthroughEmbeddings,
        rippleSpace: loadRippleSpace,
        interventions: loadInterventionSituations,
        cognitive: loadCognitiveFingerprint,
        all: loadAllEmbeddingData,
    },
};
export default embeddingPersistence;
//# sourceMappingURL=embedding-persistence.js.map