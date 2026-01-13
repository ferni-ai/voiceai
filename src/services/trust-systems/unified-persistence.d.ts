/**
 * Unified Trust Profile Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module ensures all trust profile data has a SINGLE source of truth
 * in Firestore. It prevents data drift between in-memory and persisted state.
 *
 * The Problem:
 * - Multiple systems maintain their own in-memory Maps
 * - Periodic sync can lead to stale/inconsistent data
 * - Server restarts lose recent changes
 *
 * The Solution:
 * - Real-time write-through for critical changes
 * - Periodic batch sync for efficiency
 * - Single document structure per user
 * - Conflict resolution with timestamps
 *
 * @module UnifiedTrustPersistence
 */
export interface UnifiedTrustProfile {
    userId: string;
    /** Version for conflict resolution */
    version: number;
    /** Last modification timestamps for each system */
    systemVersions: Record<string, number>;
    /** Core trust system data */
    systems: {
        boundaries?: unknown;
        growth?: unknown;
        insideJokes?: unknown;
        smallWins?: unknown;
        thinkingOfYou?: unknown;
        unsaid?: unknown;
        relationshipHealth?: unknown;
        celebrationMomentum?: unknown;
        sentimentTimeline?: unknown;
        voiceProsody?: unknown;
        journaling?: unknown;
        seasonal?: unknown;
        learningStyle?: unknown;
        media?: unknown;
        insights?: unknown;
        crossPersonaInsights?: unknown;
        tonalMemory?: unknown;
        betweenSessionThinking?: unknown;
        personaGrowth?: unknown;
        curiosityMemory?: unknown;
        conversationTexture?: unknown;
    };
    /** Metadata */
    createdAt: Date;
    updatedAt: Date;
    lastSessionId?: string;
}
export interface PersistenceConfig {
    /** How often to batch sync (ms) */
    batchSyncIntervalMs: number;
    /** Max changes before forcing a sync */
    maxPendingChanges: number;
    /** Whether to use real-time write-through for critical systems */
    realtimeWriteThrough: boolean;
    /** Systems that should be written through immediately */
    criticalSystems: string[];
}
/**
 * Initialize the unified persistence system
 */
export declare function initializeUnifiedPersistence(customConfig?: Partial<PersistenceConfig>): void;
/**
 * Shutdown the persistence system
 */
export declare function shutdownUnifiedPersistence(): Promise<void>;
/**
 * Load a user's unified trust profile
 */
export declare function loadUnifiedProfile(userId: string): Promise<UnifiedTrustProfile | null>;
/**
 * Save a specific system's data
 */
export declare function saveSystemData(userId: string, systemName: string, data: unknown, options?: {
    immediate?: boolean;
}): Promise<void>;
/**
 * Get a specific system's data
 */
export declare function getSystemData<T>(userId: string, systemName: string): Promise<T | null>;
/**
 * Get the entire unified profile
 */
export declare function getUnifiedProfile(userId: string): Promise<UnifiedTrustProfile | null>;
/**
 * Check if a system has been modified since a given timestamp
 */
export declare function hasSystemChanged(userId: string, systemName: string, since: number): boolean;
/**
 * Flush all pending changes for all users
 */
export declare function flushPendingChanges(): Promise<number>;
/**
 * Migrate from old per-system collections to unified profile
 */
export declare function migrateToUnifiedProfile(userId: string): Promise<boolean>;
/**
 * Call at session start to load and cache trust data
 */
export declare function onSessionStartUnified(userId: string, sessionId: string): Promise<void>;
/**
 * Call at session end to flush all changes
 */
export declare function onSessionEndUnified(userId: string): Promise<void>;
declare const _default: {
    initializeUnifiedPersistence: typeof initializeUnifiedPersistence;
    shutdownUnifiedPersistence: typeof shutdownUnifiedPersistence;
    loadUnifiedProfile: typeof loadUnifiedProfile;
    saveSystemData: typeof saveSystemData;
    getSystemData: typeof getSystemData;
    getUnifiedProfile: typeof getUnifiedProfile;
    hasSystemChanged: typeof hasSystemChanged;
    flushPendingChanges: typeof flushPendingChanges;
    migrateToUnifiedProfile: typeof migrateToUnifiedProfile;
    onSessionStartUnified: typeof onSessionStartUnified;
    onSessionEndUnified: typeof onSessionEndUnified;
};
export default _default;
//# sourceMappingURL=unified-persistence.d.ts.map