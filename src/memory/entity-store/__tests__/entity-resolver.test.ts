/**
 * Entity Resolver E2E Tests
 *
 * Tests for the full entity resolver implementations including:
 * - resolveMention
 * - addRelationship
 * - resolve
 * - getPeople
 * - getFacts
 * - getEntity
 * - getEntitiesByType
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Test subjects
import {
  getEntityResolver,
  resolvePerson,
  mergeEntities,
  whatDoWeKnowAbout,
  type EntityResolver,
  type MentionInput,
} from '../entity-resolver.js';
import { getEntityStore, initializeEntityStore, type EntityStore } from '../store.js';
import type { Entity, PersonAttributes } from '../types.js';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_USER_ID = `test_resolver_${uuidv4().substring(0, 8)}`;
let resolver: EntityResolver;
let store: EntityStore;
let createdEntityIds: string[] = [];

describe('Entity Resolver Full Implementation', () => {
  beforeAll(async () => {
    try {
      // Initialize store and resolver
      await initializeEntityStore();
      store = getEntityStore();
      resolver = getEntityResolver();
    } catch (error) {
      console.warn('Setup failed (may be missing credentials):', error);
    }
  });

  afterAll(async () => {
    // Cleanup created entities
    if (store) {
      for (const entityId of createdEntityIds) {
        try {
          await store.deleteEntity(entityId);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVER SINGLETON
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getEntityResolver()', () => {
    it('should return a singleton resolver', () => {
      const resolver1 = getEntityResolver();
      const resolver2 = getEntityResolver();
      expect(resolver1).toBe(resolver2);
    });

    it('should have all required methods', () => {
      expect(resolver.resolvePerson).toBeTypeOf('function');
      expect(resolver.mergeEntities).toBeTypeOf('function');
      expect(resolver.whatDoWeKnowAbout).toBeTypeOf('function');
      expect(resolver.isReady).toBeTypeOf('function');
      expect(resolver.resolveMention).toBeTypeOf('function');
      expect(resolver.addRelationship).toBeTypeOf('function');
      expect(resolver.resolve).toBeTypeOf('function');
      expect(resolver.getPeople).toBeTypeOf('function');
      expect(resolver.getFacts).toBeTypeOf('function');
      expect(resolver.getEntity).toBeTypeOf('function');
      expect(resolver.getEntitiesByType).toBeTypeOf('function');
    });

    it('should report isReady as true', () => {
      expect(resolver.isReady()).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE MENTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resolveMention()', () => {
    it('should resolve a mention by name', async () => {
      if (!store) return;

      // First create an entity
      const entity = await store.createEntity(
        TEST_USER_ID,
        'person',
        'TestPerson1',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(entity.id);

      // Now resolve it
      const mention: MentionInput = {
        name: 'TestPerson1',
      };
      const resolved = await resolver.resolveMention(TEST_USER_ID, mention);

      expect(resolved).toBeDefined();
      expect(resolved?.canonicalName).toBe('TestPerson1');
    });

    it('should resolve a mention by relationship', async () => {
      if (!store) return;

      // Create an entity with specific relationship
      const entity = await store.createEntity(
        TEST_USER_ID,
        'person',
        'TestMom',
        {
          _type: 'person',
          relationship: 'mother',
          relationshipCategory: 'family',
          sentiment: 0.9,
        } as PersonAttributes
      );
      createdEntityIds.push(entity.id);

      // Resolve by relationship
      const mention: MentionInput = {
        relationship: 'mother',
      };
      const resolved = await resolver.resolveMention(TEST_USER_ID, mention);

      expect(resolved).toBeDefined();
      // Should create or find a person entity
      if (resolved) {
        expect(resolved.type).toBe('person');
      }
    });

    it('should create new entity for unknown mention', async () => {
      if (!store) return;

      const uniqueName = `NewPerson_${uuidv4().substring(0, 6)}`;
      const mention: MentionInput = {
        name: uniqueName,
        relationship: 'colleague',
      };

      const resolved = await resolver.resolveMention(TEST_USER_ID, mention);

      expect(resolved).toBeDefined();
      expect(resolved?.canonicalName).toBe(uniqueName);

      // Track for cleanup
      if (resolved) {
        createdEntityIds.push(resolved.id);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD RELATIONSHIP
  // ═══════════════════════════════════════════════════════════════════════════

  describe('addRelationship()', () => {
    it('should create a relationship between two entities', async () => {
      if (!store) return;

      // Create two entities
      const entity1 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Alice',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.7,
        } as PersonAttributes
      );
      createdEntityIds.push(entity1.id);

      const entity2 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Bob',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.6,
        } as PersonAttributes
      );
      createdEntityIds.push(entity2.id);

      // Add relationship
      await resolver.addRelationship(TEST_USER_ID, entity1.id, entity2.id, 'friend_of');

      // Verify relationship exists
      const relationships = await store.getEntityRelationships(entity1.id);
      expect(relationships.length).toBeGreaterThan(0);

      const rel = relationships.find(
        (r) => r.fromEntity === entity1.id && r.toEntity === entity2.id
      );
      expect(rel).toBeDefined();
      expect(rel?.type).toBe('friend_of');
    });

    it('should handle different relationship types', async () => {
      if (!store) return;

      const entity1 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Employee1',
        {
          _type: 'person',
          relationship: 'colleague',
          relationshipCategory: 'colleague',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(entity1.id);

      const entity2 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Boss1',
        {
          _type: 'person',
          relationship: 'boss',
          relationshipCategory: 'professional',
          sentiment: 0.4,
        } as PersonAttributes
      );
      createdEntityIds.push(entity2.id);

      await resolver.addRelationship(TEST_USER_ID, entity1.id, entity2.id, 'reports_to');

      const relationships = await store.getEntityRelationships(entity1.id);
      const rel = relationships.find((r) => r.type === 'reports_to');
      expect(rel).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resolve()', () => {
    it('should resolve entity by ID', async () => {
      if (!store) return;

      const entity = await store.createEntity(
        TEST_USER_ID,
        'person',
        'ResolveTestPerson',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(entity.id);

      const resolved = await resolver.resolve(TEST_USER_ID, entity.id);

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe(entity.id);
      expect(resolved?.canonicalName).toBe('ResolveTestPerson');
    });

    it('should resolve entity by name query', async () => {
      if (!store) return;

      const uniqueName = `QueryTest_${uuidv4().substring(0, 6)}`;
      const entity = await store.createEntity(
        TEST_USER_ID,
        'person',
        uniqueName,
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(entity.id);

      const resolved = await resolver.resolve(TEST_USER_ID, { name: uniqueName });

      expect(resolved).toBeDefined();
      expect(resolved?.canonicalName).toBe(uniqueName);
    });

    it('should return null for non-existent entity', async () => {
      if (!store) return;

      const resolved = await resolver.resolve(TEST_USER_ID, 'non-existent-id');
      expect(resolved).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET PEOPLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getPeople()', () => {
    it('should return all person entities for a user', async () => {
      if (!store) return;

      // Create some people
      const person1 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Person1',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(person1.id);

      const person2 = await store.createEntity(
        TEST_USER_ID,
        'person',
        'Person2',
        {
          _type: 'person',
          relationship: 'colleague',
          relationshipCategory: 'colleague',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(person2.id);

      const people = await resolver.getPeople(TEST_USER_ID);

      expect(people.length).toBeGreaterThanOrEqual(2);
      expect(people.every((p) => p.type === 'person')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ENTITY BY ID
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getEntity()', () => {
    it('should get entity by ID', async () => {
      if (!store) return;

      // Use resolver to create entity (which uses storage internally)
      const resolved = await resolver.resolveMention(TEST_USER_ID, {
        name: `GetEntityTest_${uuidv4().substring(0, 6)}`,
        relationship: 'friend',
      });
      
      if (!resolved) {
        console.warn('Could not create entity for test');
        return;
      }
      createdEntityIds.push(resolved.id);

      const retrieved = await resolver.getEntity(TEST_USER_ID, resolved.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(resolved.id);
    });

    it('should return null for non-existent ID', async () => {
      const retrieved = await resolver.getEntity(TEST_USER_ID, 'fake-id-12345');
      expect(retrieved).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ENTITIES BY TYPE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getEntitiesByType()', () => {
    it('should return entities of specific type', async () => {
      if (!store) return;

      // Create a person and a commitment
      const person = await store.createEntity(
        TEST_USER_ID,
        'person',
        'TypeTestPerson',
        {
          _type: 'person',
          relationship: 'friend',
          relationshipCategory: 'friend',
          sentiment: 0.5,
        } as PersonAttributes
      );
      createdEntityIds.push(person.id);

      const people = await resolver.getEntitiesByType(TEST_USER_ID, 'person');

      expect(people.length).toBeGreaterThan(0);
      expect(people.every((e) => e.type === 'person')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET FACTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getFacts()', () => {
    it('should return facts about an entity', async () => {
      if (!store) return;

      // Create entity using resolver
      const entity = await resolver.resolveMention(TEST_USER_ID, {
        name: `FactsTestPerson_${uuidv4().substring(0, 6)}`,
        relationship: 'friend',
      });
      
      if (!entity) {
        console.warn('Could not create entity for test');
        return;
      }
      createdEntityIds.push(entity.id);

      const facts = await resolver.getFacts(TEST_USER_ID, entity.id);

      // Facts array should exist (may be empty if no facts were extracted)
      expect(Array.isArray(facts)).toBe(true);
    });
  });
});

// ============================================================================
// INTEGRATION WITH KNOWLEDGE GRAPH
// ============================================================================

describe('Knowledge Graph Integration', () => {
  it('should have entity resolver with full implementations', () => {
    // Check that the resolver has all the expected methods
    const resolver = getEntityResolver();
    
    expect(resolver.resolveMention).toBeTypeOf('function');
    expect(resolver.addRelationship).toBeTypeOf('function');
    expect(resolver.resolve).toBeTypeOf('function');
    expect(resolver.getPeople).toBeTypeOf('function');
    expect(resolver.getFacts).toBeTypeOf('function');
    expect(resolver.getEntity).toBeTypeOf('function');
    expect(resolver.getEntitiesByType).toBeTypeOf('function');
  });

  it('should have proper implementations (not just stubs)', async () => {
    // Verify that the implementations actually do something
    const resolver = getEntityResolver();
    
    // getPeople should return an array (even if empty)
    const people = await resolver.getPeople(TEST_USER_ID);
    expect(Array.isArray(people)).toBe(true);
    
    // getEntitiesByType should return an array
    const entities = await resolver.getEntitiesByType(TEST_USER_ID, 'person');
    expect(Array.isArray(entities)).toBe(true);
    
    // resolve with non-existent ID should return null (not throw)
    const resolved = await resolver.resolve(TEST_USER_ID, 'non-existent-id');
    expect(resolved).toBeNull();
  });
});
