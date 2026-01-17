/**
 * Voice Authentication Rate Limiting
 *
 * Prevents brute-force attacks by limiting request rates.
 * Uses sliding window algorithm with in-memory + Redis fallback.
 *
 * RATE LIMITS:
 * - Verification: 10 requests per minute
 * - Identification: 5 requests per minute
 * - Enrollment: 20 requests per minute
 * - Profile operations: 5 requests per minute
 *
 * @module VoiceRateLimit
 */

import pino from 'pino';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';

const log = pino({ name: 'voice-rate-limit' });

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs?: number; // Duration to block after limit exceeded
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
  blocked?: boolean;
}

type EndpointType = 'verify' | 'identify' | 'enroll' | 'profile' | 'status';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RATE_LIMITS: Record<EndpointType, RateLimitConfig> = {
  verify: {
    windowMs: 60000, // 1 minute
    maxRequests: 10,
    blockDurationMs: 300000, // 5 minute block after exceeded
  },
  identify: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    blockDurationMs: 300000, // 5 minute block
  },
  enroll: {
    windowMs: 60000, // 1 minute
    maxRequests: 20, // More lenient for enrollment
    blockDurationMs: 60000, // 1 minute block
  },
  profile: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    blockDurationMs: 60000,
  },
  status: {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // Status checks are lightweight
    blockDurationMs: 0, // No blocking
  },
};

// Global limits per IP (in addition to per-user limits)
const GLOBAL_LIMITS: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
  blockDurationMs: 600000, // 10 minute block for DDoS prevention
};

// ============================================================================
// STORAGE
// ============================================================================

interface RequestRecord {
  timestamps: number[];
  blockedUntil?: number;
}

// In-memory storage (should be Redis in production for multi-instance)
const userRequests = new Map<string, Map<EndpointType, RequestRecord>>();
const ipRequests = new Map<string, RequestRecord>();

// Cleanup interval
const CLEANUP_INTERVAL_MS = 60000; // Every minute

// ============================================================================
// RATE LIMIT LOGIC
// ============================================================================

/**
 * Check rate limit for a user + endpoint combination.
 */
export function checkRateLimit(
  userId: string,
  endpoint: EndpointType,
  ipAddress?: string,
  config?: Partial<RateLimitConfig>
): RateLimitResult {
  const limits = { ...DEFAULT_RATE_LIMITS[endpoint], ...config };
  const now = Date.now();

  // Check IP-level rate limit first (DDoS protection)
  if (ipAddress) {
    const ipResult = checkIPRateLimit(ipAddress, now);
    if (!ipResult.allowed) {
      log.warn({ ipAddress, endpoint }, 'IP rate limit exceeded');
      return ipResult;
    }
  }

  // Get or create user's request records
  if (!userRequests.has(userId)) {
    userRequests.set(userId, new Map());
  }
  const userEndpoints = userRequests.get(userId)!;

  if (!userEndpoints.has(endpoint)) {
    userEndpoints.set(endpoint, { timestamps: [] });
  }
  const record = userEndpoints.get(endpoint)!;

  // Check if user is blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    const retryAfterMs = record.blockedUntil - now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(record.blockedUntil),
      retryAfterMs,
      blocked: true,
    };
  }

  // Clear block if expired
  if (record.blockedUntil && now >= record.blockedUntil) {
    record.blockedUntil = undefined;
  }

  // Remove old timestamps outside the window
  const windowStart = now - limits.windowMs;
  record.timestamps = record.timestamps.filter((t) => t > windowStart);

  // Check if limit exceeded
  if (record.timestamps.length >= limits.maxRequests) {
    // Apply block if configured
    if (limits.blockDurationMs && limits.blockDurationMs > 0) {
      record.blockedUntil = now + limits.blockDurationMs;
      log.warn(
        { userId, endpoint, blockUntil: record.blockedUntil },
        'User blocked for rate limit'
      );
    }

    const oldestInWindow = Math.min(...record.timestamps);
    const resetAt = new Date(oldestInWindow + limits.windowMs);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: resetAt.getTime() - now,
      blocked: Boolean(record.blockedUntil),
    };
  }

  // Allow request and record timestamp
  record.timestamps.push(now);

  const remaining = limits.maxRequests - record.timestamps.length;
  const resetAt =
    record.timestamps.length > 0
      ? new Date(record.timestamps[0] + limits.windowMs)
      : new Date(now + limits.windowMs);

  return {
    allowed: true,
    remaining,
    resetAt,
  };
}

/**
 * Check IP-level rate limit.
 */
function checkIPRateLimit(ipAddress: string, now: number): RateLimitResult {
  if (!ipRequests.has(ipAddress)) {
    ipRequests.set(ipAddress, { timestamps: [] });
  }
  const record = ipRequests.get(ipAddress)!;

  // Check if blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(record.blockedUntil),
      retryAfterMs: record.blockedUntil - now,
      blocked: true,
    };
  }

  // Clear expired block
  if (record.blockedUntil && now >= record.blockedUntil) {
    record.blockedUntil = undefined;
  }

  // Remove old timestamps
  const windowStart = now - GLOBAL_LIMITS.windowMs;
  record.timestamps = record.timestamps.filter((t) => t > windowStart);

  // Check limit
  if (record.timestamps.length >= GLOBAL_LIMITS.maxRequests) {
    if (GLOBAL_LIMITS.blockDurationMs) {
      record.blockedUntil = now + GLOBAL_LIMITS.blockDurationMs;
    }

    const oldestInWindow = Math.min(...record.timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oldestInWindow + GLOBAL_LIMITS.windowMs),
      retryAfterMs: oldestInWindow + GLOBAL_LIMITS.windowMs - now,
      blocked: Boolean(record.blockedUntil),
    };
  }

  // Allow
  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: GLOBAL_LIMITS.maxRequests - record.timestamps.length,
    resetAt: new Date(record.timestamps[0] + GLOBAL_LIMITS.windowMs),
  };
}

// ============================================================================
// MIDDLEWARE HELPERS
// ============================================================================

/**
 * Rate limit middleware factory.
 * Creates middleware for specific endpoint types.
 */
export function createRateLimitMiddleware(
  endpoint: EndpointType,
  config?: Partial<RateLimitConfig>
) {
  return (
    req: { headers: Record<string, string | string[] | undefined>; userId?: string },
    res: {
      setHeader: (name: string, value: string) => void;
      status: (code: number) => { json: (body: unknown) => void };
    }
  ): boolean => {
    const userId = req.userId || 'anonymous';
    const ipAddress = getClientIP(req.headers);

    const result = checkRateLimit(userId, endpoint, ipAddress, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(DEFAULT_RATE_LIMITS[endpoint].maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((result.retryAfterMs || 0) / 1000)));
      res.status(429).json({
        error: 'Too many requests',
        message: result.blocked
          ? 'You have been temporarily blocked due to too many requests'
          : 'Rate limit exceeded. Please slow down.',
        retryAfterMs: result.retryAfterMs,
        resetAt: result.resetAt.toISOString(),
      });
      return false;
    }

    return true;
  };
}

/**
 * Get client IP from headers (handles proxies).
 */
function getClientIP(headers: Record<string, string | string[] | undefined>): string {
  // Check X-Forwarded-For first (proxy/load balancer)
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }

  // Check X-Real-IP
  const realIP = headers['x-real-ip'];
  if (realIP) {
    return typeof realIP === 'string' ? realIP : realIP[0];
  }

  // Fallback
  return 'unknown';
}

// ============================================================================
// MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Reset rate limit for a user.
 */
export function resetUserRateLimit(userId: string, endpoint?: EndpointType): void {
  if (!userRequests.has(userId)) return;

  if (endpoint) {
    userRequests.get(userId)?.delete(endpoint);
  } else {
    userRequests.delete(userId);
  }

  log.info({ userId, endpoint }, 'Rate limit reset');
}

/**
 * Reset rate limit for an IP.
 */
export function resetIPRateLimit(ipAddress: string): void {
  ipRequests.delete(ipAddress);
  log.info({ ipAddress }, 'IP rate limit reset');
}

/**
 * Get current rate limit status for a user.
 */
export function getUserRateLimitStatus(userId: string): Record<
  EndpointType,
  {
    requestsInWindow: number;
    maxRequests: number;
    blocked: boolean;
    blockedUntil?: Date;
  }
> {
  const status: Record<
    EndpointType,
    {
      requestsInWindow: number;
      maxRequests: number;
      blocked: boolean;
      blockedUntil?: Date;
    }
  > = {} as Record<
    EndpointType,
    {
      requestsInWindow: number;
      maxRequests: number;
      blocked: boolean;
      blockedUntil?: Date;
    }
  >;

  const now = Date.now();
  const userEndpoints = userRequests.get(userId);

  for (const [endpoint, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
    const record = userEndpoints?.get(endpoint as EndpointType);
    const windowStart = now - config.windowMs;
    const recentRequests = record?.timestamps.filter((t) => t > windowStart) || [];

    status[endpoint as EndpointType] = {
      requestsInWindow: recentRequests.length,
      maxRequests: config.maxRequests,
      blocked: Boolean(record?.blockedUntil && now < record.blockedUntil),
      blockedUntil: record?.blockedUntil ? new Date(record.blockedUntil) : undefined,
    };
  }

  return status;
}

/**
 * Get statistics about rate limiting.
 */
export function getRateLimitStats(): {
  activeUsers: number;
  blockedUsers: number;
  totalRequests: number;
  blockedIPs: number;
} {
  const now = Date.now();
  let blockedUsers = 0;
  let totalRequests = 0;
  let blockedIPs = 0;

  for (const userEndpoints of userRequests.values()) {
    for (const record of userEndpoints.values()) {
      totalRequests += record.timestamps.length;
      if (record.blockedUntil && now < record.blockedUntil) {
        blockedUsers++;
      }
    }
  }

  for (const record of ipRequests.values()) {
    if (record.blockedUntil && now < record.blockedUntil) {
      blockedIPs++;
    }
  }

  return {
    activeUsers: userRequests.size,
    blockedUsers,
    totalRequests,
    blockedIPs,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired records.
 */
function cleanup(): void {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  // Clean user records
  for (const [userId, endpoints] of userRequests) {
    for (const [endpoint, record] of endpoints) {
      // Remove old timestamps
      record.timestamps = record.timestamps.filter((t) => t > oneHourAgo);

      // Clear expired blocks
      if (record.blockedUntil && now >= record.blockedUntil) {
        record.blockedUntil = undefined;
      }

      // Remove empty records
      if (record.timestamps.length === 0 && !record.blockedUntil) {
        endpoints.delete(endpoint);
      }
    }

    // Remove empty user entries
    if (endpoints.size === 0) {
      userRequests.delete(userId);
    }
  }

  // Clean IP records
  for (const [ip, record] of ipRequests) {
    record.timestamps = record.timestamps.filter((t) => t > oneHourAgo);

    if (record.blockedUntil && now >= record.blockedUntil) {
      record.blockedUntil = undefined;
    }

    if (record.timestamps.length === 0 && !record.blockedUntil) {
      ipRequests.delete(ip);
    }
  }
}

// Start cleanup interval
const VOICE_RATE_LIMIT_CLEANUP_INTERVAL = 'voice-rate-limit-cleanup';

export function startCleanup(): void {
  if (hasInterval(VOICE_RATE_LIMIT_CLEANUP_INTERVAL)) return;
  registerInterval(VOICE_RATE_LIMIT_CLEANUP_INTERVAL, cleanup, CLEANUP_INTERVAL_MS);
}

export function stopCleanup(): void {
  clearNamedInterval(VOICE_RATE_LIMIT_CLEANUP_INTERVAL);
}

// Auto-start cleanup
startCleanup();

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkRateLimit,
  createRateLimitMiddleware,
  resetUserRateLimit,
  resetIPRateLimit,
  getUserRateLimitStatus,
  getRateLimitStats,
  startCleanup,
  stopCleanup,
};
