/**
 * Outreach Maintenance Service
 *
 * Handles periodic cleanup and reset tasks:
 * - Weekly counter resets
 * - Old data pruning
 * - Analytics aggregation
 * - Dead trigger cleanup
 */
export interface MaintenanceConfig {
    /** How often to run weekly resets (default: every Sunday at 3 AM) */
    weeklyResetDay: number;
    weeklyResetHour: number;
    /** How old data can be before pruning (days) */
    maxDataAgeDays: number;
    /** How long to keep outreach history (days) */
    maxHistoryAgeDays: number;
    /** Max pending triggers per user */
    maxPendingTriggersPerUser: number;
}
export interface MaintenanceStats {
    lastWeeklyReset?: Date;
    lastDataPrune?: Date;
    lastDeadTriggerCleanup?: Date;
    lastCalendarSync?: Date;
    triggersCleanedUp: number;
    dataEntriesPruned: number;
    usersReset: number;
    calendarsSynced: number;
}
/**
 * Reset weekly outreach counters for all users
 * This prevents rate limiting from becoming permanent
 */
export declare function resetWeeklyCounters(): void;
/**
 * Prune old data from all services
 */
export declare function pruneOldData(): Promise<void>;
/**
 * Clean up dead/expired triggers
 */
export declare function cleanupDeadTriggers(): void;
/**
 * Prune old outreach history
 */
export declare function pruneOutreachHistory(): void;
/**
 * Sync calendars for all users with connected Google Calendar
 *
 * This fetches each user's calendar events and updates their timing
 * profile with busy periods, ensuring outreach avoids meeting times.
 */
export declare function syncAllCalendars(): Promise<{
    synced: number;
    failed: number;
}>;
/**
 * Full reset for a user (for GDPR deletion, etc.)
 */
export declare function resetUserData(userId: string): void;
/**
 * Start the maintenance scheduler
 */
export declare function startMaintenanceScheduler(intervalMs?: number): void;
/**
 * Stop the maintenance scheduler
 */
export declare function stopMaintenanceScheduler(): void;
/**
 * Update maintenance configuration
 */
export declare function updateMaintenanceConfig(updates: Partial<MaintenanceConfig>): void;
/**
 * Get current maintenance stats
 */
export declare function getMaintenanceStats(): MaintenanceStats;
declare const _default: {
    resetWeeklyCounters: typeof resetWeeklyCounters;
    pruneOldData: typeof pruneOldData;
    cleanupDeadTriggers: typeof cleanupDeadTriggers;
    pruneOutreachHistory: typeof pruneOutreachHistory;
    syncAllCalendars: typeof syncAllCalendars;
    resetUserData: typeof resetUserData;
    startMaintenanceScheduler: typeof startMaintenanceScheduler;
    stopMaintenanceScheduler: typeof stopMaintenanceScheduler;
    updateMaintenanceConfig: typeof updateMaintenanceConfig;
    getMaintenanceStats: typeof getMaintenanceStats;
};
export default _default;
//# sourceMappingURL=maintenance.d.ts.map