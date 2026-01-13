/**
 * Rate Limiter Service
 *
 * Provides rate limiting with Redis (persistent) or in-memory (fallback) storage.
 * Redis is recommended for production to ensure rate limits survive server restarts.
 *
 * Usage:
 *   import { rateLimiter } from './rate-limiter.js';
 *   const result = await rateLimiter.check('user:123', 100, 60000);
 *   if (!result.allowed) { // rate limited }
 */
export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Remaining requests in current window */
    remaining: number;
    /** When the window resets (Unix timestamp ms) */
    resetAt: number;
}
/**
 * Rate limiter with automatic backend selection.
 * Uses Redis if available, falls back to in-memory.
 */
export declare const rateLimiter: {
    /**
     * Check if a request is rate limited.
     *
     * @param key - Unique identifier (e.g., 'user:123' or 'ip:1.2.3.4')
     * @param maxRequests - Maximum requests allowed in window
     * @param windowMs - Window duration in milliseconds
     * @returns Rate limit result with allowed, remaining, and resetAt
     */
    check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult>;
    /**
     * Check rate limit synchronously (always uses memory store).
     * Use the async `check` method for Redis support.
     */
    checkSync(key: string, maxRequests: number, windowMs: number): RateLimitResult;
    /**
     * Check if Redis is being used for rate limiting.
     */
    isUsingRedis(): boolean;
    /**
     * Get rate limiter status for health checks.
     */
    getStatus(): {
        backend: "redis" | "memory";
        connected: boolean;
    };
    /**
     * Gracefully close Redis connection (for testing/shutdown).
     */
    close(): Promise<void>;
};
//# sourceMappingURL=rate-limiter.d.ts.map