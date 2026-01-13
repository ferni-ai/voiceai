/**
 * Scheduled Outreach Executor
 *
 * Polls for pending scheduled outreach and executes them when due.
 * Runs as a background worker integrated with the automated scheduler.
 *
 * @module services/outreach/scheduled-outreach-executor
 */
interface ExecutorConfig {
    /** Poll interval in milliseconds */
    pollIntervalMs: number;
    /** Batch size per poll */
    batchSize: number;
    /** Dry run mode (log but don't send) */
    dryRun: boolean;
}
/**
 * Start the scheduled outreach executor
 */
export declare function startScheduledOutreachExecutor(overrides?: Partial<ExecutorConfig>): void;
/**
 * Stop the scheduled outreach executor
 */
export declare function stopScheduledOutreachExecutor(): void;
/**
 * Register a user for scheduled outreach processing
 * Call this when a user schedules outreach
 */
export declare function registerUserForScheduledOutreach(userId: string): void;
/**
 * Unregister a user (e.g., when they have no more scheduled items)
 */
export declare function unregisterUserFromScheduledOutreach(userId: string): void;
/**
 * Get executor status
 */
export declare function getScheduledOutreachExecutorStatus(): {
    running: boolean;
    activeUsers: number;
    config: ExecutorConfig;
};
declare const _default: {
    startScheduledOutreachExecutor: typeof startScheduledOutreachExecutor;
    stopScheduledOutreachExecutor: typeof stopScheduledOutreachExecutor;
    registerUserForScheduledOutreach: typeof registerUserForScheduledOutreach;
    unregisterUserFromScheduledOutreach: typeof unregisterUserFromScheduledOutreach;
    getScheduledOutreachExecutorStatus: typeof getScheduledOutreachExecutorStatus;
};
export default _default;
//# sourceMappingURL=scheduled-outreach-executor.d.ts.map