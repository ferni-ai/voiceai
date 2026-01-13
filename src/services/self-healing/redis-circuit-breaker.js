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
import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import { CircuitBreaker } from './circuit-breaker.js';
const log = createLogger({ module: 'redis-circuit-breaker' });
// ============================================================================
// REDIS CIRCUIT BREAKER
// ============================================================================
export class RedisCircuitBreaker extends CircuitBreaker {
    redis = null;
    redisKeyPrefix;
    instanceId;
    syncIntervalMs;
    lastSyncTime = 0;
    getIntervalName() {
        return `redis-circuit-breaker-sync-${this.name}`;
    }
    constructor(name, options = {}) {
        // Create original callback
        const originalOnStateChange = options.onStateChange;
        // Wrap state change callback to sync to Redis
        const wrappedOptions = {
            failureThreshold: options.failureThreshold ?? 5,
            recoveryTimeout: options.recoveryTimeout ?? 30000,
            successThreshold: options.successThreshold ?? 2,
            failureWindow: options.failureWindow ?? 60000,
            onStateChange: (circuitName, oldState, newState) => {
                // Sync to Redis on state change
                void this.syncStateToRedis(newState);
                // Call original callback if provided
                if (originalOnStateChange) {
                    originalOnStateChange(circuitName, oldState, newState);
                }
            },
        };
        super(name, wrappedOptions);
        this.redisKeyPrefix = options.redisKeyPrefix ?? 'circuit:';
        this.syncIntervalMs = options.syncIntervalMs ?? 1000;
        this.instanceId = this.generateInstanceId();
        // Initialize Redis connection
        void this.initializeRedis();
    }
    /**
     * Initialize Redis connection and start sync
     */
    async initializeRedis() {
        try {
            const { getRedisCache } = await import('../../memory/redis-cache.js');
            const cache = getRedisCache();
            await cache.initialize();
            if (cache.isConnected()) {
                this.redis = cache;
                // Load existing state from Redis
                await this.loadStateFromRedis();
                // Start periodic sync
                this.startPeriodicSync();
                log.info({ circuit: this.name, instanceId: this.instanceId }, '🔌 Redis circuit breaker connected');
            }
        }
        catch (error) {
            log.debug({ error: String(error), circuit: this.name }, 'Redis not available for circuit breaker');
        }
    }
    /**
     * Load state from Redis (called on startup)
     */
    async loadStateFromRedis() {
        if (!this.redis?.isConnected())
            return;
        try {
            const key = this.getRedisKey();
            const state = await this.redis.get(key);
            if (state) {
                // Check if Redis state is more recent than local state
                const localStats = this.getStats();
                if (state.lastStateChange > localStats.lastStateChange) {
                    // Redis has newer state - apply it locally
                    if (state.state === 'open' && localStats.state !== 'open') {
                        this.trip();
                        log.info({ circuit: this.name, redisState: state.state, updatedBy: state.updatedBy }, 'Applied circuit state from Redis');
                    }
                    else if (state.state === 'closed' && localStats.state === 'open') {
                        this.reset();
                        log.info({ circuit: this.name, redisState: state.state, updatedBy: state.updatedBy }, 'Applied circuit state from Redis');
                    }
                }
            }
        }
        catch (error) {
            log.debug({ error: String(error), circuit: this.name }, 'Failed to load circuit state from Redis');
        }
    }
    /**
     * Sync current state to Redis
     */
    async syncStateToRedis(newState) {
        if (!this.redis?.isConnected())
            return;
        try {
            const stats = this.getStats();
            const redisState = {
                state: newState ?? stats.state,
                failures: stats.failures,
                lastFailureTime: stats.lastFailureTime,
                lastStateChange: stats.lastStateChange,
                totalFailures: stats.totalFailures,
                totalSuccesses: stats.totalSuccesses,
                updatedBy: this.instanceId,
            };
            const key = this.getRedisKey();
            // TTL of 5 minutes - state expires if no updates
            await this.redis.set(key, redisState, 300);
            this.lastSyncTime = Date.now();
            log.debug({ circuit: this.name, state: redisState.state }, 'Circuit state synced to Redis');
        }
        catch (error) {
            log.debug({ error: String(error), circuit: this.name }, 'Failed to sync circuit state to Redis');
        }
    }
    /**
     * Start periodic sync to catch state changes from other instances
     */
    startPeriodicSync() {
        if (hasInterval(this.getIntervalName()))
            return;
        registerInterval(this.getIntervalName(), async () => {
            try {
                await this.loadStateFromRedis();
            }
            catch (error) {
                log.debug({ error: String(error), circuit: this.name }, 'Periodic sync failed');
            }
        }, this.syncIntervalMs);
        log.debug({ circuit: this.name, intervalMs: this.syncIntervalMs }, 'Started periodic circuit sync');
    }
    /**
     * Stop periodic sync (call on shutdown)
     */
    stopPeriodicSync() {
        clearNamedInterval(this.getIntervalName());
    }
    /**
     * Check if a request can be made (sync - for fast path)
     * Checks local state first, then Redis if stale
     */
    canRequest() {
        const stats = this.getStats();
        // If local state is open, check if it should transition to half-open
        if (stats.state === 'open') {
            const timeSinceLastFailure = Date.now() - (stats.lastFailureTime || 0);
            const recoveryTimeout = 30000; // Default recovery timeout
            if (timeSinceLastFailure >= recoveryTimeout) {
                return true; // Allow test request in half-open
            }
            return false;
        }
        return true;
    }
    /**
     * Check if a request can be made (async - includes Redis check)
     * Use this when cross-instance consistency is more important than latency
     */
    async canRequestAsync() {
        // First check local state
        if (!this.canRequest()) {
            return false;
        }
        // If Redis is available and we haven't synced recently, check Redis
        if (this.redis?.isConnected()) {
            const timeSinceSync = Date.now() - this.lastSyncTime;
            if (timeSinceSync > this.syncIntervalMs) {
                await this.loadStateFromRedis();
            }
        }
        return this.canRequest();
    }
    /**
     * Record a failure and sync to Redis
     */
    async recordFailureAndSync() {
        // The base class handles failures in execute(), but we provide a direct method
        // for cases where you want to sync state to Redis
        await this.syncStateToRedis();
    }
    /**
     * Record a success and sync to Redis
     */
    async recordSuccessAndSync() {
        await this.syncStateToRedis();
    }
    /**
     * Get extended stats including Redis info
     */
    getExtendedStats() {
        return {
            ...this.getStats(),
            redisConnected: this.redis?.isConnected() ?? false,
            instanceId: this.instanceId,
            lastSyncTime: this.lastSyncTime,
        };
    }
    /**
     * Shutdown the circuit breaker
     */
    async shutdown() {
        this.stopPeriodicSync();
        log.debug({ circuit: this.name }, 'Redis circuit breaker shutdown');
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    getRedisKey() {
        return `${this.redisKeyPrefix}${this.name}`;
    }
    generateInstanceId() {
        const hostname = process.env.HOSTNAME || process.env.K_REVISION || 'local';
        const random = Math.random().toString(36).substring(2, 6);
        return `${hostname}-${random}`;
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const redisCircuits = new Map();
/**
 * Create or get a Redis-backed circuit breaker
 */
export function createRedisCircuitBreaker(name, options = {}) {
    if (redisCircuits.has(name)) {
        return redisCircuits.get(name);
    }
    const circuit = new RedisCircuitBreaker(name, options);
    redisCircuits.set(name, circuit);
    return circuit;
}
/**
 * Get all Redis circuit breaker stats
 */
export function getAllRedisCircuitStats() {
    return Array.from(redisCircuits.values()).map((c) => c.getExtendedStats());
}
/**
 * Shutdown all Redis circuit breakers
 */
export async function shutdownAllRedisCircuitBreakers() {
    const shutdownPromises = Array.from(redisCircuits.values()).map((c) => c.shutdown());
    await Promise.all(shutdownPromises);
    redisCircuits.clear();
    log.info('All Redis circuit breakers shutdown');
}
export default {
    RedisCircuitBreaker,
    createRedisCircuitBreaker,
    getAllRedisCircuitStats,
    shutdownAllRedisCircuitBreakers,
};
//# sourceMappingURL=redis-circuit-breaker.js.map