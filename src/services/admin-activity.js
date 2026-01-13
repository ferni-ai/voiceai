/**
 * Admin Activity Log Service
 *
 * Persists admin activity events to Firestore for durability.
 * Falls back to in-memory storage when Firestore is unavailable.
 *
 * Collection: admin_activity_log
 * TTL: 7 days (events older than 7 days are not returned)
 *
 * @module AdminActivityService
 */
import { getLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
const log = getLogger().child({ module: 'admin-activity' });
// ============================================================================
// FIRESTORE CLIENT
// ============================================================================
let firestoreClient = null;
let firestoreAvailable = false;
// In-memory fallback
const inMemoryLog = [];
const MAX_IN_MEMORY_EVENTS = 200;
const TTL_DAYS = 7;
const COLLECTION = 'admin_activity_log';
/**
 * Initialize Firestore for activity logging
 */
export async function initializeActivityLog() {
    try {
        const admin = await import('firebase-admin');
        if (admin.apps.length === 0) {
            try {
                admin.initializeApp({
                    projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
                });
            }
            catch {
                log.warn('Firebase not configured - using in-memory activity log');
                return false;
            }
        }
        firestoreClient = admin.firestore();
        firestoreAvailable = true;
        log.info('Admin activity log initialized with Firestore');
        return true;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available - using in-memory activity log');
        firestoreAvailable = false;
        return false;
    }
}
// ============================================================================
// ACTIVITY RECORDING
// ============================================================================
/**
 * Record an activity event
 */
export async function recordActivity(event) {
    const newEvent = {
        ...event,
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
    };
    if (firestoreAvailable && firestoreClient) {
        try {
            const admin = await import('firebase-admin');
            const doc = {
                id: newEvent.id,
                type: newEvent.type,
                action: newEvent.action,
                description: newEvent.description,
                metadata: newEvent.metadata,
                timestamp: admin.firestore.Timestamp.fromDate(newEvent.timestamp),
                createdAt: admin.firestore.Timestamp.now(),
            };
            await firestoreClient.collection(COLLECTION).doc(newEvent.id).set(cleanForFirestore(doc));
            log.debug({ eventId: newEvent.id, type: newEvent.type }, 'Activity recorded to Firestore');
        }
        catch (error) {
            log.error({ error, event: newEvent }, 'Failed to persist activity to Firestore');
            // Fall back to in-memory
            addToInMemory(newEvent);
        }
    }
    else {
        addToInMemory(newEvent);
    }
}
function addToInMemory(event) {
    inMemoryLog.unshift(event);
    if (inMemoryLog.length > MAX_IN_MEMORY_EVENTS) {
        inMemoryLog.pop();
    }
    log.debug({ eventId: event.id }, 'Activity recorded to in-memory log');
}
// ============================================================================
// ACTIVITY RETRIEVAL
// ============================================================================
/**
 * Get recent activity events
 */
export async function getRecentActivity(limit = 20) {
    if (firestoreAvailable && firestoreClient) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);
            const admin = await import('firebase-admin');
            const snapshot = await firestoreClient
                .collection(COLLECTION)
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: data.id,
                    type: data.type,
                    action: data.action,
                    description: data.description,
                    metadata: data.metadata,
                    timestamp: data.timestamp.toDate(),
                };
            });
        }
        catch (error) {
            log.error({ error }, 'Failed to fetch activity from Firestore');
            return inMemoryLog.slice(0, limit);
        }
    }
    return inMemoryLog.slice(0, limit);
}
/**
 * Get activity events by type
 */
export async function getActivityByType(type, limit = 20) {
    if (firestoreAvailable && firestoreClient) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);
            const admin = await import('firebase-admin');
            const snapshot = await firestoreClient
                .collection(COLLECTION)
                .where('type', '==', type)
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: data.id,
                    type: data.type,
                    action: data.action,
                    description: data.description,
                    metadata: data.metadata,
                    timestamp: data.timestamp.toDate(),
                };
            });
        }
        catch (error) {
            log.error({ error, type }, 'Failed to fetch activity by type from Firestore');
            return inMemoryLog.filter((e) => e.type === type).slice(0, limit);
        }
    }
    return inMemoryLog.filter((e) => e.type === type).slice(0, limit);
}
/**
 * Get activity count by type (for analytics)
 */
export async function getActivityCounts() {
    const counts = {
        handoff: 0,
        evalops: 0,
        trust: 0,
        agent: 0,
        flag: 0,
        user: 0,
        system: 0,
    };
    if (firestoreAvailable && firestoreClient) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);
            const admin = await import('firebase-admin');
            const snapshot = await firestoreClient
                .collection(COLLECTION)
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
                .get();
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const type = data.type;
                if (type in counts) {
                    counts[type]++;
                }
            }
        }
        catch (error) {
            log.error({ error }, 'Failed to get activity counts from Firestore');
            // Fall back to in-memory counts
            for (const event of inMemoryLog) {
                counts[event.type]++;
            }
        }
    }
    else {
        for (const event of inMemoryLog) {
            counts[event.type]++;
        }
    }
    return counts;
}
/** Firestore batch write limit */
const FIRESTORE_BATCH_LIMIT = 500;
/**
 * Clean up old events (can be run periodically)
 * Now loops until all old events are cleaned to handle >500 events
 */
export async function cleanupOldEvents() {
    if (!firestoreAvailable || !firestoreClient) {
        // In-memory cleanup
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);
        const before = inMemoryLog.length;
        const filtered = inMemoryLog.filter((e) => e.timestamp > cutoffDate);
        inMemoryLog.length = 0;
        inMemoryLog.push(...filtered);
        return before - inMemoryLog.length;
    }
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);
        const admin = await import('firebase-admin');
        const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
        let totalDeleted = 0;
        // Loop until all old events are cleaned (handle >500 events)
        while (true) {
            const snapshot = await firestoreClient
                .collection(COLLECTION)
                .where('timestamp', '<', cutoffTimestamp)
                .limit(FIRESTORE_BATCH_LIMIT)
                .get();
            if (snapshot.empty) {
                break;
            }
            const batch = firestoreClient.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            totalDeleted += snapshot.size;
            // If we got fewer than the limit, we're done
            if (snapshot.size < FIRESTORE_BATCH_LIMIT) {
                break;
            }
        }
        if (totalDeleted > 0) {
            log.info({ deleted: totalDeleted }, 'Cleaned up old activity events');
        }
        return totalDeleted;
    }
    catch (error) {
        log.error({ error }, 'Failed to cleanup old events');
        return 0;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    initializeActivityLog,
    recordActivity,
    getRecentActivity,
    getActivityByType,
    getActivityCounts,
    cleanupOldEvents,
};
//# sourceMappingURL=admin-activity.js.map