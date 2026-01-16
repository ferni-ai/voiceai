/**
 * Resilience Configuration
 *
 * ONE SOURCE OF TRUTH for all retry, timeout, batch, and caching settings.
 * All services should import from here instead of hardcoding values.
 *
 * @module config/resilience-config
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ResilienceConfig' });

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/**
 * Default maximum retry attempts for transient failures
 * Use for: API calls, database operations, webhook delivery
 * Default: 3
 */
export const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

/**
 * Maximum retries for critical operations
 * Use for: Payment processing, user data persistence
 * Default: 5
 */
export const MAX_RETRIES_CRITICAL = parseInt(process.env.MAX_RETRIES_CRITICAL || '5', 10);

/**
 * Maximum retries for non-critical operations
 * Use for: Analytics, background tasks, caching
 * Default: 2
 */
export const MAX_RETRIES_LIGHT = parseInt(process.env.MAX_RETRIES_LIGHT || '2', 10);

/**
 * Base delay between retries (ms)
 * Used for exponential backoff: delay * 2^attempt
 * Default: 1000ms
 */
export const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '1000', 10);

/**
 * Maximum delay between retries (ms)
 * Caps exponential backoff
 * Default: 30000ms (30s)
 */
export const RETRY_MAX_DELAY_MS = parseInt(process.env.RETRY_MAX_DELAY_MS || '30000', 10);

// ============================================================================
// TIMEOUT CONFIGURATION
// ============================================================================

/**
 * Default HTTP request timeout (ms)
 * Use for: External API calls, webhook delivery
 * Default: 10000ms (10s)
 */
export const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS || '10000', 10);

/**
 * Short HTTP timeout for fast operations (ms)
 * Use for: Health checks, simple lookups
 * Default: 3000ms (3s)
 */
export const HTTP_TIMEOUT_SHORT_MS = parseInt(process.env.HTTP_TIMEOUT_SHORT_MS || '3000', 10);

/**
 * Long HTTP timeout for slow operations (ms)
 * Use for: File uploads, large data transfers
 * Default: 60000ms (60s)
 */
export const HTTP_TIMEOUT_LONG_MS = parseInt(process.env.HTTP_TIMEOUT_LONG_MS || '60000', 10);

/**
 * WebSocket connection timeout (ms)
 * Default: 30000ms (30s)
 */
export const WS_TIMEOUT_MS = parseInt(process.env.WS_TIMEOUT_MS || '30000', 10);

/**
 * Database operation timeout (ms)
 * Default: 5000ms (5s)
 */
export const DB_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS || '5000', 10);

// ============================================================================
// BATCH SIZE CONFIGURATION
// ============================================================================

/**
 * Small batch size for quick operations
 * Use for: Memory maintenance, parallel processing
 * Default: 10
 */
export const BATCH_SIZE_SMALL = parseInt(process.env.BATCH_SIZE_SMALL || '10', 10);

/**
 * Medium batch size for standard operations
 * Use for: Data consolidation, scheduled jobs
 * Default: 50
 */
export const BATCH_SIZE_MEDIUM = parseInt(process.env.BATCH_SIZE_MEDIUM || '50', 10);

/**
 * Large batch size for bulk operations
 * Use for: Data migration, backfills, exports
 * Default: 100
 */
export const BATCH_SIZE_LARGE = parseInt(process.env.BATCH_SIZE_LARGE || '100', 10);

/**
 * Extra large batch size for massive operations
 * Use for: Full data exports, Firestore sync
 * Default: 500
 */
export const BATCH_SIZE_XLARGE = parseInt(process.env.BATCH_SIZE_XLARGE || '500', 10);

// ============================================================================
// CACHE TTL CONFIGURATION (in milliseconds)
// ============================================================================

/**
 * Very short cache TTL (ms)
 * Use for: Real-time data, fast-changing state
 * Default: 5000ms (5s)
 */
export const CACHE_TTL_VERY_SHORT_MS = parseInt(process.env.CACHE_TTL_VERY_SHORT_MS || '5000', 10);

/**
 * Short cache TTL (ms)
 * Use for: Session data, frequent lookups
 * Default: 30000ms (30s)
 */
export const CACHE_TTL_SHORT_MS = parseInt(process.env.CACHE_TTL_SHORT_MS || '30000', 10);

/**
 * Medium cache TTL (ms)
 * Use for: User preferences, configuration
 * Default: 300000ms (5 minutes)
 */
export const CACHE_TTL_MEDIUM_MS = parseInt(process.env.CACHE_TTL_MEDIUM_MS || '300000', 10);

/**
 * Long cache TTL (ms)
 * Use for: Static data, expensive computations
 * Default: 3600000ms (1 hour)
 */
export const CACHE_TTL_LONG_MS = parseInt(process.env.CACHE_TTL_LONG_MS || '3600000', 10);

/**
 * Very long cache TTL (ms)
 * Use for: Near-static data, embeddings
 * Default: 86400000ms (24 hours)
 */
export const CACHE_TTL_VERY_LONG_MS = parseInt(
  process.env.CACHE_TTL_VERY_LONG_MS || '86400000',
  10
);

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

/**
 * Default rate limit window (ms)
 * Default: 60000ms (1 minute)
 */
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

/**
 * Default max requests per window
 * Default: 60
 */
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10);

/**
 * Strict rate limit max requests (for expensive operations)
 * Default: 10
 */
export const RATE_LIMIT_STRICT_MAX = parseInt(process.env.RATE_LIMIT_STRICT_MAX || '10', 10);

// ============================================================================
// CIRCUIT BREAKER CONFIGURATION
// ============================================================================

/**
 * Circuit breaker failure threshold
 * Number of failures before opening circuit
 * Default: 5
 */
export const CIRCUIT_FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD || '5', 10);

/**
 * Circuit breaker reset timeout (ms)
 * Time before attempting to close circuit
 * Default: 60000ms (1 minute)
 */
export const CIRCUIT_RESET_TIMEOUT_MS = parseInt(
  process.env.CIRCUIT_RESET_TIMEOUT_MS || '60000',
  10
);

/**
 * Circuit breaker success threshold
 * Successes needed to close circuit
 * Default: 2
 */
export const CIRCUIT_SUCCESS_THRESHOLD = parseInt(process.env.CIRCUIT_SUCCESS_THRESHOLD || '2', 10);

// ============================================================================
// GETTER FUNCTIONS
// ============================================================================

// Retry getters
export function getMaxRetries(): number {
  return MAX_RETRIES;
}
export function getMaxRetriesCritical(): number {
  return MAX_RETRIES_CRITICAL;
}
export function getMaxRetriesLight(): number {
  return MAX_RETRIES_LIGHT;
}
export function getRetryDelay(): number {
  return RETRY_DELAY_MS;
}
export function getRetryMaxDelay(): number {
  return RETRY_MAX_DELAY_MS;
}

// Timeout getters
export function getHttpTimeout(): number {
  return HTTP_TIMEOUT_MS;
}
export function getHttpTimeoutShort(): number {
  return HTTP_TIMEOUT_SHORT_MS;
}
export function getHttpTimeoutLong(): number {
  return HTTP_TIMEOUT_LONG_MS;
}
export function getWsTimeout(): number {
  return WS_TIMEOUT_MS;
}
export function getDbTimeout(): number {
  return DB_TIMEOUT_MS;
}

// Batch size getters
export function getBatchSizeSmall(): number {
  return BATCH_SIZE_SMALL;
}
export function getBatchSizeMedium(): number {
  return BATCH_SIZE_MEDIUM;
}
export function getBatchSizeLarge(): number {
  return BATCH_SIZE_LARGE;
}
export function getBatchSizeXLarge(): number {
  return BATCH_SIZE_XLARGE;
}

// Cache TTL getters
export function getCacheTtlVeryShort(): number {
  return CACHE_TTL_VERY_SHORT_MS;
}
export function getCacheTtlShort(): number {
  return CACHE_TTL_SHORT_MS;
}
export function getCacheTtlMedium(): number {
  return CACHE_TTL_MEDIUM_MS;
}
export function getCacheTtlLong(): number {
  return CACHE_TTL_LONG_MS;
}
export function getCacheTtlVeryLong(): number {
  return CACHE_TTL_VERY_LONG_MS;
}

// Rate limit getters
export function getRateLimitWindow(): number {
  return RATE_LIMIT_WINDOW_MS;
}
export function getRateLimitMaxRequests(): number {
  return RATE_LIMIT_MAX_REQUESTS;
}
export function getRateLimitStrictMax(): number {
  return RATE_LIMIT_STRICT_MAX;
}

// Circuit breaker getters
export function getCircuitFailureThreshold(): number {
  return CIRCUIT_FAILURE_THRESHOLD;
}
export function getCircuitResetTimeout(): number {
  return CIRCUIT_RESET_TIMEOUT_MS;
}
export function getCircuitSuccessThreshold(): number {
  return CIRCUIT_SUCCESS_THRESHOLD;
}

// ============================================================================
// STARTUP LOG
// ============================================================================

if (process.env.NODE_ENV !== 'test') {
  log.info(
    {
      retry: {
        maxRetries: MAX_RETRIES,
        maxRetriesCritical: MAX_RETRIES_CRITICAL,
        maxRetriesLight: MAX_RETRIES_LIGHT,
        delayMs: RETRY_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
      },
      timeouts: {
        httpMs: HTTP_TIMEOUT_MS,
        httpShortMs: HTTP_TIMEOUT_SHORT_MS,
        httpLongMs: HTTP_TIMEOUT_LONG_MS,
        wsMs: WS_TIMEOUT_MS,
        dbMs: DB_TIMEOUT_MS,
      },
      batchSizes: {
        small: BATCH_SIZE_SMALL,
        medium: BATCH_SIZE_MEDIUM,
        large: BATCH_SIZE_LARGE,
        xlarge: BATCH_SIZE_XLARGE,
      },
      cacheTtl: {
        veryShortMs: CACHE_TTL_VERY_SHORT_MS,
        shortMs: CACHE_TTL_SHORT_MS,
        mediumMs: CACHE_TTL_MEDIUM_MS,
        longMs: CACHE_TTL_LONG_MS,
        veryLongMs: CACHE_TTL_VERY_LONG_MS,
      },
      circuitBreaker: {
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        resetTimeoutMs: CIRCUIT_RESET_TIMEOUT_MS,
        successThreshold: CIRCUIT_SUCCESS_THRESHOLD,
      },
    },
    '🛡️ Resilience configuration loaded'
  );
}
