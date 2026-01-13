/**
 * Write-Ahead Log (WAL) for Firestore Persistence
 *
 * Provides non-blocking writes by queuing operations and batching them.
 * This reduces latency from 100-500ms per write to near-instant returns.
 *
 * Features:
 * - Non-blocking writes (return immediately)
 * - Batch flushing (every 5 seconds or 50 operations)
 * - Automatic retry with exponential backoff
 * - Local fallback on Firestore failures
 * - Metrics for monitoring
 *
 * @module services/write-ahead-log
 */
export interface WALEntry {
    id: string;
    operation: 'set' | 'update' | 'delete' | 'merge';
    collection: string;
    docId: string;
    data?: Record<string, unknown>;
    timestamp: number;
    userId?: string;
    retryCount: number;
    priority: 'high' | 'normal' | 'low';
}
export interface WALStats {
    queueSize: number;
    totalQueued: number;
    totalFlushed: number;
    totalFailed: number;
    avgFlushLatencyMs: number;
    lastFlushTime: number;
    isFlushInProgress: boolean;
}
export interface WALConfig {
    /** Max entries before auto-flush (default: 50) */
    maxQueueSize: number;
    /** Flush interval in ms (default: 5000) */
    flushIntervalMs: number;
    /** Max retries per entry (default: 3) */
    maxRetries: number;
    /** Enable local fallback on persistent failures (default: true) */
    enableLocalFallback: boolean;
}
export declare class WriteAheadLog {
    private queue;
    private config;
    private isFlushInProgress;
    private stats;
    private batchWriter;
    constructor(config?: Partial<WALConfig>);
    /**
     * Configure the batch writer function
     * Called during initialization to inject the Firestore batch writer
     */
    configureBatchWriter(writer: (entries: WALEntry[]) => Promise<{
        success: boolean;
        failedIds: string[];
    }>): void;
    /**
     * Queue a write operation (non-blocking)
     * Returns immediately - the actual write happens in the background
     */
    write(operation: WALEntry['operation'], collection: string, docId: string, data?: Record<string, unknown>, options?: {
        userId?: string;
        priority?: WALEntry['priority'];
    }): string;
    /**
     * Convenience methods for common operations
     */
    set(collection: string, docId: string, data: Record<string, unknown>, options?: {
        userId?: string;
        priority?: WALEntry['priority'];
    }): string;
    update(collection: string, docId: string, data: Record<string, unknown>, options?: {
        userId?: string;
        priority?: WALEntry['priority'];
    }): string;
    merge(collection: string, docId: string, data: Record<string, unknown>, options?: {
        userId?: string;
        priority?: WALEntry['priority'];
    }): string;
    delete(collection: string, docId: string, options?: {
        userId?: string;
        priority?: WALEntry['priority'];
    }): string;
    /**
     * Flush all queued writes to Firestore
     */
    flush(): Promise<{
        flushed: number;
        failed: number;
    }>;
    /**
     * Default batch writer using Firestore
     */
    private defaultBatchWriter;
    /**
     * Get WAL statistics
     */
    getStats(): WALStats;
    /**
     * Start periodic flush timer
     */
    private startPeriodicFlush;
    /**
     * Stop periodic flush and flush remaining entries
     */
    shutdown(): Promise<void>;
    /**
     * Get pending entries (for debugging/monitoring)
     */
    getPendingEntries(): WALEntry[];
    /**
     * Clear all pending entries (for testing)
     */
    clear(): void;
}
/**
 * Get the singleton WAL instance
 */
export declare function getWriteAheadLog(config?: Partial<WALConfig>): WriteAheadLog;
/**
 * Initialize WAL with Firestore batch writer
 * Call this during application startup
 */
export declare function initializeWriteAheadLog(): Promise<WriteAheadLog>;
/**
 * Shutdown WAL gracefully
 * Call this during application shutdown
 */
export declare function shutdownWriteAheadLog(): Promise<void>;
/**
 * Queue a Firestore write (non-blocking)
 */
export declare function queueWrite(operation: WALEntry['operation'], collection: string, docId: string, data?: Record<string, unknown>, options?: {
    userId?: string;
    priority?: WALEntry['priority'];
}): string;
/**
 * Queue a set operation
 */
export declare function queueSet(collection: string, docId: string, data: Record<string, unknown>, options?: {
    userId?: string;
    priority?: WALEntry['priority'];
}): string;
/**
 * Queue an update operation
 */
export declare function queueUpdate(collection: string, docId: string, data: Record<string, unknown>, options?: {
    userId?: string;
    priority?: WALEntry['priority'];
}): string;
/**
 * Queue a merge operation
 */
export declare function queueMerge(collection: string, docId: string, data: Record<string, unknown>, options?: {
    userId?: string;
    priority?: WALEntry['priority'];
}): string;
/**
 * Queue a delete operation
 */
export declare function queueDelete(collection: string, docId: string, options?: {
    userId?: string;
    priority?: WALEntry['priority'];
}): string;
/**
 * Force flush all pending writes
 */
export declare function flushWrites(): Promise<{
    flushed: number;
    failed: number;
}>;
/**
 * Get WAL statistics
 */
export declare function getWALStats(): WALStats;
export default WriteAheadLog;
//# sourceMappingURL=write-ahead-log.d.ts.map