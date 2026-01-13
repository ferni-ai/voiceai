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
export interface BatchConfig {
    /** Max events before auto-flush (default: 100) */
    maxBatchSize?: number;
    /** Max time before auto-flush in ms (default: 60000 = 1 minute) */
    flushIntervalMs?: number;
    /** Max memory for buffer in bytes (default: 10MB) */
    maxMemoryBytes?: number;
    /** Number of retries on failure (default: 3) */
    maxRetries?: number;
    /** Enable persistence for failed batches (default: true) */
    persistOnFailure?: boolean;
}
export interface AnalyticsEvent {
    /** Event type */
    type: string;
    /** Event timestamp */
    timestamp: Date;
    /** Session ID */
    sessionId?: string;
    /** User ID */
    userId?: string;
    /** Event data */
    data: Record<string, unknown>;
    /** Priority (lower = more important) */
    priority?: number;
}
export interface BatchStats {
    totalEventsQueued: number;
    totalEventsFlushed: number;
    totalBatchesFlushed: number;
    failedFlushes: number;
    currentQueueSize: number;
    avgBatchSize: number;
    avgFlushLatencyMs: number;
    lastFlushAt: number | null;
}
type FlushHandler = (events: AnalyticsEvent[]) => Promise<void>;
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
export declare class BatchAnalyticsWriter {
    private config;
    private buffer;
    private flushHandler;
    private flushInterval;
    private flushing;
    private failedBatches;
    private currentMemoryEstimate;
    private stats;
    private flushLatencies;
    private batchSizes;
    constructor(config?: BatchConfig);
    /**
     * Set the handler that processes batched events
     */
    setFlushHandler(handler: FlushHandler): void;
    /**
     * Queue an analytics event
     */
    queue(event: AnalyticsEvent): void;
    /**
     * Queue multiple events at once
     */
    queueAll(events: AnalyticsEvent[]): void;
    /**
     * Manually trigger a flush
     */
    flush(): Promise<void>;
    /**
     * Flush with retry logic
     */
    private flushWithRetry;
    /**
     * Retry failed batches
     */
    private retryFailedBatches;
    /**
     * Shutdown and flush remaining events
     */
    shutdown(): Promise<void>;
    /**
     * Get current statistics
     */
    getStats(): BatchStats;
    /**
     * Get queue length
     */
    getQueueLength(): number;
    /**
     * Check if there are pending events
     */
    hasPendingEvents(): boolean;
    private startFlushInterval;
    private recordFlushSuccess;
    private recordFlushFailure;
    private estimateSize;
    private estimateTotalSize;
}
/**
 * Get the global batch analytics writer
 */
export declare function getBatchAnalyticsWriter(config?: BatchConfig): BatchAnalyticsWriter;
/**
 * Initialize the global batch writer with a flush handler
 */
export declare function initBatchAnalytics(flushHandler: FlushHandler, config?: BatchConfig): BatchAnalyticsWriter;
/**
 * Queue an analytics event (uses global writer)
 */
export declare function queueAnalyticsEvent(event: AnalyticsEvent): void;
/**
 * Queue multiple analytics events (uses global writer)
 */
export declare function queueAnalyticsEvents(events: AnalyticsEvent[]): void;
/**
 * Shutdown the global batch writer
 */
export declare function shutdownBatchAnalytics(): Promise<void>;
/**
 * Create a session event
 */
export declare function createSessionEvent(type: 'session_start' | 'session_end' | 'session_activity', sessionId: string, userId: string, data?: Record<string, unknown>): AnalyticsEvent;
/**
 * Create a tool usage event
 */
export declare function createToolEvent(toolId: string, sessionId: string, data?: Record<string, unknown>): AnalyticsEvent;
/**
 * Create an emotion detection event
 */
export declare function createEmotionEvent(emotion: string, sessionId: string, data?: Record<string, unknown>): AnalyticsEvent;
/**
 * Create a performance metric event
 */
export declare function createPerformanceEvent(metricName: string, value: number, sessionId?: string, data?: Record<string, unknown>): AnalyticsEvent;
/**
 * Create an error event
 */
export declare function createErrorEvent(errorType: string, message: string, sessionId?: string, data?: Record<string, unknown>): AnalyticsEvent;
export {};
//# sourceMappingURL=batch-analytics.d.ts.map