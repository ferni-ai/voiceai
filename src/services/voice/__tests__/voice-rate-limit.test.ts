/**
 * Voice Rate Limit Service Tests
 *
 * Tests for rate limiting functionality to prevent brute-force attacks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  resetUserRateLimit,
  resetIPRateLimit,
  getUserRateLimitStatus,
  getRateLimitStats,
  createRateLimitMiddleware,
  stopCleanup,
} from '../voice-rate-limit.js';

describe('VoiceRateLimit', () => {
  // Use unique user/IP IDs for each test to avoid cross-test interference
  let testCounter = 1;
  const getUniqueUserId = () => `test-user-${testCounter++}`;
  const getUniqueIP = () => `203.0.113.${testCounter++ % 256}`;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopCleanup(); // Prevent cleanup timer from running
  });

  // ===========================================================================
  // checkRateLimit
  // ===========================================================================
  describe('checkRateLimit', () => {
    it('should allow requests under the limit', () => {
      const userId = getUniqueUserId();

      // Verify endpoint allows 10 requests per minute
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(userId, 'verify');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }
    });

    it('should deny requests when limit is exceeded', () => {
      const userId = getUniqueUserId();

      // Use up all 10 requests
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, 'verify');
      }

      // 11th request should be denied
      const result = checkRateLimit(userId, 'verify');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.blocked).toBe(true);
    });

    it('should reset after window expires', () => {
      const userId = getUniqueUserId();

      // Use up all 10 requests
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, 'verify');
      }

      // Advance time past the window (1 minute)
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      const result = checkRateLimit(userId, 'verify');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should enforce different limits for different endpoints', () => {
      const userId = getUniqueUserId();

      // Verify: 10 requests per minute
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(userId, 'verify');
        expect(result.allowed).toBe(true);
      }
      expect(checkRateLimit(userId, 'verify').allowed).toBe(false);

      // Same user, identify endpoint: 5 requests per minute
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(userId, 'identify');
        expect(result.allowed).toBe(true);
      }
      expect(checkRateLimit(userId, 'identify').allowed).toBe(false);
    });

    it('should track endpoints independently per user', () => {
      const userId1 = getUniqueUserId();
      const userId2 = getUniqueUserId();

      // User 1 uses up all verify requests
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId1, 'verify');
      }

      // User 2 should still have full limit
      const result = checkRateLimit(userId2, 'verify');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should block user after exceeding limit for configured duration', () => {
      const userId = getUniqueUserId();

      // Exceed limit
      for (let i = 0; i < 11; i++) {
        checkRateLimit(userId, 'verify');
      }

      // Should be blocked
      let result = checkRateLimit(userId, 'verify');
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.retryAfterMs).toBeGreaterThan(0);

      // Advance time 1 minute (still within 5 min block)
      vi.advanceTimersByTime(60000);
      result = checkRateLimit(userId, 'verify');
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);

      // Advance past block duration (5 minutes total)
      vi.advanceTimersByTime(250000); // 4+ more minutes
      result = checkRateLimit(userId, 'verify');
      expect(result.allowed).toBe(true);
    });

    it('should allow custom rate limit config', () => {
      const userId = getUniqueUserId();

      // Override to only allow 2 requests
      for (let i = 0; i < 2; i++) {
        const result = checkRateLimit(userId, 'verify', undefined, { maxRequests: 2 });
        expect(result.allowed).toBe(true);
      }

      // 3rd request should be denied with custom config
      const result = checkRateLimit(userId, 'verify', undefined, { maxRequests: 2 });
      expect(result.allowed).toBe(false);
    });

    it('should include IP rate limiting when provided', () => {
      const userId = getUniqueUserId();
      const ipAddress = getUniqueIP();

      // IP limit is 100 requests per minute globally
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit(getUniqueUserId(), 'status', ipAddress);
        expect(result.allowed).toBe(true);
      }

      // 101st request from same IP should be denied
      const result = checkRateLimit(userId, 'status', ipAddress);
      expect(result.allowed).toBe(false);
    });
  });

  // ===========================================================================
  // resetUserRateLimit
  // ===========================================================================
  describe('resetUserRateLimit', () => {
    it('should reset all endpoints for a user', () => {
      const userId = getUniqueUserId();

      // Use up limits on multiple endpoints
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, 'verify');
      }
      for (let i = 0; i < 5; i++) {
        checkRateLimit(userId, 'identify');
      }

      // Both should be denied
      expect(checkRateLimit(userId, 'verify').allowed).toBe(false);
      expect(checkRateLimit(userId, 'identify').allowed).toBe(false);

      // Reset all
      resetUserRateLimit(userId);

      // Both should be allowed again
      expect(checkRateLimit(userId, 'verify').allowed).toBe(true);
      expect(checkRateLimit(userId, 'identify').allowed).toBe(true);
    });

    it('should reset specific endpoint for a user', () => {
      const userId = getUniqueUserId();

      // Use up limits on multiple endpoints
      for (let i = 0; i < 10; i++) {
        checkRateLimit(userId, 'verify');
      }
      for (let i = 0; i < 5; i++) {
        checkRateLimit(userId, 'identify');
      }

      // Reset only verify
      resetUserRateLimit(userId, 'verify');

      // Verify should be allowed, identify should still be denied
      expect(checkRateLimit(userId, 'verify').allowed).toBe(true);
      expect(checkRateLimit(userId, 'identify').allowed).toBe(false);
    });

    it('should handle reset for non-existent user gracefully', () => {
      // Should not throw
      expect(() => resetUserRateLimit('non-existent-user')).not.toThrow();
    });
  });

  // ===========================================================================
  // resetIPRateLimit
  // ===========================================================================
  describe('resetIPRateLimit', () => {
    it('should reset rate limit for an IP', () => {
      const ipAddress = getUniqueIP();

      // Use up IP limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(getUniqueUserId(), 'status', ipAddress);
      }

      // Should be denied
      expect(checkRateLimit(getUniqueUserId(), 'status', ipAddress).allowed).toBe(false);

      // Reset IP
      resetIPRateLimit(ipAddress);

      // Should be allowed again
      expect(checkRateLimit(getUniqueUserId(), 'status', ipAddress).allowed).toBe(true);
    });

    it('should handle reset for non-existent IP gracefully', () => {
      expect(() => resetIPRateLimit('192.0.2.1')).not.toThrow();
    });
  });

  // ===========================================================================
  // getUserRateLimitStatus
  // ===========================================================================
  describe('getUserRateLimitStatus', () => {
    it('should return status for all endpoints', () => {
      const userId = getUniqueUserId();

      // Make some requests
      for (let i = 0; i < 3; i++) {
        checkRateLimit(userId, 'verify');
      }
      for (let i = 0; i < 2; i++) {
        checkRateLimit(userId, 'enroll');
      }

      const status = getUserRateLimitStatus(userId);

      expect(status.verify).toBeDefined();
      expect(status.verify.requestsInWindow).toBe(3);
      expect(status.verify.maxRequests).toBe(10);
      expect(status.verify.blocked).toBe(false);

      expect(status.enroll).toBeDefined();
      expect(status.enroll.requestsInWindow).toBe(2);
      expect(status.enroll.maxRequests).toBe(20);

      expect(status.identify).toBeDefined();
      expect(status.identify.requestsInWindow).toBe(0);
    });

    it('should show blocked status when user is blocked', () => {
      const userId = getUniqueUserId();

      // Exceed limit to get blocked
      for (let i = 0; i < 11; i++) {
        checkRateLimit(userId, 'verify');
      }

      const status = getUserRateLimitStatus(userId);
      expect(status.verify.blocked).toBe(true);
      expect(status.verify.blockedUntil).toBeInstanceOf(Date);
    });

    it('should return zeros for user with no history', () => {
      const status = getUserRateLimitStatus('brand-new-user');

      expect(status.verify.requestsInWindow).toBe(0);
      expect(status.identify.requestsInWindow).toBe(0);
      expect(status.enroll.requestsInWindow).toBe(0);
    });
  });

  // ===========================================================================
  // getRateLimitStats
  // ===========================================================================
  describe('getRateLimitStats', () => {
    it('should return aggregate statistics', () => {
      const user1 = getUniqueUserId();
      const user2 = getUniqueUserId();

      // Make some requests
      for (let i = 0; i < 5; i++) {
        checkRateLimit(user1, 'verify');
        checkRateLimit(user2, 'verify');
      }

      const stats = getRateLimitStats();

      expect(stats.activeUsers).toBeGreaterThanOrEqual(2);
      expect(stats.totalRequests).toBeGreaterThanOrEqual(10);
      expect(stats.blockedUsers).toBeGreaterThanOrEqual(0);
      expect(stats.blockedIPs).toBeGreaterThanOrEqual(0);
    });

    it('should count blocked users', () => {
      const user = getUniqueUserId();

      // Exceed limit to get blocked
      for (let i = 0; i < 11; i++) {
        checkRateLimit(user, 'verify');
      }

      const stats = getRateLimitStats();
      expect(stats.blockedUsers).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // createRateLimitMiddleware
  // ===========================================================================
  describe('createRateLimitMiddleware', () => {
    it('should create middleware that allows requests under limit', () => {
      const userId = getUniqueUserId();
      const middleware = createRateLimitMiddleware('verify');

      const req = {
        userId,
        headers: { 'x-forwarded-for': getUniqueIP() },
      };
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
        status: vi.fn().mockReturnValue({ json: vi.fn() }),
      };

      const allowed = middleware(req, res);

      expect(allowed).toBe(true);
      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('9');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should create middleware that blocks requests over limit', () => {
      const userId = getUniqueUserId();
      const ipAddress = getUniqueIP();
      const middleware = createRateLimitMiddleware('verify');

      const req = {
        userId,
        headers: { 'x-forwarded-for': ipAddress },
      };
      const headers: Record<string, string> = {};
      const jsonMock = vi.fn();
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
        status: vi.fn().mockReturnValue({ json: jsonMock }),
      };

      // Use up all requests
      for (let i = 0; i < 10; i++) {
        middleware(req, res);
      }

      // 11th should be blocked
      const allowed = middleware(req, res);

      expect(allowed).toBe(false);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests',
        })
      );
      expect(headers['Retry-After']).toBeDefined();
    });

    it('should use anonymous user when no userId provided', () => {
      const middleware = createRateLimitMiddleware('status');

      const req = {
        headers: { 'x-forwarded-for': getUniqueIP() },
      };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnValue({ json: vi.fn() }),
      };

      // Should not throw
      const allowed = middleware(req, res);
      expect(allowed).toBe(true);
    });
  });
});
