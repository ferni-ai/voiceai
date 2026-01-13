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
/**
 * Pre-defined channels for common use cases.
 * Using typed channels ensures consistency across the codebase.
 */
export declare const CHANNELS: {
    /** Session events (handoffs, ends, presence) */
    readonly SESSION: "ferni:session";
    /** Cache invalidation events */
    readonly CACHE_INVALIDATION: "ferni:cache:invalidate";
    /** Cross-persona insights */
    readonly INSIGHTS: "ferni:insights";
    /** Circuit breaker state changes */
    readonly CIRCUIT_BREAKER: "ferni:circuit";
    /** User presence updates */
    readonly PRESENCE: "ferni:presence";
    /** Predictive coaching triggers */
    readonly PREDICTIONS: "ferni:predictions";
    /** User events (theme changes, navigation, etc.) */
    readonly USER_EVENTS: "ferni:user-events";
};
export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
declare class RedisPubSubService {
    private publisher;
    private subscriber;
    private handlers;
    private config;
    private initialized;
    private initPromise;
    private stats;
    constructor(config?: PubSubConfig);
    /**
     * Initialize Redis connections for pub/sub
     */
    initialize(): Promise<boolean>;
    private doInitialize;
    /**
     * Check if pub/sub is available
     */
    isAvailable(): boolean;
    /**
     * Publish a message to a channel
     */
    publish<T>(channel: string, data: T): Promise<boolean>;
    /**
     * Subscribe to a channel with a handler
     */
    subscribe<T>(channel: string, handler: MessageHandler<T>): Promise<boolean>;
    /**
     * Unsubscribe from a channel
     */
    unsubscribe(channel: string, handler?: MessageHandler): Promise<void>;
    /**
     * Get pub/sub statistics
     */
    getStats(): typeof this.stats & {
        instanceId: string;
        available: boolean;
    };
    /**
     * Shutdown pub/sub connections
     */
    shutdown(): Promise<void>;
    private handleMessage;
    private addHandler;
    private generateInstanceId;
}
/**
 * Get the Redis Pub/Sub service instance
 */
export declare function getRedisPubSub(): RedisPubSubService;
/**
 * Initialize the Redis Pub/Sub service
 */
export declare function initializeRedisPubSub(): Promise<boolean>;
/**
 * Shutdown the Redis Pub/Sub service
 */
export declare function shutdownRedisPubSub(): Promise<void>;
/**
 * Publish a session event
 */
export declare function publishSessionEvent(event: 'handoff' | 'end' | 'presence' | 'session_start' | 'session_end', data: {
    userId: string;
    sessionId: string;
    personaId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}): Promise<boolean>;
/**
 * Publish a cache invalidation event
 */
export declare function publishCacheInvalidation(cacheType: string, keys: string[]): Promise<boolean>;
/**
 * Publish an insights update
 */
export declare function publishInsightsUpdate(userId: string, insightType: string, data: unknown): Promise<boolean>;
/**
 * Subscribe to session events
 */
export declare function subscribeToSessionEvents(handler: MessageHandler<{
    event: string;
    userId: string;
    sessionId: string;
}>): Promise<boolean>;
/**
 * Subscribe to cache invalidation events
 */
export declare function subscribeToCacheInvalidation(handler: MessageHandler<{
    cacheType: string;
    keys: string[];
}>): Promise<boolean>;
/**
 * Subscribe to insights updates
 */
export declare function subscribeToInsightsUpdates(handler: MessageHandler<{
    userId: string;
    insightType: string;
    data: unknown;
}>): Promise<boolean>;
export { RedisPubSubService };
declare const _default: {
    getRedisPubSub: typeof getRedisPubSub;
    initializeRedisPubSub: typeof initializeRedisPubSub;
    shutdownRedisPubSub: typeof shutdownRedisPubSub;
    publishSessionEvent: typeof publishSessionEvent;
    publishCacheInvalidation: typeof publishCacheInvalidation;
    publishInsightsUpdate: typeof publishInsightsUpdate;
    subscribeToSessionEvents: typeof subscribeToSessionEvents;
    subscribeToCacheInvalidation: typeof subscribeToCacheInvalidation;
    subscribeToInsightsUpdates: typeof subscribeToInsightsUpdates;
    CHANNELS: {
        /** Session events (handoffs, ends, presence) */
        readonly SESSION: "ferni:session";
        /** Cache invalidation events */
        readonly CACHE_INVALIDATION: "ferni:cache:invalidate";
        /** Cross-persona insights */
        readonly INSIGHTS: "ferni:insights";
        /** Circuit breaker state changes */
        readonly CIRCUIT_BREAKER: "ferni:circuit";
        /** User presence updates */
        readonly PRESENCE: "ferni:presence";
        /** Predictive coaching triggers */
        readonly PREDICTIONS: "ferni:predictions";
        /** User events (theme changes, navigation, etc.) */
        readonly USER_EVENTS: "ferni:user-events";
    };
};
export default _default;
//# sourceMappingURL=redis-pubsub.d.ts.map