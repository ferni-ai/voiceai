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
export interface ScheduledAction {
    id: string;
    userId: string;
    workflowId?: string;
    actionId?: string;
    scheduledFor: Date;
    title: string;
    body: string;
    personaId: string;
    status: 'pending' | 'delivered' | 'failed' | 'cancelled';
    attempts: number;
    createdAt: Date;
    deliveredAt?: Date;
    error?: string;
}
/**
 * Schedule a push notification for a future time
 */
export declare function scheduleAction(params: {
    userId: string;
    scheduledFor: Date;
    title: string;
    body: string;
    workflowId?: string;
    actionId?: string;
    personaId?: string;
}): Promise<ScheduledAction>;
/**
 * Cancel a scheduled action
 */
export declare function cancelAction(actionId: string): Promise<boolean>;
/**
 * Get all pending actions for a user
 */
export declare function getPendingActions(userId: string): ScheduledAction[];
/**
 * Start the background scheduler that checks for due actions
 */
export declare function startScheduledActionsWorker(): Promise<void>;
/**
 * Stop the background scheduler
 */
export declare function stopScheduledActionsWorker(): void;
/**
 * Check if the worker is running
 */
export declare function isScheduledActionsWorkerRunning(): boolean;
declare const _default: {
    scheduleAction: typeof scheduleAction;
    cancelAction: typeof cancelAction;
    getPendingActions: typeof getPendingActions;
    startScheduledActionsWorker: typeof startScheduledActionsWorker;
    stopScheduledActionsWorker: typeof stopScheduledActionsWorker;
    isScheduledActionsWorkerRunning: typeof isScheduledActionsWorkerRunning;
};
export default _default;
//# sourceMappingURL=scheduled-actions.d.ts.map