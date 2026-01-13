/**
 * Firestore Write-Ahead Log Integration
 *
 * Provides non-blocking Firestore writes for latency-critical paths.
 * Uses WAL to queue writes and batch flush them in the background.
 *
 * Benefits:
 * - Voice agent turns return instantly (no 100-500ms write latency)
 * - Batched writes reduce Firestore API calls and costs
 * - Automatic retry on transient failures
 * - Priority-based write ordering (high > normal > low)
 *
 * Usage:
 * ```typescript
 * // Non-blocking write (returns immediately)
 * queueUserProfileUpdate(userId, { lastSeen: Date.now() });
 *
 * // Await specific flush if needed
 * await flushUserWrites(userId);
 * ```
 *
 * @module services/firestore-wal-integration
 */
import { type WALStats } from './write-ahead-log.js';
/** Write priority levels */
export type WritePriority = 'high' | 'normal' | 'low';
/**
 * Initialize the WAL integration.
 * Call once at application startup.
 */
export declare function initializeFirestoreWAL(): Promise<void>;
/**
 * Shutdown the WAL integration.
 * Flushes all pending writes before returning.
 */
export declare function shutdownFirestoreWAL(): Promise<void>;
/**
 * Queue a user profile update (non-blocking).
 * Returns immediately - write happens in background.
 *
 * @param userId - User ID
 * @param updates - Fields to update (merge with existing)
 * @param priority - Write priority (default: normal)
 * @returns WAL entry ID for tracking
 */
export declare function queueUserProfileUpdate(userId: string, updates: Record<string, unknown>, priority?: WritePriority): string;
/**
 * Queue a user profile set (replaces entire document).
 * Use with caution - prefer merge updates.
 */
export declare function queueUserProfileSet(userId: string, profile: Record<string, unknown>, priority?: WritePriority): string;
/**
 * Queue a write to a user subcollection (non-blocking).
 *
 * @param userId - User ID
 * @param subcollection - Name of subcollection (e.g., 'memories', 'sessions')
 * @param docId - Document ID within subcollection
 * @param data - Document data
 * @param options - Write options
 */
export declare function queueSubcollectionWrite(userId: string, subcollection: string, docId: string, data: Record<string, unknown>, options?: {
    operation?: 'set' | 'merge' | 'update';
    priority?: WritePriority;
}): string;
/**
 * Queue a memory write (non-blocking).
 */
export declare function queueMemoryWrite(userId: string, memoryId: string, memory: Record<string, unknown>, priority?: WritePriority): string;
/**
 * Queue a session data write (non-blocking).
 */
export declare function queueSessionWrite(userId: string, sessionId: string, sessionData: Record<string, unknown>, priority?: WritePriority): string;
/**
 * Queue a high-priority write.
 * High-priority writes are flushed first and retried more aggressively.
 */
export declare function queueHighPriorityWrite(collection: string, docId: string, data: Record<string, unknown>, userId?: string): string;
/**
 * Queue a deletion (non-blocking).
 */
export declare function queueDeletion(collection: string, docId: string, priority?: WritePriority, userId?: string): string;
/**
 * Queue an analytics event (low priority).
 * Analytics writes never block user experience.
 */
export declare function queueAnalyticsEvent(eventId: string, event: Record<string, unknown>, userId?: string): string;
/**
 * Force flush all pending writes for a specific user.
 * Use when you need to ensure data is persisted (e.g., session end).
 */
export declare function flushUserWrites(_userId?: string): Promise<{
    flushed: number;
    failed: number;
}>;
/**
 * Force flush all pending writes.
 */
export declare function flushAllWrites(): Promise<{
    flushed: number;
    failed: number;
}>;
/**
 * Get WAL statistics for monitoring.
 */
export declare function getWALStatistics(): WALStats;
/**
 * Check if WAL is healthy.
 */
export declare function isWALHealthy(): boolean;
export { getWriteAheadLog, type WALStats } from './write-ahead-log.js';
//# sourceMappingURL=firestore-wal-integration.d.ts.map