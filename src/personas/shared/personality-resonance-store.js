/**
 * Shared Personality Resonance Store
 *
 * Cross-session learning: What personality expressions resonate with THIS user?
 *
 * This is what makes ALL personas "better than human" - a real friend learns
 * what makes you laugh, what references land, what topics feel safe.
 * Most AI forgets every session. We remember and adapt.
 *
 * Storage: Firestore under bogle_users/{userId}/personality_resonance
 *
 * Generalized from: personas/bundles/ferni/personality-resonance-store.ts
 *
 * @module personas/shared/personality-resonance-store
 */
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'shared-personality-resonance' });
// Firestore instance (lazy loaded)
let firestoreDb = null;
let firestoreInitPromise = null;
// Debounced save tracking
const pendingSaves = new Map();
const SAVE_DEBOUNCE_MS = 5000;
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
const resonanceCache = new Map();
// ============================================================================
// FIRESTORE HELPERS
// ============================================================================
function schedulePersist(userId, profile) {
    const existing = pendingSaves.get(userId);
    if (existing) {
        clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
        pendingSaves.delete(userId);
        void persistToFirestore(userId, profile);
    }, SAVE_DEBOUNCE_MS);
    pendingSaves.set(userId, timeout);
}
async function persistToFirestore(userId, profile) {
    const db = await initFirestore();
    if (!db)
        return;
    try {
        const docRef = db.collection('bogle_users').doc(userId);
        const profileDoc = docRef.collection('personality_resonance').doc('profile');
        const serialized = {
            ...profile,
            lastUpdated: profile.lastUpdated.toISOString(),
            mentionedTopics: profile.mentionedTopics.map((t) => ({
                ...t,
                firstMentioned: t.firstMentioned.toISOString(),
                lastMentioned: t.lastMentioned.toISOString(),
            })),
            expressionEngagement: Object.fromEntries(Object.entries(profile.expressionEngagement).map(([k, v]) => [
                k,
                { ...v, lastUsed: v.lastUsed.toISOString() },
            ])),
            vulnerabilityComfort: {
                ...profile.vulnerabilityComfort,
                lastVulnerableShare: profile.vulnerabilityComfort.lastVulnerableShare?.toISOString(),
            },
        };
        await profileDoc.set(cleanForFirestore(serialized), { merge: true });
        log.debug({ userId, totalExpressions: profile.totalExpressions }, 'Persisted resonance profile');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to persist resonance profile');
    }
}
async function initFirestore() {
    if (firestoreDb)
        return firestoreDb;
    if (!firestoreInitPromise) {
        firestoreInitPromise = (async () => {
            try {
                const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
                firestoreDb = new FirestoreClass({
                    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
                });
                log.info('Firestore initialized for shared personality resonance');
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Firestore not available, using in-memory only');
                firestoreDb = null;
            }
        })();
    }
    await firestoreInitPromise;
    return firestoreDb;
}
// ============================================================================
// PROFILE OPERATIONS
// ============================================================================
/**
 * Load user's resonance profile from cache or Firestore
 */
export async function loadResonanceProfile(userId) {
    try {
        const cached = resonanceCache.get(userId);
        if (cached) {
            return transformToResonanceProfile(cached);
        }
        const db = await initFirestore();
        if (db) {
            try {
                const docRef = db.collection('bogle_users').doc(userId);
                const profileDoc = await docRef.collection('personality_resonance').doc('profile').get();
                if (profileDoc.exists) {
                    const data = profileDoc.data();
                    if (data) {
                        const profile = {
                            ...data,
                            lastUpdated: new Date(data.lastUpdated),
                            mentionedTopics: (data.mentionedTopics || []).map((t) => ({
                                ...t,
                                firstMentioned: new Date(t.firstMentioned),
                                lastMentioned: new Date(t.lastMentioned),
                            })),
                            vulnerabilityComfort: {
                                ...data.vulnerabilityComfort,
                                lastVulnerableShare: data.vulnerabilityComfort.lastVulnerableShare
                                    ? new Date(data.vulnerabilityComfort.lastVulnerableShare)
                                    : undefined,
                            },
                        };
                        resonanceCache.set(userId, profile);
                        log.debug({ userId }, 'Loaded resonance profile from Firestore');
                        return transformToResonanceProfile(profile);
                    }
                }
            }
            catch (firestoreError) {
                log.warn({ error: String(firestoreError), userId }, 'Firestore load failed (non-critical)');
            }
        }
        log.debug({ userId }, 'No resonance profile found, will use defaults');
        return null;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load resonance profile');
        return null;
    }
}
/**
 * Record a resonance event (called when we detect user reaction)
 */
export async function recordResonanceEvent(userId, event) {
    try {
        const profile = resonanceCache.get(userId) || createDefaultProfile(userId);
        // Update theme score
        const currentScore = profile.themeScores[event.theme] ?? 0.5;
        const adjustment = getEngagementAdjustment(event.engagement);
        profile.themeScores[event.theme] = clamp(currentScore + adjustment, 0, 1);
        // Update expression engagement if specific
        if (event.expressionId) {
            const expr = profile.expressionEngagement[event.expressionId] || {
                positive: 0,
                negative: 0,
                lastUsed: new Date(),
            };
            if (event.engagement === 'positive')
                expr.positive++;
            else if (event.engagement === 'negative')
                expr.negative++;
            expr.lastUsed = new Date();
            profile.expressionEngagement[event.expressionId] = expr;
        }
        // Update per-persona resonance
        if (!profile.perPersonaResonance) {
            profile.perPersonaResonance = {};
        }
        if (!profile.perPersonaResonance[event.personaId]) {
            profile.perPersonaResonance[event.personaId] = {
                resonantThemes: [],
                avoidThemes: [],
                lastInteraction: new Date(),
            };
        }
        const personaRes = profile.perPersonaResonance[event.personaId];
        personaRes.lastInteraction = new Date();
        if (event.engagement === 'positive' && !personaRes.resonantThemes.includes(event.theme)) {
            personaRes.resonantThemes.push(event.theme);
        }
        else if (event.engagement === 'negative' && !personaRes.avoidThemes.includes(event.theme)) {
            personaRes.avoidThemes.push(event.theme);
        }
        // Update metadata
        profile.totalExpressions++;
        profile.lastUpdated = new Date();
        resonanceCache.set(userId, profile);
        schedulePersist(userId, profile);
        log.debug({
            userId,
            personaId: event.personaId,
            theme: event.theme,
            engagement: event.engagement,
            newScore: profile.themeScores[event.theme],
        }, 'Recorded resonance event');
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to record resonance event');
    }
}
/**
 * Record a user topic mention (for future callbacks)
 */
export async function recordUserTopicMention(userId, topic) {
    try {
        const profile = resonanceCache.get(userId) || createDefaultProfile(userId);
        const existing = profile.mentionedTopics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (existing) {
            existing.lastMentioned = new Date();
            existing.timesReferenced++;
        }
        else {
            profile.mentionedTopics.push({
                topic,
                firstMentioned: new Date(),
                lastMentioned: new Date(),
                timesReferenced: 1,
            });
        }
        profile.mentionedTopics = profile.mentionedTopics
            .sort((a, b) => b.timesReferenced - a.timesReferenced)
            .slice(0, 50);
        profile.lastUpdated = new Date();
        resonanceCache.set(userId, profile);
        schedulePersist(userId, profile);
        log.debug({ userId, topic }, 'Recorded topic mention');
    }
    catch (error) {
        log.error({ error, userId, topic }, 'Failed to record topic mention');
    }
}
/**
 * Record vulnerability response
 */
export async function recordVulnerabilityResponse(userId, responseType) {
    try {
        const profile = resonanceCache.get(userId) || createDefaultProfile(userId);
        profile.vulnerabilityComfort.lastVulnerableShare = new Date();
        profile.vulnerabilityComfort.responseType = responseType;
        if (responseType === 'reciprocated') {
            if (profile.vulnerabilityComfort.level === 'low') {
                profile.vulnerabilityComfort.level = 'medium';
            }
            else if (profile.vulnerabilityComfort.level === 'medium') {
                profile.vulnerabilityComfort.level = 'high';
            }
        }
        else if (responseType === 'deflected' || responseType === 'ignored') {
            if (profile.vulnerabilityComfort.level === 'high') {
                profile.vulnerabilityComfort.level = 'medium';
            }
            else if (profile.vulnerabilityComfort.level === 'medium') {
                profile.vulnerabilityComfort.level = 'low';
            }
        }
        profile.lastUpdated = new Date();
        resonanceCache.set(userId, profile);
        schedulePersist(userId, profile);
        log.debug({
            userId,
            responseType,
            newLevel: profile.vulnerabilityComfort.level,
        }, 'Recorded vulnerability response');
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to record vulnerability response');
    }
}
/**
 * Force immediate persist (call on session end)
 */
export async function flushResonanceProfile(userId) {
    const existing = pendingSaves.get(userId);
    if (existing) {
        clearTimeout(existing);
        pendingSaves.delete(userId);
    }
    const profile = resonanceCache.get(userId);
    if (profile) {
        await persistToFirestore(userId, profile);
    }
}
// ============================================================================
// SYNC CACHE ACCESS
// ============================================================================
/**
 * Get resonance profile from cache ONLY (synchronous, for hot path).
 */
export function getCachedResonance(userId) {
    const cached = resonanceCache.get(userId);
    if (!cached)
        return null;
    return transformToResonanceProfile(cached);
}
/**
 * Pre-load resonance profile into cache (async, call at session start).
 */
export async function prewarmResonanceCache(userId) {
    await loadResonanceProfile(userId);
}
// ============================================================================
// ENGAGEMENT DETECTION
// ============================================================================
/**
 * Analyze user's response to detect engagement
 */
export function detectEngagement(userResponse, previousExpression) {
    const response = userResponse.toLowerCase();
    const positivePatterns = [
        /that('s| is) (so |really |exactly )?true/i,
        /i (love|like) that/i,
        /yes!? (exactly|definitely|totally)/i,
        /me too/i,
        /same/i,
        /that makes sense/i,
        /i (feel|felt) that/i,
        /wow/i,
        /thank you for sharing/i,
        /i appreciate/i,
        /haha|hah|lol|😂|🤣/i,
        /that('s| is) (beautiful|wonderful|amazing)/i,
        /i relate/i,
        /you get it/i,
    ];
    const negativePatterns = [
        /anyway/i,
        /so,? (what|how)/i,
        /let('s| us) (move on|talk about|get back)/i,
        /i don('t| do not) (really )?(want|need) to/i,
        /that('s| is) (weird|strange|odd)/i,
        /ok(ay)?\.\.\./i,
        /sure/i,
    ];
    for (const pattern of positivePatterns) {
        if (pattern.test(response))
            return 'positive';
    }
    for (const pattern of negativePatterns) {
        if (pattern.test(response))
            return 'negative';
    }
    if (userResponse.split(' ').length < 5 && previousExpression.theme === 'vulnerability') {
        return 'negative';
    }
    return 'neutral';
}
// ============================================================================
// HELPERS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        themeScores: {},
        expressionEngagement: {},
        mentionedTopics: [],
        vulnerabilityComfort: {
            level: 'medium',
        },
        stylePreferences: {
            preferredLength: 'medium',
            likesHumor: true,
            likesStories: true,
            likesDirect: false,
        },
        perPersonaResonance: {},
        totalExpressions: 0,
        lastUpdated: new Date(),
        version: 1,
    };
}
function transformToResonanceProfile(stored) {
    const resonantThemes = [];
    const avoidThemes = [];
    for (const [theme, score] of Object.entries(stored.themeScores)) {
        if (score > 0.6) {
            resonantThemes.push(theme);
        }
        else if (score < 0.4) {
            avoidThemes.push(theme);
        }
    }
    const connectionPoints = [];
    for (const [exprId, engagement] of Object.entries(stored.expressionEngagement)) {
        if (engagement.positive > engagement.negative * 2) {
            const theme = exprId.split('-')[0];
            if (theme && !connectionPoints.includes(`${theme} references`)) {
                connectionPoints.push(`${theme} references`);
            }
        }
    }
    return {
        resonantThemes,
        avoidThemes,
        connectionPoints: connectionPoints.slice(0, 5),
        comfortWithVulnerability: stored.vulnerabilityComfort.level,
        preferredExpressionLength: stored.stylePreferences.preferredLength,
        userMentionedTopics: stored.mentionedTopics
            .sort((a, b) => b.timesReferenced - a.timesReferenced)
            .slice(0, 10)
            .map((t) => t.topic),
    };
}
function getEngagementAdjustment(engagement) {
    switch (engagement) {
        case 'positive':
            return 0.05;
        case 'negative':
            return -0.08;
        case 'neutral':
        default:
            return 0;
    }
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
// ============================================================================
// EXPORTS
// ============================================================================
export const sharedPersonalityResonanceStore = {
    load: loadResonanceProfile,
    getCached: getCachedResonance,
    prewarm: prewarmResonanceCache,
    recordEvent: recordResonanceEvent,
    recordTopicMention: recordUserTopicMention,
    recordVulnerabilityResponse,
    detectEngagement,
    flush: flushResonanceProfile,
};
export default sharedPersonalityResonanceStore;
//# sourceMappingURL=personality-resonance-store.js.map