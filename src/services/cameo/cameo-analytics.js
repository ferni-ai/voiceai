/**
 * Cameo Analytics Service
 *
 * Tracks cameo engagement and user preferences to enable:
 * 1. Analytics on which cameos resonate most
 * 2. Learning user preferences for cameo frequency
 * 3. Personalized cameo suggestions based on history
 *
 * Data is persisted to Firestore for cross-session learning.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'CameoAnalytics' });
// ============================================================================
// STATE
// ============================================================================
// In-memory session data
const sessionData = new Map();
// Cached user preferences
const preferencesCache = new Map();
// Firestore collection paths
const COLLECTIONS = {
    CAMEO_ENGAGEMENTS: 'cameo_engagements',
    CAMEO_PREFERENCES: 'cameo_preferences',
    CAMEO_STATS: 'cameo_stats',
};
// Lazy Firestore initialization
let firestoreInstance = null;
function getDb() {
    if (!firestoreInstance) {
        try {
            firestoreInstance = getFirestore();
        }
        catch (e) {
            log.warn({ error: String(e) }, 'Firestore not available for cameo analytics');
            return null;
        }
    }
    return firestoreInstance;
}
// ============================================================================
// SESSION DATA MANAGEMENT
// ============================================================================
function getSessionData(sessionId) {
    let data = sessionData.get(sessionId);
    if (!data) {
        data = {
            engagements: [],
            lastCameoEndTime: 0,
            cameoCount: 0,
        };
        sessionData.set(sessionId, data);
    }
    return data;
}
/**
 * Clear session data (call on session end)
 */
export function clearSessionData(sessionId) {
    sessionData.delete(sessionId);
}
// ============================================================================
// ENGAGEMENT TRACKING
// ============================================================================
/**
 * Record a cameo engagement event
 */
export async function recordCameoEngagement(userId, sessionId, engagement) {
    // Update session data
    const session = getSessionData(sessionId);
    session.engagements.push(engagement);
    session.lastCameoEndTime = Date.now();
    session.cameoCount++;
    log.debug({
        userId,
        sessionId,
        personaId: engagement.personaId,
        positive: engagement.userRespondedPositively,
    }, '📊 Recorded cameo engagement');
    // Persist to Firestore (fire-and-forget)
    persistEngagement(userId, engagement);
    // Update preferences based on this engagement
    updatePreferencesFromEngagement(userId, engagement);
}
/**
 * Analyze user's response to determine engagement signals
 */
export function analyzeUserResponse(userMessage, cameoPersonaId, timeSinceCameoMs) {
    const messageLower = userMessage.toLowerCase();
    // Positive response indicators
    const positivePatterns = [
        /thanks?|thank\s+you/i,
        /that('s| is)?\s+(helpful|great|good|interesting|cool|nice)/i,
        /i\s+(like|love|appreciate)\s+that/i,
        /makes?\s+sense/i,
        /good\s+(point|idea|thought)/i,
        /^(yes|yeah|yep|definitely|absolutely)/i,
        /tell\s+me\s+more/i,
        /i('ll| will)\s+(try|do|consider)\s+that/i,
    ];
    // Follow-up request indicators
    const followUpPatterns = [
        /tell\s+me\s+more/i,
        /what\s+(else|more)/i,
        /can\s+you\s+explain/i,
        /how\s+(do|would|should)\s+i/i,
        /what\s+about/i,
    ];
    // Handoff request indicators
    const handoffPatterns = [
        /talk\s+to\s+\w+\s+(more|directly)/i,
        /can\s+i\s+speak\s+(to|with)/i,
        /transfer|handoff|connect\s+me/i,
        new RegExp(`more\\s+from\\s+${cameoPersonaId.split('-')[0]}`, 'i'),
    ];
    // Negative/dismissive indicators
    const negativePatterns = [
        /^(no|nah|nope)/i,
        /not\s+(helpful|useful|what\s+i)/i,
        /i\s+don't\s+(think|care|need)/i,
        /anyway|moving\s+on/i,
        /back\s+to\s+(ferni|what)/i,
    ];
    const userRespondedPositively = positivePatterns.some((p) => p.test(messageLower)) &&
        !negativePatterns.some((p) => p.test(messageLower));
    const userAskedFollowUp = followUpPatterns.some((p) => p.test(messageLower));
    const userRequestedHandoff = handoffPatterns.some((p) => p.test(messageLower));
    // If response came quickly and continued conversation, that's positive
    const conversationContinued = timeSinceCameoMs < 30000 && userMessage.length > 20;
    return {
        userRespondedPositively,
        userAskedFollowUp,
        userRequestedHandoff,
        conversationContinued,
    };
}
// ============================================================================
// PREFERENCE LEARNING
// ============================================================================
/**
 * Get user's learned cameo preferences
 */
export async function getUserPreferences(userId) {
    // Check cache first
    const cached = preferencesCache.get(userId);
    if (cached && Date.now() - cached.updatedAt < 3600000) {
        // 1 hour cache
        return cached;
    }
    // Try to load from Firestore
    const db = getDb();
    if (db) {
        try {
            const doc = await db.collection(COLLECTIONS.CAMEO_PREFERENCES).doc(userId).get();
            if (doc.exists) {
                const data = doc.data();
                preferencesCache.set(userId, data);
                return data;
            }
        }
        catch (e) {
            log.warn({ error: String(e), userId }, 'Failed to load cameo preferences');
        }
    }
    // Return defaults
    return createDefaultPreferences(userId);
}
/**
 * Create default preferences for new user
 */
function createDefaultPreferences(userId) {
    return {
        userId,
        updatedAt: Date.now(),
        preferredFrequency: 'occasional',
        maxCameosPerSession: 4,
        minCooldownMs: 30000, // 30 seconds default
        favoritePersonas: [],
        avoidPersonas: [],
        respondWellTo: [],
        ignoredTriggers: [],
        totalCameosReceived: 0,
        totalPositiveResponses: 0,
        overallEngagementRate: 0.5, // Start neutral
    };
}
/**
 * Update preferences based on engagement
 */
async function updatePreferencesFromEngagement(userId, engagement) {
    const prefs = await getUserPreferences(userId);
    // Update totals
    prefs.totalCameosReceived++;
    if (engagement.userRespondedPositively) {
        prefs.totalPositiveResponses++;
    }
    // Calculate engagement rate (exponential moving average)
    const alpha = 0.2; // Weight for new data
    const newEngagement = engagement.userRespondedPositively ? 1 : 0;
    prefs.overallEngagementRate = alpha * newEngagement + (1 - alpha) * prefs.overallEngagementRate;
    // Update favorite personas
    if (engagement.userRespondedPositively || engagement.userAskedFollowUp) {
        if (!prefs.favoritePersonas.includes(engagement.personaId)) {
            // Count positive engagements for this persona
            const positiveCount = await countPositiveEngagements(userId, engagement.personaId);
            if (positiveCount >= 3) {
                prefs.favoritePersonas.push(engagement.personaId);
                // Remove from avoid list if present
                prefs.avoidPersonas = prefs.avoidPersonas.filter((p) => p !== engagement.personaId);
            }
        }
    }
    // Detect avoided personas (3+ negative responses)
    if (!engagement.userRespondedPositively && !engagement.conversationContinued) {
        const negativeCount = await countNegativeEngagements(userId, engagement.personaId);
        if (negativeCount >= 3 && !prefs.avoidPersonas.includes(engagement.personaId)) {
            prefs.avoidPersonas.push(engagement.personaId);
            prefs.favoritePersonas = prefs.favoritePersonas.filter((p) => p !== engagement.personaId);
        }
    }
    // Update trigger preferences
    if (engagement.userRespondedPositively && !prefs.respondWellTo.includes(engagement.triggerType)) {
        prefs.respondWellTo.push(engagement.triggerType);
    }
    // Adapt frequency preference
    prefs.preferredFrequency = calculatePreferredFrequency(prefs);
    prefs.maxCameosPerSession = calculateMaxCameos(prefs);
    prefs.minCooldownMs = calculateMinCooldown(prefs);
    prefs.updatedAt = Date.now();
    // Update cache
    preferencesCache.set(userId, prefs);
    // Persist (fire-and-forget)
    persistPreferences(prefs);
}
/**
 * Calculate preferred frequency from engagement data
 */
function calculatePreferredFrequency(prefs) {
    if (prefs.totalCameosReceived < 5) {
        return 'occasional'; // Not enough data
    }
    if (prefs.overallEngagementRate >= 0.7) {
        return 'frequent'; // User loves cameos
    }
    else if (prefs.overallEngagementRate >= 0.4) {
        return 'occasional'; // User is neutral
    }
    else {
        return 'rare'; // User doesn't engage with cameos
    }
}
/**
 * Calculate max cameos per session
 */
function calculateMaxCameos(prefs) {
    switch (prefs.preferredFrequency) {
        case 'frequent':
            return 6;
        case 'occasional':
            return 4;
        case 'rare':
            return 2;
        default:
            return 4;
    }
}
/**
 * Calculate minimum cooldown between cameos
 */
function calculateMinCooldown(prefs) {
    switch (prefs.preferredFrequency) {
        case 'frequent':
            return 20000; // 20 seconds
        case 'occasional':
            return 30000; // 30 seconds
        case 'rare':
            return 60000; // 1 minute
        default:
            return 30000;
    }
}
// ============================================================================
// ANALYTICS QUERIES
// ============================================================================
/**
 * Get engagement stats for a specific persona
 */
export async function getPersonaStats(userId, personaId) {
    const db = getDb();
    if (!db)
        return null;
    try {
        const snapshot = await db
            .collection(COLLECTIONS.CAMEO_ENGAGEMENTS)
            .doc(userId)
            .collection('history')
            .where('personaId', '==', personaId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        if (snapshot.empty)
            return null;
        const engagements = snapshot.docs.map((doc) => doc.data());
        // Calculate stats
        const totalCameos = engagements.length;
        const positiveResponses = engagements.filter((e) => e.userRespondedPositively).length;
        const followUpRequests = engagements.filter((e) => e.userAskedFollowUp).length;
        const handoffRequests = engagements.filter((e) => e.userRequestedHandoff).length;
        const totalDuration = engagements.reduce((sum, e) => sum + e.durationMs, 0);
        // Calculate per-trigger-type stats
        // FIX BUG: Build stats incrementally then cast to full Record for return
        const triggerTypeStatsBuilder = {};
        for (const engagement of engagements) {
            if (!triggerTypeStatsBuilder[engagement.triggerType]) {
                triggerTypeStatsBuilder[engagement.triggerType] = { count: 0, positiveRate: 0 };
            }
            triggerTypeStatsBuilder[engagement.triggerType].count++;
        }
        // Calculate positive rates per trigger type
        for (const triggerType of Object.keys(triggerTypeStatsBuilder)) {
            const typeEngagements = engagements.filter((e) => e.triggerType === triggerType);
            const positiveCount = typeEngagements.filter((e) => e.userRespondedPositively).length;
            triggerTypeStatsBuilder[triggerType].positiveRate = positiveCount / typeEngagements.length;
        }
        // Cast to full Record - only contains trigger types that were actually seen
        const triggerTypeStats = triggerTypeStatsBuilder;
        return {
            personaId,
            totalCameos,
            positiveResponses,
            followUpRequests,
            handoffRequests,
            averageDurationMs: totalDuration / totalCameos,
            engagementRate: positiveResponses / totalCameos,
            lastCameoAt: engagements[0]?.timestamp || 0,
            triggerTypeStats,
        };
    }
    catch (e) {
        log.warn({ error: String(e), userId, personaId }, 'Failed to get persona stats');
        return null;
    }
}
/**
 * Get global engagement stats for a persona (across all users)
 * Used for admin analytics dashboard
 */
export async function getGlobalPersonaStats(personaId) {
    const db = getDb();
    if (!db)
        return null;
    try {
        // Query all engagements for this persona using collection group
        const snapshot = await db
            .collectionGroup('history')
            .where('personaId', '==', personaId)
            .orderBy('timestamp', 'desc')
            .limit(500) // Get recent 500 engagements
            .get();
        if (snapshot.empty)
            return null;
        const engagements = snapshot.docs.map((doc) => doc.data());
        // Calculate stats
        const totalCameos = engagements.length;
        const positiveResponses = engagements.filter((e) => e.userRespondedPositively).length;
        const followUpRequests = engagements.filter((e) => e.userAskedFollowUp).length;
        const handoffRequests = engagements.filter((e) => e.userRequestedHandoff).length;
        const totalDuration = engagements.reduce((sum, e) => sum + (e.durationMs || 0), 0);
        // Calculate per-trigger-type stats
        const triggerTypeStats = {};
        for (const engagement of engagements) {
            if (!triggerTypeStats[engagement.triggerType]) {
                triggerTypeStats[engagement.triggerType] = { count: 0, positiveRate: 0 };
            }
            triggerTypeStats[engagement.triggerType].count++;
        }
        // Calculate positive rates per trigger type
        for (const triggerType of Object.keys(triggerTypeStats)) {
            const typeEngagements = engagements.filter((e) => e.triggerType === triggerType);
            const positiveCount = typeEngagements.filter((e) => e.userRespondedPositively).length;
            triggerTypeStats[triggerType].positiveRate = positiveCount / typeEngagements.length;
        }
        return {
            personaId,
            totalCameos,
            positiveResponses,
            followUpRequests,
            handoffRequests,
            averageDurationMs: totalCameos > 0 ? totalDuration / totalCameos : 0,
            engagementRate: totalCameos > 0 ? positiveResponses / totalCameos : 0,
            lastCameoAt: engagements[0]?.timestamp || 0,
            triggerTypeStats,
        };
    }
    catch (e) {
        log.warn({ error: String(e), personaId }, 'Failed to get global persona stats');
        return null;
    }
}
/**
 * Get best persona for a given trigger type (based on user history)
 */
export async function getBestPersonaForTrigger(userId, triggerType) {
    const prefs = await getUserPreferences(userId);
    // If user has favorites that match this trigger, prefer them
    if (prefs.favoritePersonas.length > 0) {
        // Check if any favorite handles this trigger type well
        const db = getDb();
        if (db) {
            for (const personaId of prefs.favoritePersonas) {
                const stats = await getPersonaStats(userId, personaId);
                const triggerStats = stats?.triggerTypeStats;
                const positiveRate = triggerStats?.[triggerType]?.positiveRate ?? 0;
                if (positiveRate >= 0.6) {
                    return personaId;
                }
            }
        }
    }
    // Default mapping
    const triggerToPersona = {
        data_insight: 'peter-john',
        scheduling: 'alex-chen',
        habit_check: 'maya-santos',
        planning: 'jordan-taylor',
        wisdom: 'nayan-patel',
        celebration: 'jordan-taylor',
        support: 'maya-santos',
        expertise: 'peter-john',
        manual: 'peter-john',
    };
    const defaultPersona = triggerToPersona[triggerType];
    // Make sure it's not in avoid list
    if (prefs.avoidPersonas.includes(defaultPersona)) {
        // Find alternative
        const alternatives = [
            'peter-john',
            'alex-chen',
            'maya-santos',
            'jordan-taylor',
            'nayan-patel',
        ];
        return alternatives.find((p) => !prefs.avoidPersonas.includes(p)) || null;
    }
    return defaultPersona;
}
// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================
async function persistEngagement(userId, engagement) {
    const db = getDb();
    if (!db)
        return;
    try {
        await db
            .collection(COLLECTIONS.CAMEO_ENGAGEMENTS)
            .doc(userId)
            .collection('history')
            .doc(engagement.cameoId)
            .set(cleanForFirestore(engagement));
    }
    catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to persist cameo engagement');
    }
}
async function persistPreferences(prefs) {
    const db = getDb();
    if (!db)
        return;
    try {
        await db
            .collection(COLLECTIONS.CAMEO_PREFERENCES)
            .doc(prefs.userId)
            .set(cleanForFirestore(prefs));
    }
    catch (e) {
        log.warn({ error: String(e), userId: prefs.userId }, 'Failed to persist cameo preferences');
    }
}
async function countPositiveEngagements(userId, personaId) {
    const db = getDb();
    if (!db)
        return 0;
    try {
        const snapshot = await db
            .collection(COLLECTIONS.CAMEO_ENGAGEMENTS)
            .doc(userId)
            .collection('history')
            .where('personaId', '==', personaId)
            .where('userRespondedPositively', '==', true)
            .count()
            .get();
        return snapshot.data().count;
    }
    catch (e) {
        return 0;
    }
}
async function countNegativeEngagements(userId, personaId) {
    const db = getDb();
    if (!db)
        return 0;
    try {
        const snapshot = await db
            .collection(COLLECTIONS.CAMEO_ENGAGEMENTS)
            .doc(userId)
            .collection('history')
            .where('personaId', '==', personaId)
            .where('userRespondedPositively', '==', false)
            .where('conversationContinued', '==', false)
            .count()
            .get();
        return snapshot.data().count;
    }
    catch (e) {
        return 0;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordCameoEngagement,
    analyzeUserResponse,
    getUserPreferences,
    getPersonaStats,
    getBestPersonaForTrigger,
    clearSessionData,
};
//# sourceMappingURL=cameo-analytics.js.map