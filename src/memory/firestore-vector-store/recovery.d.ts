/**
 * Firestore Vector Store Recovery
 *
 * Handles automatic recovery when Firestore becomes unavailable,
 * including periodic recovery attempts and cache migration.
 *
 * @module memory/firestore-vector-store/recovery
 */
import type { FirestoreInstance } from './types.js';
import type { FallbackCache } from './fallback-cache.js';
export interface RecoveryState {
    recoveryAttemptCount: number;
    lastRecoveryAttempt: number;
}
export interface RecoveryCallbacks {
    reinitialize: () => Promise<boolean>;
    onRecoverySuccess: () => void;
    isInFallbackMode: () => boolean;
}
/**
 * Manages recovery attempts and cache migration.
 */
export declare class RecoveryManager {
    private state;
    private callbacks;
    constructor(callbacks: RecoveryCallbacks);
    /**
     * Get current recovery state.
     */
    getState(): Readonly<RecoveryState>;
    /**
     * Schedule periodic recovery attempts.
     */
    scheduleRecoveryAttempt(): void;
    /**
     * Attempt to recover Firestore connection.
     */
    attemptRecovery(): Promise<boolean>;
    /**
     * Clean up recovery timer.
     */
    cleanupTimer(): void;
    /**
     * Reset recovery state.
     */
    reset(): void;
}
/**
 * Migrate cached data to Firestore after recovery.
 * Uses batch writes to respect Firestore's 500-operation limit.
 */
export declare function migrateCacheToFirestore(db: FirestoreInstance, collectionName: string, fallbackCache: FallbackCache): Promise<{
    migrated: number;
    failed: number;
}>;
//# sourceMappingURL=recovery.d.ts.map