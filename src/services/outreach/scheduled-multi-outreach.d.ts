/**
 * Scheduled Multi-Outreach Storage
 *
 * Handles storing and retrieving scheduled outreach targets from Firestore.
 * Integrates with the automated scheduler for execution.
 *
 * Storage: bogle_users/{userId}/scheduled_outreach/{id}
 *
 * @module services/outreach/scheduled-multi-outreach
 */
/**
 * Target details for scheduled outreach
 */
export interface ScheduledOutreachTarget {
    /** Original contact name/query */
    contact: string;
    /** Purpose of the outreach */
    purpose: string;
    /** Channel preference */
    channel: 'call' | 'text' | 'email' | 'conversation' | 'auto';
    /** Custom message (optional) */
    message?: string;
    /** Resolved contact ID */
    resolvedContactId: string;
    /** Resolved contact name */
    resolvedContactName: string;
    /** Resolved phone number */
    resolvedPhone?: string;
    /** Resolved email */
    resolvedEmail?: string;
}
/**
 * Scheduled outreach record in Firestore
 */
export interface ScheduledOutreach {
    id: string;
    userId: string;
    personaId: string;
    target: ScheduledOutreachTarget;
    scheduledFor: Date;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
    createdAt: Date;
    updatedAt: Date;
    batchId?: string;
    executedAt?: Date;
    result?: {
        success: boolean;
        channel?: string;
        error?: string;
    };
    retryCount: number;
    maxRetries: number;
}
/**
 * Schedule an outreach for later execution
 */
export declare function scheduleOutreach(userId: string, personaId: string, target: ScheduledOutreachTarget, scheduledFor: Date, batchId?: string): Promise<string>;
/**
 * Get pending scheduled outreach for a user
 */
export declare function getPendingOutreach(userId: string): Promise<ScheduledOutreach[]>;
/**
 * Get all scheduled outreach for a user (for UI display)
 */
export declare function getScheduledOutreach(userId: string, options?: {
    status?: ScheduledOutreach['status'];
    limit?: number;
}): Promise<ScheduledOutreach[]>;
/**
 * Update outreach status
 */
export declare function updateOutreachStatus(userId: string, outreachId: string, status: ScheduledOutreach['status'], result?: ScheduledOutreach['result']): Promise<void>;
/**
 * Increment retry count and optionally mark as failed
 */
export declare function incrementRetry(userId: string, outreachId: string): Promise<{
    shouldRetry: boolean;
    retryCount: number;
}>;
/**
 * Cancel a scheduled outreach
 */
export declare function cancelScheduledOutreach(userId: string, outreachId: string): Promise<boolean>;
/**
 * Delete old completed/failed/cancelled outreach records
 * Called by cleanup jobs
 */
export declare function cleanupOldOutreach(userId: string, olderThanDays?: number): Promise<number>;
declare const _default: {
    scheduleOutreach: typeof scheduleOutreach;
    getPendingOutreach: typeof getPendingOutreach;
    getScheduledOutreach: typeof getScheduledOutreach;
    updateOutreachStatus: typeof updateOutreachStatus;
    incrementRetry: typeof incrementRetry;
    cancelScheduledOutreach: typeof cancelScheduledOutreach;
    cleanupOldOutreach: typeof cleanupOldOutreach;
};
export default _default;
//# sourceMappingURL=scheduled-multi-outreach.d.ts.map