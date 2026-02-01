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

import { createLogger } from '../../utils/safe-logger.js';
import type { RateLimitState, RateLimitResult, RateLimitConfig } from './types.js';
import { INTEGRATIONS } from './integration-hub.js';

const log = createLogger({ module: 'rate-limiter' });

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

export class RateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private requestTimestamps: Map<string, number[]> = new Map();

  constructor() {
    // Clean up old timestamps periodically
    setInterval(() => this.cleanup(), 60000);
  }

  // ==========================================================================
  // CHECK LIMIT
  // ==========================================================================

  /**
   * Check if a request is allowed under rate limits
   */
  async checkLimit(userId: string, integrationId: string): Promise<RateLimitResult> {
    const integration = INTEGRATIONS[integrationId];
    if (!integration) {
      // Unknown integration - allow but log warning
      log.warn({ integrationId }, 'Rate limit check for unknown integration');
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date(),
      };
    }

    const config = integration.rateLimits;
    const key = this.getKey(userId, integrationId);

    // Get current state
    const timestamps = this.getTimestamps(key, config.windowMs);
    const currentCount = timestamps.length;

    if (currentCount >= config.requests) {
      // Rate limit exceeded
      const oldestTimestamp = timestamps[0];
      const resetAt = new Date(oldestTimestamp + config.windowMs);
      const retryAfter = resetAt.getTime() - Date.now();

      log.warn(
        { userId, integrationId, currentCount, limit: config.requests },
        'Rate limit exceeded'
      );

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    // Calculate remaining
    const remaining = config.requests - currentCount;
    const resetAt =
      timestamps.length > 0
        ? new Date(timestamps[0] + config.windowMs)
        : new Date(Date.now() + config.windowMs);

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  // ==========================================================================
  // RECORD REQUEST
  // ==========================================================================

  /**
   * Record that a request was made
   */
  async recordRequest(userId: string, integrationId: string): Promise<void> {
    const key = this.getKey(userId, integrationId);
    const timestamps = this.requestTimestamps.get(key) || [];
    timestamps.push(Date.now());
    this.requestTimestamps.set(key, timestamps);
  }

  // ==========================================================================
  // GET STATE
  // ==========================================================================

  /**
   * Get current rate limit state for a user/integration
   */
  getState(userId: string, integrationId: string): RateLimitState | null {
    const integration = INTEGRATIONS[integrationId];
    if (!integration) {
      return null;
    }

    const key = this.getKey(userId, integrationId);
    const config = integration.rateLimits;
    const timestamps = this.getTimestamps(key, config.windowMs);

    return {
      integrationId,
      userId,
      requestCount: timestamps.length,
      windowStart: timestamps.length > 0 ? new Date(timestamps[0]) : new Date(),
      blocked: timestamps.length >= config.requests,
      retryAfter:
        timestamps.length >= config.requests
          ? new Date(timestamps[0] + config.windowMs)
          : undefined,
    };
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  /**
   * Reset rate limits for a user/integration (e.g., after token refresh)
   */
  reset(userId: string, integrationId: string): void {
    const key = this.getKey(userId, integrationId);
    this.requestTimestamps.delete(key);
    this.states.delete(key);
    log.debug({ userId, integrationId }, 'Rate limits reset');
  }

  /**
   * Reset all rate limits for a user
   */
  resetUser(userId: string): void {
    for (const key of this.requestTimestamps.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.requestTimestamps.delete(key);
      }
    }
    for (const key of this.states.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.states.delete(key);
      }
    }
    log.debug({ userId }, 'All rate limits reset for user');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Generate cache key for user/integration
   */
  private getKey(userId: string, integrationId: string): string {
    return `${userId}:${integrationId}`;
  }

  /**
   * Get timestamps within the current window
   */
  private getTimestamps(key: string, windowMs: number): number[] {
    const allTimestamps = this.requestTimestamps.get(key) || [];
    const cutoff = Date.now() - windowMs;

    // Filter to only timestamps within the window
    const validTimestamps = allTimestamps.filter((ts) => ts > cutoff);

    // Update stored timestamps if changed
    if (validTimestamps.length !== allTimestamps.length) {
      this.requestTimestamps.set(key, validTimestamps);
    }

    return validTimestamps;
  }

  /**
   * Cleanup old timestamps to prevent memory bloat
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamps] of this.requestTimestamps) {
      // Get max window for this integration
      const integrationId = key.split(':')[1];
      const integration = INTEGRATIONS[integrationId];
      const windowMs = integration?.rateLimits.windowMs || 3600000; // Default 1 hour

      // Remove timestamps older than window
      const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);

      if (validTimestamps.length === 0) {
        this.requestTimestamps.delete(key);
        cleaned++;
      } else if (validTimestamps.length !== timestamps.length) {
        this.requestTimestamps.set(key, validTimestamps);
        cleaned += timestamps.length - validTimestamps.length;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned up old rate limit timestamps');
    }
  }
}

// ============================================================================
// GLOBAL RATE LIMIT UTILITIES
// ============================================================================

/**
 * Check if an integration has global (not per-user) rate limits
 */
export function hasGlobalRateLimit(integrationId: string): boolean {
  const integration = INTEGRATIONS[integrationId];
  if (!integration) return false;

  // Some APIs have global rate limits across all users
  // For now, all our integrations are per-user
  return false;
}

/**
 * Get the rate limit configuration for an integration
 */
export function getRateLimitConfig(integrationId: string): RateLimitConfig | null {
  const integration = INTEGRATIONS[integrationId];
  return integration?.rateLimits || null;
}

/**
 * Format rate limit for display
 */
export function formatRateLimit(config: RateLimitConfig): string {
  const windowSeconds = config.windowMs / 1000;
  if (windowSeconds < 60) {
    return `${config.requests} requests per ${windowSeconds}s`;
  }
  if (windowSeconds < 3600) {
    return `${config.requests} requests per ${Math.round(windowSeconds / 60)} minutes`;
  }
  return `${config.requests} requests per ${Math.round(windowSeconds / 3600)} hours`;
}
