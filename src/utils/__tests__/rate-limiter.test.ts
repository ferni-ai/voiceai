/**
 * Rate Limiter Tests
 *
 * Tests the token bucket and sliding window rate limiter implementations.
 *
 * @module utils/__tests__/rate-limiter.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  SlidingWindowLimiter,
  RateLimitError,
  getRateLimiter,
  getSlidingWindowLimiter,
  resetAllRateLimiters,
} from '../rate-limiter.js';

describe('RateLimiter (Token Bucket)', () => {
  beforeEach(() => {
    resetAllRateLimiters();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should allow consumption within limits', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(8);
    });

    it('should deny consumption when tokens exhausted', () => {
      const limiter = new RateLimiter({
        maxTokens: 2,
        refillRate: 1,
        refillInterval: 1000,
      });

      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(true);
      expect(limiter.tryConsume()).toBe(false);
    });

    it('should consume multiple tokens at once', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });

      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(5);
      expect(limiter.tryConsume(6)).toBe(false);
    });

    it('should throw RateLimitError when using consume()', () => {
      const limiter = new RateLimiter({
        maxTokens: 1,
        refillRate: 1,
        refillInterval: 1000,
      });

      limiter.consume();
      expect(() => limiter.consume()).toThrow(RateLimitError);
    });
  });

  describe('refill behavior', () => {
    it('should refill tokens over time', async () => {
      vi.useFakeTimers();

      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryConsume();
      }
      expect(limiter.getAvailableTokens()).toBe(0);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Should have 5 tokens refilled
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should not exceed maxTokens when refilling', async () => {
      vi.useFakeTimers();

      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      // Use 2 tokens
      limiter.tryConsume(2);
      expect(limiter.getAvailableTokens()).toBe(8);

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Should be capped at maxTokens
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe('waitForToken', () => {
    it('should wait until token available', async () => {
      vi.useFakeTimers();

      const limiter = new RateLimiter({
        maxTokens: 1,
        refillRate: 1,
        refillInterval: 100,
      });

      limiter.tryConsume();

      const waitPromise = limiter.waitForToken();

      // Advance time
      vi.advanceTimersByTime(100);

      await waitPromise;
      expect(limiter.getAvailableTokens()).toBe(0);
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when tokens available', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });

      expect(limiter.getWaitTime()).toBe(0);
    });

    it('should calculate wait time when tokens exhausted', () => {
      const limiter = new RateLimiter({
        maxTokens: 1,
        refillRate: 1,
        refillInterval: 1000,
      });

      limiter.tryConsume();
      expect(limiter.getWaitTime()).toBe(1000);
    });
  });

  describe('state management', () => {
    it('should save and restore state', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });

      limiter.tryConsume(5);
      const state = limiter.getState();

      const newLimiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });
      newLimiter.restore(state);

      expect(newLimiter.getAvailableTokens()).toBe(5);
    });

    it('should reset limiter', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 1,
        refillInterval: 1000,
      });

      limiter.tryConsume(10);
      expect(limiter.getAvailableTokens()).toBe(0);

      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe('registry', () => {
    it('should get or create limiters by name', () => {
      const limiter1 = getRateLimiter('api', { maxTokens: 10, refillRate: 1 });
      const limiter2 = getRateLimiter('api', { maxTokens: 10, refillRate: 1 });

      expect(limiter1).toBe(limiter2);
    });

    it('should reset all limiters', () => {
      const limiter1 = getRateLimiter('a', { maxTokens: 5, refillRate: 1 });
      const limiter2 = getRateLimiter('b', { maxTokens: 5, refillRate: 1 });

      limiter1.tryConsume(5);
      limiter2.tryConsume(5);

      resetAllRateLimiters();

      expect(limiter1.getAvailableTokens()).toBe(5);
      expect(limiter2.getAvailableTokens()).toBe(5);
    });
  });
});

describe('SlidingWindowLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetAllRateLimiters();
  });

  describe('basic operations', () => {
    it('should allow requests within limit', () => {
      const limiter = new SlidingWindowLimiter(5, 60000);

      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('should deny requests beyond limit', () => {
      const limiter = new SlidingWindowLimiter(2, 60000);

      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.tryRequest()).toBe(false);
    });

    it('should check if request allowed without consuming', () => {
      const limiter = new SlidingWindowLimiter(1, 60000);

      expect(limiter.isAllowed()).toBe(true);
      limiter.tryRequest();
      expect(limiter.isAllowed()).toBe(false);
    });
  });

  describe('sliding window behavior', () => {
    it('should allow requests after window slides', async () => {
      vi.useFakeTimers();

      const limiter = new SlidingWindowLimiter(2, 1000); // 2 per second

      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.tryRequest()).toBe(true);
      expect(limiter.tryRequest()).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(1100);

      // Should allow requests again
      expect(limiter.tryRequest()).toBe(true);
    });

    it('should calculate correct reset time', async () => {
      vi.useFakeTimers();

      const limiter = new SlidingWindowLimiter(1, 1000);

      limiter.tryRequest();
      const resetTime = limiter.getResetTime();

      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(1000);
    });
  });

  describe('registry', () => {
    it('should get or create sliding window limiters', () => {
      const limiter1 = getSlidingWindowLimiter('api', 10, 60000);
      const limiter2 = getSlidingWindowLimiter('api', 10, 60000);

      expect(limiter1).toBe(limiter2);
    });
  });
});
