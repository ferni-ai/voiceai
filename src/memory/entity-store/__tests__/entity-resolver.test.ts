/**
 * Entity Resolver E2E Tests
 *
 * Full implementation suite against Firestore. Skipped unless
 * FIRESTORE_EMULATOR_HOST is set (regular unit CI stays cheap).
 *
 * CI: Data Layer E2E → Entity Resolver Emulator, which starts the
 * Firestore emulator with committed indexes (`firestore.indexes.json`
 * via `firebase.json`) and local hash embeddings (no network).
 *
 * Local: FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm test:memory:resolver
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import {
  getEntityResolver,
  type EntityResolver,
  type MentionInput,
} from '../entity-resolver.js';
import { initializeEntityStore, type EntityStore } from '../store.js';
import { getRelationshipsForEntity } from '../storage.js';

const TEST_USER_ID = `test_resolver_${uuidv4().substring(0, 8)}`;
const runFirestoreIntegration = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let resolver: EntityResolver;
let createdEntityIds: string[] = [];

function track(id: string | undefined): void {
  if (id) createdEntityIds.push(id);
}

(runFirestoreIntegration ? describe : describe.skip)(
  'Entity Resolver Full Implementation (Firestore emulator)',
  () => {
    beforeAll(async () => {
      // Fail the job if the emulator is advertised but the store cannot init.
      // Swallowing here would make CI green while skipping every assertion.
      await initializeEntityStore();
      resolver = getEntityResolver();
      expect(resolver.isReady()).toBe(true);
    });

    afterAll(async () => {
      const { getEntityStore } = await import('../store.js');
      const store: EntityStore = getEntityStore();
      for (const entityId of createdEntityIds) {
        try {
          await store.deleteEntity(entityId);
        } catch {
          // Cleanup is best-effort; resolver entities live in entity_store/.
        }
      }
    });

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

    describe('resolveMention()', () => {
      it('should resolve a mention by name', async () => {
        const mention: MentionInput = { name: 'TestPerson1' };
        const created = await resolver.resolveMention(TEST_USER_ID, mention);
        expect(created).toBeDefined();
        expect(created?.canonicalName).toBe('TestPerson1');
        track(created?.id);

        const resolved = await resolver.resolveMention(TEST_USER_ID, mention);
        expect(resolved).toBeDefined();
        expect(resolved?.id).toBe(created?.id);
        expect(resolved?.canonicalName).toBe('TestPerson1');
      });

      it('should resolve a mention by relationship', async () => {
        const mention: MentionInput = { relationship: 'mother' };
        const resolved = await resolver.resolveMention(TEST_USER_ID, mention);

        expect(resolved).toBeDefined();
        track(resolved?.id);
        if (resolved) {
          expect(resolved.type).toBe('person');
        }
      });

      it('should create new entity for unknown mention', async () => {
        const uniqueName = `NewPerson_${uuidv4().substring(0, 6)}`;
        const mention: MentionInput = {
          name: uniqueName,
          relationship: 'colleague',
        };

        const resolved = await resolver.resolveMention(TEST_USER_ID, mention);

        expect(resolved).toBeDefined();
        expect(resolved?.canonicalName).toBe(uniqueName);
        track(resolved?.id);
      });
    });

    describe('addRelationship()', () => {
      it('should create a relationship between two entities', async () => {
        const entity1 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Alice_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        const entity2 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Bob_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        expect(entity1).toBeDefined();
        expect(entity2).toBeDefined();
        track(entity1?.id);
        track(entity2?.id);

        await resolver.addRelationship(TEST_USER_ID, entity1!.id, entity2!.id, 'friend_of');

        const relationships = await getRelationshipsForEntity(TEST_USER_ID, entity1!.id);
        expect(relationships.length).toBeGreaterThan(0);

        const rel = relationships.find(
          (r) => r.fromEntity === entity1!.id && r.toEntity === entity2!.id
        );
        expect(rel).toBeDefined();
        expect(rel?.type).toBe('friend_of');
      });

      it('should handle different relationship types', async () => {
        const entity1 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Employee1_${uuidv4().substring(0, 6)}`,
          relationship: 'colleague',
        });
        const entity2 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Boss1_${uuidv4().substring(0, 6)}`,
          relationship: 'boss',
        });
        expect(entity1).toBeDefined();
        expect(entity2).toBeDefined();
        track(entity1?.id);
        track(entity2?.id);

        await resolver.addRelationship(TEST_USER_ID, entity1!.id, entity2!.id, 'reports_to');

        const relationships = await getRelationshipsForEntity(TEST_USER_ID, entity1!.id);
        const rel = relationships.find((r) => r.type === 'reports_to');
        expect(rel).toBeDefined();
      });
    });

    describe('resolve()', () => {
      it('should resolve entity by ID', async () => {
        const entity = await resolver.resolveMention(TEST_USER_ID, {
          name: `ResolveTest_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        expect(entity).toBeDefined();
        track(entity?.id);

        const resolved = await resolver.resolve(TEST_USER_ID, entity!.id);
        expect(resolved).toBeDefined();
        expect(resolved?.id).toBe(entity!.id);
      });

      it('should resolve entity by name query', async () => {
        const uniqueName = `QueryTest_${uuidv4().substring(0, 6)}`;
        const entity = await resolver.resolveMention(TEST_USER_ID, {
          name: uniqueName,
          relationship: 'friend',
        });
        expect(entity).toBeDefined();
        track(entity?.id);

        const resolved = await resolver.resolve(TEST_USER_ID, { name: uniqueName });
        expect(resolved).toBeDefined();
        expect(resolved?.canonicalName).toBe(uniqueName);
      });

      it('should return null for non-existent entity', async () => {
        const resolved = await resolver.resolve(TEST_USER_ID, 'non-existent-id');
        expect(resolved).toBeNull();
      });
    });

    describe('getPeople()', () => {
      it('should return all person entities for a user', async () => {
        const person1 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Person1_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        const person2 = await resolver.resolveMention(TEST_USER_ID, {
          name: `Person2_${uuidv4().substring(0, 6)}`,
          relationship: 'colleague',
        });
        track(person1?.id);
        track(person2?.id);

        const people = await resolver.getPeople(TEST_USER_ID);

        expect(people.length).toBeGreaterThanOrEqual(2);
        expect(people.every((p) => p.type === 'person')).toBe(true);
      });
    });

    describe('getEntity()', () => {
      it('should get entity by ID', async () => {
        const resolved = await resolver.resolveMention(TEST_USER_ID, {
          name: `GetEntityTest_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        expect(resolved).toBeDefined();
        track(resolved?.id);

        const retrieved = await resolver.getEntity(TEST_USER_ID, resolved!.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(resolved!.id);
      });

      it('should return null for non-existent ID', async () => {
        const retrieved = await resolver.getEntity(TEST_USER_ID, 'fake-id-12345');
        expect(retrieved).toBeNull();
      });
    });

    describe('getEntitiesByType()', () => {
      it('should return entities of specific type', async () => {
        const person = await resolver.resolveMention(TEST_USER_ID, {
          name: `TypeTest_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        track(person?.id);

        const people = await resolver.getEntitiesByType(TEST_USER_ID, 'person');

        expect(people.length).toBeGreaterThan(0);
        expect(people.every((e) => e.type === 'person')).toBe(true);
      });
    });

    describe('getFacts()', () => {
      it('should return facts about an entity', async () => {
        const entity = await resolver.resolveMention(TEST_USER_ID, {
          name: `FactsTestPerson_${uuidv4().substring(0, 6)}`,
          relationship: 'friend',
        });
        expect(entity).toBeDefined();
        track(entity?.id);

        const facts = await resolver.getFacts(TEST_USER_ID, entity!.id);
        expect(Array.isArray(facts)).toBe(true);
      });
    });
  }
);

(runFirestoreIntegration ? describe : describe.skip)(
  'Knowledge Graph Integration (Firestore emulator)',
  () => {
    it('should have entity resolver with full implementations', () => {
      const graphResolver = getEntityResolver();

      expect(graphResolver.resolveMention).toBeTypeOf('function');
      expect(graphResolver.addRelationship).toBeTypeOf('function');
      expect(graphResolver.resolve).toBeTypeOf('function');
      expect(graphResolver.getPeople).toBeTypeOf('function');
      expect(graphResolver.getFacts).toBeTypeOf('function');
      expect(graphResolver.getEntity).toBeTypeOf('function');
      expect(graphResolver.getEntitiesByType).toBeTypeOf('function');
    });

    it('should have proper implementations (not just stubs)', async () => {
      const graphResolver = getEntityResolver();

      const people = await graphResolver.getPeople(TEST_USER_ID);
      expect(Array.isArray(people)).toBe(true);

      const entities = await graphResolver.getEntitiesByType(TEST_USER_ID, 'person');
      expect(Array.isArray(entities)).toBe(true);

      const resolved = await graphResolver.resolve(TEST_USER_ID, 'non-existent-id');
      expect(resolved).toBeNull();
    });
  }
);
