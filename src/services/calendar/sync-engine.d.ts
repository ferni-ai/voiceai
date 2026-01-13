/**
 * Calendar Sync Engine
 *
 * Handles bidirectional sync between Ferni's calendar and external providers.
 *
 * Sync Strategy:
 * - Ferni calendar is the canonical source of truth
 * - External events are imported into Ferni
 * - Ferni events can be exported to connected providers
 * - Conflicts are resolved based on user preference
 *
 * @module calendar/sync-engine
 */
import type { CalendarProvider, SyncResult, ConflictResolution } from './types.js';
interface SyncOptions {
    /** Days in the past to sync */
    pastDays?: number;
    /** Days in the future to sync */
    futureDays?: number;
    /** How to resolve conflicts */
    conflictResolution?: ConflictResolution;
    /** Force full sync (ignore timestamps) */
    fullSync?: boolean;
}
export declare class CalendarSyncEngine {
    private syncInProgress;
    /**
     * Sync all connected providers for a user
     */
    syncAll(userId: string, options?: SyncOptions): Promise<SyncResult[]>;
    /**
     * Sync a specific provider
     */
    syncProvider(userId: string, provider: CalendarProvider, options?: SyncOptions): Promise<SyncResult>;
    /**
     * Pull events from provider into Ferni
     */
    private pullFromProvider;
    /**
     * Push pending Ferni events to provider
     */
    private pushToProvider;
    /**
     * Detect if there's a conflict between Ferni and provider versions
     */
    private detectConflict;
    /**
     * Resolve a conflict based on strategy
     */
    private resolveConflict;
}
export declare function getSyncEngine(): CalendarSyncEngine;
/**
 * Sync all providers for a user
 */
export declare function syncAllProviders(userId: string, options?: SyncOptions): Promise<SyncResult[]>;
/**
 * Sync a specific provider
 */
export declare function syncProvider(userId: string, provider: CalendarProvider, options?: SyncOptions): Promise<SyncResult>;
declare const _default: {
    CalendarSyncEngine: typeof CalendarSyncEngine;
    getSyncEngine: typeof getSyncEngine;
    syncAllProviders: typeof syncAllProviders;
    syncProvider: typeof syncProvider;
};
export default _default;
//# sourceMappingURL=sync-engine.d.ts.map