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

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledAction {
  id: string;
  userId: string;
  workflowId?: string;
  actionId?: string;
  scheduledFor: Date;
  title: string;
  body: string;
  personaId: string;
  /** 'sending' = claimed by the delivery job; 'missed' = found too late to be useful. */
  status: 'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled' | 'missed';
  attempts: number;
  createdAt: Date;
  deliveredAt?: Date;
  error?: string;
}

// In-memory cache for quick access
const scheduledActionsCache = new Map<string, ScheduledAction>();

// Background job interval
let schedulerInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

async function getFirestoreDb() {
  try {
    const { getFirestoreDb: getDb } = await import('../superhuman/firestore-utils.js');
    return getDb();
  } catch {
    return null;
  }
}

/**
 * Save a scheduled action to Firestore
 */
async function persistAction(action: ScheduledAction): Promise<void> {
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
  } catch (error) {
    log.error({ error: String(error), actionId: action.id }, 'Failed to persist action');
  }
}

/** Rebuild an action from its Firestore document (dates are stored as ISO strings). */
export function actionFromDoc(data: Record<string, unknown>): ScheduledAction {
  return {
    id: String(data.id),
    userId: String(data.userId),
    workflowId: data.workflowId as string | undefined,
    actionId: data.actionId as string | undefined,
    scheduledFor: new Date(data.scheduledFor as string),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    personaId: (data.personaId as string) || 'ferni',
    status: data.status as ScheduledAction['status'],
    attempts: Number(data.attempts ?? 0) || 0,
    createdAt: new Date(data.createdAt as string),
    deliveredAt: data.deliveredAt ? new Date(data.deliveredAt as string) : undefined,
    error: data.error as string | undefined,
  };
}

/**
 * Load all pending actions from Firestore on startup
 */
async function loadPendingActions(): Promise<number> {
  const db = await getFirestoreDb();
  if (!db) return 0;

  try {
    // Query all pending actions across all users.
    // If you get FAILED_PRECONDITION: in Firebase Console → Firestore → Indexes → Single field,
    // enable indexing for collection group "scheduled_actions" on field "status".
    const snapshot = await db
      .collectionGroup('scheduled_actions')
      .where('status', '==', 'pending')
      .get();

    let loaded = 0;
    for (const doc of snapshot.docs) {
      const action = actionFromDoc(doc.data());
      scheduledActionsCache.set(action.id, action);
      loaded++;
    }

    log.info({ loaded }, '📅 Loaded pending scheduled actions from Firestore');
    return loaded;
  } catch (error) {
    const errStr = String(error);
    // Firestore collection group queries require a composite index. Missing index → FAILED_PRECONDITION (code 9).
    if (errStr.includes('FAILED_PRECONDITION') || errStr.includes('index')) {
      log.warn(
        { hint: 'Create a Firestore composite index for collectionGroup scheduled_actions + status' },
        'Pending scheduled actions: Firestore index missing (non-fatal, running with in-memory only)'
      );
    } else {
      log.error({ error: errStr }, 'Failed to load pending actions');
    }
    return 0;
  }
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Schedule a push notification for a future time
 */
export async function scheduleAction(params: {
  userId: string;
  scheduledFor: Date;
  title: string;
  body: string;
  workflowId?: string;
  actionId?: string;
  personaId?: string;
}): Promise<ScheduledAction> {
  const action: ScheduledAction = {
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

  log.info(
    { actionId: action.id, userId: params.userId, scheduledFor: params.scheduledFor },
    '📅 Action scheduled'
  );

  return action;
}

/**
 * Cancel a scheduled action
 */
export async function cancelAction(actionId: string): Promise<boolean> {
  const action = scheduledActionsCache.get(actionId);
  if (!action) return false;

  action.status = 'cancelled';
  scheduledActionsCache.set(actionId, action);
  await persistAction(action);

  log.info({ actionId }, '🚫 Action cancelled');
  return true;
}

/**
 * Get all pending actions for a user
 */
export function getPendingActions(userId: string): ScheduledAction[] {
  return Array.from(scheduledActionsCache.values()).filter(
    (a) => a.userId === userId && a.status === 'pending'
  );
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute a scheduled action (send push notification)
 */
async function executeAction(action: ScheduledAction): Promise<boolean> {
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
    } else {
      // Retry up to 3 times
      if (action.attempts >= 3) {
        action.status = 'failed';
        action.error = 'Max attempts reached';
        log.warn(
          { actionId: action.id, attempts: action.attempts },
          '❌ Action failed after retries'
        );
      } else {
        log.debug({ actionId: action.id, attempts: action.attempts }, 'Will retry action');
      }
    }

    scheduledActionsCache.set(action.id, action);
    await persistAction(action);

    return success;
  } catch (error) {
    action.status = 'failed';
    action.error = String(error);
    scheduledActionsCache.set(action.id, action);
    await persistAction(action);

    log.error({ actionId: action.id, error: String(error) }, 'Action execution failed');
    return false;
  }
}

export interface ScheduledActionsRunResult {
  due: number;
  delivered: number;
  /** Push failed; left pending for the next run (up to 3 attempts). */
  retrying: number;
  failed: number;
  missed: number;
  skipped: number;
  /** Delivered to the in-app panel because this server can't send push. */
  inApp: number;
  dryRun: boolean;
}

/**
 * Deliver due scheduled actions straight from Firestore. Run by Cloud
 * Scheduler (POST /api/jobs/deliver-scheduled-actions) every minute.
 *
 * The in-process worker only saw actions in its own process's cache and ran
 * only inside voice-call processes, while actions are scheduled from the API
 * server, so an action was delivered only if the process that happened to
 * hold it was still alive when it came due.
 */
export async function deliverDueScheduledActions(
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {}
): Promise<ScheduledActionsRunResult> {
  const db = await getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const { claimDueItems } = await import('../scheduling/due-items.js');
  const claim = await claimDueItems(db, {
    collection: 'scheduled_actions',
    dueField: 'scheduledFor',
    dueType: 'iso',
    claimStatus: 'sending',
    lateStatus: 'missed',
    lateAfterMs: 2 * 60 * 60 * 1000,
    now: opts.now,
    limit: opts.limit,
    dryRun: opts.dryRun,
  });
  const result: ScheduledActionsRunResult = {
    due: claim.due,
    delivered: 0,
    retrying: 0,
    failed: 0,
    missed: claim.late,
    skipped: claim.skipped,
    inApp: 0,
    dryRun: opts.dryRun === true,
  };
  if (opts.dryRun || claim.claimed.length === 0) return result;

  const { getChannelStatus, saveInAppMessage } = await import('../outreach/unified-delivery.js');
  const pushUp = (await getChannelStatus()).push.available;

  for (const item of claim.claimed) {
    // Claimed as 'sending'; a push that fails goes back to 'pending' so the
    // next run retries it (executeAction gives up after 3 attempts).
    const action: ScheduledAction = { ...actionFromDoc(item.data), status: 'pending' };
    if (pushUp) {
      await executeAction(action);
    } else {
      action.attempts++;
      const saved = await saveInAppMessage(action.userId, {
        type: 'scheduled_action',
        personaId: action.personaId,
        text: action.body ? `${action.title}: ${action.body}` : action.title,
        reason: action.title,
        triggerId: action.id,
      });
      action.status = saved.success ? 'delivered' : 'failed';
      if (saved.success) {
        action.deliveredAt = new Date();
        result.inApp++;
      } else {
        action.error = saved.error;
      }
      await persistAction(action);
    }
    if (action.status === 'delivered') result.delivered++;
    else if (action.status === 'failed') result.failed++;
    else result.retrying++;
  }
  if (result.due > 0) log.info(result, 'Scheduled actions delivery run');
  return result;
}

/**
 * Check for and execute due actions
 */
async function checkDueActions(): Promise<void> {
  const now = new Date();
  const dueActions = Array.from(scheduledActionsCache.values()).filter(
    (a) => a.status === 'pending' && a.scheduledFor <= now
  );

  if (dueActions.length === 0) return;

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
export async function startScheduledActionsWorker(): Promise<void> {
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
export function stopScheduledActionsWorker(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log.info('⏹️ Scheduled actions worker stopped');
  }
}

/**
 * Check if the worker is running
 */
export function isScheduledActionsWorkerRunning(): boolean {
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
