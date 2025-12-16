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

const log = createLogger({ module: 'AsyncEvents' });

// ============================================================================
// TYPES
// ============================================================================

export type EventType =
  // Conversation lifecycle
  | 'conversation:start'
  | 'conversation:end'
  | 'conversation:turn'

  // Trust & relationship
  | 'trust:update'
  | 'trust:milestone'
  | 'relationship:stage-change'

  // Learning & analytics
  | 'analytics:interaction'
  | 'analytics:emotion-detected'
  | 'learning:pattern-detected'
  | 'learning:community-insight'

  // User events
  | 'user:profile-update'
  | 'user:preference-change'

  // Outreach
  | 'outreach:trigger'
  | 'outreach:scheduled';

export interface EventPayload {
  type: EventType;
  timestamp: number;
  sessionId?: string;
  userId?: string;
  personaId?: string;
  data: Record<string, unknown>;
}

export type EventHandler = (payload: EventPayload) => void | Promise<void>;

// ============================================================================
// EVENT BUS
// ============================================================================

class AsyncEventBus {
  private handlers = new Map<EventType, Set<EventHandler>>();
  private queue: EventPayload[] = [];
  private processing = false;
  private usePubSub = false;
  private pubsubClient: unknown = null;
  private topicName = 'ferni-events';

  // Stats
  private stats = {
    emitted: 0,
    processed: 0,
    errors: 0,
    queueHighWater: 0,
  };

  /**
   * Emit an event (fire-and-forget).
   * Returns immediately - processing happens async.
   */
  emit(
    type: EventType,
    data: Record<string, unknown>,
    context?: {
      sessionId?: string;
      userId?: string;
      personaId?: string;
    }
  ): void {
    const payload: EventPayload = {
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
      this.processQueue();
    }
  }

  /**
   * Subscribe to an event type.
   */
  on(type: EventType, handler: EventHandler): () => void {
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
  onAll(handler: EventHandler): () => void {
    // Subscribe to all known event types
    const unsubscribes: Array<() => void> = [];
    const types: EventType[] = [
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
  async enablePubSub(projectId: string, topicName?: string): Promise<void> {
    try {
      // Dynamic import - may not be available in all environments
      // Using Function constructor to avoid TypeScript module resolution
      const moduleName = '@google-cloud/pubsub';
      const importFn = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
      const pubsubModule = (await importFn(moduleName).catch(() => null)) as {
        PubSub?: new (opts: { projectId: string }) => unknown;
      } | null;
      if (!pubsubModule?.PubSub) {
        log.warn('Pub/Sub module not available');
        return;
      }
      const { PubSub } = pubsubModule;
      this.pubsubClient = new PubSub({ projectId });
      this.topicName = topicName || 'ferni-events';
      this.usePubSub = true;
      log.info({ projectId, topicName: this.topicName }, 'Pub/Sub enabled');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to enable Pub/Sub - continuing without');
    }
  }

  /**
   * Get event stats.
   */
  getStats(): typeof this.stats & { queueLength: number; handlerCount: number } {
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
  async flush(): Promise<void> {
    // Process remaining queue
    while (this.queue.length > 0) {
      await this.processNext();
    }
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        await this.processNext();
      }
    } finally {
      this.processing = false;
    }
  }

  private async processNext(): Promise<void> {
    const payload = this.queue.shift();
    if (!payload) return;

    try {
      // Call local handlers
      const handlers = this.handlers.get(payload.type);
      if (handlers) {
        const promises = Array.from(handlers).map((handler) =>
          Promise.resolve(handler(payload)).catch((err) => {
            log.warn({ type: payload.type, error: String(err) }, 'Event handler error');
            this.stats.errors++;
          })
        );

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
    } catch (error) {
      log.warn({ type: payload.type, error: String(error) }, 'Event processing error');
      this.stats.errors++;
    }
  }

  private async publishToPubSub(payload: EventPayload): Promise<void> {
    if (!this.pubsubClient) return;

    // Use type assertion to avoid importing types
    const client = this.pubsubClient as {
      topic: (name: string) => {
        publishMessage: (msg: {
          json: unknown;
          attributes: Record<string, string>;
        }) => Promise<string>;
      };
    };
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
export function emitConversationStart(context: {
  sessionId: string;
  userId: string;
  personaId: string;
  isReturning: boolean;
}): void {
  AsyncEvents.emit(
    'conversation:start',
    {
      isReturning: context.isReturning,
    },
    context
  );
}

/**
 * Emit conversation end event.
 */
export function emitConversationEnd(context: {
  sessionId: string;
  userId: string;
  personaId: string;
  turnCount: number;
  durationMs: number;
  emotionalHighlight?: string;
}): void {
  AsyncEvents.emit(
    'conversation:end',
    {
      turnCount: context.turnCount,
      durationMs: context.durationMs,
      emotionalHighlight: context.emotionalHighlight,
    },
    context
  );
}

/**
 * Emit trust update event.
 */
export function emitTrustUpdate(context: {
  sessionId?: string;
  userId: string;
  personaId: string;
  trustDelta: number;
  reason: string;
}): void {
  AsyncEvents.emit(
    'trust:update',
    {
      trustDelta: context.trustDelta,
      reason: context.reason,
    },
    context
  );
}

/**
 * Emit analytics interaction event.
 */
export function emitAnalyticsInteraction(context: {
  sessionId: string;
  userId: string;
  personaId: string;
  interactionType: string;
  metadata?: Record<string, unknown>;
}): void {
  AsyncEvents.emit(
    'analytics:interaction',
    {
      interactionType: context.interactionType,
      metadata: context.metadata || {},
    },
    context
  );
}

export default AsyncEvents;
