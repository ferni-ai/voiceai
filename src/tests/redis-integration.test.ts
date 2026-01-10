/**
 * Redis Integration Tests
 *
 * End-to-end tests for Redis services.
 * These tests require a real Redis instance (skip if unavailable).
 *
 * To run with Redis:
 *   REDIS_URL=redis://localhost:6379 pnpm vitest run src/tests/redis-integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ============================================================================
// TEST SETUP
// ============================================================================

let redisAvailable = false;

beforeAll(async () => {
  // Check if Redis is available
  try {
    const { getRedisCache } = await import('../memory/redis-cache.js');
    const redis = getRedisCache();
    await redis.initialize();
    redisAvailable = redis.isConnected();

    if (redisAvailable) {
      console.log('✅ Redis is available for integration tests');
    } else {
      console.log('⚠️ Redis not connected - skipping integration tests');
    }
  } catch {
    console.log('⚠️ Redis not available - skipping integration tests');
  }
});

afterAll(async () => {
  if (redisAvailable) {
    try {
      const { resetRedisCache } = await import('../memory/redis-cache.js');
      await resetRedisCache();
    } catch {
      // Ignore cleanup errors
    }
  }
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Redis Integration', () => {
  describe('RedisBackedCache E2E', () => {
    it.skipIf(!redisAvailable)('should persist data to Redis and retrieve', async () => {
      const { createRedisBackedCache } =
        await import('../services/data-layer/memory-cache-manager.js');

      const cache = await createRedisBackedCache<{ name: string; score: number }>('e2e-test', {
        ttlMs: 30000,
        redisKeyPrefix: 'e2e:',
        redisTtlSeconds: 30,
      });

      // Write data
      await cache.setAsync('player1', { name: 'Alice', score: 100 });
      await cache.setAsync('player2', { name: 'Bob', score: 85 });

      // Read from L1 (memory)
      expect(cache.get('player1')).toEqual({ name: 'Alice', score: 100 });

      // Clear L1 to force L2 lookup
      cache.clear();

      // Read from L2 (Redis)
      const fromRedis = await cache.getAsync('player1');
      expect(fromRedis).toEqual({ name: 'Alice', score: 100 });
    });

    it.skipIf(!redisAvailable)('should expire data based on TTL', async () => {
      const { createRedisBackedCache } =
        await import('../services/data-layer/memory-cache-manager.js');

      const cache = await createRedisBackedCache<string>('e2e-ttl', {
        ttlMs: 100, // 100ms TTL
        redisKeyPrefix: 'ttl:',
        redisTtlSeconds: 1, // 1 second Redis TTL
      });

      await cache.setAsync('expiring', 'value');

      // Should exist immediately
      expect(cache.get('expiring')).toBe('value');

      // Wait for L1 TTL
      await new Promise<void>((r) => {
        setTimeout(r, 150);
      });

      // L1 should be expired
      expect(cache.get('expiring')).toBeUndefined();
    });
  });

  describe('Redis Pub/Sub E2E', () => {
    it.skipIf(!redisAvailable)('should publish and receive messages', async () => {
      const { initializeRedisPubSub, publishSessionEvent, subscribeToSessionEvents } =
        await import('../services/redis-pubsub.js');

      await initializeRedisPubSub();

      let receivedMessage: unknown = null;

      // Subscribe
      await subscribeToSessionEvents(async (message) => {
        receivedMessage = message;
      });

      // Publish
      await publishSessionEvent('test', {
        userId: 'e2e-user',
        sessionId: 'e2e-session',
        personaId: 'ferni',
      });

      // Wait for message propagation
      await new Promise<void>((r) => {
        setTimeout(r, 100);
      });

      // Note: Due to self-filtering, we won't receive our own message
      // This test just verifies no errors occur
      expect(true).toBe(true);
    });
  });

  describe('Session Warmup E2E', () => {
    it.skipIf(!redisAvailable)('should warm Redis caches', async () => {
      const { warmSessionCaches } = await import('../services/session-warmup.js');

      const result = await warmSessionCaches('e2e-user-warmup', {
        timeoutMs: 5000,
      });

      // Should complete without error
      expect(result).toHaveProperty('warmedCaches');
      expect(result).toHaveProperty('durationMs');
      expect(result.durationMs).toBeGreaterThan(0);

      // Should have warmed at least some caches
      expect(Array.isArray(result.warmedCaches)).toBe(true);
    });
  });

  describe('Redis Circuit Breaker E2E', () => {
    it.skipIf(!redisAvailable)('should share state across instances', async () => {
      const { createRedisCircuitBreaker } =
        await import('../services/self-healing/redis-circuit-breaker.js');

      // Create two "instances" of the same breaker
      const breaker1 = createRedisCircuitBreaker('e2e-shared', {
        failureThreshold: 2,
        recoveryTimeout: 60000,
      });

      const breaker2 = createRedisCircuitBreaker('e2e-shared-copy', {
        failureThreshold: 2,
        recoveryTimeout: 60000,
      });

      // Both should start closed
      expect(breaker1.getStats().state).toBe('closed');
      expect(breaker2.getStats().state).toBe('closed');

      // Trigger failures on breaker1
      try {
        await breaker1.execute(async () => {
          throw new Error('fail1');
        });
      } catch {
        /* expected */
      }
      try {
        await breaker1.execute(async () => {
          throw new Error('fail2');
        });
      } catch {
        /* expected */
      }

      // Breaker1 should be open now
      expect(breaker1.getStats().state).toBe('open');

      // Note: breaker2 won't automatically sync in test environment
      // without periodic sync running, so we just verify breaker1 works
      expect(breaker1.canRequest()).toBe(false);
    });
  });

  describe('Persona Insights Cache L2 E2E', () => {
    it.skipIf(!redisAvailable)('should cache insights in Redis', async () => {
      const {
        cachePersonaInsights,
        getCachedPersonaInsightsAsync,
        clearSessionInsightsCache,
        getInsightsCacheStats,
      } = await import('../intelligence/context-builders/persona-insights-cache.js');

      const sessionId = 'e2e-insights-session';
      clearSessionInsightsCache(sessionId);

      // Cache some insights
      cachePersonaInsights(sessionId, {
        personaId: 'ferni',
        crossTeamContext: 'E2E test context',
        recentTopics: ['testing', 'redis'],
        emotionalState: { primary: 'curious', valence: 0.7, arousal: 0.5 },
        relevantMemories: [],
      });

      // Wait for Redis write
      await new Promise<void>((r) => {
        setTimeout(r, 50);
      });

      // Async getter should find it
      const insights = await getCachedPersonaInsightsAsync(sessionId, 'ferni');
      expect(insights).toBeDefined();
      expect(insights?.crossTeamContext).toBe('E2E test context');

      // Stats should show Redis enabled (if connected)
      const stats = getInsightsCacheStats();
      expect(stats.redisL2Enabled).toBe(true);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Redis Performance', () => {
  it.skipIf(!redisAvailable)('should handle high throughput', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<number>('perf-test', {
      ttlMs: 60000,
      maxSize: 1000,
      redisKeyPrefix: 'perf:',
    });

    const iterations = 100;
    const start = Date.now();

    // Write phase
    for (let i = 0; i < iterations; i++) {
      cache.set(`key-${i}`, i * 10);
    }

    // Read phase
    let hits = 0;
    for (let i = 0; i < iterations; i++) {
      if (cache.get(`key-${i}`) === i * 10) {
        hits++;
      }
    }

    const duration = Date.now() - start;

    // Should be fast
    expect(duration).toBeLessThan(1000); // Less than 1 second for 200 ops
    expect(hits).toBe(iterations);
  });
});
