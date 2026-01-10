/**
 * Redis Services Unit Tests
 *
 * Tests for Redis-backed caching, pub/sub, session warmup, and circuit breakers.
 * Uses mocks to test logic without requiring a real Redis instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Redis cache
const mockRedisCache = {
  isConnected: vi.fn(() => true),
  initialize: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve(null)),
  set: vi.fn(() => Promise.resolve()),
  setCompressed: vi.fn(() => Promise.resolve()),
  getCompressed: vi.fn(() => Promise.resolve(null)),
  delete: vi.fn(() => Promise.resolve(true)), // RedisCache uses 'delete', not 'del'
  getPersonaAffinity: vi.fn(() => Promise.resolve(null)),
  setPersonaAffinity: vi.fn(() => Promise.resolve()),
  getEmotionalState: vi.fn(() => Promise.resolve(null)),
  setEmotionalState: vi.fn(() => Promise.resolve()),
  getUserPresence: vi.fn(() => Promise.resolve(null)),
  setUserPresence: vi.fn(() => Promise.resolve()),
};

vi.mock('../memory/redis-cache.js', () => ({
  getRedisCache: () => mockRedisCache,
  getRedisCacheAsync: () => Promise.resolve(mockRedisCache),
  resetRedisCache: vi.fn(),
  RedisCache: vi.fn(),
}));

// ============================================================================
// REDIS-BACKED CACHE TESTS
// ============================================================================

describe('RedisBackedCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with Redis when available', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<string>('test-cache', {
      ttlMs: 60000,
      maxSize: 100,
    });

    expect(cache).toBeDefined();
    expect(cache.name).toBe('test-cache');
  });

  it('should get from L1 memory first', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<string>('test-l1', {
      ttlMs: 60000,
      maxSize: 100,
    });

    // Set a value
    cache.set('key1', 'value1');

    // Get should return from L1
    const result = cache.get('key1');
    expect(result).toBe('value1');
  });

  it('should write to L1 synchronously and provide L2 via async', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<{ name: string }>('test-write', {
      ttlMs: 60000,
      redisKeyPrefix: 'test:',
    });

    // L1 write is synchronous
    cache.set('user1', { name: 'Alice' });

    // L1 should have it immediately
    expect(cache.get('user1')).toEqual({ name: 'Alice' });

    // setAsync should also work
    await cache.setAsync('user2', { name: 'Bob' });
    expect(cache.get('user2')).toEqual({ name: 'Bob' });
  });

  it('should provide getAsync for L2 lookup', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<{ name: string }>('test-fallback', {
      ttlMs: 60000,
      redisKeyPrefix: 'fallback:',
    });

    // Set a value
    cache.set('user3', { name: 'Charlie' });

    // getAsync should find it (from L1 first)
    const result = await cache.getAsync('user3');
    expect(result).toEqual({ name: 'Charlie' });

    // L1 miss returns undefined (no real Redis in test)
    const miss = await cache.getAsync('nonexistent');
    expect(miss).toBeUndefined();
  });

  it('should delete from L1', async () => {
    const { createRedisBackedCache } =
      await import('../services/data-layer/memory-cache-manager.js');

    const cache = await createRedisBackedCache<string>('test-delete', {
      ttlMs: 60000,
      redisKeyPrefix: 'del:',
    });

    cache.set('toDelete', 'value');
    expect(cache.get('toDelete')).toBe('value');

    cache.delete('toDelete');
    expect(cache.get('toDelete')).toBeUndefined();
  });

  it('should provide extended stats with L2 info', async () => {
    const { RedisBackedCache } = await import('../services/data-layer/memory-cache-manager.js');

    // Create cache directly to ensure we get RedisBackedCache instance
    const cache = new RedisBackedCache<string, string>('test-stats-direct', {
      ttlMs: 60000,
      maxSize: 100,
      redisKeyPrefix: 'stats:',
      redisTtlSeconds: 60,
    });

    const stats = cache.getExtendedStats();
    // Should have L2 stats
    expect(stats).toHaveProperty('redisL2Enabled');
    expect(stats).toHaveProperty('l2Hits');
    expect(stats).toHaveProperty('l2Misses');
    expect(stats).toHaveProperty('l2Errors');
    expect(stats).toHaveProperty('l2HitRate');
    // And standard stats (from CacheStats interface)
    expect(stats).toHaveProperty('entries');
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('evictions');
  });
});

// ============================================================================
// SESSION WARMUP TESTS
// ============================================================================

describe('Session Warmup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should warm multiple caches in parallel', async () => {
    const { warmSessionCaches } = await import('../services/session-warmup.js');

    const result = await warmSessionCaches('test-user-123', {
      timeoutMs: 5000,
      includeSemanticRouter: false, // Skip to avoid complex mocking
      includeSuperhuman: false,
    });

    expect(result).toHaveProperty('warmedCaches');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.warmedCaches)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should respect timeout', async () => {
    const { warmSessionCaches } = await import('../services/session-warmup.js');

    const start = Date.now();
    const result = await warmSessionCaches('test-user-456', {
      timeoutMs: 100, // Very short timeout
      includeSemanticRouter: false,
      includeSuperhuman: false,
    });
    const elapsed = Date.now() - start;

    // Should complete within reasonable time
    expect(elapsed).toBeLessThan(500);
    expect(result).toHaveProperty('warmedCaches');
  });

  it('should provide setup hooks for connect/disconnect', async () => {
    const { setupWarmupOnConnect } = await import('../services/session-warmup.js');

    const hooks = setupWarmupOnConnect();

    expect(hooks).toHaveProperty('onConnect');
    expect(hooks).toHaveProperty('onDisconnect');
    expect(typeof hooks.onConnect).toBe('function');
    expect(typeof hooks.onDisconnect).toBe('function');
  });
});

// ============================================================================
// REDIS PUB/SUB TESTS
// ============================================================================

describe('Redis Pub/Sub', () => {
  // Mock ioredis
  const mockPublisher = {
    publish: vi.fn(() => Promise.resolve(1)),
    quit: vi.fn(() => Promise.resolve()),
  };

  const mockSubscriber = {
    subscribe: vi.fn(() => Promise.resolve()),
    unsubscribe: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export channel constants', async () => {
    const { CHANNELS } = await import('../services/redis-pubsub.js');

    expect(CHANNELS).toHaveProperty('SESSION');
    expect(CHANNELS).toHaveProperty('CACHE_INVALIDATION');
    expect(CHANNELS).toHaveProperty('INSIGHTS');
    expect(CHANNELS).toHaveProperty('CIRCUIT_BREAKER');
  });

  it('should provide convenience publish functions', async () => {
    const { publishSessionEvent, publishCacheInvalidation, publishInsightsUpdate } =
      await import('../services/redis-pubsub.js');

    // These should not throw (they gracefully fail if Redis not available)
    await expect(
      publishSessionEvent('handoff', {
        userId: 'u1',
        sessionId: 's1',
        personaId: 'ferni',
      })
    ).resolves.not.toThrow();

    await expect(
      publishCacheInvalidation({
        key: 'user:123',
        reason: 'test',
      })
    ).resolves.not.toThrow();

    await expect(
      publishInsightsUpdate({
        userId: 'u1',
        insightType: 'test',
        data: {},
      })
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// REDIS CIRCUIT BREAKER TESTS
// ============================================================================

describe('Redis Circuit Breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create Redis-backed circuit breaker', async () => {
    const { createRedisCircuitBreaker } =
      await import('../services/self-healing/redis-circuit-breaker.js');

    const breaker = createRedisCircuitBreaker('test-breaker', {
      failureThreshold: 3,
      resetTimeout: 10000,
    });

    expect(breaker).toBeDefined();
    expect(breaker.name).toBe('test-breaker');
  });

  it('should execute functions when circuit is closed', async () => {
    const { createRedisCircuitBreaker } =
      await import('../services/self-healing/redis-circuit-breaker.js');

    const breaker = createRedisCircuitBreaker('test-execute', {
      failureThreshold: 3,
    });

    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should open circuit after failure threshold', async () => {
    const { createRedisCircuitBreaker } =
      await import('../services/self-healing/redis-circuit-breaker.js');

    const breaker = createRedisCircuitBreaker('test-failures', {
      failureThreshold: 2,
      resetTimeout: 60000,
    });

    // First failure
    await expect(
      breaker.execute(async () => {
        throw new Error('fail1');
      })
    ).rejects.toThrow('fail1');

    // Second failure - should open circuit
    await expect(
      breaker.execute(async () => {
        throw new Error('fail2');
      })
    ).rejects.toThrow('fail2');

    // Third call should be rejected by open circuit
    await expect(
      breaker.execute(async () => {
        return 'should not reach';
      })
    ).rejects.toThrow(/circuit.*open/i);
  });

  it('should provide stats', async () => {
    const { createRedisCircuitBreaker } =
      await import('../services/self-healing/redis-circuit-breaker.js');

    const breaker = createRedisCircuitBreaker('test-stats', {
      failureThreshold: 5,
    });

    const stats = breaker.getStats();
    expect(stats).toHaveProperty('name');
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failures');
    expect(stats.name).toBe('test-stats');
  });

  it('should track all Redis circuit breakers', async () => {
    const { createRedisCircuitBreaker, getAllRedisCircuitStats } =
      await import('../services/self-healing/redis-circuit-breaker.js');

    createRedisCircuitBreaker('track-test-1', { failureThreshold: 5 });
    createRedisCircuitBreaker('track-test-2', { failureThreshold: 5 });

    const allStats = getAllRedisCircuitStats();
    expect(Array.isArray(allStats)).toBe(true);
    expect(allStats.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// PERSONA INSIGHTS CACHE L2 TESTS
// ============================================================================

describe('Persona Insights Cache L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have sync getter for L1 lookup', async () => {
    const { getCachedPersonaInsights, cachePersonaInsights, clearSessionInsightsCache } =
      await import('../intelligence/context-builders/persona-insights-cache.js');

    // Clear any existing cache
    clearSessionInsightsCache('test-session-sync');

    // Cache some insights (function signature: sessionId, PersonaInsights)
    cachePersonaInsights('test-session-sync', {
      personaId: 'ferni',
      crossTeamContext: 'sync test context',
      recentTopics: ['topic1'],
      emotionalState: {
        primary: 'curious',
        valence: 0.5,
        arousal: 0.5,
      },
      relevantMemories: [],
    });

    // Sync getter should find it in L1
    const insights = getCachedPersonaInsights('test-session-sync', 'ferni');
    expect(insights).toBeDefined();
    expect(insights?.crossTeamContext).toBe('sync test context');
  });

  it('should have async getter available', async () => {
    const { getCachedPersonaInsightsAsync, cachePersonaInsights, clearSessionInsightsCache } =
      await import('../intelligence/context-builders/persona-insights-cache.js');

    // Clear any existing cache
    clearSessionInsightsCache('test-session-async');

    // Cache some insights (function signature: sessionId, PersonaInsights)
    cachePersonaInsights('test-session-async', {
      personaId: 'peter-john',
      crossTeamContext: 'async test context',
      recentTopics: ['topic2'],
      emotionalState: {
        primary: 'focused',
        valence: 0.6,
        arousal: 0.4,
      },
      relevantMemories: [],
    });

    // Async getter should also find it (checks L1 first)
    const insights = await getCachedPersonaInsightsAsync('test-session-async', 'peter-john');
    expect(insights).toBeDefined();
    expect(insights?.crossTeamContext).toBe('async test context');
  });

  it('should include L2 status in stats', async () => {
    const { getInsightsCacheStats } =
      await import('../intelligence/context-builders/persona-insights-cache.js');

    const stats = getInsightsCacheStats();
    expect(stats).toHaveProperty('redisL2Enabled');
    expect(typeof stats.redisL2Enabled).toBe('boolean');
  });
});

// ============================================================================
// INTEGRATION HELPER TESTS
// ============================================================================

describe('Redis Integration Helpers', () => {
  it('should check Redis availability', async () => {
    const { isRedisAvailable } = await import('../services/redis/index.js');

    // Should return boolean without throwing
    const available = await isRedisAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should provide Map wrapper utility', async () => {
    const { wrapMapWithRedis } = await import('../services/redis/index.js');

    const originalMap = new Map<string, { value: number }>();
    originalMap.set('existing', { value: 42 });

    const wrapped = await wrapMapWithRedis('test-wrap', originalMap, {
      ttlMs: 60000,
    });

    // Original values should be copied
    expect(wrapped.get('existing')).toEqual({ value: 42 });
    expect(wrapped.has('existing')).toBe(true);

    // New values should work
    wrapped.set('new', { value: 100 });
    expect(wrapped.get('new')).toEqual({ value: 100 });

    // Size should track entries
    expect(wrapped.size).toBeGreaterThanOrEqual(2);

    // Clear should work
    wrapped.clear();
    expect(wrapped.size).toBe(0);
  });
});
