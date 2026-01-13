/**
 * Scheduled Actions Store
 *
 * Persists scheduled workflow actions to Firestore for durability across restarts.
 * A background job checks for due actions and executes them.
 *
 * Unlike the reminder-scheduler (which is for contact-based SMS/email/call),
 * this is specifically for push notification reminders from workflow routines.
 *
 * @module services/workflows/scheduled-actions
 */
import { createLogger } from '../../utils/safe-logger.js';
import { sendPushNotification } from '../outreach/delivery/push-notifications.js';
const log = createLogger({ module: 'scheduled-actions' });
// In-memory cache for quick access
const scheduledActionsCache = new Map();
// Background job interval
let schedulerInterval = null;
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================
async function getFirestoreDb() {
    try {
        const { getFirestoreDb: getDb } = await import('../superhuman/firestore-utils.js');
        return getDb();
    }
    catch {
        return null;
    }
}
/**
 * Save a scheduled action to Firestore
 */
async function persistAction(action) {
    const db = await getFirestoreDb();
    if (!db) {
        log.debug({ actionId: action.id }, 'Firestore unavailable, action only in memory');
        return;
    }
    try {
        await db
            .collection('bogle_users')
            .doc(action.userId)
            .collection('scheduled_actions')
            .doc(action.id)
            .set({
            ...action,
            scheduledFor: action.scheduledFor.toISOString(),
            createdAt: action.createdAt.toISOString(),
            deliveredAt: action.deliveredAt?.toISOString(),
        });
        log.debug({ actionId: action.id, userId: action.userId }, 'Action persisted to Firestore');
    }
    catch (error) {
        log.error({ error: String(error), actionId: action.id }, 'Failed to persist action');
    }
}
/**
 * Load all pending actions from Firestore on startup
 */
async function loadPendingActions() {
    const db = await getFirestoreDb();
    if (!db)
        return 0;
    try {
        // Query all pending actions across all users
        const snapshot = await db
            .collectionGroup('scheduled_actions')
            .where('status', '==', 'pending')
            .get();
        let loaded = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const action = {
                id: data.id,
                userId: data.userId,
                workflowId: data.workflowId,
                actionId: data.actionId,
                scheduledFor: new Date(data.scheduledFor),
                title: data.title,
                body: data.body,
                personaId: data.personaId || 'ferni',
                status: data.status,
                attempts: data.attempts || 0,
                createdAt: new Date(data.createdAt),
                deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : undefined,
                error: data.error,
            };
            scheduledActionsCache.set(action.id, action);
            loaded++;
        }
        log.info({ loaded }, '📅 Loaded pending scheduled actions from Firestore');
        return loaded;
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to load pending actions');
        return 0;
    }
}
// ============================================================================
// CRUD OPERATIONS
// ============================================================================
/**
 * Schedule a push notification for a future time
 */
export async function scheduleAction(params) {
    const action = {
        id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: params.userId,
        workflowId: params.workflowId,
        actionId: params.actionId,
        scheduledFor: params.scheduledFor,
        title: params.title,
        body: params.body,
        personaId: params.personaId || 'ferni',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
    };
    scheduledActionsCache.set(action.id, action);
    await persistAction(action);
    log.info({ actionId: action.id, userId: params.userId, scheduledFor: params.scheduledFor }, '📅 Action scheduled');
    return action;
}
/**
 * Cancel a scheduled action
 */
export async function cancelAction(actionId) {
    const action = scheduledActionsCache.get(actionId);
    if (!action)
        return false;
    action.status = 'cancelled';
    scheduledActionsCache.set(actionId, action);
    await persistAction(action);
    log.info({ actionId }, '🚫 Action cancelled');
    return true;
}
/**
 * Get all pending actions for a user
 */
export function getPendingActions(userId) {
    return Array.from(scheduledActionsCache.values()).filter((a) => a.userId === userId && a.status === 'pending');
}
// ============================================================================
// EXECUTION
// ============================================================================
/**
 * Execute a scheduled action (send push notification)
 */
async function executeAction(action) {
    try {
        action.attempts++;
        const results = await sendPushNotification({
            userId: action.userId,
            personaId: action.personaId,
            outreachId: action.id,
            title: action.title,
            body: action.body,
            priority: 'high',
        });
        const success = results.some((r) => r.success);
        if (success) {
            action.status = 'delivered';
            action.deliveredAt = new Date();
            log.info({ actionId: action.id, userId: action.userId }, '✅ Scheduled action delivered');
        }
        else {
            // Retry up to 3 times
            if (action.attempts >= 3) {
                action.status = 'failed';
                action.error = 'Max attempts reached';
                log.warn({ actionId: action.id, attempts: action.attempts }, '❌ Action failed after retries');
            }
            else {
                log.debug({ actionId: action.id, attempts: action.attempts }, 'Will retry action');
            }
        }
        scheduledActionsCache.set(action.id, action);
        await persistAction(action);
        return success;
    }
    catch (error) {
        action.status = 'failed';
        action.error = String(error);
        scheduledActionsCache.set(action.id, action);
        await persistAction(action);
        log.error({ actionId: action.id, error: String(error) }, 'Action execution failed');
        return false;
    }
}
/**
 * Check for and execute due actions
 */
async function checkDueActions() {
    const now = new Date();
    const dueActions = Array.from(scheduledActionsCache.values()).filter((a) => a.status === 'pending' && a.scheduledFor <= now);
    if (dueActions.length === 0)
        return;
    log.debug({ count: dueActions.length }, 'Processing due actions');
    for (const action of dueActions) {
        await executeAction(action);
    }
}
// ============================================================================
// BACKGROUND SCHEDULER
// ============================================================================
/**
 * Start the background scheduler that checks for due actions
 */
export async function startScheduledActionsWorker() {
    if (schedulerInterval) {
        log.warn('Scheduled actions worker already running');
        return;
    }
    // Load pending actions from Firestore
    await loadPendingActions();
    // Start checking for due actions
    schedulerInterval = setInterval(() => {
        void checkDueActions();
    }, CHECK_INTERVAL_MS);
    log.info({ intervalMs: CHECK_INTERVAL_MS }, '🚀 Scheduled actions worker started');
}
/**
 * Stop the background scheduler
 */
export function stopScheduledActionsWorker() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        log.info('⏹️ Scheduled actions worker stopped');
    }
}
/**
 * Check if the worker is running
 */
export function isScheduledActionsWorkerRunning() {
    return schedulerInterval !== null;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    scheduleAction,
    cancelAction,
    getPendingActions,
    startScheduledActionsWorker,
    stopScheduledActionsWorker,
    isScheduledActionsWorkerRunning,
};
//# sourceMappingURL=scheduled-actions.js.map