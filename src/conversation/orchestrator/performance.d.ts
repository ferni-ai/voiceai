/**
 * Orchestrator Performance Optimizations
 *
 * Provides:
 * - LRU cache for detection results
 * - Circuit breakers for slow/failing systems
 * - Lazy loading helpers
 * - Timeout wrappers
 *
 * @module @ferni/conversation/orchestrator/performance
 */
/**
 * Simple LRU cache with TTL
 */
export declare class LRUCache<K, V> {
    private cache;
    private readonly maxSize;
    private readonly ttlMs;
    constructor(maxSize?: number, ttlMs?: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    get size(): number;
    /**
     * Get or compute value
     */
    getOrCompute(key: K, compute: () => V): V;
    /**
     * Get or compute async value
     */
    getOrComputeAsync(key: K, compute: () => Promise<V>): Promise<V>;
}
export type CircuitState = 'closed' | 'open' | 'half-open';
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time to wait before trying again (ms) */
    resetTimeoutMs: number;
    /** Number of successes needed to close from half-open */
    successThreshold: number;
    /** Name for logging */
    name: string;
}
/**
 * Circuit breaker for protecting against slow/failing systems
 */
export declare class CircuitBreaker {
    private state;
    private failures;
    private successes;
    private lastFailureTime;
    private readonly config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Check if the circuit is open (should skip the operation)
     */
    isOpen(): boolean;
    /**
     * Record a successful operation
     */
    recordSuccess(): void;
    /**
     * Record a failed operation
     */
    recordFailure(): void;
    /**
     * Execute a function with circuit breaker protection
     */
    execute<T>(fn: () => Promise<T>, fallback?: T): Promise<{
        success: boolean;
        value: T | undefined;
        fromCircuit: boolean;
    }>;
    /**
     * Get current state
     */
    getState(): {
        state: CircuitState;
        failures: number;
        successes: number;
    };
    /**
     * Reset the circuit breaker
     */
    reset(): void;
}
/**
 * Execute a function with a timeout
 */
export declare function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, fallback?: T): Promise<{
    value: T | undefined;
    timedOut: boolean;
}>;
/**
 * Lazy loader for modules that should only be loaded when needed
 */
export declare class LazyLoader<T> {
    private instance;
    private loading;
    private readonly loader;
    private readonly name;
    constructor(loader: () => Promise<T>, name?: string);
    /**
     * Get the instance, loading if necessary
     */
    get(): Promise<T>;
    /**
     * Check if already loaded
     */
    isLoaded(): boolean;
    /**
     * Reset (unload)
     */
    reset(): void;
}
/**
 * Get cached detection result
 */
export declare function getCachedDetection<T>(key: string): T | undefined;
/**
 * Set cached detection result
 */
export declare function setCachedDetection<T>(key: string, value: T): void;
/**
 * Get or compute cached detection
 */
export declare function getOrComputeDetection<T>(key: string, compute: () => T): T;
/**
 * Get or compute cached detection, also returning whether it was a cache hit.
 *
 * NOTE: This treats `undefined` as a cache miss. Detection functions in this
 * module should return defined values (booleans/objects), so this is fine.
 */
export declare function getOrComputeDetectionWithHit<T>(key: string, compute: () => T): {
    value: T;
    hit: boolean;
};
/**
 * Clear detection cache
 */
export declare function clearDetectionCache(): void;
/**
 * Get or create a circuit breaker for a system
 */
export declare function getCircuitBreaker(system: 'sessionIntelligence' | 'betterThanHuman' | 'advancedHumanization' | 'deepHumanization', config?: Partial<CircuitBreakerConfig>): CircuitBreaker;
/**
 * Reset all circuit breakers
 */
export declare function resetAllCircuitBreakers(): void;
/**
 * Get status of all circuit breakers
 */
export declare function getCircuitBreakerStatus(): Record<string, {
    state: CircuitState;
    failures: number;
}>;
/**
 * Get performance stats for debugging
 */
export declare function getPerformanceStats(): {
    detectionCacheSize: number;
    circuitBreakers: Record<string, {
        state: CircuitState;
        failures: number;
    }>;
};
/**
 * Reset all performance optimizations
 */
export declare function resetPerformanceOptimizations(): void;
//# sourceMappingURL=performance.d.ts.map