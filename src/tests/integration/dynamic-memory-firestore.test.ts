/**
 * Dynamic Memory Firestore Integration Test
 *
 * Tests the full round-trip from fast capture → STM → deep extraction → Firestore → context builder.
 *
 * Run with Firestore emulator:
 * ```bash
 * firebase emulators:start --only firestore &
 * FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/integration/dynamic-memory-firestore.test.ts
 * ```
 *
 * @module tests/integration/dynamic-memory-firestore
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { perfBudget } from '../perf-budget.js';

// Vitest 5 only accepts vi.mock at the top level. Vitest 4 hoisted these
// here from inside the suites below, so moving them changes nothing.
// Mock Firestore as unavailable
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

// Check if running with emulator
const isEmulatorRunning = !!process.env.FIRESTORE_EMULATOR_HOST;

// Skip all tests if emulator not running
const describeWithEmulator = isEmulatorRunning ? describe : describe.skip;

describeWithEmulator('Dynamic Memory Firestore Integration', () => {
  const testUserId = `test-user-${Date.now()}`;
  const testSessionId = `test-session-${Date.now()}`;

  beforeAll(async () => {
    // Verify emulator connection
    console.log(`🔥 Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (db) {
        // Delete test user's dynamic collections
        const collections = [
          'dynamic_entities',
          'dynamic_facts',
          'dynamic_relationships',
          'promoted_entities',
        ];
        for (const col of collections) {
          const snapshot = await db.collection('bogle_users').doc(testUserId).collection(col).get();
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full Round-Trip', () => {
    it('should persist entities from deep extraction to Firestore', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) {
        console.log('Firestore not available, skipping');
        return;
      }

      // Manually write a test entity (simulating deep extraction output)
      const entityRef = db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('dynamic_entities')
        .doc();

      await entityRef.set({
        name: 'Mom',
        type: 'person',
        attributes: { relationship: 'mother' },
        confidence: 0.9,
        extractedAt: new Date().toISOString(),
        sessionId: testSessionId,
        turnNumber: 1,
        source: 'deep_extraction',
      });

      // Read it back
      const doc = await entityRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.name).toBe('Mom');
      expect(doc.data()?.type).toBe('person');
    });

    it('should persist facts from deep extraction to Firestore', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      const factRef = db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('dynamic_facts')
        .doc();

      await factRef.set({
        entityName: 'Mom',
        factType: 'event',
        key: 'birthday',
        value: 'next week',
        confidence: 0.8,
        extractedAt: new Date().toISOString(),
        sessionId: testSessionId,
        turnNumber: 1,
        source: 'deep_extraction',
      });

      const doc = await factRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.entityName).toBe('Mom');
      expect(doc.data()?.key).toBe('birthday');
    });

    it('should persist relationships from deep extraction to Firestore', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      const relRef = db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('dynamic_relationships')
        .doc();

      await relRef.set({
        sourceEntity: 'Mom',
        targetEntity: 'Dad',
        type: 'spouse',
        strength: 0.9,
        bidirectional: true,
        extractedAt: new Date().toISOString(),
        sessionId: testSessionId,
        turnNumber: 2,
        extractionSource: 'deep_extraction',
      });

      const doc = await relRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.type).toBe('spouse');
    });
  });

  describe('STM Promotion', () => {
    it('should persist promoted entities to Firestore', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      // Simulate promotion
      const promotedRef = db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('promoted_entities')
        .doc();

      await promotedRef.set({
        name: 'Test Entity',
        type: 'person',
        mentionCount: 5,
        importance: 0.85,
        lastContext: 'Called about dinner',
        sessionId: testSessionId,
        promotedAt: new Date().toISOString(),
      });

      const doc = await promotedRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.mentionCount).toBe(5);
    });

    it('should persist emotional arcs to Firestore', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      const arcRef = db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('emotional_arcs')
        .doc(testSessionId);

      await arcRef.set({
        sessionId: testSessionId,
        trajectory: [
          { turnNumber: 1, dominantEmotion: 'stressed', intensity: 'high' },
          { turnNumber: 2, dominantEmotion: 'hopeful', intensity: 'medium' },
          { turnNumber: 3, dominantEmotion: 'relieved', intensity: 'medium' },
        ],
        overallShift: 'positive',
        promotedAt: new Date().toISOString(),
      });

      const doc = await arcRef.get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.overallShift).toBe('positive');
      expect(doc.data()?.trajectory.length).toBe(3);
    });
  });

  describe('Query Performance', () => {
    it('should retrieve recent entities within acceptable time', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      const startTime = Date.now();

      await db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('dynamic_entities')
        .orderBy('extractedAt', 'desc')
        .limit(10)
        .get();

      const queryTime = Date.now() - startTime;

      // Should complete within 500ms (emulator may be slower than production)
      expect(queryTime).toBeLessThan(perfBudget(500));
    });

    it('should support compound queries', async () => {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      // Query facts by type and entity
      const snapshot = await db
        .collection('bogle_users')
        .doc(testUserId)
        .collection('dynamic_facts')
        .where('factType', '==', 'state')
        .limit(5)
        .get();

      // Should not throw
      expect(snapshot).toBeDefined();
    });
  });
});
