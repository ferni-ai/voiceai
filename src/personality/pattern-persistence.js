/**
 * Pattern Persistence Service
 *
 * Persists emotional patterns to Firestore for cross-session insights.
 * This enables "superhuman" observations like:
 * - "I've noticed you seem more stressed when work comes up"
 * - "Every Sunday evening you seem anxious"
 *
 * Uses a dedicated Firestore collection for emotional data.
 *
 * @module personality/pattern-persistence
 */
import { getFirestore } from 'firebase-admin/firestore';
import { removeUndefined, cleanForFirestore } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'PatternPersistence' });
// ============================================================================
// FIRESTORE COLLECTIONS
// ============================================================================
const COLLECTIONS = {
    EMOTIONAL_DATA: 'emotional_data',
    EMOTIONAL_PATTERNS: 'emotional_patterns',
    GROWTH_MOMENTS: 'growth_moments',
};
// ============================================================================
// INITIALIZATION
// ============================================================================
let db = null;
/**
 * Initialize Firestore connection (lazy initialization)
 */
function getDb() {
    if (db)
        return db;
    try {
        db = getFirestore();
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available - using in-memory storage');
        return null;
    }
}
// ============================================================================
// EMOTIONAL DATA PERSISTENCE
// ============================================================================
/**
 * Save an emotional data point to Firestore
 */
export async function saveEmotionalDataPoint(userId, dataPoint) {
    const firestore = getDb();
    if (!firestore) {
        log.debug('Firestore not available, skipping emotional data save');
        return false;
    }
    try {
        const docRef = firestore
            .collection(COLLECTIONS.EMOTIONAL_DATA)
            .doc(userId)
            .collection('points')
            .doc();
        await docRef.set(removeUndefined({
            ...dataPoint,
            timestamp: dataPoint.timestamp.toISOString(),
            createdAt: new Date().toISOString(),
        }));
        log.debug({ userId, emotion: dataPoint.emotion }, 'Emotional data point saved');
        return true;
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to save emotional data point');
        return false;
    }
}
/**
 * Get emotional data points for a user (for pattern analysis)
 */
export async function getEmotionalDataPoints(userId, options = {}) {
    const firestore = getDb();
    if (!firestore) {
        return [];
    }
    try {
        let query = firestore
            .collection(COLLECTIONS.EMOTIONAL_DATA)
            .doc(userId)
            .collection('points')
            .orderBy('timestamp', 'desc');
        if (options.since) {
            query = query.where('timestamp', '>=', options.since.toISOString());
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                timestamp: new Date(data.timestamp),
            };
        });
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to get emotional data points');
        return [];
    }
}
// ============================================================================
// PATTERN PERSISTENCE
// ============================================================================
/**
 * Save or update an emotional pattern
 */
export async function saveEmotionalPattern(userId, pattern) {
    const firestore = getDb();
    if (!firestore) {
        return false;
    }
    try {
        const docRef = firestore
            .collection(COLLECTIONS.EMOTIONAL_PATTERNS)
            .doc(userId)
            .collection('patterns')
            .doc(pattern.id);
        await docRef.set(removeUndefined({
            ...pattern,
            detectedAt: pattern.detectedAt.toISOString(),
            lastUpdated: new Date().toISOString(),
        }));
        log.info({ userId, patternId: pattern.id, pattern: pattern.pattern }, '🔮 Pattern saved');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, patternId: pattern.id }, 'Failed to save pattern');
        return false;
    }
}
/**
 * Get patterns for a user
 */
export async function getEmotionalPatterns(userId, options = {}) {
    const firestore = getDb();
    if (!firestore) {
        return [];
    }
    try {
        const query = firestore
            .collection(COLLECTIONS.EMOTIONAL_PATTERNS)
            .doc(userId)
            .collection('patterns')
            .orderBy('confidence', 'desc');
        const snapshot = await query.get();
        let patterns = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                detectedAt: new Date(data.detectedAt),
                lastUpdated: new Date(data.lastUpdated),
            };
        });
        if (options.onlyUnsurfaced) {
            patterns = patterns.filter((p) => !p.surfacedToUser);
        }
        if (options.minConfidence !== undefined) {
            const minConf = options.minConfidence;
            patterns = patterns.filter((p) => p.confidence >= minConf);
        }
        return patterns;
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to get patterns');
        return [];
    }
}
/**
 * Mark a pattern as surfaced to the user
 */
export async function markPatternSurfaced(userId, patternId) {
    const firestore = getDb();
    if (!firestore) {
        return false;
    }
    try {
        const docRef = firestore
            .collection(COLLECTIONS.EMOTIONAL_PATTERNS)
            .doc(userId)
            .collection('patterns')
            .doc(patternId);
        await docRef.update(cleanForFirestore({
            surfacedToUser: true,
            surfacedAt: new Date().toISOString(),
        }));
        log.info({ userId, patternId }, '✅ Pattern marked as surfaced');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, patternId }, 'Failed to mark pattern surfaced');
        return false;
    }
}
// ============================================================================
// GROWTH PERSISTENCE
// ============================================================================
/**
 * Save a growth moment
 */
export async function saveGrowthMoment(userId, growth) {
    const firestore = getDb();
    if (!firestore) {
        return false;
    }
    try {
        const docRef = firestore
            .collection(COLLECTIONS.GROWTH_MOMENTS)
            .doc(userId)
            .collection('moments')
            .doc(growth.id);
        await docRef.set(removeUndefined({
            ...growth,
            pastDate: growth.pastDate.toISOString(),
            currentDate: growth.currentDate.toISOString(),
            createdAt: new Date().toISOString(),
        }));
        log.info({ userId, growthId: growth.id, area: growth.area }, '🌱 Growth moment saved');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, growthId: growth.id }, 'Failed to save growth moment');
        return false;
    }
}
/**
 * Get growth moments for a user
 */
export async function getGrowthMoments(userId, options = {}) {
    const firestore = getDb();
    if (!firestore) {
        return [];
    }
    try {
        const snapshot = await firestore
            .collection(COLLECTIONS.GROWTH_MOMENTS)
            .doc(userId)
            .collection('moments')
            .get();
        let moments = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                pastDate: new Date(data.pastDate),
                currentDate: new Date(data.currentDate),
            };
        });
        if (options.onlyUnsurfaced) {
            moments = moments.filter((m) => !m.surfaced);
        }
        return moments;
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to get growth moments');
        return [];
    }
}
/**
 * Mark a growth moment as surfaced (celebrated)
 */
export async function markGrowthSurfaced(userId, growthId) {
    const firestore = getDb();
    if (!firestore) {
        return false;
    }
    try {
        const docRef = firestore
            .collection(COLLECTIONS.GROWTH_MOMENTS)
            .doc(userId)
            .collection('moments')
            .doc(growthId);
        await docRef.update(cleanForFirestore({
            surfaced: true,
            surfacedAt: new Date().toISOString(),
        }));
        log.info({ userId, growthId }, '✅ Growth moment marked as celebrated');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, growthId }, 'Failed to mark growth surfaced');
        return false;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    saveEmotionalDataPoint,
    getEmotionalDataPoints,
    saveEmotionalPattern,
    getEmotionalPatterns,
    markPatternSurfaced,
    saveGrowthMoment,
    getGrowthMoments,
    markGrowthSurfaced,
};
//# sourceMappingURL=pattern-persistence.js.map