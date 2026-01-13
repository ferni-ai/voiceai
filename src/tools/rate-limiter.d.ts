/**
 * Rate Limiter for External API Calls
 *
 * Implements token bucket algorithm for rate limiting.
 * Prevents API abuse and handles graceful degradation.
 */
interface RateLimitConfig {
    maxTokens: number;
    refillRate: number;
    refillInterval: number;
}
/**
 * Token bucket rate limiter
 */
export declare class RateLimiter {
    private config;
    private state;
    private name;
    constructor(name: string, config?: Partial<RateLimitConfig>);
    /**
     * Refill tokens based on elapsed time
     */
    private refill;
    /**
     * Try to acquire a token for a request
     * Returns true if allowed, false if rate limited
     */
    tryAcquire(): boolean;
    /**
     * Wait until a token is available (with timeout)
     */
    acquire(timeoutMs?: number): Promise<boolean>;
    /**
     * Get current state (for monitoring)
     */
    getState(): {
        availableTokens: number;
        requestCount: number;
        isLimited: boolean;
    };
    /**
     * Reset the limiter (e.g., for testing)
     */
    reset(): void;
}
/**
 * Get or create a rate limiter for a service
 */
export declare function getRateLimiter(service: string): RateLimiter;
/**
 * Execute a function with rate limiting
 * Falls back to a default value if rate limited
 */
export declare function withRateLimit<T>(service: string, fn: () => Promise<T>, fallback: T): Promise<T>;
/**
 * Execute with rate limiting, waiting if necessary
 */
export declare function withRateLimitWait<T>(service: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
/**
 * Check if a service is currently rate limited
 */
export declare function isRateLimited(service: string): boolean;
/**
 * Get rate limit stats for all services
 */
export declare function getRateLimitStats(): Record<string, {
    availableTokens: number;
    requestCount: number;
    isLimited: boolean;
}>;
/**
 * Reset all rate limiters (for testing)
 */
export declare function resetAllRateLimiters(): void;
declare const _default: {
    RateLimiter: typeof RateLimiter;
    getRateLimiter: typeof getRateLimiter;
    withRateLimit: typeof withRateLimit;
    withRateLimitWait: typeof withRateLimitWait;
    isRateLimited: typeof isRateLimited;
    getRateLimitStats: typeof getRateLimitStats;
    resetAllRateLimiters: typeof resetAllRateLimiters;
};
export default _default;
//# sourceMappingURL=rate-limiter.d.ts.map