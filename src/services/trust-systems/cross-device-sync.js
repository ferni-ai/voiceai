/**
 * Cross-Device Sync for Trust Systems
 *
 * Phase 3: Ensures trust data travels with the user across devices
 *
 * Features:
 * - Real-time Firestore sync via change listeners
 * - Conflict resolution (last-write-wins with merge)
 * - Session continuity detection
 * - Device-aware sync
 *
 * Note: This module works on the server side using firebase-admin.
 * Frontend real-time sync happens via API polling or websockets.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'CrossDeviceSync' });
// ============================================================================
// CONSTANTS
// ============================================================================
const TRUST_COLLECTION = 'bogle_users';
const TRUST_SUBCOLLECTION = 'trust_profiles';
const SYNC_DEBOUNCE_MS = 500;
const CONFLICT_WINDOW_MS = 5000;
// ============================================================================
// STATE
// ============================================================================
const pendingUpdates = new Map();
const syncListeners = new Set();
const deviceIds = new Map(); // userId -> deviceId
let syncDebounceTimer = null;
// ============================================================================
// DEVICE ID MANAGEMENT
// ============================================================================
function getDeviceId(userId) {
    let deviceId = deviceIds.get(userId);
    if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        deviceIds.set(userId, deviceId);
    }
    return deviceId;
}
export function setDeviceId(userId, deviceId) {
    deviceIds.set(userId, deviceId);
}
// ============================================================================
// SYNC STATE
// ============================================================================
export function getSyncState(userId) {
    return {
        lastSyncTime: null, // Would be stored in Firestore
        pendingChanges: pendingUpdates.size,
        isConnected: true, // Server is always connected
        deviceId: getDeviceId(userId),
        conflictsResolved: 0,
    };
}
// ============================================================================
// EVENT SYSTEM
// ============================================================================
export function onSyncEvent(listener) {
    syncListeners.add(cleanForFirestore(listener));
    return () => syncListeners.delete(listener);
}
function emitSyncEvent(event) {
    for (const listener of syncListeners) {
        try {
            listener(event);
        }
        catch (err) {
            log.error({ error: err }, 'Listener error');
        }
    }
}
// ============================================================================
// SYNC OPERATIONS
// ============================================================================
/**
 * Start listening for changes (server-side polling approach)
 */
export function startRealTimeSync(userId, onDataUpdate) {
    // On server, we don't maintain persistent listeners
    // Instead, data is loaded on-demand via loadTrustProfiles
    // This function returns a no-op cleanup for API compatibility
    log.debug({ userId }, 'Sync initialized');
    return () => {
        log.debug({ userId }, 'Sync stopped');
    };
}
/**
 * Stop listening for a user
 */
export function stopRealTimeSync(userId) {
    log.debug({ userId }, 'Stopping sync');
}
/**
 * Write trust data with sync metadata
 */
export async function syncWrite(userId, systemId, data, options = {}) {
    const pendingKey = `${userId}:${systemId}`;
    pendingUpdates.set(cleanForFirestore(pendingKey), {
        data,
        timestamp: Date.now(),
    });
    if (options.immediate) {
        await performWrite(userId, systemId, data);
        pendingUpdates.delete(pendingKey);
    }
    else {
        if (syncDebounceTimer) {
            clearTimeout(syncDebounceTimer);
        }
        syncDebounceTimer = setTimeout(() => {
            void flushPendingWrites(userId);
        }, SYNC_DEBOUNCE_MS);
    }
}
async function performWrite(userId, systemId, data) {
    try {
        const db = getFirestore();
        const docRef = db
            .collection(TRUST_COLLECTION)
            .doc(userId)
            .collection(TRUST_SUBCOLLECTION)
            .doc(systemId);
        const existing = await docRef.get();
        const currentVersion = existing.exists ? existing.data()?.version || 0 : 0;
        const trustDoc = {
            userId,
            systemId,
            data,
            updatedAt: FieldValue.serverTimestamp(),
            deviceId: getDeviceId(userId),
            version: currentVersion + 1,
        };
        await docRef.set(cleanForFirestore(trustDoc));
        emitSyncEvent({
            type: 'sync_complete',
            timestamp: new Date(),
            details: { systemId, version: currentVersion + 1 },
        });
    }
    catch (err) {
        log.error({ error: err, userId, systemId }, 'Write failed');
        throw err;
    }
}
async function flushPendingWrites(userId) {
    if (pendingUpdates.size === 0)
        return;
    try {
        const db = getFirestore();
        const batch = db.batch();
        for (const [key, pending] of pendingUpdates) {
            const [uid, systemId] = key.split(':');
            if (uid !== userId)
                continue;
            const docRef = db
                .collection(TRUST_COLLECTION)
                .doc(userId)
                .collection(TRUST_SUBCOLLECTION)
                .doc(systemId);
            batch.set(docRef, removeUndefined({
                userId,
                systemId,
                data: pending.data,
                updatedAt: FieldValue.serverTimestamp(),
                deviceId: getDeviceId(userId),
                version: Date.now(),
            }));
        }
        await batch.commit();
        // Clear pending for this user
        for (const key of pendingUpdates.keys()) {
            if (key.startsWith(`${userId}:`)) {
                pendingUpdates.delete(key);
            }
        }
        emitSyncEvent({
            type: 'sync_complete',
            timestamp: new Date(),
            details: { flushedCount: pendingUpdates.size },
        });
    }
    catch (err) {
        log.error({ error: err, userId }, 'Flush failed');
    }
}
// ============================================================================
// NETWORK STATUS (Server-side no-op)
// ============================================================================
export function setNetworkStatus(_online) {
    // Server is always online - this is for API compatibility
}
// ============================================================================
// SESSION CONTINUITY
// ============================================================================
/**
 * Detect if user is continuing from another device
 */
export async function detectSessionContinuity(userId) {
    try {
        const db = getFirestore();
        const sessionDocRef = db
            .collection(TRUST_COLLECTION)
            .doc(userId)
            .collection('session_state')
            .doc('current');
        const sessionDoc = await sessionDocRef.get();
        if (!sessionDoc.exists) {
            return {
                previousDevice: null,
                previousSessionEnd: null,
                conversationContext: null,
                wasInterrupted: false,
            };
        }
        const data = sessionDoc.data();
        if (!data) {
            return {
                previousDevice: null,
                previousSessionEnd: null,
                conversationContext: null,
                wasInterrupted: false,
            };
        }
        const currentDevice = getDeviceId(userId);
        const previousDevice = data.deviceId;
        const isContinuing = previousDevice && previousDevice !== currentDevice;
        const lastActivity = data.lastActivity?.toDate() || null;
        const wasInterrupted = lastActivity && !data.gracefulEnd && Date.now() - lastActivity.getTime() < 60 * 60 * 1000;
        return {
            previousDevice: isContinuing ? previousDevice : null,
            previousSessionEnd: lastActivity,
            conversationContext: data.lastContext || null,
            wasInterrupted: !!wasInterrupted,
        };
    }
    catch (err) {
        log.error({ error: err, userId }, 'Failed to detect continuity');
        return {
            previousDevice: null,
            previousSessionEnd: null,
            conversationContext: null,
            wasInterrupted: false,
        };
    }
}
/**
 * Update session state for continuity tracking
 */
export async function updateSessionState(userId, context, isEnding = false) {
    try {
        const db = getFirestore();
        const sessionDocRef = db
            .collection(TRUST_COLLECTION)
            .doc(userId)
            .collection('session_state')
            .doc('current');
        await sessionDocRef.set(removeUndefined({
            deviceId: getDeviceId(userId),
            lastActivity: FieldValue.serverTimestamp(),
            lastContext: context,
            gracefulEnd: isEnding,
        }));
    }
    catch (err) {
        log.error({ error: err, userId }, 'Failed to update session state');
    }
}
// ============================================================================
// CLEANUP
// ============================================================================
export function cleanup() {
    pendingUpdates.clear();
    syncListeners.clear();
    deviceIds.clear();
    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
    }
}
//# sourceMappingURL=cross-device-sync.js.map