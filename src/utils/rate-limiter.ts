/**
 * Rate Limiter Utility
 *
 * Token bucket implementation for rate limiting operations.
 * Useful for:
 * - API rate limiting
 * - Preventing abuse
 * - Resource throttling
 *
 * @module utils/rate-limiter
 */

import { getLogger } from './safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimiterOptions {
  /** Maximum number of tokens in the bucket */
  maxTokens: number;
  /** Number of tokens to add per interval */
  refillRate: number;
  /** Interval in ms between refills (default: 1000ms = 1 second) */
  refillInterval?: number;
}

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

/**
 * Token bucket rate limiter.
 *
 * @example
 * // Allow 10 requests per second
 * const limiter = new RateLimiter({ maxTokens: 10, refillRate: 10, refillInterval: 1000 });
 *
 * // Check if request is allowed
 * if (limiter.tryConsume()) {
 *   await makeRequest();
 * } else {
 *   throw new Error('Rate limited');
 * }
 *
 * // Or wait until allowed
 * await limiter.waitForToken();
 * await makeRequest();
 */
export class RateLimiter {
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;

  private tokens: number;
  private lastRefill: number;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxTokens;
    this.refillRate = options.refillRate;
    this.refillInterval = options.refillInterval ?? 1000;
    this.tokens = options.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.refillInterval);

    if (intervals > 0) {
      const tokensToAdd = intervals * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.refillInterval);
    }
  }

  /**
   * Try to consume a token. Returns true if successful, false if rate limited.
   */
  tryConsume(tokens = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Consume a token, throwing if rate limited.
   */
  consume(tokens = 1): void {
    if (!this.tryConsume(tokens)) {
      throw new RateLimitError('Rate limit exceeded', this.getWaitTime(tokens));
    }
  }

  /**
   * Wait until a token is available, then consume it.
   */
  async waitForToken(tokens = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitTime = this.getWaitTime(tokens);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get the time in ms until the specified number of tokens are available.
   */
  getWaitTime(tokens = 1): number {
    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const neededTokens = tokens - this.tokens;
    const intervalsNeeded = Math.ceil(neededTokens / this.refillRate);
    return intervalsNeeded * this.refillInterval;
  }

  /**
   * Get current number of available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the rate limiter to full capacity.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Get current state (for persistence/monitoring).
   */
  getState(): RateLimiterState {
    return {
      tokens: this.tokens,
      lastRefill: this.lastRefill,
    };
  }

  /**
   * Restore from saved state.
   */
  restore(state: RateLimiterState): void {
    this.tokens = Math.min(state.tokens, this.maxTokens);
    this.lastRefill = state.lastRefill;
    this.refill(); // Catch up on any refills since save
  }
}

// ============================================================================
// RATE LIMIT ERROR
// ============================================================================

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// SLIDING WINDOW RATE LIMITER
// ============================================================================

/**
 * Sliding window rate limiter.
 *
 * More accurate than token bucket for strict rate limits.
 *
 * @example
 * // Allow 100 requests per minute
 * const limiter = new SlidingWindowLimiter(100, 60000);
 */
export class SlidingWindowLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private requests: number[] = [];

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Clean up old request timestamps.
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter((time) => time > cutoff);
  }

  /**
   * Check if a request is allowed without consuming.
   */
  isAllowed(): boolean {
    this.cleanup();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Try to make a request. Returns true if allowed.
   */
  tryRequest(): boolean {
    this.cleanup();

    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests in current window.
   */
  getRemainingRequests(): number {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Get time until next request is allowed.
   */
  getResetTime(): number {
    this.cleanup();

    if (this.requests.length < this.maxRequests) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    return oldestRequest + this.windowMs - Date.now();
  }

  /**
   * Reset the limiter.
   */
  reset(): void {
    this.requests = [];
  }
}

// ============================================================================
// REGISTRY OF RATE LIMITERS
// ============================================================================

const limiters = new Map<string, RateLimiter>();
const slidingLimiters = new Map<string, SlidingWindowLimiter>();

/**
 * Get or create a rate limiter by name.
 */
export function getRateLimiter(name: string, options: RateLimiterOptions): RateLimiter {
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new RateLimiter(options);
    limiters.set(name, limiter);
    getLogger().debug({ name, ...options }, 'Created rate limiter');
  }
  return limiter;
}

/**
 * Get or create a sliding window limiter by name.
 */
export function getSlidingWindowLimiter(
  name: string,
  maxRequests: number,
  windowMs: number
): SlidingWindowLimiter {
  let limiter = slidingLimiters.get(name);
  if (!limiter) {
    limiter = new SlidingWindowLimiter(maxRequests, windowMs);
    slidingLimiters.set(name, limiter);
    getLogger().debug({ name, maxRequests, windowMs }, 'Created sliding window limiter');
  }
  return limiter;
}

/**
 * Reset all rate limiters (for testing).
 */
export function resetAllRateLimiters(): void {
  for (const limiter of limiters.values()) {
    limiter.reset();
  }
  for (const limiter of slidingLimiters.values()) {
    limiter.reset();
  }
}

// ============================================================================
// DECORATOR
// ============================================================================

/**
 * Decorator to rate limit a function.
 *
 * @example
 * class ApiClient {
 *   @rateLimited('api', { maxTokens: 10, refillRate: 10 })
 *   async makeRequest() {
 *     // ...
 *   }
 * }
 */
export function rateLimited(name: string, options: RateLimiterOptions) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const limiter = getRateLimiter(name, options);
      await limiter.waitForToken();
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  RateLimiter,
  SlidingWindowLimiter,
  RateLimitError,
  getRateLimiter,
  getSlidingWindowLimiter,
  resetAllRateLimiters,
  rateLimited,
};
