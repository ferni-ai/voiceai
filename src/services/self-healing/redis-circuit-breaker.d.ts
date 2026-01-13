/**
 * Redis-Backed Circuit Breaker
 *
 * Extends the standard circuit breaker with Redis state persistence
 * for cross-instance state sharing. When one instance trips a circuit,
 * all instances see the same state.
 *
 * USE CASES:
 * - Multi-instance deployments where circuit state must be shared
 * - Prevent one instance from continuing to call a failed service
 *   while others have already tripped the circuit
 * - Consistent failure handling across GCE instances
 *
 * ARCHITECTURE:
 * - Local state for fast synchronous checks (canRequest)
 * - Redis for state persistence and cross-instance sync
 * - Pub/Sub for real-time state propagation
 * - Falls back to local-only if Redis unavailable
 *
 * @module services/self-healing/redis-circuit-breaker
 */
import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from './circuit-breaker.js';
interface RedisCircuitBreakerOptions extends CircuitBreakerOptions {
    /** Redis key prefix (default: 'circuit:') */
    redisKeyPrefix?: string;
    /** How often to sync with Redis in ms (default: 1000) */
    syncIntervalMs?: number;
    /** Whether to use pub/sub for real-time updates (default: true) */
    usePubSub?: boolean;
}
export declare class RedisCircuitBreaker extends CircuitBreaker {
    private redis;
    private redisKeyPrefix;
    private instanceId;
    private syncIntervalMs;
    private lastSyncTime;
    private getIntervalName;
    constructor(name: string, options?: RedisCircuitBreakerOptions);
    /**
     * Initialize Redis connection and start sync
     */
    private initializeRedis;
    /**
     * Load state from Redis (called on startup)
     */
    private loadStateFromRedis;
    /**
     * Sync current state to Redis
     */
    private syncStateToRedis;
    /**
     * Start periodic sync to catch state changes from other instances
     */
    private startPeriodicSync;
    /**
     * Stop periodic sync (call on shutdown)
     */
    stopPeriodicSync(): void;
    /**
     * Check if a request can be made (sync - for fast path)
     * Checks local state first, then Redis if stale
     */
    canRequest(): boolean;
    /**
     * Check if a request can be made (async - includes Redis check)
     * Use this when cross-instance consistency is more important than latency
     */
    canRequestAsync(): Promise<boolean>;
    /**
     * Record a failure and sync to Redis
     */
    recordFailureAndSync(): Promise<void>;
    /**
     * Record a success and sync to Redis
     */
    recordSuccessAndSync(): Promise<void>;
    /**
     * Get extended stats including Redis info
     */
    getExtendedStats(): ReturnType<CircuitBreaker['getStats']> & {
        redisConnected: boolean;
        instanceId: string;
        lastSyncTime: number;
    };
    /**
     * Shutdown the circuit breaker
     */
    shutdown(): Promise<void>;
    private getRedisKey;
    private generateInstanceId;
}
/**
 * Create or get a Redis-backed circuit breaker
 */
export declare function createRedisCircuitBreaker(name: string, options?: RedisCircuitBreakerOptions): RedisCircuitBreaker;
/**
 * Get all Redis circuit breaker stats
 */
export declare function getAllRedisCircuitStats(): Array<ReturnType<RedisCircuitBreaker['getExtendedStats']>>;
/**
 * Shutdown all Redis circuit breakers
 */
export declare function shutdownAllRedisCircuitBreakers(): Promise<void>;
export type { CircuitState };
declare const _default: {
    RedisCircuitBreaker: typeof RedisCircuitBreaker;
    createRedisCircuitBreaker: typeof createRedisCircuitBreaker;
    getAllRedisCircuitStats: typeof getAllRedisCircuitStats;
    shutdownAllRedisCircuitBreakers: typeof shutdownAllRedisCircuitBreakers;
};
export default _default;
//# sourceMappingURL=redis-circuit-breaker.d.ts.map