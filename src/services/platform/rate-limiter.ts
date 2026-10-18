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
import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval } from '../../utils/interval-manager.js';
import { checkSharedInFirestore, wantsFirestoreSharedLimits } from './firestore-rate-limit.js';

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
 * retryStrategy gives up after 5 tries, and ioredis then ends the connection for good:
 * the client stays set, nothing reconnects, and checkShared fails closed (journal
 * transcription refuses every clip) until the instance restarts. So the next check
 * after a backoff connects again: 30 s at first, doubling up to 5 min.
 */
const REVIVE_MIN_MS = 30_000;
const REVIVE_MAX_MS = 5 * 60_000;
let reviveDelayMs = REVIVE_MIN_MS;
let nextReviveAt = 0;
/** When ioredis gave up, while it stays given up. */
let gaveUpAt: number | null = null;

/**
 * Reconnect a client ioredis has given up on, at most once per backoff window, with
 * one alertable error per window. A client still retrying on its own is left alone.
 */
function reviveRedisIfGivenUp(key: string): void {
  if (!redisClient || redisAvailable || redisClient.status !== 'end') return;
  const now = Date.now();
  if (now < nextReviveAt) return;
  gaveUpAt ??= now;
  log.error(
    { keyPrefix: key.split(':')[0], downForMs: now - gaveUpAt, nextTryInMs: reviveDelayMs },
    'rate_limit_redis_down'
  );
  nextReviveAt = now + reviveDelayMs;
  reviveDelayMs = Math.min(reviveDelayMs * 2, REVIVE_MAX_MS);
  redisClient.connect().catch((error: unknown) => {
    // The window's error is logged above; ioredis logs the connection error itself.
    log.debug({ error: String(error) }, 'Redis reconnect attempt failed');
  });
}

function resetRevival(): void {
  reviveDelayMs = REVIVE_MIN_MS;
  nextReviveAt = 0;
  gaveUpAt = null;
}

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
          gaveUpAt ??= Date.now();
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      protocol: 2, // ioredis 6 defaults to RESP3; keep v5's RESP2
    });

    redisClient.on('connect', () => {
      log.info('Redis connected for rate limiting');
      if (gaveUpAt !== null) {
        log.info({ downForMs: Date.now() - gaveUpAt }, 'rate_limit_redis_recovered');
      }
      resetRevival();
      redisAvailable = true;
    });

    // Debug: ioredis emits these on every reconnect attempt. An outage is reported by
    // rate_limit_redis_down, once per revive window, not once per attempt.
    redisClient.on('error', (err) => {
      log.debug({ error: String(err) }, 'Redis connection error');
      redisAvailable = false;
    });

    redisClient.on('close', () => {
      log.debug('Redis connection closed');
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
  windowMs: number,
  cost = 1
): RateLimitResult {
  const now = Date.now();
  let entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  if (entry.count + cost > maxRequests) {
    return {
      allowed: false,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  entry.count += cost;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Cleanup expired entries every minute (managed by IntervalManager)
registerInterval(
  'rate-limiter-cleanup',
  () => {
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
  },
  60000
);

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
local cost = tonumber(ARGV[4]) or 1

-- Get current count and reset time
local data = redis.call('HMGET', key, 'count', 'resetAt')
local count = tonumber(data[1]) or 0
local reset_at = tonumber(data[2]) or 0

-- Check if window has expired
if reset_at <= now then
  count = 0
  reset_at = now + window_ms
end

-- Check if rate limited (a call uses cost units, 1 unless given)
if count + cost > max_requests then
  return {0, math.max(0, max_requests - count), reset_at}
end

-- Increment and update
count = count + cost
redis.call('HSET', key, 'count', count, 'resetAt', reset_at)
redis.call('PEXPIRE', key, window_ms)

return {1, max_requests - count, reset_at}
`;

/** One atomic check in Redis; throws when Redis isn't connected or the script fails. */
async function evalRedisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  cost: number
): Promise<RateLimitResult> {
  if (!redisClient || !redisAvailable) throw new Error('Redis not connected');
  const result = (await redisClient.eval(
    RATE_LIMIT_SCRIPT,
    1,
    `ratelimit:${key}`,
    maxRequests,
    windowMs,
    Date.now(),
    cost
  )) as [number, number, number];
  return { allowed: result[0] === 1, remaining: result[1], resetAt: result[2] };
}

/**
 * Check rate limit using Redis (atomic operation).
 */
async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  cost = 1
): Promise<RateLimitResult> {
  if (!redisClient || !redisAvailable) {
    return checkMemoryRateLimit(key, maxRequests, windowMs, cost);
  }

  try {
    return await evalRedisRateLimit(key, maxRequests, windowMs, cost);
  } catch (error) {
    log.warn({ error: String(error) }, 'Redis rate limit check failed, using memory fallback');
    return checkMemoryRateLimit(key, maxRequests, windowMs, cost);
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
   * @param cost - Units this call uses (default 1), e.g. audio tokens
   * @returns Rate limit result with allowed, remaining, and resetAt
   */
  async check(
    key: string,
    maxRequests: number,
    windowMs: number,
    cost = 1
  ): Promise<RateLimitResult> {
    if (redisAvailable && redisClient) {
      return checkRedisRateLimit(key, maxRequests, windowMs, cost);
    }
    reviveRedisIfGivenUp(key);
    return checkMemoryRateLimit(key, maxRequests, windowMs, cost);
  },

  /**
   * Like `check`, but for limits that must hold across instances (spend caps).
   * The count lives in Redis when it is configured, otherwise in Firestore
   * (firestore-rate-limit.ts); either way it returns null instead of counting in
   * this instance's memory when the store is unreachable, so the caller can fail
   * closed. Uses memory only in local development with neither (no Google Cloud,
   * no emulator). A cost that isn't a positive finite number is refused (null).
   */
  async checkShared(
    key: string,
    maxRequests: number,
    windowMs: number,
    cost = 1
  ): Promise<RateLimitResult | null> {
    if (!Number.isFinite(cost) || cost <= 0) return null;
    if (!redisClient) {
      return wantsFirestoreSharedLimits()
        ? checkSharedInFirestore(key, maxRequests, windowMs, cost)
        : checkMemoryRateLimit(key, maxRequests, windowMs, cost);
    }
    // Fail closed until 'connect' fires; rate_limit_redis_down reports it once per window.
    if (!redisAvailable) {
      reviveRedisIfGivenUp(key);
      return null;
    }
    try {
      return await evalRedisRateLimit(key, maxRequests, windowMs, cost);
    } catch (error) {
      log.warn({ error: String(error), key }, 'Shared rate limit unavailable: Redis unreachable');
      return null;
    }
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
   * Rate limiter status for health checks: where shared limits count. Firestore is
   * reported as connected because each check reaches it on its own (and fails closed).
   */
  getStatus(): { backend: 'redis' | 'firestore' | 'memory'; connected: boolean } {
    if (redisAvailable) return { backend: 'redis', connected: true };
    if (!redisClient && wantsFirestoreSharedLimits())
      return { backend: 'firestore', connected: true };
    return { backend: 'memory', connected: false };
  },

  /**
   * Gracefully close Redis connection (for testing/shutdown).
   */
  async close(): Promise<void> {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      redisAvailable = false;
      resetRevival();
    }
  },
};

// Without Redis, spend caps count in Firestore and only per-request limits stay per
// instance, so there is nothing to warn about. With Redis configured, the connection is
// still in flight at load time and its failures log their own warnings.
if (!redisClient && wantsFirestoreSharedLimits()) {
  log.info(
    'No Redis configured: spend caps count in Firestore; per-request limits stay per instance'
  );
}
