/**
 * Entity Cache Tests
 *
 * Tests for the session-scoped entity resolution cache that reduces
 * Firestore reads during entity lookups.
 *
 * @module memory/entity-store/__tests__/entity-cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedEntityList,
  cacheEntityList,
  getCachedEntity,
  cacheEntity,
  getCachedEntityIdByAlias,
  cacheAliasMapping,
  invalidateUserCache,
  invalidateEntity,
  clearAllEntityCaches,
  getEntityCacheMetrics,
  resetEntityCacheMetrics,
  configureEntityCache,
  recordCacheHit,
  recordCacheMiss,
} from '../entity-cache.js';
import type { Entity, EntityType } from '../types.js';

// Helper to create test entities
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).slice(2)}`,
    userId: 'test-user',
    type: 'person' as EntityType,
    canonicalName: 'Test Entity',
    aliases: [],
    searchTokens: [],
    embedding: [], // Required for Entity type
    createdAt: new Date(),
    updatedAt: new Date(),
    mentionCount: 0,
    salience: 0.5,
    ...overrides,
  } as Entity;
}

describe('EntityCache', () => {
  beforeEach(() => {
    // Clear all caches and metrics before each test
    clearAllEntityCaches();
    resetEntityCacheMetrics();
    // Reset to default config with short TTLs for testing
    configureEntityCache({
      entityListTtlMs: 60_000,
      entityTtlMs: 30_000,
      aliasTtlMs: 60_000,
      maxEntitiesPerUser: 500,
      maxUsers: 100,
    });
  });

  describe('Entity List Cache', () => {
    it('should return null for uncached entity list', () => {
      const result = getCachedEntityList('user-1');
      expect(result).toBeNull();
    });

    it('should cache and retrieve entity list', () => {
      const entities = [
        createTestEntity({ id: 'e1', canonicalName: 'Alice' }),
        createTestEntity({ id: 'e2', canonicalName: 'Bob' }),
      ];

      cacheEntityList('user-1', entities);
      const cached = getCachedEntityList('user-1');

      expect(cached).not.toBeNull();
      expect(cached).toHaveLength(2);
      expect(cached![0].canonicalName).toBe('Alice');
    });

    it('should cache entity list by type', () => {
      const personEntities = [
        createTestEntity({ id: 'e1', type: 'person', canonicalName: 'Alice' }),
      ];
      const placeEntities = [
        createTestEntity({ id: 'e2', type: 'place', canonicalName: 'Office' }),
      ];

      cacheEntityList('user-1', personEntities, { types: ['person'] });
      cacheEntityList('user-1', placeEntities, { types: ['place'] });

      const cachedPeople = getCachedEntityList('user-1', { types: ['person'] });
      const cachedPlaces = getCachedEntityList('user-1', { types: ['place'] });

      expect(cachedPeople).toHaveLength(1);
      expect(cachedPeople![0].type).toBe('person');
      expect(cachedPlaces).toHaveLength(1);
      expect(cachedPlaces![0].type).toBe('place');
    });

    it('should apply limit when retrieving from full cache', () => {
      const entities = Array.from({ length: 10 }, (_, i) =>
        createTestEntity({ id: `e${i}`, canonicalName: `Entity ${i}` })
      );

      cacheEntityList('user-1', entities);
      const cached = getCachedEntityList('user-1', { topK: 3 });

      expect(cached).toHaveLength(3);
    });
  });

  describe('Individual Entity Cache', () => {
    it('should return null for uncached entity', () => {
      const result = getCachedEntity('user-1', 'nonexistent-id');
      expect(result).toBeNull();
    });

    it('should cache and retrieve individual entity', () => {
      const entity = createTestEntity({ id: 'e1', canonicalName: 'Alice' });

      cacheEntity('user-1', entity);
      const cached = getCachedEntity('user-1', 'e1');

      expect(cached).not.toBeNull();
      expect(cached!.canonicalName).toBe('Alice');
    });

    it('should cache aliases when caching entity', () => {
      const entity = createTestEntity({
        id: 'e1',
        canonicalName: 'Alice',
        aliases: ['ali', 'allie'],
        type: 'person',
      });

      cacheEntity('user-1', entity);

      // Should be able to find by alias
      const byAlias = getCachedEntityIdByAlias('user-1', 'ali');
      expect(byAlias).toBe('e1');

      // Should also work with type constraint
      const byAliasWithType = getCachedEntityIdByAlias('user-1', 'allie', 'person');
      expect(byAliasWithType).toBe('e1');
    });
  });

  describe('Alias Cache', () => {
    it('should return null for uncached alias', () => {
      const result = getCachedEntityIdByAlias('user-1', 'unknown-alias');
      expect(result).toBeNull();
    });

    it('should cache and retrieve alias mapping', () => {
      cacheAliasMapping('user-1', 'my brother', 'entity-123', 'person');

      const entityId = getCachedEntityIdByAlias('user-1', 'my brother');
      expect(entityId).toBe('entity-123');
    });

    it('should be case-insensitive', () => {
      cacheAliasMapping('user-1', 'My Brother', 'entity-123');

      const lower = getCachedEntityIdByAlias('user-1', 'my brother');
      const upper = getCachedEntityIdByAlias('user-1', 'MY BROTHER');

      expect(lower).toBe('entity-123');
      expect(upper).toBe('entity-123');
    });

    it('should find alias without type when type was specified in cache', () => {
      cacheAliasMapping('user-1', 'mom', 'entity-456', 'person');

      // Should find without type constraint
      const withoutType = getCachedEntityIdByAlias('user-1', 'mom');
      expect(withoutType).toBe('entity-456');

      // Should also find with type constraint
      const withType = getCachedEntityIdByAlias('user-1', 'mom', 'person');
      expect(withType).toBe('entity-456');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate all cache for a user', () => {
      const entity = createTestEntity({ id: 'e1' });
      cacheEntity('user-1', entity);
      cacheEntityList('user-1', [entity]);
      cacheAliasMapping('user-1', 'test', 'e1');

      invalidateUserCache('user-1');

      expect(getCachedEntity('user-1', 'e1')).toBeNull();
      expect(getCachedEntityList('user-1')).toBeNull();
      expect(getCachedEntityIdByAlias('user-1', 'test')).toBeNull();
    });

    it('should not affect other users when invalidating', () => {
      const entity1 = createTestEntity({ id: 'e1', userId: 'user-1' });
      const entity2 = createTestEntity({ id: 'e2', userId: 'user-2' });

      cacheEntity('user-1', entity1);
      cacheEntity('user-2', entity2);

      invalidateUserCache('user-1');

      expect(getCachedEntity('user-1', 'e1')).toBeNull();
      expect(getCachedEntity('user-2', 'e2')).not.toBeNull();
    });

    it('should invalidate specific entity and its aliases', () => {
      const entity = createTestEntity({
        id: 'e1',
        canonicalName: 'Alice',
        aliases: ['ali'],
        type: 'person',
      });

      cacheEntity('user-1', entity);
      expect(getCachedEntity('user-1', 'e1')).not.toBeNull();
      expect(getCachedEntityIdByAlias('user-1', 'ali')).toBe('e1');

      invalidateEntity('user-1', 'e1');

      expect(getCachedEntity('user-1', 'e1')).toBeNull();
      expect(getCachedEntityIdByAlias('user-1', 'ali')).toBeNull();
    });
  });

  describe('Cache Metrics', () => {
    it('should track hits and misses', () => {
      recordCacheHit('entityById');
      recordCacheHit('entityById');
      recordCacheMiss('entityById');

      recordCacheHit('alias');
      recordCacheMiss('alias');
      recordCacheMiss('alias');

      const metrics = getEntityCacheMetrics();

      expect(metrics.hitRate.entityById).toBeCloseTo(2 / 3, 2);
      expect(metrics.hitRate.alias).toBeCloseTo(1 / 3, 2);
    });

    it('should count cached entities', () => {
      const entity1 = createTestEntity({ id: 'e1' });
      const entity2 = createTestEntity({ id: 'e2' });

      cacheEntity('user-1', entity1);
      cacheEntity('user-1', entity2);
      cacheEntity('user-2', createTestEntity({ id: 'e3' }));

      const metrics = getEntityCacheMetrics();

      expect(metrics.totalUsers).toBe(2);
      expect(metrics.totalCachedEntities).toBe(3);
    });

    it('should reset metrics', () => {
      recordCacheHit('entityById');
      recordCacheMiss('entityById');

      resetEntityCacheMetrics();

      const metrics = getEntityCacheMetrics();
      expect(metrics.hitRate.entityById).toBe(0);
    });
  });

  describe('Max Users Eviction', () => {
    it('should evict oldest user when max users reached', () => {
      // Configure with very low max users
      configureEntityCache({ maxUsers: 2 });

      cacheEntity('user-1', createTestEntity({ id: 'e1' }));
      cacheEntity('user-2', createTestEntity({ id: 'e2' }));

      // Adding a third user should evict the first
      cacheEntity('user-3', createTestEntity({ id: 'e3' }));

      // user-1 should be evicted (FIFO)
      expect(getCachedEntity('user-1', 'e1')).toBeNull();
      expect(getCachedEntity('user-2', 'e2')).not.toBeNull();
      expect(getCachedEntity('user-3', 'e3')).not.toBeNull();
    });
  });
});
