/**
 * Unified Trust Profile Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module ensures all trust profile data has a SINGLE source of truth
 * in Firestore. It prevents data drift between in-memory and persisted state.
 *
 * The Problem:
 * - Multiple systems maintain their own in-memory Maps
 * - Periodic sync can lead to stale/inconsistent data
 * - Server restarts lose recent changes
 *
 * The Solution:
 * - Real-time write-through for critical changes
 * - Periodic batch sync for efficiency
 * - Single document structure per user
 * - Conflict resolution with timestamps
 *
 * @module UnifiedTrustPersistence
 */
import { getFirestoreDatabase, getGCPProjectId } from '../../config/environment.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
const log = createLogger({ module: 'UnifiedTrustPersistence' });
// Module-level Firestore instance (lazy initialized)
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
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
        log.info('Unified trust persistence Firestore initialized');
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available for unified persistence');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    batchSyncIntervalMs: 30000, // 30 seconds
    maxPendingChanges: 50,
    realtimeWriteThrough: true,
    criticalSystems: ['boundaries', 'relationshipHealth', 'unsaid'],
};
// ============================================================================
// STATE
// ============================================================================
let config = { ...DEFAULT_CONFIG };
const pendingChanges = new Map(); // userId -> set of system names
const profileCache = new Map();
let isInitialized = false;
// ============================================================================
// INITIALIZATION
// ============================================================================
/**
 * Initialize the unified persistence system
 */
export function initializeUnifiedPersistence(customConfig) {
    if (isInitialized) {
        log.warn('Unified persistence already initialized');
        return;
    }
    config = { ...DEFAULT_CONFIG, ...customConfig };
    // Start batch sync interval using managed interval
    registerInterval('unified-trust-persistence-sync', () => {
        void flushPendingChanges();
    }, config.batchSyncIntervalMs);
    isInitialized = true;
    log.info({ config }, '✅ Unified trust persistence initialized');
}
/**
 * Shutdown the persistence system
 */
export async function shutdownUnifiedPersistence() {
    clearNamedInterval('unified-trust-persistence-sync');
    // Flush any remaining changes
    await flushPendingChanges();
    profileCache.clear();
    pendingChanges.clear();
    isInitialized = false;
    log.info('🛑 Unified trust persistence shut down');
}
// ============================================================================
// CORE API
// ============================================================================
/**
 * Load a user's unified trust profile
 */
export async function loadUnifiedProfile(userId) {
    // Check cache first
    const cached = profileCache.get(userId);
    if (cached) {
        return cached;
    }
    try {
        const firestore = await getFirestore();
        if (!firestore) {
            log.warn({ userId }, 'Firestore not available for loading profile');
            return null;
        }
        const doc = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('trust')
            .doc('unified_profile')
            .get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        const profile = {
            userId,
            version: data.version || 1,
            systemVersions: data.systemVersions || {},
            systems: data.systems || {},
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
            lastSessionId: data.lastSessionId,
        };
        profileCache.set(userId, profile);
        log.debug({ userId, version: profile.version }, 'Loaded unified trust profile');
        return profile;
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to load unified profile');
        return null;
    }
}
/**
 * Save a specific system's data
 */
export async function saveSystemData(userId, systemName, data, options = {}) {
    const shouldWriteThrough = options.immediate ||
        (config.realtimeWriteThrough && config.criticalSystems.includes(systemName));
    // Get or create profile
    let profile = profileCache.get(userId);
    if (!profile) {
        profile = (await loadUnifiedProfile(userId)) || createEmptyProfile(userId);
    }
    // Update the system data
    profile.systems[systemName] = data;
    profile.systemVersions[systemName] = Date.now();
    profile.version++;
    profile.updatedAt = new Date();
    profileCache.set(userId, profile);
    if (shouldWriteThrough) {
        // Write immediately
        await persistProfile(userId, profile);
        log.debug({ userId, systemName }, 'Real-time write-through completed');
    }
    else {
        // Queue for batch sync
        if (!pendingChanges.has(userId)) {
            pendingChanges.set(userId, new Set());
        }
        pendingChanges.get(userId).add(cleanForFirestore(systemName));
        // Check if we should force sync
        const userPending = pendingChanges.get(userId);
        if (userPending.size >= config.maxPendingChanges) {
            await flushUserChanges(userId);
        }
    }
}
/**
 * Get a specific system's data
 */
export async function getSystemData(userId, systemName) {
    const profile = await loadUnifiedProfile(userId);
    if (!profile)
        return null;
    return profile.systems[systemName] || null;
}
/**
 * Get the entire unified profile
 */
export async function getUnifiedProfile(userId) {
    return loadUnifiedProfile(userId);
}
/**
 * Check if a system has been modified since a given timestamp
 */
export function hasSystemChanged(userId, systemName, since) {
    const profile = profileCache.get(userId);
    if (!profile)
        return false;
    const systemVersion = profile.systemVersions[systemName];
    return systemVersion !== undefined && systemVersion > since;
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
/**
 * Flush all pending changes for all users
 */
export async function flushPendingChanges() {
    let flushedCount = 0;
    for (const userId of pendingChanges.keys()) {
        try {
            await flushUserChanges(userId);
            flushedCount++;
        }
        catch (error) {
            log.error({ error, userId }, 'Failed to flush changes for user');
        }
    }
    if (flushedCount > 0) {
        log.debug({ flushedCount }, 'Batch sync completed');
    }
    return flushedCount;
}
/**
 * Flush pending changes for a specific user
 */
async function flushUserChanges(userId) {
    const userPending = pendingChanges.get(userId);
    if (!userPending || userPending.size === 0)
        return;
    const profile = profileCache.get(userId);
    if (!profile)
        return;
    await persistProfile(userId, profile);
    pendingChanges.delete(userId);
    log.debug({ userId, systemCount: userPending.size }, 'Flushed user changes');
}
/**
 * Persist a profile to Firestore
 */
async function persistProfile(userId, profile) {
    try {
        const firestore = await getFirestore();
        if (!firestore)
            return;
        await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('trust')
            .doc('unified_profile')
            .set(cleanForFirestore({
            ...profile,
            createdAt: profile.createdAt.toISOString(),
            updatedAt: new Date().toISOString(),
        }), { merge: true });
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to persist profile');
        throw error;
    }
}
// ============================================================================
// MIGRATION HELPERS
// ============================================================================
/**
 * Migrate from old per-system collections to unified profile
 */
export async function migrateToUnifiedProfile(userId) {
    try {
        const firestore = await getFirestore();
        if (!firestore)
            return false;
        // Check if already migrated
        const existingProfile = await loadUnifiedProfile(userId);
        if (existingProfile && Object.keys(existingProfile.systems).length > 0) {
            log.debug({ userId }, 'User already has unified profile');
            return true;
        }
        // Load from old collections
        const oldCollections = [
            'trust_profiles/boundaries',
            'trust_profiles/growth',
            'trust_profiles/inside_jokes',
            'trust_profiles/small_wins',
            'trust_profiles/thinking_of_you',
        ];
        const systems = {};
        const systemVersions = {};
        for (const path of oldCollections) {
            const doc = await firestore
                .collection('bogle_users')
                .doc(userId)
                .collection(path.split('/')[0])
                .doc(path.split('/')[1])
                .get();
            if (doc.exists) {
                const systemName = path.split('/')[1];
                systems[systemName] = doc.data();
                systemVersions[systemName] = Date.now();
            }
        }
        if (Object.keys(systems).length === 0) {
            log.debug({ userId }, 'No old trust data to migrate');
            return true;
        }
        // Create unified profile
        const profile = createEmptyProfile(userId);
        profile.systems = systems;
        profile.systemVersions = systemVersions;
        await persistProfile(userId, profile);
        profileCache.set(userId, profile);
        log.info({ userId, migratedSystems: Object.keys(systems) }, '✅ Migrated to unified trust profile');
        return true;
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to migrate to unified profile');
        return false;
    }
}
// ============================================================================
// HELPERS
// ============================================================================
function createEmptyProfile(userId) {
    return {
        userId,
        version: 1,
        systemVersions: {},
        systems: {},
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}
// ============================================================================
// SESSION HOOKS
// ============================================================================
/**
 * Call at session start to load and cache trust data
 */
export async function onSessionStartUnified(userId, sessionId) {
    const profile = await loadUnifiedProfile(userId);
    if (profile) {
        profile.lastSessionId = sessionId;
        profileCache.set(userId, profile);
    }
    log.debug({ userId, sessionId }, 'Session started with unified trust profile');
}
/**
 * Call at session end to flush all changes
 */
export async function onSessionEndUnified(userId) {
    await flushUserChanges(userId);
    log.debug({ userId }, 'Session ended, trust data persisted');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    initializeUnifiedPersistence,
    shutdownUnifiedPersistence,
    loadUnifiedProfile,
    saveSystemData,
    getSystemData,
    getUnifiedProfile,
    hasSystemChanged,
    flushPendingChanges,
    migrateToUnifiedProfile,
    onSessionStartUnified,
    onSessionEndUnified,
};
//# sourceMappingURL=unified-persistence.js.map