/**
 * Action Store
 *
 * Persistence layer for actions and audit logs.
 * Stores actions in memory with Firestore backup.
 *
 * @module services/actions/action-store
 */
import type { Action, ActionPayload, ActionStatus, ActionAuditEntry } from './action-types.js';
export declare class ActionStore {
    private actions;
    private userActions;
    private auditLog;
    private readonly maxAuditEntries;
    constructor();
    /**
     * Store a new action
     */
    save<T extends ActionPayload>(action: Action<T>): void;
    /**
     * Get an action by ID
     */
    get<T extends ActionPayload>(actionId: string): Action<T> | undefined;
    /**
     * Update an action
     */
    update<T extends ActionPayload>(actionId: string, updates: Partial<Action<T>>): Action<T> | undefined;
    /**
     * Delete an action
     */
    delete(actionId: string): boolean;
    /**
     * Get all actions for a user
     */
    getByUser(userId: string): Action[];
    /**
     * Get pending actions for a user (awaiting confirmation)
     */
    getPending(userId: string): Action[];
    /**
     * Get active actions (confirmed, executing, or pending)
     */
    getActive(userId: string): Action[];
    /**
     * Get actions by status
     */
    getByStatus(status: ActionStatus): Action[];
    /**
     * Get expired actions (pending confirmation past expiry)
     */
    getExpired(): Action[];
    /**
     * Get recent completed actions
     */
    getRecentCompleted(userId: string, limit?: number): Action[];
    /**
     * Get audit log for an action
     */
    getAuditLog(actionId: string): ActionAuditEntry[];
    /**
     * Get recent audit entries for a user
     */
    getUserAuditLog(userId: string, limit?: number): ActionAuditEntry[];
    /**
     * Add an audit entry
     */
    private addAuditEntry;
    /**
     * Convert status to event type
     */
    private statusToEvent;
    /**
     * Clean up expired actions
     */
    private cleanupExpired;
    /**
     * Clean up old completed actions
     */
    cleanupOld(maxAge?: number): void;
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
    };
}
export declare function getActionStore(): ActionStore;
export declare function resetActionStore(): void;
//# sourceMappingURL=action-store.d.ts.map