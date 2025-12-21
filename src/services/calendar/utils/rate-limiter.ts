/**
 * Calendar API Rate Limiter
 *
 * Prevents abuse of calendar provider APIs with per-user and global limits.
 *
 * Limits:
 * - Per-user: 100 requests/minute for sync operations
 * - Per-user: 30 requests/minute for credential operations
 * - Global: 1000 requests/minute across all users
 *
 * @module calendar/utils/rate-limiter
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitConfig {
  /** Max requests allowed in window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional key prefix for namespacing */
  prefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
}

// ============================================================================
// IN-MEMORY RATE LIMITER
// ============================================================================

class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      prefix: 'default',
      ...config,
    };

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  /**
   * Check if a request is allowed and consume a token if so
   */
  check(key: string): RateLimitResult {
    const fullKey = `${this.config.prefix}:${key}`;
    const now = Date.now();

    let entry = this.entries.get(fullKey);

    // Reset if window has passed
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + this.config.windowMs,
      };
    }

    // Check limit
    if (entry.count >= this.config.maxRequests) {
      const retryAfterMs = entry.resetAt - now;
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfterMs,
      };
    }

    // Consume token
    entry.count++;
    this.entries.set(fullKey, entry);

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Get current status without consuming a token
   */
  status(key: string): { remaining: number; resetAt: number } {
    const fullKey = `${this.config.prefix}:${key}`;
    const now = Date.now();
    const entry = this.entries.get(fullKey);

    if (!entry || now >= entry.resetAt) {
      return {
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      };
    }

    return {
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Reset limit for a key
   */
  reset(key: string): void {
    const fullKey = `${this.config.prefix}:${key}`;
    this.entries.delete(fullKey);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }
}

// ============================================================================
// CALENDAR-SPECIFIC RATE LIMITERS
// ============================================================================

/** Rate limiter for sync operations (100/min per user) */
export const syncLimiter = new RateLimiter({
  prefix: 'calendar:sync',
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
});

/** Rate limiter for credential operations (30/min per user) */
export const credentialLimiter = new RateLimiter({
  prefix: 'calendar:credentials',
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
});

/** Global rate limiter (1000/min across all users) */
export const globalLimiter = new RateLimiter({
  prefix: 'calendar:global',
  maxRequests: 1000,
  windowMs: 60 * 1000, // 1 minute
});

// ============================================================================
// MIDDLEWARE HELPERS
// ============================================================================

/**
 * Check rate limit for a calendar operation
 * Returns headers to set on response
 */
export function checkCalendarRateLimit(
  userId: string,
  operation: 'sync' | 'credential'
): {
  allowed: boolean;
  headers: Record<string, string>;
  retryAfterSeconds?: number;
} {
  // Check global limit first
  const globalResult = globalLimiter.check('all');
  if (!globalResult.allowed) {
    log.warn({ userId, operation }, 'Global calendar rate limit exceeded');
    return {
      allowed: false,
      headers: {
        'X-RateLimit-Limit': '1000',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(globalResult.resetAt / 1000)),
        'Retry-After': String(Math.ceil((globalResult.retryAfterMs || 0) / 1000)),
      },
      retryAfterSeconds: Math.ceil((globalResult.retryAfterMs || 0) / 1000),
    };
  }

  // Check user-specific limit
  const limiter = operation === 'sync' ? syncLimiter : credentialLimiter;
  const maxRequests = operation === 'sync' ? 100 : 30;
  const result = limiter.check(userId);

  if (!result.allowed) {
    log.warn({ userId, operation }, 'User calendar rate limit exceeded');
  }

  return {
    allowed: result.allowed,
    headers: {
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      ...(result.retryAfterMs && {
        'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
      }),
    },
    retryAfterSeconds: result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : undefined,
  };
}

/**
 * Get rate limit status for a user
 */
export function getCalendarRateLimitStatus(userId: string): {
  sync: { remaining: number; resetAt: Date };
  credential: { remaining: number; resetAt: Date };
  global: { remaining: number; resetAt: Date };
} {
  const syncStatus = syncLimiter.status(userId);
  const credentialStatus = credentialLimiter.status(userId);
  const globalStatus = globalLimiter.status('all');

  return {
    sync: {
      remaining: syncStatus.remaining,
      resetAt: new Date(syncStatus.resetAt),
    },
    credential: {
      remaining: credentialStatus.remaining,
      resetAt: new Date(credentialStatus.resetAt),
    },
    global: {
      remaining: globalStatus.remaining,
      resetAt: new Date(globalStatus.resetAt),
    },
  };
}

/**
 * Reset rate limits for a user (admin operation)
 */
export function resetCalendarRateLimits(userId: string): void {
  syncLimiter.reset(userId);
  credentialLimiter.reset(userId);
  log.info({ userId }, 'Reset calendar rate limits');
}

export default {
  syncLimiter,
  credentialLimiter,
  globalLimiter,
  checkCalendarRateLimit,
  getCalendarRateLimitStatus,
  resetCalendarRateLimits,
};
