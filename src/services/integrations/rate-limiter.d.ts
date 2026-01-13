/**
 * Rate Limiter
 *
 * Per-user, per-integration rate limiting to prevent
 * exceeding external API quotas.
 *
 * Uses sliding window algorithm for accurate rate limiting.
 *
 * @module services/integrations/rate-limiter
 */
import type { RateLimitState, RateLimitResult, RateLimitConfig } from './types.js';
export declare class RateLimiter {
    private states;
    private requestTimestamps;
    constructor();
    /**
     * Check if a request is allowed under rate limits
     */
    checkLimit(userId: string, integrationId: string): Promise<RateLimitResult>;
    /**
     * Record that a request was made
     */
    recordRequest(userId: string, integrationId: string): Promise<void>;
    /**
     * Get current rate limit state for a user/integration
     */
    getState(userId: string, integrationId: string): RateLimitState | null;
    /**
     * Reset rate limits for a user/integration (e.g., after token refresh)
     */
    reset(userId: string, integrationId: string): void;
    /**
     * Reset all rate limits for a user
     */
    resetUser(userId: string): void;
    /**
     * Generate cache key for user/integration
     */
    private getKey;
    /**
     * Get timestamps within the current window
     */
    private getTimestamps;
    /**
     * Cleanup old timestamps to prevent memory bloat
     */
    private cleanup;
}
/**
 * Check if an integration has global (not per-user) rate limits
 */
export declare function hasGlobalRateLimit(integrationId: string): boolean;
/**
 * Get the rate limit configuration for an integration
 */
export declare function getRateLimitConfig(integrationId: string): RateLimitConfig | null;
/**
 * Format rate limit for display
 */
export declare function formatRateLimit(config: RateLimitConfig): string;
//# sourceMappingURL=rate-limiter.d.ts.map