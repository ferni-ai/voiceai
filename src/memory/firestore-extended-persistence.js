/**
 * Extended Firestore Persistence
 *
 * Persists additional data that was previously ephemeral:
 * - Session state (survives restarts)
 * - Tool execution logs (for pattern analysis)
 * - Persona bonds (relationship with each persona)
 * - Voice profiles (vocal characteristics)
 * - User intents (intent history for learning)
 * - Superhuman cache (cached insights)
 * - Quality metrics (per-session quality data)
 *
 * Schema:
 * - bogle_users/{userId}/sessions/{sessionId} → SessionState
 * - bogle_users/{userId}/tool_executions/{executionId} → ToolExecution
 * - bogle_users/{userId}/persona_bonds/{personaId} → PersonaBond
 * - bogle_users/{userId}/voice_profile → VoiceProfile
 * - bogle_users/{userId}/intents/{intentId} → UserIntent
 * - bogle_users/{userId}/superhuman_cache/{cacheKey} → CachedInsight
 * - bogle_users/{userId}/quality_metrics/{sessionId} → QualityMetrics
 *
 * @module memory/firestore-extended-persistence
 */
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
const log = createLogger({ module: 'FirestoreExtendedPersistence' });
// ============================================================================
// TYPE GUARDS
// ============================================================================
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value) {
    return typeof value === 'string';
}
function isNumber(value) {
    return typeof value === 'number';
}
function isBoolean(value) {
    return typeof value === 'boolean';
}
function isArray(value) {
    return Array.isArray(value);
}
function isSerializedSession(data) {
    if (!isObject(data))
        return false;
    return (isString(data.sessionId) &&
        isString(data.userId) &&
        isString(data.startedAt) &&
        isString(data.lastActiveAt) &&
        isString(data.personaId) &&
        isString(data.connectionType) &&
        isBoolean(data.isActive));
}
function isSerializedToolExecution(data) {
    if (!isObject(data))
        return false;
    return (isString(data.id) &&
        isString(data.sessionId) &&
        isString(data.toolId) &&
        isString(data.toolName) &&
        isObject(data.parameters) &&
        isBoolean(data.success) &&
        isNumber(data.durationMs) &&
        isString(data.executedAt) &&
        isString(data.personaId));
}
function isSerializedPersonaBond(data) {
    if (!isObject(data))
        return false;
    return (isString(data.personaId) &&
        isString(data.userId) &&
        isNumber(data.totalConversations) &&
        isNumber(data.totalDurationMinutes) &&
        isString(data.firstConversation) &&
        isString(data.lastConversation) &&
        isNumber(data.trustLevel) &&
        isArray(data.preferredTopics) &&
        isArray(data.memorableExchanges));
}
function isSerializedVoiceProfile(data) {
    if (!isObject(data))
        return false;
    return (isString(data.userId) &&
        isString(data.updatedAt) &&
        isObject(data.characteristics) &&
        isObject(data.preferences));
}
function isSerializedUserIntent(data) {
    if (!isObject(data))
        return false;
    return (isString(data.id) &&
        isString(data.userId) &&
        isString(data.sessionId) &&
        isString(data.utterance) &&
        isString(data.detectedIntent) &&
        isNumber(data.confidence) &&
        isBoolean(data.successful) &&
        isString(data.timestamp));
}
function isSerializedCachedInsight(data) {
    if (!isObject(data))
        return false;
    return (isString(data.cacheKey) &&
        isString(data.userId) &&
        isString(data.insightType) &&
        isObject(data.data) &&
        isString(data.computedAt) &&
        isString(data.expiresAt) &&
        isNumber(data.hitCount));
}
function isSerializedQualityMetrics(data) {
    if (!isObject(data))
        return false;
    return (isString(data.sessionId) &&
        isString(data.userId) &&
        isString(data.recordedAt) &&
        isObject(data.audioQuality) &&
        isObject(data.conversationQuality) &&
        isArray(data.toolsUsed) &&
        isArray(data.errorsEncountered));
}
// ============================================================================
// FIRESTORE INSTANCE
// ============================================================================
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
/**
 * Configure the Firestore instance (call once at startup)
 */
export function configureFirestoreExtended(firestore) {
    db = firestore;
    dbInitPromise = null; // Reset promise when configured
}
/**
 * Get the Firestore instance, with lazy loading fallback
 */
async function getDb() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeDb();
    return dbInitPromise;
}
async function initializeDb() {
    try {
        const { getFirestore } = await import('firebase-admin/firestore');
        db = getFirestore();
        return db;
    }
    catch {
        log.debug('Firestore not available');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// SESSION STATE OPERATIONS
// ============================================================================
export async function saveSessionState(session) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...session,
        startedAt: session.startedAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(session.userId)
            .collection('sessions')
            .doc(session.sessionId)
            .set(cleanForFirestore(serialized), { merge: true });
        log.debug({ sessionId: session.sessionId }, 'Session state saved');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to save session state');
    }
}
export async function getSessionState(userId, sessionId) {
    const firestore = await getDb();
    if (!firestore)
        return null;
    try {
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('sessions')
            .doc(sessionId)
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!isSerializedSession(data)) {
            log.warn({ userId, sessionId }, 'Invalid session data shape');
            return null;
        }
        return {
            ...data,
            startedAt: new Date(data.startedAt),
            lastActiveAt: new Date(data.lastActiveAt),
        };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get session state');
        return null;
    }
}
export async function getRecentSessions(userId, limit = 10) {
    const firestore = await getDb();
    if (!firestore)
        return [];
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('sessions')
            .orderBy('lastActiveAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs
            .map((doc) => {
            const data = doc.data();
            if (!isSerializedSession(data)) {
                log.warn({ userId, docId: doc.id }, 'Invalid session data shape, skipping');
                return null;
            }
            return {
                ...data,
                startedAt: new Date(data.startedAt),
                lastActiveAt: new Date(data.lastActiveAt),
            };
        })
            .filter((s) => s !== null);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get recent sessions');
        return [];
    }
}
// ============================================================================
// TOOL EXECUTION OPERATIONS
// ============================================================================
export async function logToolExecution(execution) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...execution,
        executedAt: execution.executedAt.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(execution.sessionId.split('_')[0]) // Extract userId from sessionId
            .collection('tool_executions')
            .doc(execution.id)
            .set(cleanForFirestore(serialized));
        log.debug({ toolId: execution.toolId }, 'Tool execution logged');
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to log tool execution');
    }
}
export async function getToolExecutions(userId, options) {
    const firestore = await getDb();
    if (!firestore)
        return [];
    try {
        let query = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('tool_executions')
            .orderBy('executedAt', 'desc');
        if (options?.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs
            .map((doc) => {
            const data = doc.data();
            if (!isSerializedToolExecution(data)) {
                log.warn({ userId, docId: doc.id }, 'Invalid tool execution data shape, skipping');
                return null;
            }
            return {
                ...data,
                executedAt: new Date(data.executedAt),
            };
        })
            .filter((t) => t !== null);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get tool executions');
        return [];
    }
}
// ============================================================================
// PERSONA BOND OPERATIONS
// ============================================================================
export async function savePersonaBond(bond) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...bond,
        firstConversation: bond.firstConversation.toISOString(),
        lastConversation: bond.lastConversation.toISOString(),
        memorableExchanges: bond.memorableExchanges.map((e) => ({
            ...e,
            date: e.date.toISOString(),
        })),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(bond.userId)
            .collection('persona_bonds')
            .doc(bond.personaId)
            .set(cleanForFirestore(serialized), { merge: true });
        log.debug({ personaId: bond.personaId }, 'Persona bond saved');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to save persona bond');
    }
}
export async function getPersonaBond(userId, personaId) {
    const firestore = await getDb();
    if (!firestore)
        return null;
    try {
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('persona_bonds')
            .doc(personaId)
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!isSerializedPersonaBond(data)) {
            log.warn({ userId, personaId }, 'Invalid persona bond data shape');
            return null;
        }
        return {
            ...data,
            firstConversation: new Date(data.firstConversation),
            lastConversation: new Date(data.lastConversation),
            memorableExchanges: data.memorableExchanges.map((e) => ({
                ...e,
                date: new Date(e.date),
            })),
        };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get persona bond');
        return null;
    }
}
export async function getAllPersonaBonds(userId) {
    const firestore = await getDb();
    if (!firestore)
        return [];
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('persona_bonds')
            .get();
        return snapshot.docs
            .map((doc) => {
            const data = doc.data();
            if (!isSerializedPersonaBond(data)) {
                log.warn({ userId, docId: doc.id }, 'Invalid persona bond data shape, skipping');
                return null;
            }
            return {
                ...data,
                firstConversation: new Date(data.firstConversation),
                lastConversation: new Date(data.lastConversation),
                memorableExchanges: data.memorableExchanges.map((e) => ({
                    ...e,
                    date: new Date(e.date),
                })),
            };
        })
            .filter((b) => b !== null);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get persona bonds');
        return [];
    }
}
// ============================================================================
// VOICE PROFILE OPERATIONS
// ============================================================================
export async function saveVoiceProfile(profile) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...profile,
        updatedAt: profile.updatedAt.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(profile.userId)
            .collection('voice_profile')
            .doc('current')
            .set(cleanForFirestore(serialized), { merge: true });
        log.debug({ userId: profile.userId }, 'Voice profile saved');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to save voice profile');
    }
}
export async function getVoiceProfile(userId) {
    const firestore = await getDb();
    if (!firestore)
        return null;
    try {
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('voice_profile')
            .doc('current')
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!isSerializedVoiceProfile(data)) {
            log.warn({ userId }, 'Invalid voice profile data shape');
            return null;
        }
        return {
            ...data,
            updatedAt: new Date(data.updatedAt),
        };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get voice profile');
        return null;
    }
}
// ============================================================================
// USER INTENT OPERATIONS
// ============================================================================
export async function logUserIntent(intent) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...intent,
        timestamp: intent.timestamp.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(intent.userId)
            .collection('intents')
            .doc(intent.id)
            .set(cleanForFirestore(serialized));
        log.debug({ intent: intent.detectedIntent }, 'User intent logged');
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to log user intent');
    }
}
export async function getRecentIntents(userId, limit = 50) {
    const firestore = await getDb();
    if (!firestore)
        return [];
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('intents')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs
            .map((doc) => {
            const data = doc.data();
            if (!isSerializedUserIntent(data)) {
                log.warn({ userId, docId: doc.id }, 'Invalid user intent data shape, skipping');
                return null;
            }
            return {
                ...data,
                timestamp: new Date(data.timestamp),
            };
        })
            .filter((i) => i !== null);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get recent intents');
        return [];
    }
}
// ============================================================================
// SUPERHUMAN CACHE OPERATIONS
// ============================================================================
export async function setCachedInsight(insight) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...insight,
        computedAt: insight.computedAt.toISOString(),
        expiresAt: insight.expiresAt.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(insight.userId)
            .collection('superhuman_cache')
            .doc(insight.cacheKey)
            .set(cleanForFirestore(serialized), { merge: true });
        log.debug({ cacheKey: insight.cacheKey }, 'Superhuman insight cached');
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to cache insight');
    }
}
export async function getCachedInsight(userId, cacheKey) {
    const firestore = await getDb();
    if (!firestore)
        return null;
    try {
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('superhuman_cache')
            .doc(cacheKey)
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!isSerializedCachedInsight(data)) {
            log.warn({ userId, cacheKey }, 'Invalid cached insight data shape');
            return null;
        }
        const insight = {
            ...data,
            computedAt: new Date(data.computedAt),
            expiresAt: new Date(data.expiresAt),
        };
        // Check if expired
        if (insight.expiresAt < new Date()) {
            // Delete expired cache entry
            await doc.ref.delete();
            return null;
        }
        // Increment hit count
        await doc.ref.update(cleanForFirestore({ hitCount: insight.hitCount + 1 }));
        return insight;
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get cached insight');
        return null;
    }
}
// ============================================================================
// QUALITY METRICS OPERATIONS
// ============================================================================
export async function saveQualityMetrics(metrics) {
    const firestore = await getDb();
    if (!firestore)
        return;
    const serialized = {
        ...metrics,
        recordedAt: metrics.recordedAt.toISOString(),
    };
    try {
        await firestore
            .collection('bogle_users')
            .doc(metrics.userId)
            .collection('quality_metrics')
            .doc(metrics.sessionId)
            .set(cleanForFirestore(serialized));
        log.debug({ sessionId: metrics.sessionId }, 'Quality metrics saved');
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to save quality metrics');
    }
}
export async function getQualityMetrics(userId, options) {
    const firestore = await getDb();
    if (!firestore)
        return [];
    try {
        let query = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('quality_metrics')
            .orderBy('recordedAt', 'desc');
        if (options?.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        return snapshot.docs
            .map((doc) => {
            const data = doc.data();
            if (!isSerializedQualityMetrics(data)) {
                log.warn({ userId, docId: doc.id }, 'Invalid quality metrics data shape, skipping');
                return null;
            }
            return {
                ...data,
                recordedAt: new Date(data.recordedAt),
            };
        })
            .filter((q) => q !== null);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get quality metrics');
        return [];
    }
}
// ============================================================================
// GDPR DELETION
// ============================================================================
/**
 * Delete all extended data for a user (GDPR compliance)
 */
export async function deleteAllExtendedUserData(userId) {
    const firestore = await getDb();
    if (!firestore)
        return { deleted: [], errors: ['Firestore not available'] };
    const collections = [
        'sessions',
        'tool_executions',
        'persona_bonds',
        'voice_profile',
        'intents',
        'superhuman_cache',
        'quality_metrics',
    ];
    const deleted = [];
    const errors = [];
    for (const collectionName of collections) {
        try {
            const collectionRef = firestore
                .collection('bogle_users')
                .doc(userId)
                .collection(collectionName);
            const snapshot = await collectionRef.get();
            // Delete each document
            for (const doc of snapshot.docs) {
                await doc.ref.delete();
            }
            deleted.push(collectionName);
            log.info({ userId, collection: collectionName }, 'Collection deleted for GDPR');
        }
        catch (error) {
            errors.push(`${collectionName}: ${String(error)}`);
            log.error({ error: String(error), collection: collectionName }, 'GDPR deletion failed');
        }
    }
    return { deleted, errors };
}
//# sourceMappingURL=firestore-extended-persistence.js.map