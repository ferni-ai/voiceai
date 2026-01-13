/**
 * Superhuman Capabilities Persistence Layer - Better Than Human v4
 *
 * Persists the 8 superhuman predictive capabilities to Firestore.
 *
 * WHAT GETS PERSISTED:
 * 1. Avoidance Prediction - Topics they avoid, deflection patterns
 * 2. Breakthrough Proximity - Active breakthrough tracks, past breakthroughs
 * 3. Pre-Trajectory Detection - Precursor patterns, baselines, trajectory history
 * 4. Conversation Preparation - Topic history, needs patterns, temporal patterns
 * 5. Cognitive Fingerprint - Decision style, stress response, change velocity
 * 6. Ripple Effect Prediction - Domain states, influence patterns, event history
 * 7. Life Phase Prediction - Phase history, phase patterns, observations
 * 8. Intervention Timing - Timing patterns, intervention outcomes
 *
 * @module intelligence/predictive/superhuman-persistence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../services/superhuman/firestore-utils.js';
import { Timestamp } from '@google-cloud/firestore';
const log = createLogger({ module: 'SuperhumanPersistence' });
// ============================================================================
// SAVE FUNCTIONS
// ============================================================================
async function saveToFirestore(userId, docName, data) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        log.debug({ userId, docName }, 'Firestore not available, skipping save');
        return;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('superhuman_predictive')
            .doc(docName);
        const cleanedData = cleanForFirestore({
            ...data,
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedData, { merge: true });
        log.debug({ userId, docName }, 'Superhuman data saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId, docName }, 'Failed to save superhuman data');
    }
}
async function loadFromFirestore(userId, docName) {
    const firestore = getFirestoreDb();
    if (!firestore)
        return null;
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('superhuman_predictive')
            .doc(docName);
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        log.debug({ userId, docName }, 'Superhuman data loaded');
        return doc.data();
    }
    catch (error) {
        log.warn({ error: String(error), userId, docName }, 'Failed to load superhuman data');
        return null;
    }
}
// ============================================================================
// INDIVIDUAL CAPABILITY PERSISTENCE
// ============================================================================
export async function saveAvoidanceState(userId, data) {
    await saveToFirestore(userId, 'avoidance', data);
}
export async function loadAvoidanceState(userId) {
    return loadFromFirestore(userId, 'avoidance');
}
export async function saveBreakthroughState(userId, data) {
    // Trim to last 50 active tracks
    const trimmedData = {
        ...data,
        activeTracks: data.activeTracks.slice(-50),
        pastBreakthroughs: data.pastBreakthroughs.slice(-100),
    };
    await saveToFirestore(userId, 'breakthrough', trimmedData);
}
export async function loadBreakthroughState(userId) {
    return loadFromFirestore(userId, 'breakthrough');
}
export async function saveTrajectoryState(userId, data) {
    // Trim history
    const trimmedData = {
        ...data,
        trajectoryHistory: data.trajectoryHistory.slice(-200),
    };
    await saveToFirestore(userId, 'trajectory', trimmedData);
}
export async function loadTrajectoryState(userId) {
    return loadFromFirestore(userId, 'trajectory');
}
export async function saveConversationPrepState(userId, data) {
    // Trim history
    const trimmedData = {
        ...data,
        topicHistory: data.topicHistory.slice(-200),
        needsHistory: data.needsHistory.slice(-200),
    };
    await saveToFirestore(userId, 'conversation_prep', trimmedData);
}
export async function loadConversationPrepState(userId) {
    return loadFromFirestore(userId, 'conversation_prep');
}
export async function saveCognitiveFingerprintState(userId, data) {
    await saveToFirestore(userId, 'cognitive_fingerprint', data);
}
export async function loadCognitiveFingerprintState(userId) {
    return loadFromFirestore(userId, 'cognitive_fingerprint');
}
export async function saveRippleState(userId, data) {
    // Trim event history
    const trimmedData = {
        ...data,
        eventHistory: data.eventHistory.slice(-200),
    };
    await saveToFirestore(userId, 'ripple', trimmedData);
}
export async function loadRippleState(userId) {
    return loadFromFirestore(userId, 'ripple');
}
export async function saveLifePhaseState(userId, data) {
    await saveToFirestore(userId, 'life_phase', data);
}
export async function loadLifePhaseState(userId) {
    return loadFromFirestore(userId, 'life_phase');
}
export async function saveInterventionTimingState(userId, data) {
    // Trim outcomes
    const trimmedData = {
        ...data,
        outcomes: data.outcomes.slice(-200),
    };
    await saveToFirestore(userId, 'intervention_timing', trimmedData);
}
export async function loadInterventionTimingState(userId) {
    return loadFromFirestore(userId, 'intervention_timing');
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
const dirtyUsers = new Set();
const lastFlushTime = new Map();
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export function markSuperhumanDirty(userId) {
    dirtyUsers.add(userId);
}
export async function flushSuperhumanState(userId, getters) {
    const promises = [];
    const avoidance = getters.getAvoidance(userId);
    if (avoidance)
        promises.push(saveAvoidanceState(userId, avoidance));
    const breakthrough = getters.getBreakthrough(userId);
    if (breakthrough)
        promises.push(saveBreakthroughState(userId, breakthrough));
    const trajectory = getters.getTrajectory(userId);
    if (trajectory)
        promises.push(saveTrajectoryState(userId, trajectory));
    const conversationPrep = getters.getConversationPrep(userId);
    if (conversationPrep)
        promises.push(saveConversationPrepState(userId, conversationPrep));
    const cognitiveFingerprint = getters.getCognitiveFingerprint(userId);
    if (cognitiveFingerprint)
        promises.push(saveCognitiveFingerprintState(userId, cognitiveFingerprint));
    const ripple = getters.getRipple(userId);
    if (ripple)
        promises.push(saveRippleState(userId, ripple));
    const lifePhase = getters.getLifePhase(userId);
    if (lifePhase)
        promises.push(saveLifePhaseState(userId, lifePhase));
    const interventionTiming = getters.getInterventionTiming(userId);
    if (interventionTiming)
        promises.push(saveInterventionTimingState(userId, interventionTiming));
    await Promise.all(promises);
    dirtyUsers.delete(userId);
    lastFlushTime.set(userId, Date.now());
    log.debug({ userId }, '🧠 Flushed superhuman predictive state');
}
export async function flushAllDirtySuperhumanUsers(getters) {
    const now = Date.now();
    let flushed = 0;
    let errors = 0;
    for (const userId of Array.from(dirtyUsers)) {
        const lastFlush = lastFlushTime.get(userId) || 0;
        if (now - lastFlush < FLUSH_INTERVAL_MS)
            continue;
        try {
            await flushSuperhumanState(userId, getters);
            flushed++;
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to flush superhuman state');
            errors++;
        }
    }
    if (flushed > 0) {
        log.info({ flushed, errors }, 'Flushed dirty superhuman state');
    }
    return { flushed, errors };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const superhumanPersistence = {
    // Individual save/load
    saveAvoidance: saveAvoidanceState,
    loadAvoidance: loadAvoidanceState,
    saveBreakthrough: saveBreakthroughState,
    loadBreakthrough: loadBreakthroughState,
    saveTrajectory: saveTrajectoryState,
    loadTrajectory: loadTrajectoryState,
    saveConversationPrep: saveConversationPrepState,
    loadConversationPrep: loadConversationPrepState,
    saveCognitiveFingerprint: saveCognitiveFingerprintState,
    loadCognitiveFingerprint: loadCognitiveFingerprintState,
    saveRipple: saveRippleState,
    loadRipple: loadRippleState,
    saveLifePhase: saveLifePhaseState,
    loadLifePhase: loadLifePhaseState,
    saveInterventionTiming: saveInterventionTimingState,
    loadInterventionTiming: loadInterventionTimingState,
    // Batch
    markDirty: markSuperhumanDirty,
    flushUser: flushSuperhumanState,
    flushAllDirty: flushAllDirtySuperhumanUsers,
};
export default superhumanPersistence;
//# sourceMappingURL=superhuman-persistence.js.map