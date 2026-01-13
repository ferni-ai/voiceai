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
import { createLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../utils/interval-manager.js';
const log = createLogger({ module: 'WriteAheadLog' });
// ============================================================================
// WRITE-AHEAD LOG IMPLEMENTATION
// ============================================================================
const WAL_FLUSH_INTERVAL = 'wal-periodic-flush';
export class WriteAheadLog {
    queue = [];
    config;
    isFlushInProgress = false;
    stats = {
        totalQueued: 0,
        totalFlushed: 0,
        totalFailed: 0,
        flushLatencies: [],
        lastFlushTime: 0,
    };
    // Firestore batch writer (injected to avoid circular deps)
    batchWriter = null;
    constructor(config) {
        this.config = {
            maxQueueSize: 50,
            flushIntervalMs: 5000,
            maxRetries: 3,
            enableLocalFallback: true,
            ...config,
        };
        // Start periodic flush
        this.startPeriodicFlush();
    }
    /**
     * Configure the batch writer function
     * Called during initialization to inject the Firestore batch writer
     */
    configureBatchWriter(writer) {
        this.batchWriter = writer;
    }
    /**
     * Queue a write operation (non-blocking)
     * Returns immediately - the actual write happens in the background
     */
    write(operation, collection, docId, data, options) {
        const entry = {
            id: `wal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            operation,
            collection,
            docId,
            data,
            timestamp: Date.now(),
            userId: options?.userId,
            retryCount: 0,
            priority: options?.priority || 'normal',
        };
        this.queue.push(entry);
        this.stats.totalQueued++;
        // Sort by priority (high first)
        this.queue.sort((a, b) => {
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
        log.debug({
            entryId: entry.id,
            collection,
            docId,
            queueSize: this.queue.length,
        }, 'Write queued');
        // Auto-flush if queue is full
        if (this.queue.length >= this.config.maxQueueSize) {
            void this.flush();
        }
        return entry.id;
    }
    /**
     * Convenience methods for common operations
     */
    set(collection, docId, data, options) {
        return this.write('set', collection, docId, data, options);
    }
    update(collection, docId, data, options) {
        return this.write('update', collection, docId, data, options);
    }
    merge(collection, docId, data, options) {
        return this.write('merge', collection, docId, data, options);
    }
    delete(collection, docId, options) {
        return this.write('delete', collection, docId, undefined, options);
    }
    /**
     * Flush all queued writes to Firestore
     */
    async flush() {
        if (this.isFlushInProgress) {
            log.debug('Flush already in progress, skipping');
            return { flushed: 0, failed: 0 };
        }
        if (this.queue.length === 0) {
            return { flushed: 0, failed: 0 };
        }
        this.isFlushInProgress = true;
        const startTime = Date.now();
        // Take all entries from queue
        const entries = [...this.queue];
        this.queue = [];
        let flushed = 0;
        let failed = 0;
        try {
            if (this.batchWriter) {
                // Use configured batch writer
                const result = await this.batchWriter(entries);
                if (result.success) {
                    flushed = entries.length;
                }
                else {
                    // Re-queue failed entries for retry
                    for (const entry of entries) {
                        if (result.failedIds.includes(entry.id)) {
                            if (entry.retryCount < this.config.maxRetries) {
                                entry.retryCount++;
                                this.queue.push(entry);
                                log.debug({ entryId: entry.id, retryCount: entry.retryCount }, 'Entry re-queued');
                            }
                            else {
                                failed++;
                                this.stats.totalFailed++;
                                log.warn({ entryId: entry.id, collection: entry.collection, docId: entry.docId }, 'Entry failed after max retries');
                            }
                        }
                        else {
                            flushed++;
                        }
                    }
                }
            }
            else {
                // Fallback: use default Firestore batch
                const result = await this.defaultBatchWriter(entries);
                flushed = result.flushed;
                failed = result.failed;
            }
            this.stats.totalFlushed += flushed;
            const latency = Date.now() - startTime;
            this.stats.flushLatencies.push(latency);
            if (this.stats.flushLatencies.length > 100) {
                this.stats.flushLatencies.shift();
            }
            this.stats.lastFlushTime = Date.now();
            log.info({ flushed, failed, latencyMs: latency, queueRemaining: this.queue.length }, 'WAL flush complete');
        }
        catch (error) {
            log.error({ error: String(error), entries: entries.length }, 'WAL flush failed');
            // Re-queue all entries for retry
            for (const entry of entries) {
                if (entry.retryCount < this.config.maxRetries) {
                    entry.retryCount++;
                    this.queue.push(entry);
                }
                else {
                    failed++;
                    this.stats.totalFailed++;
                }
            }
        }
        finally {
            this.isFlushInProgress = false;
        }
        return { flushed, failed };
    }
    /**
     * Default batch writer using Firestore
     */
    async defaultBatchWriter(entries) {
        let flushed = 0;
        let failed = 0;
        try {
            // Dynamic import to avoid circular deps
            const { getFirestoreDb } = await import('./superhuman/firestore-utils.js');
            const db = getFirestoreDb();
            if (!db) {
                // Re-queue all entries
                for (const entry of entries) {
                    if (entry.retryCount < this.config.maxRetries) {
                        entry.retryCount++;
                        this.queue.push(entry);
                    }
                    else {
                        failed++;
                    }
                }
                return { flushed, failed };
            }
            // Use Firestore batch (max 500 operations per batch)
            const BATCH_SIZE = 500;
            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batchEntries = entries.slice(i, i + BATCH_SIZE);
                const batch = db.batch();
                for (const entry of batchEntries) {
                    const docRef = db.collection(entry.collection).doc(entry.docId);
                    switch (entry.operation) {
                        case 'set':
                            batch.set(docRef, entry.data || {});
                            break;
                        case 'update':
                            batch.update(docRef, entry.data || {});
                            break;
                        case 'merge':
                            batch.set(docRef, entry.data || {}, { merge: true });
                            break;
                        case 'delete':
                            batch.delete(docRef);
                            break;
                    }
                }
                await batch.commit();
                flushed += batchEntries.length;
            }
        }
        catch (error) {
            log.error({ error: String(error) }, 'Default batch writer failed');
            // Re-queue for retry
            for (const entry of entries) {
                if (entry.retryCount < this.config.maxRetries) {
                    entry.retryCount++;
                    this.queue.push(entry);
                }
                else {
                    failed++;
                }
            }
        }
        return { flushed, failed };
    }
    /**
     * Get WAL statistics
     */
    getStats() {
        return {
            queueSize: this.queue.length,
            totalQueued: this.stats.totalQueued,
            totalFlushed: this.stats.totalFlushed,
            totalFailed: this.stats.totalFailed,
            avgFlushLatencyMs: this.stats.flushLatencies.length > 0
                ? this.stats.flushLatencies.reduce((a, b) => a + b, 0) / this.stats.flushLatencies.length
                : 0,
            lastFlushTime: this.stats.lastFlushTime,
            isFlushInProgress: this.isFlushInProgress,
        };
    }
    /**
     * Start periodic flush timer
     */
    startPeriodicFlush() {
        if (hasInterval(WAL_FLUSH_INTERVAL))
            return;
        registerInterval(WAL_FLUSH_INTERVAL, () => {
            void this.flush();
        }, this.config.flushIntervalMs);
        log.info({ intervalMs: this.config.flushIntervalMs }, 'WAL periodic flush started');
    }
    /**
     * Stop periodic flush and flush remaining entries
     */
    async shutdown() {
        clearNamedInterval(WAL_FLUSH_INTERVAL);
        // Final flush
        if (this.queue.length > 0) {
            log.info({ remaining: this.queue.length }, 'Flushing remaining WAL entries on shutdown');
            await this.flush();
        }
        log.info('WAL shutdown complete');
    }
    /**
     * Get pending entries (for debugging/monitoring)
     */
    getPendingEntries() {
        return [...this.queue];
    }
    /**
     * Clear all pending entries (for testing)
     */
    clear() {
        this.queue = [];
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let walInstance = null;
/**
 * Get the singleton WAL instance
 */
export function getWriteAheadLog(config) {
    if (!walInstance) {
        walInstance = new WriteAheadLog(config);
    }
    return walInstance;
}
/**
 * Initialize WAL with Firestore batch writer
 * Call this during application startup
 */
export async function initializeWriteAheadLog() {
    const wal = getWriteAheadLog();
    // Configure batch writer with Firestore
    wal.configureBatchWriter(async (entries) => {
        const { getFirestoreDb } = await import('./superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db) {
            return { success: false, failedIds: entries.map((e) => e.id) };
        }
        try {
            const batch = db.batch();
            for (const entry of entries) {
                const docRef = db.collection(entry.collection).doc(entry.docId);
                switch (entry.operation) {
                    case 'set':
                        batch.set(docRef, entry.data || {});
                        break;
                    case 'update':
                        batch.update(docRef, entry.data || {});
                        break;
                    case 'merge':
                        batch.set(docRef, entry.data || {}, { merge: true });
                        break;
                    case 'delete':
                        batch.delete(docRef);
                        break;
                }
            }
            await batch.commit();
            return { success: true, failedIds: [] };
        }
        catch (error) {
            log.error({ error: String(error), entries: entries.length }, 'Batch commit failed');
            return { success: false, failedIds: entries.map((e) => e.id) };
        }
    });
    log.info('WAL initialized with Firestore batch writer');
    return wal;
}
/**
 * Shutdown WAL gracefully
 * Call this during application shutdown
 */
export async function shutdownWriteAheadLog() {
    if (walInstance) {
        await walInstance.shutdown();
        walInstance = null;
    }
}
// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================
/**
 * Queue a Firestore write (non-blocking)
 */
export function queueWrite(operation, collection, docId, data, options) {
    return getWriteAheadLog().write(operation, collection, docId, data, options);
}
/**
 * Queue a set operation
 */
export function queueSet(collection, docId, data, options) {
    return getWriteAheadLog().set(collection, docId, data, options);
}
/**
 * Queue an update operation
 */
export function queueUpdate(collection, docId, data, options) {
    return getWriteAheadLog().update(collection, docId, data, options);
}
/**
 * Queue a merge operation
 */
export function queueMerge(collection, docId, data, options) {
    return getWriteAheadLog().merge(collection, docId, data, options);
}
/**
 * Queue a delete operation
 */
export function queueDelete(collection, docId, options) {
    return getWriteAheadLog().delete(collection, docId, options);
}
/**
 * Force flush all pending writes
 */
export async function flushWrites() {
    return getWriteAheadLog().flush();
}
/**
 * Get WAL statistics
 */
export function getWALStats() {
    return getWriteAheadLog().getStats();
}
export default WriteAheadLog;
//# sourceMappingURL=write-ahead-log.js.map