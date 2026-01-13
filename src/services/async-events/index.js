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
import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import { resilienceMetrics } from '../observability/resilience-metrics.js';
const log = createLogger({ module: 'AsyncEvents' });
// ============================================================================
// QUEUE MONITORING CONSTANTS
// ============================================================================
/** Maximum queue depth before backpressure kicks in */
const MAX_QUEUE_DEPTH = 1000;
/** Queue depth at which we start warning */
const WARN_QUEUE_DEPTH = 500;
/** Interval for reporting queue metrics (every 10 seconds) */
const QUEUE_METRICS_INTERVAL_MS = 10_000;
// ============================================================================
// EVENT BUS
// ============================================================================
const ASYNC_EVENTS_METRICS_INTERVAL = 'async-events-metrics';
class AsyncEventBus {
    handlers = new Map();
    queue = [];
    processing = false;
    usePubSub = false;
    pubsubClient = null;
    topicName = 'ferni-events';
    // Stats
    stats = {
        emitted: 0,
        processed: 0,
        errors: 0,
        queueHighWater: 0,
        dropped: 0, // Events dropped due to backpressure
        backpressureEvents: 0,
    };
    // Queue monitoring
    lastMetricsTime = Date.now();
    lastProcessedCount = 0;
    constructor() {
        // Start queue metrics reporting
        this.startMetricsReporting();
    }
    /**
     * Start periodic queue metrics reporting.
     */
    startMetricsReporting() {
        if (hasInterval(ASYNC_EVENTS_METRICS_INTERVAL))
            return;
        registerInterval(ASYNC_EVENTS_METRICS_INTERVAL, () => {
            this.reportQueueMetrics();
        }, QUEUE_METRICS_INTERVAL_MS);
    }
    /**
     * Stop metrics reporting (for cleanup).
     */
    stopMetricsReporting() {
        clearNamedInterval(ASYNC_EVENTS_METRICS_INTERVAL);
    }
    /**
     * Report current queue metrics to resilience monitoring.
     */
    reportQueueMetrics() {
        const now = Date.now();
        const elapsed = (now - this.lastMetricsTime) / 1000; // seconds
        const processedSinceLastReport = this.stats.processed - this.lastProcessedCount;
        const processedPerSecond = elapsed > 0 ? processedSinceLastReport / elapsed : 0;
        // Calculate oldest message age (approximate)
        const oldestMessageAgeMs = this.queue.length > 0 ? now - (this.queue[0]?.timestamp ?? now) : 0;
        // Check if backpressure is active
        const backpressureActive = this.queue.length >= WARN_QUEUE_DEPTH;
        // Report to resilience metrics
        resilienceMetrics.recordQueueMetric('async-events', this.queue.length, oldestMessageAgeMs, processedPerSecond, backpressureActive);
        // Update tracking
        this.lastMetricsTime = now;
        this.lastProcessedCount = this.stats.processed;
        // Log warning if queue is backing up
        if (this.queue.length >= WARN_QUEUE_DEPTH) {
            log.warn({
                queueLength: this.queue.length,
                processedPerSecond: processedPerSecond.toFixed(1),
                oldestMessageAgeMs,
            }, 'AsyncEvents queue backing up');
        }
    }
    /**
     * Emit an event (fire-and-forget).
     * Returns immediately - processing happens async.
     *
     * @returns true if event was queued, false if dropped due to backpressure
     */
    emit(type, data, context) {
        // Backpressure: drop events if queue is too deep
        if (this.queue.length >= MAX_QUEUE_DEPTH) {
            this.stats.dropped++;
            this.stats.backpressureEvents++;
            // Log every 100th dropped event to avoid log spam
            if (this.stats.dropped % 100 === 1) {
                log.error({
                    type,
                    queueLength: this.queue.length,
                    totalDropped: this.stats.dropped,
                }, 'AsyncEvents backpressure - dropping event');
            }
            return false;
        }
        const payload = {
            type,
            timestamp: Date.now(),
            sessionId: context?.sessionId,
            userId: context?.userId,
            personaId: context?.personaId,
            data,
        };
        this.stats.emitted++;
        // Add to queue for processing
        this.queue.push(payload);
        this.stats.queueHighWater = Math.max(this.stats.queueHighWater, this.queue.length);
        // Start processing if not already
        if (!this.processing) {
            void this.processQueue();
        }
        return true;
    }
    /**
     * Subscribe to an event type.
     */
    on(type, handler) {
        let handlers = this.handlers.get(type);
        if (!handlers) {
            handlers = new Set();
            this.handlers.set(type, handlers);
        }
        handlers.add(handler);
        // Return unsubscribe function
        return () => {
            handlers?.delete(handler);
        };
    }
    /**
     * Subscribe to all events.
     */
    onAll(handler) {
        // Subscribe to all known event types
        const unsubscribes = [];
        const types = [
            'conversation:start',
            'conversation:end',
            'conversation:turn',
            'trust:update',
            'trust:milestone',
            'relationship:stage-change',
            'analytics:interaction',
            'analytics:emotion-detected',
            'learning:pattern-detected',
            'learning:community-insight',
            'user:profile-update',
            'user:preference-change',
            'outreach:trigger',
            'outreach:scheduled',
            // Pub/Sub worker events
            'embedding:generate',
            'embedding:batch-generate',
            'embedding:index-memory',
            'embedding:cache-warmup',
            'summarization:conversation',
            'summarization:memory-consolidation',
            'summarization:topic-threading',
            'summarization:emotional-journey',
            'context:warmup',
            // Prediction worker events
            'prediction:observation',
            'prediction:pattern-update',
            'prediction:generate',
            'prediction:surface',
        ];
        for (const type of types) {
            unsubscribes.push(this.on(type, handler));
        }
        return () => {
            for (const unsub of unsubscribes) {
                unsub();
            }
        };
    }
    /**
     * Enable Pub/Sub publishing for background workers.
     * Events will be sent to GCP Pub/Sub in addition to local handlers.
     */
    async enablePubSub(projectId, topicName) {
        try {
            // Dynamic import - may not be available in all environments
            // Using Function constructor to avoid TypeScript module resolution
            const moduleName = '@google-cloud/pubsub';
            const importFn = new Function('m', 'return import(m)');
            const pubsubModule = (await importFn(moduleName).catch(() => null));
            if (!pubsubModule?.PubSub) {
                log.warn('Pub/Sub module not available');
                return;
            }
            const { PubSub } = pubsubModule;
            this.pubsubClient = new PubSub({ projectId });
            this.topicName = topicName || 'ferni-events';
            this.usePubSub = true;
            log.info({ projectId, topicName: this.topicName }, 'Pub/Sub enabled');
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Failed to enable Pub/Sub - continuing without');
        }
    }
    /**
     * Get event stats.
     */
    getStats() {
        let handlerCount = 0;
        for (const handlers of this.handlers.values()) {
            handlerCount += handlers.size;
        }
        return {
            ...this.stats,
            queueLength: this.queue.length,
            handlerCount,
        };
    }
    /**
     * Flush remaining events (call during shutdown).
     */
    async flush() {
        // Process remaining queue
        while (this.queue.length > 0) {
            await this.processNext();
        }
    }
    // ============================================================================
    // PRIVATE
    // ============================================================================
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        try {
            while (this.queue.length > 0) {
                await this.processNext();
            }
        }
        finally {
            this.processing = false;
        }
    }
    async processNext() {
        const payload = this.queue.shift();
        if (!payload)
            return;
        try {
            // Call local handlers
            const handlers = this.handlers.get(payload.type);
            if (handlers) {
                const promises = Array.from(handlers).map(async (handler) => Promise.resolve(handler(payload)).catch((err) => {
                    log.warn({ type: payload.type, error: String(err) }, 'Event handler error');
                    this.stats.errors++;
                }));
                // Don't await - fire and forget (individual errors already logged above)
                void Promise.all(promises);
            }
            // Publish to Pub/Sub if enabled
            if (this.usePubSub && this.pubsubClient) {
                this.publishToPubSub(payload).catch((err) => {
                    log.warn({ type: payload.type, error: String(err) }, 'Pub/Sub publish error');
                });
            }
            this.stats.processed++;
        }
        catch (error) {
            log.warn({ type: payload.type, error: String(error) }, 'Event processing error');
            this.stats.errors++;
        }
    }
    async publishToPubSub(payload) {
        if (!this.pubsubClient)
            return;
        // Use type assertion to avoid importing types
        const client = this.pubsubClient;
        const topic = client.topic(this.topicName);
        await topic.publishMessage({
            json: payload,
            attributes: {
                type: payload.type,
                sessionId: payload.sessionId || '',
                userId: payload.userId || '',
            },
        });
    }
}
// Singleton instance
export const AsyncEvents = new AsyncEventBus();
// ============================================================================
// CONVENIENCE EMITTERS
// ============================================================================
/**
 * Emit conversation start event.
 */
export function emitConversationStart(context) {
    AsyncEvents.emit('conversation:start', {
        isReturning: context.isReturning,
    }, context);
}
/**
 * Emit conversation end event.
 */
export function emitConversationEnd(context) {
    AsyncEvents.emit('conversation:end', {
        turnCount: context.turnCount,
        durationMs: context.durationMs,
        emotionalHighlight: context.emotionalHighlight,
    }, context);
}
/**
 * Emit trust update event.
 */
export function emitTrustUpdate(context) {
    AsyncEvents.emit('trust:update', {
        trustDelta: context.trustDelta,
        reason: context.reason,
    }, context);
}
/**
 * Emit analytics interaction event.
 */
export function emitAnalyticsInteraction(context) {
    AsyncEvents.emit('analytics:interaction', {
        interactionType: context.interactionType,
        metadata: context.metadata || {},
    }, context);
}
// ============================================================================
// PUB/SUB WORKER EMITTERS
// ============================================================================
/**
 * Queue embedding generation (processed by Pub/Sub worker).
 */
export function queueEmbeddingGeneration(text, context) {
    AsyncEvents.emit('embedding:generate', { text, ...context }, context);
}
/**
 * Queue batch embedding generation (processed by Pub/Sub worker).
 */
export function queueBatchEmbeddings(texts, context) {
    AsyncEvents.emit('embedding:batch-generate', { texts, ...context }, context);
}
/**
 * Queue conversation summarization (processed by Pub/Sub worker).
 */
export function queueConversationSummary(context) {
    AsyncEvents.emit('summarization:conversation', {
        turns: context.turns,
        emotionalHighlight: context.emotionalHighlight,
    }, context);
}
/**
 * Queue memory consolidation (processed by Pub/Sub worker).
 */
export function queueMemoryConsolidation(userId) {
    AsyncEvents.emit('summarization:memory-consolidation', {}, { userId });
}
/**
 * Queue context cache warmup (processed by Pub/Sub worker).
 */
export function queueContextWarmup(userId, personaId) {
    AsyncEvents.emit('context:warmup', { userId, personaId }, { userId, personaId });
}
export default AsyncEvents;
//# sourceMappingURL=index.js.map