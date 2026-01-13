/**
 * Async Event System
 *
 * Fire-and-forget event publishing for non-critical operations.
 * Events can be processed locally (in-process) or sent to Pub/Sub
 * for background worker processing.
 *
 * This enables:
 * - Zero-latency event dispatch (doesn't block voice agent)
 * - Background processing of analytics, learning, trust updates
 * - Future migration to microservices via Pub/Sub
 *
 * Usage:
 * ```ts
 * // Fire-and-forget (doesn't block)
 * AsyncEvents.emit('conversation:end', { userId, sessionData });
 *
 * // Subscribe to events (for local processing)
 * AsyncEvents.on('conversation:end', async (data) => {
 *   await updateTrustMetrics(data);
 * });
 * ```
 */
export type EventType = 'conversation:start' | 'conversation:end' | 'conversation:turn' | 'trust:update' | 'trust:milestone' | 'relationship:stage-change' | 'analytics:interaction' | 'analytics:emotion-detected' | 'learning:pattern-detected' | 'learning:community-insight' | 'user:profile-update' | 'user:preference-change' | 'outreach:trigger' | 'outreach:scheduled' | 'embedding:generate' | 'embedding:batch-generate' | 'embedding:index-memory' | 'embedding:cache-warmup' | 'summarization:conversation' | 'summarization:memory-consolidation' | 'summarization:topic-threading' | 'summarization:emotional-journey' | 'context:warmup' | 'prediction:observation' | 'prediction:pattern-update' | 'prediction:generate' | 'prediction:surface';
export interface EventPayload {
    type: EventType;
    timestamp: number;
    sessionId?: string;
    userId?: string;
    personaId?: string;
    data: Record<string, unknown>;
}
export type EventHandler = (payload: EventPayload) => void | Promise<void>;
declare class AsyncEventBus {
    private handlers;
    private queue;
    private processing;
    private usePubSub;
    private pubsubClient;
    private topicName;
    private stats;
    private lastMetricsTime;
    private lastProcessedCount;
    constructor();
    /**
     * Start periodic queue metrics reporting.
     */
    private startMetricsReporting;
    /**
     * Stop metrics reporting (for cleanup).
     */
    stopMetricsReporting(): void;
    /**
     * Report current queue metrics to resilience monitoring.
     */
    private reportQueueMetrics;
    /**
     * Emit an event (fire-and-forget).
     * Returns immediately - processing happens async.
     *
     * @returns true if event was queued, false if dropped due to backpressure
     */
    emit(type: EventType, data: Record<string, unknown>, context?: {
        sessionId?: string;
        userId?: string;
        personaId?: string;
    }): boolean;
    /**
     * Subscribe to an event type.
     */
    on(type: EventType, handler: EventHandler): () => void;
    /**
     * Subscribe to all events.
     */
    onAll(handler: EventHandler): () => void;
    /**
     * Enable Pub/Sub publishing for background workers.
     * Events will be sent to GCP Pub/Sub in addition to local handlers.
     */
    enablePubSub(projectId: string, topicName?: string): Promise<void>;
    /**
     * Get event stats.
     */
    getStats(): typeof this.stats & {
        queueLength: number;
        handlerCount: number;
    };
    /**
     * Flush remaining events (call during shutdown).
     */
    flush(): Promise<void>;
    private processQueue;
    private processNext;
    private publishToPubSub;
}
export declare const AsyncEvents: AsyncEventBus;
/**
 * Emit conversation start event.
 */
export declare function emitConversationStart(context: {
    sessionId: string;
    userId: string;
    personaId: string;
    isReturning: boolean;
}): void;
/**
 * Emit conversation end event.
 */
export declare function emitConversationEnd(context: {
    sessionId: string;
    userId: string;
    personaId: string;
    turnCount: number;
    durationMs: number;
    emotionalHighlight?: string;
}): void;
/**
 * Emit trust update event.
 */
export declare function emitTrustUpdate(context: {
    sessionId?: string;
    userId: string;
    personaId: string;
    trustDelta: number;
    reason: string;
}): void;
/**
 * Emit analytics interaction event.
 */
export declare function emitAnalyticsInteraction(context: {
    sessionId: string;
    userId: string;
    personaId: string;
    interactionType: string;
    metadata?: Record<string, unknown>;
}): void;
/**
 * Queue embedding generation (processed by Pub/Sub worker).
 */
export declare function queueEmbeddingGeneration(text: string, context?: {
    userId?: string;
    sessionId?: string;
}): void;
/**
 * Queue batch embedding generation (processed by Pub/Sub worker).
 */
export declare function queueBatchEmbeddings(texts: string[], context?: {
    userId?: string;
    sessionId?: string;
}): void;
/**
 * Queue conversation summarization (processed by Pub/Sub worker).
 */
export declare function queueConversationSummary(context: {
    userId: string;
    sessionId: string;
    turns: unknown[];
    emotionalHighlight?: string;
}): void;
/**
 * Queue memory consolidation (processed by Pub/Sub worker).
 */
export declare function queueMemoryConsolidation(userId: string): void;
/**
 * Queue context cache warmup (processed by Pub/Sub worker).
 */
export declare function queueContextWarmup(userId: string, personaId: string): void;
export default AsyncEvents;
//# sourceMappingURL=index.d.ts.map