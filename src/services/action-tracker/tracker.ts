/**
 * Action Tracker Service
 *
 * Tracks high-impact actions Ferni takes on behalf of users.
 * Persists to Firestore for cross-session visibility.
 *
 * Based on the Concierge Tracker pattern - same lifecycle model
 * but simplified for direct user-requested actions.
 *
 * @module services/action-tracker/tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
// Two-way integration: Close commitments when actions complete
import { onActionCompleted as notifyCommitmentKeeperOfAction } from '../superhuman/commitment-keeper.js';
import type {
  FerniAction,
  ActionType,
  ActionStatus,
  ActionEvent,
  ActionRequest,
  ActionExecution,
  CreateActionOptions,
  StartExecutionOptions,
  CompleteExecutionOptions,
  ActionFilter,
  ActionStats,
  ActionChangeEvent,
} from './types.js';

const log = createLogger({ module: 'action-tracker' });

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/** In-memory cache for fast access during sessions */
const actionCache = new Map<string, FerniAction>();

/** Actions indexed by userId for fast lookup */
const userActionsIndex = new Map<string, Set<string>>();

/** Event listeners for real-time updates */
type ActionEventListener = (event: ActionChangeEvent) => void;
const eventListeners: ActionEventListener[] = [];

// ============================================================================
// CONSTANTS
// ============================================================================

/** TTL for action history (90 days in milliseconds) */
const ACTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Max actions to keep in memory per user */
const MAX_CACHED_ACTIONS_PER_USER = 50;

// ============================================================================
// ACTION TRACKER CLASS
// ============================================================================

export class ActionTracker {
  /**
   * Generate a unique action ID
   */
  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: ActionChangeEvent): void {
    log.debug({ type: event.type, actionId: event.actionId }, 'Emitting action event');
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (error) {
        log.error({ error: String(error) }, 'Event listener error');
      }
    }
  }

  /**
   * Add action to cache with proper indexing
   */
  private cacheAction(action: FerniAction): void {
    actionCache.set(action.id, action);

    // Update user index
    if (!userActionsIndex.has(action.userId)) {
      userActionsIndex.set(action.userId, new Set());
    }
    userActionsIndex.get(action.userId)!.add(action.id);

    // Enforce cache limit per user
    const userActions = userActionsIndex.get(action.userId)!;
    if (userActions.size > MAX_CACHED_ACTIONS_PER_USER) {
      // Remove oldest actions from cache
      const actionsToCheck = Array.from(userActions);
      const sortedByDate = actionsToCheck
        .map((id) => actionCache.get(id))
        .filter((a): a is FerniAction => a !== undefined)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Remove oldest until under limit
      while (sortedByDate.length > MAX_CACHED_ACTIONS_PER_USER) {
        const oldest = sortedByDate.shift();
        if (oldest) {
          actionCache.delete(oldest.id);
          userActions.delete(oldest.id);
        }
      }
    }
  }

  /**
   * Create a new action when user makes a request.
   */
  async createAction(options: CreateActionOptions): Promise<FerniAction> {
    const actionId = this.generateId();
    const now = new Date();

    const request: ActionRequest = {
      description: options.description,
      target: options.target,
      targetContact: options.targetContact,
      requestedAt: now,
      sessionId: options.sessionId,
      commitmentId: options.commitmentId,
      userMessage: options.userMessage,
    };

    const action: FerniAction = {
      id: actionId,
      userId: options.userId,
      type: options.type,
      status: 'requested',
      request,
      events: [{ type: 'requested', timestamp: now }],
      createdAt: now,
      updatedAt: now,
    };

    // Cache locally
    this.cacheAction(action);

    // Persist to Firestore
    await this.persistAction(action);

    // Emit event
    this.emitEvent({
      type: 'action_created',
      actionId,
      userId: options.userId,
      action,
      timestamp: now,
    });

    log.info(
      { actionId, userId: options.userId, type: options.type, target: options.target },
      'Action created'
    );

    return action;
  }

  /**
   * Start execution of an action (when tool begins running).
   */
  async startExecution(actionId: string, options: StartExecutionOptions): Promise<FerniAction | null> {
    const action = await this.getAction(actionId);
    if (!action) {
      log.warn({ actionId }, 'Action not found for execution start');
      return null;
    }

    const now = new Date();

    action.status = 'in_progress';
    action.execution = {
      toolId: options.toolId,
      toolArgs: options.toolArgs,
      startedAt: now,
    };
    action.events.push({ type: 'started', timestamp: now });
    action.updatedAt = now;

    this.cacheAction(action);
    await this.persistAction(action);

    this.emitEvent({
      type: 'action_updated',
      actionId,
      userId: action.userId,
      action,
      timestamp: now,
    });

    log.info({ actionId, toolId: options.toolId }, 'Action execution started');

    return action;
  }

  /**
   * Complete execution of an action (success or failure).
   */
  async completeExecution(
    actionId: string,
    options: CompleteExecutionOptions
  ): Promise<FerniAction | null> {
    const action = await this.getAction(actionId);
    if (!action) {
      log.warn({ actionId }, 'Action not found for completion');
      return null;
    }

    const now = new Date();

    action.status = options.success ? 'completed' : 'failed';
    action.completedAt = now;
    action.updatedAt = now;

    if (action.execution) {
      action.execution.completedAt = now;
      action.execution.success = options.success;
      action.execution.resultSummary = options.resultSummary;
      action.execution.callDurationSeconds = options.callDurationSeconds;
      action.execution.deliveryStatus = options.deliveryStatus;
      action.execution.rawResult = options.rawResult;
      action.execution.durationMs = now.getTime() - action.execution.startedAt.getTime();
    }

    action.events.push({
      type: options.success ? 'completed' : 'failed',
      timestamp: now,
      details: options.resultSummary,
      error: options.success ? undefined : options.resultSummary,
    });

    this.cacheAction(action);
    await this.persistAction(action);

    this.emitEvent({
      type: options.success ? 'action_completed' : 'action_failed',
      actionId,
      userId: action.userId,
      action,
      timestamp: now,
    });

    log.info(
      { actionId, success: options.success, resultSummary: options.resultSummary },
      'Action execution completed'
    );

    // Two-way integration: Notify commitment keeper to close matching commitments
    // Fire-and-forget - don't block on commitment updates
    void notifyCommitmentKeeperOfAction({
      userId: action.userId,
      actionType: action.type,
      target: action.request.target,
      commitmentId: action.request.commitmentId,
      success: options.success,
      resultSummary: options.resultSummary,
    });

    return action;
  }

  /**
   * Cancel an action.
   */
  async cancelAction(actionId: string, reason?: string): Promise<FerniAction | null> {
    const action = await this.getAction(actionId);
    if (!action) return null;

    const now = new Date();

    action.status = 'cancelled';
    action.completedAt = now;
    action.updatedAt = now;
    action.events.push({
      type: 'cancelled',
      timestamp: now,
      details: reason,
    });

    this.cacheAction(action);
    await this.persistAction(action);

    log.info({ actionId, reason }, 'Action cancelled');

    return action;
  }

  /**
   * Get a single action by ID.
   */
  async getAction(actionId: string): Promise<FerniAction | null> {
    // Check cache first
    if (actionCache.has(actionId)) {
      return actionCache.get(actionId)!;
    }

    // Try Firestore
    const db = getFirestoreDb();
    if (!db) return null;

    try {
      // Need to search since we don't know userId from actionId alone
      // First try global collection
      const globalDoc = await db.collection('ferni_actions').doc(actionId).get();
      if (globalDoc.exists) {
        const action = this.deserializeAction(globalDoc.data()!);
        this.cacheAction(action);
        return action;
      }
    } catch (error) {
      log.error({ error: String(error), actionId }, 'Failed to get action from Firestore');
    }

    return null;
  }

  /**
   * Get actions for a user with optional filtering.
   */
  async getUserActions(userId: string, filter?: ActionFilter): Promise<FerniAction[]> {
    const results: FerniAction[] = [];

    // First gather from cache
    const cachedIds = userActionsIndex.get(userId) || new Set();
    for (const id of cachedIds) {
      const action = actionCache.get(id);
      if (action) {
        results.push(action);
      }
    }

    // Then query Firestore for any not in cache
    const db = getFirestoreDb();
    if (db) {
      try {
        let query = db
          .collection('bogle_users')
          .doc(userId)
          .collection('ferni_actions')
          .orderBy('createdAt', 'desc');

        // Apply filters
        if (filter?.since) {
          query = query.where('createdAt', '>=', filter.since.toISOString());
        }
        if (filter?.until) {
          query = query.where('createdAt', '<=', filter.until.toISOString());
        }
        if (filter?.type) {
          const types = Array.isArray(filter.type) ? filter.type : [filter.type];
          query = query.where('type', 'in', types);
        }
        if (filter?.status) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
          query = query.where('status', 'in', statuses);
        }

        const limit = filter?.limit || 50;
        query = query.limit(limit);

        const snapshot = await query.get();
        for (const doc of snapshot.docs) {
          if (!cachedIds.has(doc.id)) {
            const action = this.deserializeAction(doc.data());
            this.cacheAction(action);
            results.push(action);
          }
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get user actions from Firestore');
      }
    }

    // Apply type/status filter to cached results and sort
    let filtered = results;
    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      filtered = filtered.filter((a) => types.includes(a.type));
    }
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filtered = filtered.filter((a) => statuses.includes(a.status));
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply limit and offset
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Find an existing pending action for a tool execution.
   * Used to link tool executions to user requests.
   */
  async findPendingActionForTool(
    userId: string,
    toolId: string,
    targetHint?: string
  ): Promise<FerniAction | null> {
    // Look for recent pending/in_progress actions that match
    const actions = await this.getUserActions(userId, {
      status: ['requested', 'in_progress'],
      limit: 10,
    });

    const toolLower = toolId.toLowerCase();

    for (const action of actions) {
      // Match by tool type
      if (toolLower.includes('call') && action.type === 'call') {
        // If target hint provided, try to match
        if (targetHint && action.request.target) {
          if (targetHint.toLowerCase().includes(action.request.target.toLowerCase())) {
            return action;
          }
        } else if (!targetHint) {
          return action; // Return first matching type
        }
      }
      if ((toolLower.includes('text') || toolLower.includes('sms')) && action.type === 'text') {
        if (targetHint && action.request.target) {
          if (targetHint.toLowerCase().includes(action.request.target.toLowerCase())) {
            return action;
          }
        } else if (!targetHint) {
          return action;
        }
      }
      if (toolLower.includes('email') && action.type === 'email') {
        return action;
      }
      if ((toolLower.includes('calendar') || toolLower.includes('event')) && action.type === 'calendar') {
        return action;
      }
      if (toolLower.includes('reminder') && action.type === 'reminder') {
        return action;
      }
    }

    return null;
  }

  /**
   * Get action statistics for a user.
   */
  async getStats(userId: string): Promise<ActionStats> {
    const actions = await this.getUserActions(userId, { limit: 200 });
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats: ActionStats = {
      total: actions.length,
      byType: { call: 0, text: 0, email: 0, calendar: 0, reminder: 0 },
      byStatus: { requested: 0, in_progress: 0, completed: 0, failed: 0, cancelled: 0 },
      completedToday: 0,
      inProgress: 0,
      failedLast24h: 0,
    };

    for (const action of actions) {
      stats.byType[action.type]++;
      stats.byStatus[action.status]++;

      if (action.status === 'in_progress') {
        stats.inProgress++;
      }

      if (action.completedAt) {
        if (action.completedAt >= todayStart && action.status === 'completed') {
          stats.completedToday++;
        }
        if (action.completedAt >= last24h && action.status === 'failed') {
          stats.failedLast24h++;
        }
      }
    }

    return stats;
  }

  /**
   * Subscribe to action events.
   */
  onEvent(listener: ActionEventListener): () => void {
    eventListeners.push(listener);
    return () => {
      const index = eventListeners.indexOf(listener);
      if (index >= 0) {
        eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Persist action to Firestore.
   */
  private async persistAction(action: FerniAction): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      const serialized = this.serializeAction(action);

      // Store in user's subcollection
      await db
        .collection('bogle_users')
        .doc(action.userId)
        .collection('ferni_actions')
        .doc(action.id)
        .set(cleanForFirestore(serialized));

      // Also store in global collection for admin queries
      await db.collection('ferni_actions').doc(action.id).set(cleanForFirestore(serialized));
    } catch (error) {
      log.error({ error: String(error), actionId: action.id }, 'Failed to persist action');
    }
  }

  /**
   * Serialize action for Firestore (dates to ISO strings).
   */
  private serializeAction(action: FerniAction): Record<string, unknown> {
    return {
      ...action,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
      completedAt: action.completedAt?.toISOString(),
      request: {
        ...action.request,
        requestedAt: action.request.requestedAt.toISOString(),
      },
      execution: action.execution
        ? {
            ...action.execution,
            startedAt: action.execution.startedAt.toISOString(),
            completedAt: action.execution.completedAt?.toISOString(),
          }
        : undefined,
      events: action.events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    };
  }

  /**
   * Deserialize action from Firestore (ISO strings to dates).
   */
  private deserializeAction(data: Record<string, unknown>): FerniAction {
    return {
      ...data,
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
      completedAt: data.completedAt ? new Date(data.completedAt as string) : undefined,
      request: {
        ...(data.request as Record<string, unknown>),
        requestedAt: new Date((data.request as Record<string, unknown>).requestedAt as string),
      },
      execution: data.execution
        ? {
            ...(data.execution as Record<string, unknown>),
            startedAt: new Date((data.execution as Record<string, unknown>).startedAt as string),
            completedAt: (data.execution as Record<string, unknown>).completedAt
              ? new Date((data.execution as Record<string, unknown>).completedAt as string)
              : undefined,
          }
        : undefined,
      events: ((data.events as Array<Record<string, unknown>>) || []).map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp as string),
      })),
    } as FerniAction;
  }

  /**
   * Cleanup old actions (called periodically or on startup).
   */
  async cleanupOldActions(): Promise<number> {
    const db = getFirestoreDb();
    if (!db) return 0;

    const cutoffDate = new Date(Date.now() - ACTION_TTL_MS);
    let deletedCount = 0;

    try {
      const snapshot = await db
        .collection('ferni_actions')
        .where('completedAt', '<', cutoffDate.toISOString())
        .limit(500)
        .get();

      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);

        // Also delete from user subcollection
        const action = doc.data();
        if (action.userId) {
          const userDocRef = db
            .collection('bogle_users')
            .doc(action.userId as string)
            .collection('ferni_actions')
            .doc(doc.id);
          batch.delete(userDocRef);
        }

        deletedCount++;
      }

      await batch.commit();

      if (deletedCount > 0) {
        log.info({ deletedCount, cutoffDate }, 'Cleaned up old actions');
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to cleanup old actions');
    }

    return deletedCount;
  }

  /**
   * Clear in-memory cache (for testing or memory management).
   */
  clearCache(): void {
    actionCache.clear();
    userActionsIndex.clear();
    log.debug('Action cache cleared');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let trackerInstance: ActionTracker | null = null;

/** Cleanup interval: 6 hours (run 4x per day) */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_NAME = 'action-tracker-cleanup';

/**
 * Get the singleton ActionTracker instance.
 */
export function getActionTracker(): ActionTracker {
  if (!trackerInstance) {
    trackerInstance = new ActionTracker();

    // Schedule periodic cleanup (90-day TTL)
    if (!hasInterval(CLEANUP_INTERVAL_NAME)) {
      // Run initial cleanup after 1 minute (let other systems initialize first)
      setTimeout(() => {
        trackerInstance?.cleanupOldActions().catch((err) => {
          log.debug({ error: String(err) }, 'Initial action cleanup failed');
        });
      }, 60000);

      // Schedule recurring cleanup every 6 hours using managed interval
      registerInterval(
        CLEANUP_INTERVAL_NAME,
        () => {
          trackerInstance?.cleanupOldActions().catch((err) => {
            log.debug({ error: String(err) }, 'Scheduled action cleanup failed');
          });
        },
        CLEANUP_INTERVAL_MS
      );

      log.info('Action tracker TTL cleanup scheduled (every 6 hours)');
    }
  }
  return trackerInstance;
}

/**
 * Reset the tracker (for testing).
 */
export function resetActionTracker(): void {
  if (trackerInstance) {
    trackerInstance.clearCache();
  }
  trackerInstance = null;

  // Clear cleanup interval
  clearNamedInterval(CLEANUP_INTERVAL_NAME);
}
