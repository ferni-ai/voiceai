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

import Redis from 'ioredis';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'RateLimiter' });

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the window resets (Unix timestamp ms) */
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// REDIS CONNECTION
// ============================================================================

let redisClient: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection if REDIS_URL is configured.
 * Automatically reconnects on failure.
 */
function initializeRedis(): void {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_RATE_LIMIT_URL;

  if (!redisUrl) {
    log.info('No REDIS_URL configured - using in-memory rate limiting');
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          log.warn('Redis retry limit reached, falling back to in-memory');
          redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      log.info('Redis connected for rate limiting');
      redisAvailable = true;
    });

    redisClient.on('error', (err) => {
      log.warn({ error: String(err) }, 'Redis connection error');
      redisAvailable = false;
    });

    redisClient.on('close', () => {
      log.info('Redis connection closed');
      redisAvailable = false;
    });

    // Attempt connection
    void redisClient.connect().catch((err) => {
      log.warn({ error: String(err) }, 'Failed to connect to Redis');
      redisAvailable = false;
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize Redis');
    redisAvailable = false;
  }
}

// Initialize on module load
initializeRedis();

// ============================================================================
// IN-MEMORY FALLBACK
// ============================================================================

const memoryStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit using in-memory store.
 */
function checkMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug({ cleaned }, 'Cleaned expired in-memory rate limit entries');
  }
}, 60000);

// ============================================================================
// REDIS RATE LIMITING
// ============================================================================

/**
 * Lua script for atomic sliding window rate limiting.
 * Returns [allowed, remaining, resetAt]
 */
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local max_requests = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Get current count and reset time
local data = redis.call('HMGET', key, 'count', 'resetAt')
local count = tonumber(data[1]) or 0
local reset_at = tonumber(data[2]) or 0

-- Check if window has expired
if reset_at <= now then
  count = 0
  reset_at = now + window_ms
end

-- Check if rate limited
if count >= max_requests then
  return {0, 0, reset_at}
end

-- Increment and update
count = count + 1
redis.call('HSET', key, 'count', count, 'resetAt', reset_at)
redis.call('PEXPIRE', key, window_ms)

return {1, max_requests - count, reset_at}
`;

/**
 * Check rate limit using Redis (atomic operation).
 */
async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!redisClient || !redisAvailable) {
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }

  try {
    const now = Date.now();
    const result = (await redisClient.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `ratelimit:${key}`,
      maxRequests,
      windowMs,
      now
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetAt: result[2],
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Redis rate limit check failed, using memory fallback');
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Rate limiter with automatic backend selection.
 * Uses Redis if available, falls back to in-memory.
 */
export const rateLimiter = {
  /**
   * Check if a request is rate limited.
   *
   * @param key - Unique identifier (e.g., 'user:123' or 'ip:1.2.3.4')
   * @param maxRequests - Maximum requests allowed in window
   * @param windowMs - Window duration in milliseconds
   * @returns Rate limit result with allowed, remaining, and resetAt
   */
  async check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    if (redisAvailable && redisClient) {
      return checkRedisRateLimit(key, maxRequests, windowMs);
    }
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  },

  /**
   * Check rate limit synchronously (always uses memory store).
   * Use the async `check` method for Redis support.
   */
  checkSync(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  },

  /**
   * Check if Redis is being used for rate limiting.
   */
  isUsingRedis(): boolean {
    return redisAvailable;
  },

  /**
   * Get rate limiter status for health checks.
   */
  getStatus(): { backend: 'redis' | 'memory'; connected: boolean } {
    return {
      backend: redisAvailable ? 'redis' : 'memory',
      connected: redisAvailable,
    };
  },

  /**
   * Gracefully close Redis connection (for testing/shutdown).
   */
  async close(): Promise<void> {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      redisAvailable = false;
    }
  },
};

// Log initialization status
const isProduction =
  process.env.NODE_ENV === 'production' ||
  !!process.env.GOOGLE_CLOUD_PROJECT ||
  !!process.env.K_SERVICE;

if (isProduction && !redisAvailable) {
  log.warn(
    'SECURITY: Using in-memory rate limiting in production. ' +
      'Rate limits will reset on server restart. ' +
      'Set REDIS_URL or REDIS_RATE_LIMIT_URL for persistent rate limiting.'
  );
}
