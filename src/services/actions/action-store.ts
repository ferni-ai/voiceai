/**
 * Action Store
 *
 * Persistence layer for actions and audit logs.
 * Stores actions in memory with Firestore backup.
 *
 * @module services/actions/action-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Action, ActionPayload, ActionStatus, ActionAuditEntry } from './action-types.js';

const log = createLogger({ module: 'action-store' });

// ============================================================================
// ACTION STORE CLASS
// ============================================================================

export class ActionStore {
  private actions: Map<string, Action> = new Map();
  private userActions: Map<string, Set<string>> = new Map();
  private auditLog: ActionAuditEntry[] = [];
  private readonly maxAuditEntries = 10000;

  constructor() {
    // Clean up expired actions periodically
    setInterval(() => this.cleanupExpired(), 60000);
  }

  // ==========================================================================
  // ACTION CRUD
  // ==========================================================================

  /**
   * Store a new action
   */
  save<T extends ActionPayload>(action: Action<T>): void {
    this.actions.set(action.id, action as Action);

    // Track by user
    const userSet = this.userActions.get(action.userId) || new Set();
    userSet.add(action.id);
    this.userActions.set(action.userId, userSet);

    // Add audit entry
    this.addAuditEntry({
      actionId: action.id,
      timestamp: new Date(),
      event: 'created',
      newStatus: action.status,
      userId: action.userId,
      details: { type: action.type },
    });

    log.debug({ actionId: action.id, userId: action.userId, type: action.type }, 'Action saved');
  }

  /**
   * Get an action by ID
   */
  get<T extends ActionPayload>(actionId: string): Action<T> | undefined {
    return this.actions.get(actionId) as Action<T> | undefined;
  }

  /**
   * Update an action
   */
  update<T extends ActionPayload>(
    actionId: string,
    updates: Partial<Action<T>>
  ): Action<T> | undefined {
    const existing = this.actions.get(actionId);
    if (!existing) {
      return undefined;
    }

    const previousStatus = existing.status;
    const updated = { ...existing, ...updates } as Action<T>;
    this.actions.set(actionId, updated as Action);

    // Add audit entry if status changed
    if (updates.status && updates.status !== previousStatus) {
      this.addAuditEntry({
        actionId,
        timestamp: new Date(),
        event: this.statusToEvent(updates.status),
        previousStatus,
        newStatus: updates.status,
        userId: existing.userId,
      });
    }

    log.debug({ actionId, status: updated.status }, 'Action updated');
    return updated;
  }

  /**
   * Delete an action
   */
  delete(actionId: string): boolean {
    const action = this.actions.get(actionId);
    if (!action) {
      return false;
    }

    this.actions.delete(actionId);

    // Remove from user tracking
    const userSet = this.userActions.get(action.userId);
    if (userSet) {
      userSet.delete(actionId);
      if (userSet.size === 0) {
        this.userActions.delete(action.userId);
      }
    }

    return true;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get all actions for a user
   */
  getByUser(userId: string): Action[] {
    const actionIds = this.userActions.get(userId);
    if (!actionIds) {
      return [];
    }

    const actions: Action[] = [];
    for (const id of actionIds) {
      const action = this.actions.get(id);
      if (action) {
        actions.push(action);
      }
    }

    return actions.sort((a, b) => b.preparedAt.getTime() - a.preparedAt.getTime());
  }

  /**
   * Get pending actions for a user (awaiting confirmation)
   */
  getPending(userId: string): Action[] {
    return this.getByUser(userId).filter((a) => a.status === 'pending_confirmation');
  }

  /**
   * Get active actions (confirmed, executing, or pending)
   */
  getActive(userId: string): Action[] {
    return this.getByUser(userId).filter((a) =>
      ['pending_confirmation', 'confirmed', 'executing'].includes(a.status)
    );
  }

  /**
   * Get actions by status
   */
  getByStatus(status: ActionStatus): Action[] {
    return Array.from(this.actions.values()).filter((a) => a.status === status);
  }

  /**
   * Get expired actions (pending confirmation past expiry)
   */
  getExpired(): Action[] {
    const now = new Date();
    return Array.from(this.actions.values()).filter(
      (a) => a.status === 'pending_confirmation' && a.expiresAt < now
    );
  }

  /**
   * Get recent completed actions
   */
  getRecentCompleted(userId: string, limit = 10): Action[] {
    return this.getByUser(userId)
      .filter((a) => ['completed', 'failed', 'cancelled'].includes(a.status))
      .slice(0, limit);
  }

  // ==========================================================================
  // AUDIT LOG
  // ==========================================================================

  /**
   * Get audit log for an action
   */
  getAuditLog(actionId: string): ActionAuditEntry[] {
    return this.auditLog.filter((e) => e.actionId === actionId);
  }

  /**
   * Get recent audit entries for a user
   */
  getUserAuditLog(userId: string, limit = 50): ActionAuditEntry[] {
    return this.auditLog.filter((e) => e.userId === userId).slice(-limit);
  }

  /**
   * Add an audit entry
   */
  private addAuditEntry(entry: ActionAuditEntry): void {
    this.auditLog.push(entry);

    // Trim if too large
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries / 2);
    }
  }

  /**
   * Convert status to event type
   */
  private statusToEvent(status: ActionStatus): ActionAuditEntry['event'] {
    switch (status) {
      case 'confirmed':
        return 'confirmed';
      case 'cancelled':
        return 'cancelled';
      case 'executing':
        return 'started';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'rolled_back':
        return 'rolled_back';
      default:
        return 'created';
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Clean up expired actions
   */
  private cleanupExpired(): void {
    const expired = this.getExpired();
    let cleaned = 0;

    for (const action of expired) {
      this.update(action.id, {
        status: 'expired',
      });
      cleaned++;
    }

    if (cleaned > 0) {
      log.info({ cleaned }, 'Expired actions cleaned up');
    }
  }

  /**
   * Clean up old completed actions
   */
  cleanupOld(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [id, action] of this.actions) {
      if (
        ['completed', 'failed', 'cancelled', 'expired', 'rolled_back'].includes(action.status) &&
        action.preparedAt < cutoff
      ) {
        this.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info({ cleaned }, 'Old actions cleaned up');
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get statistics
   */
  getStats(): {
    totalActions: number;
    pendingConfirmation: number;
    executing: number;
    completed: number;
    failed: number;
    uniqueUsers: number;
  } {
    const all = Array.from(this.actions.values());

    return {
      totalActions: all.length,
      pendingConfirmation: all.filter((a) => a.status === 'pending_confirmation').length,
      executing: all.filter((a) => a.status === 'executing').length,
      completed: all.filter((a) => a.status === 'completed').length,
      failed: all.filter((a) => a.status === 'failed').length,
      uniqueUsers: this.userActions.size,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let actionStoreInstance: ActionStore | null = null;

export function getActionStore(): ActionStore {
  if (!actionStoreInstance) {
    actionStoreInstance = new ActionStore();
  }
  return actionStoreInstance;
}

export function resetActionStore(): void {
  actionStoreInstance = null;
}
