/**
 * Rate Limiter for External API Calls
 *
 * Provides rate limiting and circuit breaker patterns for external API calls
 * in the information domain (news, weather, sports, traffic, nutrition).
 *
 * Features:
 * - Sliding window rate limiting per API
 * - Circuit breaker for failing APIs
 * - Graceful degradation with cached results
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Name for logging */
  name: string;
}

interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeMs: number;
}

interface ApiLimiterState {
  /** Timestamps of recent requests */
  requests: number[];
  /** Circuit breaker state */
  circuitOpen: boolean;
  /** When circuit was opened */
  circuitOpenedAt: number;
  /** Consecutive failure count */
  failures: number;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Google APIs (generous free tier)
  'google-geocoding': { maxRequests: 50, windowMs: 60000, name: 'Google Geocoding' },
  'google-weather': { maxRequests: 30, windowMs: 60000, name: 'Google Weather' },
  'google-maps': { maxRequests: 30, windowMs: 60000, name: 'Google Maps' },

  // Open-Meteo (free, no key required, generous limits)
  'open-meteo': { maxRequests: 100, windowMs: 60000, name: 'Open-Meteo' },

  // News APIs
  newsdata: { maxRequests: 10, windowMs: 60000, name: 'NewsData.io' },
  gnews: { maxRequests: 10, windowMs: 60000, name: 'GNews' },
  finnhub: { maxRequests: 30, windowMs: 60000, name: 'Finnhub' },

  // Sports/Other
  espn: { maxRequests: 30, windowMs: 60000, name: 'ESPN' },
  duckduckgo: { maxRequests: 20, windowMs: 60000, name: 'DuckDuckGo' },
  wikipedia: { maxRequests: 50, windowMs: 60000, name: 'Wikipedia' },
  usda: { maxRequests: 30, windowMs: 60000, name: 'USDA FoodData' },
  'here-maps': { maxRequests: 20, windowMs: 60000, name: 'HERE Maps' },
};

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeMs: 30000, // 30 seconds
};

// ============================================================================
// STATE
// ============================================================================

const apiState = new Map<string, ApiLimiterState>();

function getState(apiId: string): ApiLimiterState {
  let state = apiState.get(apiId);
  if (!state) {
    state = {
      requests: [],
      circuitOpen: false,
      circuitOpenedAt: 0,
      failures: 0,
    };
    apiState.set(apiId, state);
  }
  return state;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if we can make a request to the given API.
 * Returns true if allowed, false if rate limited.
 */
export function canMakeRequest(apiId: string): boolean {
  const config = DEFAULT_RATE_LIMITS[apiId];
  if (!config) return true; // Unknown API, allow

  const state = getState(apiId);
  const now = Date.now();

  // Check circuit breaker first
  if (state.circuitOpen) {
    if (now - state.circuitOpenedAt > DEFAULT_CIRCUIT_BREAKER.resetTimeMs) {
      // Try to half-open the circuit
      state.circuitOpen = false;
      log.info({ apiId }, '🔌 Circuit breaker half-open, allowing test request');
    } else {
      log.debug({ apiId }, '🔌 Circuit breaker open, blocking request');
      return false;
    }
  }

  // Clean up old requests outside the window
  state.requests = state.requests.filter((ts) => now - ts < config.windowMs);

  // Check rate limit
  if (state.requests.length >= config.maxRequests) {
    log.warn(
      { apiId, count: state.requests.length, max: config.maxRequests },
      '⏳ Rate limit reached'
    );
    return false;
  }

  return true;
}

/**
 * Record that a request was made to the given API.
 * Call this AFTER successfully initiating a request.
 */
export function recordRequest(apiId: string): void {
  const state = getState(apiId);
  state.requests.push(Date.now());
}

/**
 * Record a successful response from the given API.
 * Resets failure counter and closes circuit if it was half-open.
 */
export function recordSuccess(apiId: string): void {
  const state = getState(apiId);
  if (state.failures > 0) {
    log.debug({ apiId, previousFailures: state.failures }, '✅ API recovered');
  }
  state.failures = 0;
  state.circuitOpen = false;
}

/**
 * Record a failure from the given API.
 * May open the circuit breaker if threshold is reached.
 */
export function recordFailure(apiId: string, error?: string): void {
  const state = getState(apiId);
  state.failures++;

  if (state.failures >= DEFAULT_CIRCUIT_BREAKER.failureThreshold) {
    state.circuitOpen = true;
    state.circuitOpenedAt = Date.now();
    log.warn(
      { apiId, failures: state.failures, error },
      '🔌 Circuit breaker OPEN - too many failures'
    );
  } else {
    log.debug({ apiId, failures: state.failures, error }, '⚠️ API failure recorded');
  }
}

// ============================================================================
// HIGH-LEVEL WRAPPER
// ============================================================================

/**
 * Wrap an async function with rate limiting and circuit breaking.
 *
 * @param apiId - Identifier for the API (must match DEFAULT_RATE_LIMITS)
 * @param fn - The async function to wrap
 * @param fallback - Optional fallback value if rate limited or circuit open
 */
export async function withRateLimitAndCircuitBreaker<T>(
  apiId: string,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  if (!canMakeRequest(apiId)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Rate limited or circuit open for ${apiId}`);
  }

  recordRequest(apiId);

  try {
    const result = await fn();
    recordSuccess(apiId);
    return result;
  } catch (error) {
    recordFailure(apiId, String(error));
    throw error;
  }
}

// ============================================================================
// MONITORING
// ============================================================================

/**
 * Get current state of all API limiters (for monitoring/debugging).
 */
export function getApiLimiterStats(): Record<
  string,
  {
    name: string;
    requestsInWindow: number;
    maxRequests: number;
    circuitOpen: boolean;
    failures: number;
  }
> {
  const stats: Record<
    string,
    {
      name: string;
      requestsInWindow: number;
      maxRequests: number;
      circuitOpen: boolean;
      failures: number;
    }
  > = {};
  const now = Date.now();

  for (const [apiId, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
    const state = apiState.get(apiId) || {
      requests: [],
      circuitOpen: false,
      failures: 0,
    };
    const recentRequests = state.requests.filter((ts) => now - ts < config.windowMs);

    stats[apiId] = {
      name: config.name,
      requestsInWindow: recentRequests.length,
      maxRequests: config.maxRequests,
      circuitOpen: state.circuitOpen,
      failures: state.failures,
    };
  }

  return stats;
}

/**
 * Reset all rate limiters (useful for testing).
 */
export function resetAllLimiters(): void {
  apiState.clear();
  log.debug('🔄 All API limiters reset');
}
