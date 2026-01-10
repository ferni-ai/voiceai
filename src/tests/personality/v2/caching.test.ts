/**
 * Profile Caching Tests
 *
 * Tests for the personality v2 profile caching system:
 * - TTL behavior
 * - Cache invalidation
 * - Race condition prevention
 * - LRU pruning
 *
 * @module tests/personality/v2/caching
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  clearProfileCache,
  invalidateBuildContextCache,
  getProfileCacheStats,
} from '../../../personality/application/build-personality-context.js';
import { createTestPersonalityService } from '../../../personality/v2/index.js';

describe('Profile Caching', () => {
  let service: ReturnType<typeof createTestPersonalityService>['service'];
  let repository: ReturnType<typeof createTestPersonalityService>['repository'];

  beforeEach(() => {
    clearProfileCache();
    const test = createTestPersonalityService();
    service = test.service;
    repository = test.repository;
  });

  afterEach(() => {
    clearProfileCache();
    vi.useRealTimers();
  });

  describe('Cache Hits and Misses', () => {
    it('should cache profile on first access', async () => {
      // First access - cache miss
      await service.buildContext({
        userId: 'cache_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      const stats = getProfileCacheStats();
      expect(stats.cacheSize).toBe(1);
    });

    it('should return cached profile on second access', async () => {
      // First access
      const context1 = await service.buildContext({
        userId: 'cache_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      // Second access - should use cache
      const context2 = await service.buildContext({
        userId: 'cache_test_user',
        personaId: 'ferni',
        currentMessage: 'How are you?',
      });

      // Same relationship stage indicates same profile
      expect(context1.relationshipStage).toBe(context2.relationshipStage);
    });

    it('should cache different users separately', async () => {
      await service.buildContext({
        userId: 'user_a',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      await service.buildContext({
        userId: 'user_b',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      const stats = getProfileCacheStats();
      expect(stats.cacheSize).toBe(2);
    });

    it('should cache different personas separately', async () => {
      await service.buildContext({
        userId: 'cache_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      await service.buildContext({
        userId: 'cache_test_user',
        personaId: 'maya',
        currentMessage: 'Hello!',
      });

      const stats = getProfileCacheStats();
      expect(stats.cacheSize).toBe(2);
    });
  });

  describe('TTL Behavior', () => {
    it('should expire cache after TTL', async () => {
      vi.useFakeTimers();

      // First access
      await service.buildContext({
        userId: 'ttl_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(1);

      // Advance time past TTL (30 seconds)
      vi.advanceTimersByTime(31_000);

      // Force a new access - should trigger reload
      await service.buildContext({
        userId: 'ttl_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello again!',
      });

      // Cache should still be size 1 (expired entry replaced)
      expect(getProfileCacheStats().cacheSize).toBe(1);
    });

    it('should not expire cache before TTL', async () => {
      vi.useFakeTimers();

      // First access
      await service.buildContext({
        userId: 'ttl_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      // Advance time but not past TTL
      vi.advanceTimersByTime(15_000);

      // Second access - should still use cache
      await service.buildContext({
        userId: 'ttl_test_user',
        personaId: 'ferni',
        currentMessage: 'Hello again!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache for specific user', async () => {
      await service.buildContext({
        userId: 'invalidate_test',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(1);

      invalidateBuildContextCache('invalidate_test', 'ferni');

      expect(getProfileCacheStats().cacheSize).toBe(0);
    });

    it('should not affect other users when invalidating', async () => {
      await service.buildContext({
        userId: 'user_a',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      await service.buildContext({
        userId: 'user_b',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(2);

      invalidateBuildContextCache('user_a', 'ferni');

      expect(getProfileCacheStats().cacheSize).toBe(1);
    });

    it('should invalidate cache after recordMoment', async () => {
      // Build context (caches profile)
      await service.buildContext({
        userId: 'moment_test',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(1);

      // Record moment (should invalidate cache)
      await service.recordMoment({
        userId: 'moment_test',
        personaId: 'ferni',
        message: "I've been struggling with anxiety",
        topics: ['anxiety'],
      });

      // Cache should be invalidated (recordMoment calls invalidateBuildContextCache)
      expect(getProfileCacheStats().cacheSize).toBe(0);
    });
  });

  describe('Concurrent Access (Race Condition Prevention)', () => {
    it('should handle concurrent requests for same user', async () => {
      // Simulate 5 concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() =>
          service.buildContext({
            userId: 'concurrent_user',
            personaId: 'ferni',
            currentMessage: 'Hello!',
          })
        );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(5);
      results.forEach((r) => {
        expect(r.profile).toBeDefined();
      });

      // Should only have one cache entry
      expect(getProfileCacheStats().cacheSize).toBe(1);
    });

    it('should not have in-flight promises after completion', async () => {
      await service.buildContext({
        userId: 'flight_test',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      const stats = getProfileCacheStats();
      expect(stats.loadingCount).toBe(0);
    });
  });

  describe('Cache Pruning', () => {
    it('should prune old entries when cache is full', async () => {
      // Fill cache beyond max size
      for (let i = 0; i < 105; i++) {
        await service.buildContext({
          userId: `prune_test_${i}`,
          personaId: 'ferni',
          currentMessage: 'Hello!',
        });
      }

      const stats = getProfileCacheStats();
      // Should have pruned to stay under max
      expect(stats.cacheSize).toBeLessThanOrEqual(stats.maxSize);
    });
  });

  describe('Clear Cache', () => {
    it('should clear all cached profiles', async () => {
      await service.buildContext({
        userId: 'user_1',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      await service.buildContext({
        userId: 'user_2',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(getProfileCacheStats().cacheSize).toBe(2);

      clearProfileCache();

      expect(getProfileCacheStats().cacheSize).toBe(0);
    });
  });
});
