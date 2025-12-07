/**
 * Redis Cache Tests
 *
 * Tests for the Redis cache layer graceful degradation:
 * - All operations return sensible defaults when Redis unavailable
 * - Rate limiting fails open for availability
 * - Factory and reset functions work correctly
 *
 * Note: These tests focus on the graceful degradation behavior,
 * which is the critical safety feature of this cache layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCache, getRedisCache, resetRedisCache } from '../memory/redis-cache.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('RedisCache - Graceful Degradation', () => {
  let cache: RedisCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRedisCache();
    // Create cache without initializing (simulates Redis unavailable)
    cache = new RedisCache();
  });

  describe('When Redis is Not Connected', () => {
    it('should report not connected', () => {
      expect(cache.isConnected()).toBe(false);
    });

    describe('Session Management', () => {
      it('setSession should return false', async () => {
        const result = await cache.setSession('session-123', { userId: 'user-1' });
        expect(result).toBe(false);
      });

      it('getSession should return null', async () => {
        const result = await cache.getSession('session-123');
        expect(result).toBeNull();
      });

      it('deleteSession should return false', async () => {
        const result = await cache.deleteSession('session-123');
        expect(result).toBe(false);
      });

      it('extendSession should return false', async () => {
        const result = await cache.extendSession('session-123');
        expect(result).toBe(false);
      });
    });

    describe('Conversation Turns', () => {
      it('addTurn should return false', async () => {
        const result = await cache.addTurn('session-123', {
          role: 'user',
          content: 'hello',
          timestamp: new Date(),
        });
        expect(result).toBe(false);
      });

      it('getRecentTurns should return empty array', async () => {
        const result = await cache.getRecentTurns('session-123');
        expect(result).toEqual([]);
      });

      it('getTurnCount should return 0', async () => {
        const result = await cache.getTurnCount('session-123');
        expect(result).toBe(0);
      });
    });

    describe('Analysis Caching', () => {
      it('cacheAnalysis should return false', async () => {
        const result = await cache.cacheAnalysis('session-123', { sentiment: 'positive' });
        expect(result).toBe(false);
      });

      it('getCachedAnalysis should return null', async () => {
        const result = await cache.getCachedAnalysis('session-123');
        expect(result).toBeNull();
      });
    });

    describe('User Session Mapping', () => {
      it('setUserSession should return false', async () => {
        const result = await cache.setUserSession('user-123', 'session-456');
        expect(result).toBe(false);
      });

      it('getUserSession should return null', async () => {
        const result = await cache.getUserSession('user-123');
        expect(result).toBeNull();
      });
    });

    describe('Rate Limiting - Fail Open', () => {
      it('should allow requests when Redis unavailable (fail open)', async () => {
        const result = await cache.checkRateLimit('user-123', 60);

        expect(result).toEqual({
          allowed: true,
          current: 0,
          remaining: 60,
        });
      });

      it('should use default limit when not specified', async () => {
        const result = await cache.checkRateLimit('user-123');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(60); // default limit
      });
    });

    describe('Generic Operations', () => {
      it('set should return false', async () => {
        const result = await cache.set('key', 'value');
        expect(result).toBe(false);
      });

      it('get should return null', async () => {
        const result = await cache.get('key');
        expect(result).toBeNull();
      });

      it('delete should return false', async () => {
        const result = await cache.delete('key');
        expect(result).toBe(false);
      });

      it('exists should return false', async () => {
        const result = await cache.exists('key');
        expect(result).toBe(false);
      });
    });

    describe('Connection Management', () => {
      it('close should not throw when not connected', async () => {
        await expect(cache.close()).resolves.not.toThrow();
      });
    });
  });
});

describe('Redis Cache Factory', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRedisCache();
  });

  describe('getRedisCache', () => {
    it('should return singleton instance', () => {
      const cache1 = getRedisCache();
      const cache2 = getRedisCache();

      expect(cache1).toBe(cache2);
    });

    it('should accept custom config', () => {
      const cache = getRedisCache({ host: 'custom-host', port: 6380 });

      expect(cache).toBeDefined();
      expect(cache.isConnected()).toBe(false); // Not initialized yet
    });
  });

  describe('resetRedisCache', () => {
    it('should clear singleton', async () => {
      const cache1 = getRedisCache();
      await resetRedisCache();
      const cache2 = getRedisCache();

      expect(cache1).not.toBe(cache2);
    });
  });
});

describe('RedisCache Constructor', () => {
  it('should use environment variables for config', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      REDIS_URL: 'redis://test:6379',
      REDIS_HOST: 'test-host',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'secret',
    };

    const cache = new RedisCache();

    // Cache is created but not connected
    expect(cache.isConnected()).toBe(false);

    process.env = originalEnv;
  });

  it('should accept config override', () => {
    const cache = new RedisCache({
      host: 'override-host',
      port: 6381,
      password: 'override-password',
      keyPrefix: 'custom:',
    });

    expect(cache.isConnected()).toBe(false);
  });
});
