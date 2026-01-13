/**
 * Batch Analytics Writer
 *
 * Groups non-critical analytics writes for efficiency.
 * Reduces database pressure and improves response times.
 *
 * Key Features:
 * - Automatic batching with configurable thresholds
 * - Priority-based flushing
 * - Graceful degradation on failures
 * - Memory pressure handling
 *
 * @module BatchAnalytics
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'BatchAnalytics' });
// ============================================================================
// BATCH WRITER CLASS
// ============================================================================
/**
 * Batches analytics events for efficient writing
 *
 * @example
 * ```ts
 * const batchWriter = new BatchAnalyticsWriter({
 *   maxBatchSize: 50,
 *   flushIntervalMs: 30000,
 * });
 *
 * // Set the flush handler
 * batchWriter.setFlushHandler(async (events) => {
 *   await firestore.collection('analytics').add(cleanForFirestore({ events }));
 * });
 *
 * // Queue events
 * batchWriter.queue({
 *   type: 'page_view',
 *   timestamp: new Date(),
 *   data: { page: '/home' },
 * });
 *
 * // Shutdown (flushes remaining)
 * await batchWriter.shutdown();
 * ```
 */
export class BatchAnalyticsWriter {
    config;
    buffer = [];
    flushHandler = null;
    flushInterval = null;
    flushing = false;
    failedBatches = [];
    currentMemoryEstimate = 0;
    // Stats
    stats = {
        totalEventsQueued: 0,
        totalEventsFlushed: 0,
        totalBatchesFlushed: 0,
        failedFlushes: 0,
        currentQueueSize: 0,
        avgBatchSize: 0,
        avgFlushLatencyMs: 0,
        lastFlushAt: null,
    };
    flushLatencies = [];
    batchSizes = [];
    constructor(config = {}) {
        this.config = {
            maxBatchSize: config.maxBatchSize ?? 100,
            flushIntervalMs: config.flushIntervalMs ?? 60000,
            maxMemoryBytes: config.maxMemoryBytes ?? 10 * 1024 * 1024, // 10MB
            maxRetries: config.maxRetries ?? 3,
            persistOnFailure: config.persistOnFailure ?? true,
        };
        this.startFlushInterval();
    }
    /**
     * Set the handler that processes batched events
     */
    setFlushHandler(handler) {
        this.flushHandler = handler;
    }
    /**
     * Queue an analytics event
     */
    queue(event) {
        // Estimate memory size
        const eventSize = this.estimateSize(event);
        // Check memory pressure
        if (this.currentMemoryEstimate + eventSize > this.config.maxMemoryBytes) {
            log.warn('Memory pressure - forcing flush');
            void this.flush();
        }
        this.buffer.push({
            ...event,
            priority: event.priority ?? 50,
        });
        this.currentMemoryEstimate += eventSize;
        this.stats.totalEventsQueued++;
        this.stats.currentQueueSize = this.buffer.length;
        // Check if we should flush
        if (this.buffer.length >= this.config.maxBatchSize) {
            void this.flush();
        }
    }
    /**
     * Queue multiple events at once
     */
    queueAll(events) {
        for (const event of events) {
            this.queue(event);
        }
    }
    /**
     * Manually trigger a flush
     */
    async flush() {
        if (this.flushing || this.buffer.length === 0)
            return;
        this.flushing = true;
        const startTime = Date.now();
        // Get events to flush (sorted by priority)
        const toFlush = this.buffer.splice(0, this.config.maxBatchSize);
        toFlush.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
        this.currentMemoryEstimate = this.estimateTotalSize(this.buffer);
        this.stats.currentQueueSize = this.buffer.length;
        try {
            if (this.flushHandler) {
                await this.flushWithRetry(toFlush);
                this.recordFlushSuccess(toFlush.length, Date.now() - startTime);
            }
            else {
                // No handler - just log
                log.debug({ count: toFlush.length }, 'Batch flush (no handler)');
                this.recordFlushSuccess(toFlush.length, Date.now() - startTime);
            }
        }
        catch (error) {
            this.recordFlushFailure(toFlush);
            log.error({ error: String(error), count: toFlush.length }, 'Batch flush failed');
        }
        finally {
            this.flushing = false;
        }
        // Retry failed batches if any
        if (this.failedBatches.length > 0) {
            void this.retryFailedBatches();
        }
    }
    /**
     * Flush with retry logic
     */
    async flushWithRetry(events) {
        let lastError = null;
        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                await this.flushHandler(events);
                return;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < this.config.maxRetries - 1) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise((resolve) => {
                        setTimeout(resolve, delay);
                    });
                }
            }
        }
        throw lastError;
    }
    /**
     * Retry failed batches
     */
    async retryFailedBatches() {
        if (this.failedBatches.length === 0 || !this.flushHandler)
            return;
        const batch = this.failedBatches.shift();
        if (!batch)
            return;
        try {
            await this.flushHandler(batch);
            this.stats.totalEventsFlushed += batch.length;
            log.info({ count: batch.length }, 'Recovered failed batch');
        }
        catch (error) {
            // Put back at end of queue
            this.failedBatches.push(batch);
            log.warn({ error: String(error) }, 'Failed batch retry failed');
        }
    }
    /**
     * Shutdown and flush remaining events
     */
    async shutdown() {
        // Stop interval
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        // Flush remaining buffer
        while (this.buffer.length > 0) {
            await this.flush();
        }
        // Try to flush failed batches
        while (this.failedBatches.length > 0) {
            await this.retryFailedBatches();
        }
        log.info(this.getStats(), '📊 Batch analytics shutdown');
    }
    /**
     * Get current statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Get queue length
     */
    getQueueLength() {
        return this.buffer.length;
    }
    /**
     * Check if there are pending events
     */
    hasPendingEvents() {
        return this.buffer.length > 0 || this.failedBatches.length > 0;
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    startFlushInterval() {
        this.flushInterval = setInterval(() => {
            if (this.buffer.length > 0) {
                void this.flush();
            }
        }, this.config.flushIntervalMs);
    }
    recordFlushSuccess(count, latencyMs) {
        this.stats.totalEventsFlushed += count;
        this.stats.totalBatchesFlushed++;
        this.stats.lastFlushAt = Date.now();
        // Track for averages
        this.flushLatencies.push(latencyMs);
        this.batchSizes.push(count);
        // Keep bounded
        if (this.flushLatencies.length > 100) {
            this.flushLatencies.shift();
            this.batchSizes.shift();
        }
        // Update averages
        this.stats.avgFlushLatencyMs = Math.round(this.flushLatencies.reduce((a, b) => a + b, 0) / this.flushLatencies.length);
        this.stats.avgBatchSize = Math.round(this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length);
    }
    recordFlushFailure(events) {
        this.stats.failedFlushes++;
        if (this.config.persistOnFailure) {
            this.failedBatches.push(events);
        }
    }
    estimateSize(event) {
        try {
            return JSON.stringify(event).length * 2; // UTF-16
        }
        catch {
            return 1000;
        }
    }
    estimateTotalSize(events) {
        return events.reduce((sum, e) => sum + this.estimateSize(e), 0);
    }
}
// ============================================================================
// SINGLETON INSTANCES
// ============================================================================
let globalWriter = null;
/**
 * Get the global batch analytics writer
 */
export function getBatchAnalyticsWriter(config) {
    if (!globalWriter) {
        globalWriter = new BatchAnalyticsWriter(config);
    }
    return globalWriter;
}
/**
 * Initialize the global batch writer with a flush handler
 */
export function initBatchAnalytics(flushHandler, config) {
    const writer = getBatchAnalyticsWriter(config);
    writer.setFlushHandler(flushHandler);
    return writer;
}
/**
 * Queue an analytics event (uses global writer)
 */
export function queueAnalyticsEvent(event) {
    getBatchAnalyticsWriter().queue(event);
}
/**
 * Queue multiple analytics events (uses global writer)
 */
export function queueAnalyticsEvents(events) {
    getBatchAnalyticsWriter().queueAll(events);
}
/**
 * Shutdown the global batch writer
 */
export async function shutdownBatchAnalytics() {
    if (globalWriter) {
        await globalWriter.shutdown();
        globalWriter = null;
    }
}
// ============================================================================
// CONVENIENCE EVENT BUILDERS
// ============================================================================
/**
 * Create a session event
 */
export function createSessionEvent(type, sessionId, userId, data = {}) {
    return {
        type,
        timestamp: new Date(),
        sessionId,
        userId,
        data,
        priority: type === 'session_start' ? 20 : type === 'session_end' ? 30 : 50,
    };
}
/**
 * Create a tool usage event
 */
export function createToolEvent(toolId, sessionId, data = {}) {
    return {
        type: 'tool_usage',
        timestamp: new Date(),
        sessionId,
        data: { toolId, ...data },
        priority: 60, // Lower priority
    };
}
/**
 * Create an emotion detection event
 */
export function createEmotionEvent(emotion, sessionId, data = {}) {
    return {
        type: 'emotion_detected',
        timestamp: new Date(),
        sessionId,
        data: { emotion, ...data },
        priority: 40, // Medium priority
    };
}
/**
 * Create a performance metric event
 */
export function createPerformanceEvent(metricName, value, sessionId, data = {}) {
    return {
        type: 'performance_metric',
        timestamp: new Date(),
        sessionId,
        data: { metricName, value, ...data },
        priority: 70, // Lower priority - batched
    };
}
/**
 * Create an error event
 */
export function createErrorEvent(errorType, message, sessionId, data = {}) {
    return {
        type: 'error',
        timestamp: new Date(),
        sessionId,
        data: { errorType, message, ...data },
        priority: 10, // High priority - flush soon
    };
}
//# sourceMappingURL=batch-analytics.js.map