/**
 * Redis Pub/Sub Service
 *
 * Provides real-time event broadcasting across multiple instances.
 * Essential for multi-instance deployments where events need to propagate
 * to all instances (e.g., session handoffs, cache invalidations, insights).
 *
 * USE CASES:
 * - Session handoff notifications across instances
 * - Real-time insights updates (cross-persona intelligence)
 * - Cache invalidation broadcasts
 * - Circuit breaker state synchronization
 * - User presence updates
 *
 * PERFORMANCE:
 * - Publish latency: ~1-2ms
 * - Subscribe latency: ~0ms (event-driven)
 * - Supports high message throughput
 *
 * @module services/redis-pubsub
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'RedisPubSub' });

// ============================================================================
// TYPES
// ============================================================================

export interface PubSubMessage<T = unknown> {
  channel: string;
  data: T;
  timestamp: number;
  sourceInstanceId: string;
}

export type MessageHandler<T = unknown> = (message: PubSubMessage<T>) => void | Promise<void>;

export interface PubSubConfig {
  /** Instance ID for deduplication (auto-generated if not provided) */
  instanceId?: string;
  /** Whether to ignore messages from self (default: true) */
  ignoreSelf?: boolean;
  /** Message TTL for cleanup (default: 60 seconds) */
  messageTtlSeconds?: number;
}

// ============================================================================
// CHANNEL DEFINITIONS
// ============================================================================

/**
 * Pre-defined channels for common use cases.
 * Using typed channels ensures consistency across the codebase.
 */
export const CHANNELS = {
  /** Session events (handoffs, ends, presence) */
  SESSION: 'ferni:session',
  /** Cache invalidation events */
  CACHE_INVALIDATION: 'ferni:cache:invalidate',
  /** Cross-persona insights */
  INSIGHTS: 'ferni:insights',
  /** Circuit breaker state changes */
  CIRCUIT_BREAKER: 'ferni:circuit',
  /** User presence updates */
  PRESENCE: 'ferni:presence',
  /** Predictive coaching triggers */
  PREDICTIONS: 'ferni:predictions',
  /** User events (theme changes, navigation, etc.) */
  USER_EVENTS: 'ferni:user-events',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// ============================================================================
// REDIS PUB/SUB SERVICE
// ============================================================================

interface RedisClient {
  publish: (channel: string, message: string) => Promise<number>;
  subscribe: (channel: string) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  quit: () => Promise<string>;
  duplicate: () => RedisClient;
}

class RedisPubSubService {
  private publisher: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private config: Required<PubSubConfig>;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private stats = {
    published: 0,
    received: 0,
    errors: 0,
    ignored: 0,
  };

  constructor(config: PubSubConfig = {}) {
    this.config = {
      instanceId: config.instanceId ?? this.generateInstanceId(),
      ignoreSelf: config.ignoreSelf ?? true,
      messageTtlSeconds: config.messageTtlSeconds ?? 60,
    };
  }

  /**
   * Initialize Redis connections for pub/sub
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise.then(() => this.initialized);

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initPromise = null;
    return this.initialized;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Check if Redis is configured
      if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        log.debug('Redis not configured, pub/sub disabled');
        return;
      }

      // Dynamic import to avoid loading Redis unless needed
      const Redis = (await import('ioredis')).default;

      const redisUrl =
        process.env.REDIS_URL ||
        `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;

      // Create publisher connection
      this.publisher = new Redis(redisUrl, {
        keyPrefix: '',
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      }) as unknown as RedisClient;

      // Create subscriber connection (must be separate for pub/sub)
      this.subscriber = (this.publisher as unknown as { duplicate: () => RedisClient }).duplicate();

      // Add error handlers
      this.publisher.on('error', (error) => {
        log.debug({ error: String(error) }, 'Redis publisher error (non-fatal)');
      });

      this.subscriber.on('error', (error) => {
        log.debug({ error: String(error) }, 'Redis subscriber error (non-fatal)');
      });

      // Set up message handler
      this.subscriber.on('message', (channel: unknown, message: unknown) => {
        if (typeof channel === 'string' && typeof message === 'string') {
          this.handleMessage(channel, message);
        }
      });

      // Connect
      await (this.publisher as unknown as { connect: () => Promise<void> }).connect();
      await (this.subscriber as unknown as { connect: () => Promise<void> }).connect();

      this.initialized = true;
      log.info({ instanceId: this.config.instanceId }, '🚀 Redis Pub/Sub initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Redis Pub/Sub initialization failed');
      this.publisher = null;
      this.subscriber = null;
    }
  }

  /**
   * Check if pub/sub is available
   */
  isAvailable(): boolean {
    return this.initialized && this.publisher !== null && this.subscriber !== null;
  }

  /**
   * Publish a message to a channel
   */
  async publish<T>(channel: string, data: T): Promise<boolean> {
    if (!this.publisher) {
      return false;
    }

    try {
      const message: PubSubMessage<T> = {
        channel,
        data,
        timestamp: Date.now(),
        sourceInstanceId: this.config.instanceId,
      };

      await this.publisher.publish(channel, JSON.stringify(message));
      this.stats.published++;

      log.debug({ channel, instanceId: this.config.instanceId }, 'Message published');
      return true;
    } catch (error) {
      this.stats.errors++;
      log.warn({ error: String(error), channel }, 'Publish failed');
      return false;
    }
  }

  /**
   * Subscribe to a channel with a handler
   */
  async subscribe<T>(channel: string, handler: MessageHandler<T>): Promise<boolean> {
    if (!this.subscriber) {
      // Store handler anyway for potential later connection
      this.addHandler(channel, handler as MessageHandler);
      return false;
    }

    try {
      // Add handler first
      const isNewChannel = !this.handlers.has(channel);
      this.addHandler(channel, handler as MessageHandler);

      // Subscribe if this is a new channel
      if (isNewChannel) {
        await this.subscriber.subscribe(channel);
        log.debug({ channel }, 'Subscribed to channel');
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      log.warn({ error: String(error), channel }, 'Subscribe failed');
      return false;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    if (handler) {
      // Remove specific handler
      const handlers = this.handlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(channel);
        }
      }
    } else {
      // Remove all handlers for channel
      this.handlers.delete(channel);
    }

    // Unsubscribe from Redis if no more handlers
    if (!this.handlers.has(channel) && this.subscriber) {
      try {
        await this.subscriber.unsubscribe(channel);
        log.debug({ channel }, 'Unsubscribed from channel');
      } catch (error) {
        log.debug({ error: String(error), channel }, 'Unsubscribe failed');
      }
    }
  }

  /**
   * Get pub/sub statistics
   */
  getStats(): typeof this.stats & { instanceId: string; available: boolean } {
    return {
      ...this.stats,
      instanceId: this.config.instanceId,
      available: this.isAvailable(),
    };
  }

  /**
   * Shutdown pub/sub connections
   */
  async shutdown(): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }
      this.initialized = false;
      this.handlers.clear();
      log.info('Redis Pub/Sub shutdown complete');
    } catch (error) {
      log.warn({ error: String(error) }, 'Pub/Sub shutdown error');
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private handleMessage(channel: string, rawMessage: string): void {
    try {
      const message = JSON.parse(rawMessage) as PubSubMessage;

      // Ignore self if configured
      if (this.config.ignoreSelf && message.sourceInstanceId === this.config.instanceId) {
        this.stats.ignored++;
        return;
      }

      // Check message age
      const age = Date.now() - message.timestamp;
      if (age > this.config.messageTtlSeconds * 1000) {
        this.stats.ignored++;
        log.debug({ channel, ageMs: age }, 'Ignoring stale message');
        return;
      }

      this.stats.received++;

      // Dispatch to handlers
      const handlers = this.handlers.get(channel);
      if (handlers) {
        for (const handler of handlers) {
          try {
            const result = handler(message);
            if (result instanceof Promise) {
              result.catch((error) => {
                log.warn({ error: String(error), channel }, 'Handler error');
              });
            }
          } catch (error) {
            log.warn({ error: String(error), channel }, 'Handler error');
          }
        }
      }
    } catch (error) {
      this.stats.errors++;
      log.debug({ error: String(error), channel }, 'Failed to parse message');
    }
  }

  private addHandler(channel: string, handler: MessageHandler): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
  }

  private generateInstanceId(): string {
    const hostname = process.env.HOSTNAME || process.env.K_REVISION || 'local';
    const random = Math.random().toString(36).substring(2, 8);
    return `${hostname}-${random}`;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pubsubInstance: RedisPubSubService | null = null;

/**
 * Get the Redis Pub/Sub service instance
 */
export function getRedisPubSub(): RedisPubSubService {
  if (!pubsubInstance) {
    pubsubInstance = new RedisPubSubService();
  }
  return pubsubInstance;
}

/**
 * Initialize the Redis Pub/Sub service
 */
export async function initializeRedisPubSub(): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.initialize();
}

/**
 * Shutdown the Redis Pub/Sub service
 */
export async function shutdownRedisPubSub(): Promise<void> {
  if (pubsubInstance) {
    await pubsubInstance.shutdown();
    pubsubInstance = null;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Publish a session event
 */
export async function publishSessionEvent(
  event: 'handoff' | 'end' | 'presence' | 'session_start' | 'session_end',
  data: {
    userId: string;
    sessionId: string;
    personaId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.publish(CHANNELS.SESSION, { event, ...data });
}

/**
 * Publish a cache invalidation event
 */
export async function publishCacheInvalidation(
  cacheType: string,
  keys: string[]
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.publish(CHANNELS.CACHE_INVALIDATION, { cacheType, keys });
}

/**
 * Publish an insights update
 */
export async function publishInsightsUpdate(
  userId: string,
  insightType: string,
  data: unknown
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.publish(CHANNELS.INSIGHTS, { userId, insightType, data });
}

/**
 * Subscribe to session events
 */
export async function subscribeToSessionEvents(
  handler: MessageHandler<{ event: string; userId: string; sessionId: string }>
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.subscribe(CHANNELS.SESSION, handler);
}

/**
 * Subscribe to cache invalidation events
 */
export async function subscribeToCacheInvalidation(
  handler: MessageHandler<{ cacheType: string; keys: string[] }>
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.subscribe(CHANNELS.CACHE_INVALIDATION, handler);
}

/**
 * Subscribe to insights updates
 */
export async function subscribeToInsightsUpdates(
  handler: MessageHandler<{ userId: string; insightType: string; data: unknown }>
): Promise<boolean> {
  const pubsub = getRedisPubSub();
  return pubsub.subscribe(CHANNELS.INSIGHTS, handler);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { RedisPubSubService };
export default {
  getRedisPubSub,
  initializeRedisPubSub,
  shutdownRedisPubSub,
  publishSessionEvent,
  publishCacheInvalidation,
  publishInsightsUpdate,
  subscribeToSessionEvents,
  subscribeToCacheInvalidation,
  subscribeToInsightsUpdates,
  CHANNELS,
};
