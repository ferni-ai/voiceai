/**
 * Predictive Intelligence Persistence Layer
 *
 * Stores learned ML model state to Firestore so patterns survive restarts.
 *
 * WHAT GETS PERSISTED:
 * - Markov chain transition counts
 * - Time-series historical data
 * - Reinforcement learning weights
 * - Signal accuracy scores
 *
 * ARCHITECTURE:
 * - In-memory for fast reads during conversation
 * - Periodic flush to Firestore (batched for efficiency)
 * - Load on first access per user
 * - Shared community patterns stored separately
 *
 * @module intelligence/predictive/persistence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../services/superhuman/firestore-utils.js';
import { Timestamp } from '@google-cloud/firestore';
const log = createLogger({ module: 'PredictiveMLPersistence' });
// ============================================================================
// STATE TRACKING
// ============================================================================
/** Users with dirty state that need flushing */
const dirtyUsers = new Set();
/** Last flush timestamp per user */
const lastFlushTime = new Map();
/** Minimum time between flushes (5 minutes) */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
/** Cache for loaded profiles */
const loadedUsers = new Set();
/** Active flush locks to prevent concurrent writes per user */
const flushLocks = new Map();
/**
 * Execute with lock to prevent concurrent flushes for the same user
 */
async function withFlushLock(userId, fn) {
    // Wait for any existing flush to complete
    const existingLock = flushLocks.get(userId);
    if (existingLock) {
        await existingLock;
    }
    // Create new lock and execute
    const lockPromise = fn().finally(() => {
        flushLocks.delete(userId);
    });
    flushLocks.set(userId, lockPromise);
    return lockPromise;
}
// ============================================================================
// MARKOV PERSISTENCE
// ============================================================================
/**
 * Save Markov model state to Firestore
 */
export async function saveMarkovState(userId, data) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        log.debug({ userId }, 'Firestore not available, skipping Markov save');
        return;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('markov');
        const cleanedData = cleanForFirestore({
            ...data,
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedData, { merge: true });
        log.debug({ userId, observations: data.totalObservations }, 'Markov state saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save Markov state');
    }
}
/**
 * Load Markov model state from Firestore
 */
export async function loadMarkovState(userId) {
    const firestore = getFirestoreDb();
    if (!firestore)
        return null;
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('markov');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        log.debug({ userId, observations: data.totalObservations }, 'Markov state loaded');
        return data;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load Markov state');
        return null;
    }
}
// ============================================================================
// TIME SERIES PERSISTENCE
// ============================================================================
/**
 * Save time series model state to Firestore
 */
export async function saveTimeSeriesState(userId, data) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        log.debug({ userId }, 'Firestore not available, skipping time series save');
        return;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('time_series');
        // Limit points to last 90 days for storage efficiency
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const trimmedData = {
            ...data,
            mood: data.mood.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
            energy: data.energy.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
            engagement: data.engagement.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
            stress: data.stress.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
        };
        const cleanedData = cleanForFirestore({
            ...trimmedData,
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedData, { merge: true });
        const totalPoints = trimmedData.mood.length +
            trimmedData.energy.length +
            trimmedData.engagement.length +
            trimmedData.stress.length;
        log.debug({ userId, totalPoints }, 'Time series state saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save time series state');
    }
}
/**
 * Load time series model state from Firestore
 */
export async function loadTimeSeriesState(userId) {
    const firestore = getFirestoreDb();
    if (!firestore)
        return null;
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('time_series');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        const totalPoints = (data.mood?.length || 0) +
            (data.energy?.length || 0) +
            (data.engagement?.length || 0) +
            (data.stress?.length || 0);
        log.debug({ userId, totalPoints }, 'Time series state loaded');
        return data;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load time series state');
        return null;
    }
}
// ============================================================================
// REINFORCEMENT LEARNING PERSISTENCE
// ============================================================================
/**
 * Save reinforcement learning state to Firestore
 */
export async function saveReinforcementState(userId, data) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        log.debug({ userId }, 'Firestore not available, skipping reinforcement save');
        return;
    }
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('reinforcement');
        // Keep only recent predictions (last 30 days)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentPredictions = {};
        for (const [key, pred] of Object.entries(data.predictions)) {
            if (pred.timestamp > thirtyDaysAgo) {
                recentPredictions[key] = pred;
            }
        }
        // Keep only recent outreach history (last 90 days)
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const recentOutreach = data.outreachHistory.filter((o) => o.timestamp > ninetyDaysAgo);
        const trimmedData = {
            ...data,
            predictions: recentPredictions,
            outreachHistory: recentOutreach.slice(-200), // Max 200 entries
        };
        const cleanedData = cleanForFirestore({
            ...trimmedData,
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedData, { merge: true });
        log.debug({ userId, predictionCount: Object.keys(recentPredictions).length }, 'Reinforcement state saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save reinforcement state');
    }
}
/**
 * Load reinforcement learning state from Firestore
 */
export async function loadReinforcementState(userId) {
    const firestore = getFirestoreDb();
    if (!firestore)
        return null;
    try {
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_ml')
            .doc('reinforcement');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        log.debug({ userId, predictionCount: Object.keys(data.predictions || {}).length }, 'Reinforcement state loaded');
        return data;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load reinforcement state');
        return null;
    }
}
// ============================================================================
// COMMUNITY PATTERNS PERSISTENCE
// ============================================================================
/**
 * Save community-wide patterns (aggregated, anonymous)
 */
export async function saveCommunityPatterns(data) {
    const firestore = getFirestoreDb();
    if (!firestore)
        return;
    try {
        const docRef = firestore.collection('predictive_intelligence').doc('community_patterns');
        const cleanedData = cleanForFirestore({
            ...data,
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedData, { merge: true });
        log.info({ observations: data.totalObservations }, 'Community patterns saved');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to save community patterns');
    }
}
/**
 * Load community-wide patterns
 */
export async function loadCommunityPatterns() {
    const firestore = getFirestoreDb();
    if (!firestore)
        return null;
    try {
        const docRef = firestore.collection('predictive_intelligence').doc('community_patterns');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        log.info({ observations: data.totalObservations }, 'Community patterns loaded');
        return data;
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to load community patterns');
        return null;
    }
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
/**
 * Mark a user's ML state as dirty (needs persistence)
 */
export function markDirty(userId) {
    dirtyUsers.add(userId);
}
/**
 * Check if user is loaded
 */
export function isUserLoaded(userId) {
    return loadedUsers.has(userId);
}
/**
 * Mark user as loaded
 */
export function markUserLoaded(userId) {
    loadedUsers.add(userId);
}
/**
 * Flush all dirty users to Firestore
 *
 * Called periodically by scheduled job or on shutdown.
 */
export async function flushDirtyUsers(getMarkovData, getTimeSeriesData, getReinforcementData) {
    const now = Date.now();
    let flushed = 0;
    let errors = 0;
    for (const userId of Array.from(dirtyUsers)) {
        // Check if we should flush (respect interval)
        const lastFlush = lastFlushTime.get(userId) || 0;
        if (now - lastFlush < FLUSH_INTERVAL_MS) {
            continue; // Skip - too soon
        }
        try {
            // Save all model types in parallel
            const markovData = getMarkovData(userId);
            const timeSeriesData = getTimeSeriesData(userId);
            const reinforcementData = getReinforcementData(userId);
            const promises = [];
            if (markovData) {
                promises.push(saveMarkovState(userId, markovData));
            }
            if (timeSeriesData) {
                promises.push(saveTimeSeriesState(userId, timeSeriesData));
            }
            if (reinforcementData) {
                promises.push(saveReinforcementState(userId, reinforcementData));
            }
            await Promise.all(promises);
            dirtyUsers.delete(userId);
            lastFlushTime.set(userId, now);
            flushed++;
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to flush user ML state');
            errors++;
        }
    }
    if (flushed > 0) {
        log.info({ flushed, errors }, 'Flushed dirty ML state to Firestore');
    }
    return { flushed, errors };
}
/**
 * Force flush a specific user (e.g., on session end)
 * Uses lock to prevent concurrent writes to the same user's data.
 */
export async function forceFlushUser(userId, getMarkovData, getTimeSeriesData, getReinforcementData) {
    return withFlushLock(userId, async () => {
        const markovData = getMarkovData(userId);
        const timeSeriesData = getTimeSeriesData(userId);
        const reinforcementData = getReinforcementData(userId);
        const promises = [];
        if (markovData) {
            promises.push(saveMarkovState(userId, markovData));
        }
        if (timeSeriesData) {
            promises.push(saveTimeSeriesState(userId, timeSeriesData));
        }
        if (reinforcementData) {
            promises.push(saveReinforcementState(userId, reinforcementData));
        }
        await Promise.all(promises);
        dirtyUsers.delete(userId);
        lastFlushTime.set(userId, Date.now());
    });
}
// ============================================================================
// INITIALIZATION
// ============================================================================
let initialized = false;
let flushIntervalHandle = null;
/**
 * Initialize persistence layer with periodic flushing
 */
export function initializePersistence(getMarkovData, getTimeSeriesData, getReinforcementData) {
    if (initialized)
        return;
    // Set up periodic flush (every 5 minutes)
    flushIntervalHandle = setInterval(() => {
        void flushDirtyUsers(getMarkovData, getTimeSeriesData, getReinforcementData);
    }, FLUSH_INTERVAL_MS);
    initialized = true;
    log.info('🧠 Predictive ML persistence initialized');
}
/**
 * Shutdown persistence layer (flush remaining data)
 */
export async function shutdownPersistence(getMarkovData, getTimeSeriesData, getReinforcementData) {
    if (flushIntervalHandle) {
        clearInterval(flushIntervalHandle);
        flushIntervalHandle = null;
    }
    // Final flush of all dirty users
    await flushDirtyUsers(getMarkovData, getTimeSeriesData, getReinforcementData);
    initialized = false;
    log.info('🧠 Predictive ML persistence shut down');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const predictiveMLPersistence = {
    // Markov
    saveMarkov: saveMarkovState,
    loadMarkov: loadMarkovState,
    // Time Series
    saveTimeSeries: saveTimeSeriesState,
    loadTimeSeries: loadTimeSeriesState,
    // Reinforcement
    saveReinforcement: saveReinforcementState,
    loadReinforcement: loadReinforcementState,
    // Community
    saveCommunity: saveCommunityPatterns,
    loadCommunity: loadCommunityPatterns,
    // Batch
    markDirty,
    flushDirty: flushDirtyUsers,
    forceFlush: forceFlushUser,
    // Lifecycle
    initialize: initializePersistence,
    shutdown: shutdownPersistence,
    // State
    isUserLoaded,
    markUserLoaded,
};
export default predictiveMLPersistence;
//# sourceMappingURL=persistence.js.map