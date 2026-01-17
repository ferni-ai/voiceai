/**
 * Rate Limiter for External API Calls
 *
 * Implements token bucket algorithm for rate limiting.
 * Prevents API abuse and handles graceful degradation.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// RATE LIMITER IMPLEMENTATION
// ============================================================================

interface RateLimitConfig {
  maxTokens: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  refillInterval: number; // How often to refill (ms)
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
  requestCount: number;
  lastRequestTime: number;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private state: RateLimitState;
  private name: string;

  constructor(name: string, config: Partial<RateLimitConfig> = {}) {
    this.name = name;
    this.config = {
      maxTokens: config.maxTokens ?? 10,
      refillRate: config.refillRate ?? 1,
      refillInterval: config.refillInterval ?? 1000,
    };
    this.state = {
      tokens: this.config.maxTokens,
      lastRefill: Date.now(),
      requestCount: 0,
      lastRequestTime: 0,
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.state.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.config.refillInterval) * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.state.tokens = Math.min(this.config.maxTokens, this.state.tokens + tokensToAdd);
      this.state.lastRefill = now;
    }
  }

  /**
   * Try to acquire a token for a request
   * Returns true if allowed, false if rate limited
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.state.tokens > 0) {
      this.state.tokens--;
      this.state.requestCount++;
      this.state.lastRequestTime = Date.now();
      return true;
    }

    getLogger().warn(
      {
        limiter: this.name,
        tokens: this.state.tokens,
        requestCount: this.state.requestCount,
      },
      'Rate limit exceeded'
    );

    return false;
  }

  /**
   * Wait until a token is available (with timeout)
   */
  async acquire(timeoutMs = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.tryAcquire()) {
        return true;
      }

      // Wait for refill interval
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.config.refillInterval);
      });
    }

    getLogger().warn(
      {
        limiter: this.name,
        timeoutMs,
      },
      'Rate limit acquire timed out'
    );

    return false;
  }

  /**
   * Get current state (for monitoring)
   */
  getState(): {
    availableTokens: number;
    requestCount: number;
    isLimited: boolean;
  } {
    this.refill();
    return {
      availableTokens: this.state.tokens,
      requestCount: this.state.requestCount,
      isLimited: this.state.tokens === 0,
    };
  }

  /**
   * Reset the limiter (e.g., for testing)
   */
  reset(): void {
    this.state = {
      tokens: this.config.maxTokens,
      lastRefill: Date.now(),
      requestCount: 0,
      lastRequestTime: 0,
    };
  }
}

// ============================================================================
// PRE-CONFIGURED LIMITERS
// ============================================================================

// API-specific rate limiters
const limiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a service
 */
export function getRateLimiter(service: string): RateLimiter {
  if (!limiters.has(service)) {
    const config = getServiceConfig(service);
    limiters.set(service, new RateLimiter(service, config));
  }
  return limiters.get(service)!;
}

/**
 * Get rate limit config for a service
 */
function getServiceConfig(service: string): Partial<RateLimitConfig> {
  const configs: Record<string, Partial<RateLimitConfig>> = {
    // Yahoo Finance - be conservative
    'yahoo-finance': {
      maxTokens: 5,
      refillRate: 1,
      refillInterval: 2000, // 1 request per 2 seconds
    },

    // Alpha Vantage - 5 calls/min on free tier
    'alpha-vantage': {
      maxTokens: 5,
      refillRate: 1,
      refillInterval: 12000, // ~5 per minute
    },

    // SendGrid - generous limits
    sendgrid: {
      maxTokens: 10,
      refillRate: 2,
      refillInterval: 1000,
    },

    // Twilio - generous limits
    twilio: {
      maxTokens: 10,
      refillRate: 2,
      refillInterval: 1000,
    },

    // Plaid - be careful
    plaid: {
      maxTokens: 10,
      refillRate: 2,
      refillInterval: 1000,
    },

    // ESPN (sports scores) - public API, fairly generous limits
    // Note: getTeamScore iterates through 8 sports leagues to find a team,
    // so we need enough tokens for multiple teams at session startup
    espn: {
      maxTokens: 30,
      refillRate: 5,
      refillInterval: 1000, // 5 per second, burst of 30
    },

    // Weather API - generous
    weather: {
      maxTokens: 10,
      refillRate: 2,
      refillInterval: 1000,
    },

    // News APIs - be conservative
    news: {
      maxTokens: 5,
      refillRate: 1,
      refillInterval: 3000,
    },

    // Spotify - be careful with rate limits
    spotify: {
      maxTokens: 10,
      refillRate: 2,
      refillInterval: 1000,
    },

    // Google Calendar API - 1M queries/day but be conservative
    'google-calendar': {
      maxTokens: 20,
      refillRate: 5,
      refillInterval: 1000, // 5 per second
    },

    // Cartesia TTS - generous but protect from abuse
    cartesia: {
      maxTokens: 50,
      refillRate: 10,
      refillInterval: 1000, // 10 per second
    },

    // Cartesia Voice Clone - expensive operation
    'cartesia-voice-clone': {
      maxTokens: 5,
      refillRate: 1,
      refillInterval: 5000, // 1 every 5 seconds
    },
  };

  return (
    configs[service] || {
      maxTokens: 5,
      refillRate: 1,
      refillInterval: 1000,
    }
  );
}

// ============================================================================
// WRAPPER FUNCTIONS
// ============================================================================

/**
 * Execute a function with rate limiting
 * Falls back to a default value if rate limited
 */
export async function withRateLimit<T>(
  service: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  const limiter = getRateLimiter(service);

  if (!limiter.tryAcquire()) {
    getLogger().warn({ service }, 'Request rate limited, using fallback');
    return fallback;
  }

  try {
    return await fn();
  } catch (error) {
    getLogger().error({ service, error }, 'Rate-limited request failed');
    return fallback;
  }
}

/**
 * Execute with rate limiting, waiting if necessary
 */
export async function withRateLimitWait<T>(
  service: string,
  fn: () => Promise<T>,
  timeoutMs = 5000
): Promise<T> {
  const limiter = getRateLimiter(service);

  const acquired = await limiter.acquire(timeoutMs);
  if (!acquired) {
    throw new Error(`Rate limit timeout for ${service}`);
  }

  return fn();
}

/**
 * Check if a service is currently rate limited
 */
export function isRateLimited(service: string): boolean {
  const limiter = getRateLimiter(service);
  return limiter.getState().isLimited;
}

/**
 * Get rate limit stats for all services
 */
export function getRateLimitStats(): Record<
  string,
  {
    availableTokens: number;
    requestCount: number;
    isLimited: boolean;
  }
> {
  const stats: Record<
    string,
    {
      availableTokens: number;
      requestCount: number;
      isLimited: boolean;
    }
  > = {};

  for (const [name, limiter] of limiters) {
    stats[name] = limiter.getState();
  }

  return stats;
}

/**
 * Reset all rate limiters (for testing)
 */
export function resetAllRateLimiters(): void {
  for (const limiter of limiters.values()) {
    limiter.reset();
  }
}

export default {
  RateLimiter,
  getRateLimiter,
  withRateLimit,
  withRateLimitWait,
  isRateLimited,
  getRateLimitStats,
  resetAllRateLimiters,
};
