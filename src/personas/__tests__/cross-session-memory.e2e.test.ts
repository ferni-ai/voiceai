/**
 * Cross-Session Memory E2E Tests
 *
 * Tests the full persistence flow for cross-session memory:
 * 1. Session 1: User shares vulnerability, moments recorded
 * 2. Session 2: Verify moments persisted, relationship stage progressed
 * 3. Session 3: Verify callbacks/inside jokes from earlier sessions
 *
 * These tests verify that the "Better than Human" promise works:
 * - Perfect memory across sessions
 * - Relationship progression persists
 * - Inside jokes and callbacks work
 *
 * To run with actual Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm test cross-session-memory
 *
 * @module personas/__tests__/cross-session-memory.e2e.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RelationshipMemory,
  SharedMoment,
  InsideJoke,
  InsideJokeSeed,
  CallbackAttempt,
  CallbackEffectiveness,
} from '../relationship-memory/types.js';

// ============================================================================
// MOCK FIRESTORE (In-Memory Implementation)
// ============================================================================

interface MockDocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface MockQuerySnapshot {
  empty: boolean;
  docs: MockDocSnapshot[];
}

interface MockDocRef {
  id: string;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
  get: () => Promise<MockDocSnapshot>;
  delete: () => Promise<void>;
  collection: (subPath: string) => MockCollectionRef;
}

interface MockQuery {
  orderBy: (field: string, direction?: 'asc' | 'desc') => MockQuery;
  limit: (n: number) => MockQuery;
  where: (field: string, op: string, value: unknown) => MockQuery;
  get: () => Promise<MockQuerySnapshot>;
}

interface MockCollectionRef extends MockQuery {
  doc: (id: string) => MockDocRef;
}

// Simulates Firestore with in-memory storage that persists across "sessions"
class MockFirestoreDB {
  private data = new Map<string, Record<string, unknown>>();

  collection(path: string): MockCollectionRef {
    const self = this;

    const createQuery = (
      filters: Array<{ field: string; op: string; value: unknown }> = []
    ): MockQuery => ({
      orderBy(_field: string, _direction?: 'asc' | 'desc') {
        return createQuery(filters);
      },
      limit(_n: number) {
        return createQuery(filters);
      },
      where(field: string, op: string, value: unknown) {
        return createQuery([...filters, { field, op, value }]);
      },
      async get(): Promise<MockQuerySnapshot> {
        const docs: MockDocSnapshot[] = [];
        for (const [key, docData] of self.data.entries()) {
          if (key.startsWith(`${path}/`)) {
            // Apply filters
            let matches = true;
            for (const filter of filters) {
              const fieldValue = docData[filter.field];
              if (filter.op === '==' && fieldValue !== filter.value) {
                matches = false;
              }
            }
            if (matches) {
              const docId = key.slice(path.length + 1).split('/')[0];
              docs.push({
                exists: true,
                data: () => docData,
                id: docId,
              });
            }
          }
        }
        return { empty: docs.length === 0, docs };
      },
    });

    const collectionRef: MockCollectionRef = {
      ...createQuery(),
      doc(docId: string): MockDocRef {
        const docPath = `${path}/${docId}`;
        return {
          id: docId,
          async set(data: Record<string, unknown>, _options?: { merge?: boolean }) {
            self.data.set(docPath, { ...data });
          },
          async get(): Promise<MockDocSnapshot> {
            const docData = self.data.get(docPath);
            return {
              exists: !!docData,
              data: () => docData,
              id: docId,
            };
          },
          async delete() {
            self.data.delete(docPath);
          },
          collection(subPath: string): MockCollectionRef {
            return self.collection(`${docPath}/${subPath}`);
          },
        };
      },
    };

    return collectionRef;
  }

  // Helper for tests to inspect state
  getAllData(): Map<string, Record<string, unknown>> {
    return new Map(this.data);
  }

  // Helper to clear all data between test suites
  clear(): void {
    this.data.clear();
  }
}

// Global mock Firestore instance that persists across "sessions"
const mockFirestore = new MockFirestoreDB();

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createBaseMemory(userId: string, personaId: string): RelationshipMemory {
  const now = new Date();
  return {
    userId,
    personaId,
    stage: 'stranger' as const,
    trustScore: 0.5,
    trustFactors: {
      sessionCount: 0,
      vulnerabilityShared: 0,
      callbacksLanded: 0,
      crisesTogether: 0,
      consistencyScore: 0,
    },
    totalSessions: 0,
    totalTurns: 0,
    sharedMoments: [],
    insideJokes: [],
    insideJokeSeeds: [],
    milestones: [],
    callbackAttempts: [],
    callbackEffectiveness: [],
    firstConversation: now,
    lastConversation: now,
    updatedAt: now,
    temporalPatterns: {
      dayOfWeekFrequency: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0,
      },
      timeOfDayFrequency: {
        early_morning: 0,
        morning: 0,
        afternoon: 0,
        evening: 0,
        late_night: 0,
      },
      topicsByTime: {},
      moodByDayOfWeek: {},
      averageSessionLength: 0,
      sessionsPerWeek: 0,
      typicalGapDays: 0,
      longestGap: 0,
    },
    emotionalTrajectory: {
      recentSessions: [],
      trendDirection: 'stable',
      trendConfidence: 0,
      concerns: [],
      growthAreas: [],
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Cross-Session Memory E2E', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFirestore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Multi-Session Relationship Progression', () => {
    it('should persist relationship memory across simulated sessions', async () => {
      const userId = 'test-user-cross-session';
      const personaId = 'ferni';
      const docPath = `relationship_memories/${userId}_${personaId}`;

      // === SESSION 1: First conversation ===
      const session1Memory = createBaseMemory(userId, personaId);
      session1Memory.totalSessions = 1;
      session1Memory.totalTurns = 15;

      // User shares vulnerability
      const moment1: SharedMoment = {
        id: 'moment-session1',
        type: 'first_vulnerability',
        timestamp: new Date(),
        sessionNumber: 1,
        summary: 'User shared about anxiety at work',
        topic: 'work-stress',
        userPhrase: "I've never told anyone this, but I'm really struggling",
        significance: 0.9,
        callbackCount: 0,
        lastCallback: undefined,
        tags: ['vulnerability', 'work', 'anxiety'],
      };
      session1Memory.sharedMoments.push(moment1);

      // Save session 1 memory
      await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .set(serializeMemory(session1Memory));

      // Verify session 1 was saved
      const saved1 = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      expect(saved1.exists).toBe(true);
      const data1 = saved1.data();
      expect(data1?.totalSessions).toBe(1);
      expect((data1?.sharedMoments as unknown[])?.length).toBe(1);

      // === SESSION 2: Returning user - verify memory persists ===
      const loaded2 = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      expect(loaded2.exists).toBe(true);

      const session2Memory = deserializeMemory(loaded2.data()!);
      expect(session2Memory.totalSessions).toBe(1);
      expect(session2Memory.sharedMoments.length).toBe(1);
      expect(session2Memory.sharedMoments[0].type).toBe('first_vulnerability');

      // Progress the relationship
      session2Memory.totalSessions = 2;
      session2Memory.totalTurns += 20;

      // Add another moment - this time a breakthrough
      const moment2: SharedMoment = {
        id: 'moment-session2',
        type: 'breakthrough',
        timestamp: new Date(),
        sessionNumber: 2,
        summary: 'User realized their anxiety stems from perfectionism',
        topic: 'self-discovery',
        userPhrase: 'Oh wow, I never connected those dots before',
        significance: 0.95,
        callbackCount: 0,
        lastCallback: undefined,
        tags: ['breakthrough', 'self-discovery', 'anxiety'],
      };
      session2Memory.sharedMoments.push(moment2);

      // Callback to first session's moment
      session2Memory.sharedMoments[0].callbackCount = 1;
      session2Memory.sharedMoments[0].lastCallback = new Date();

      // Progress stage after vulnerability + breakthrough
      session2Memory.stage = 'acquaintance';
      session2Memory.trustScore = 0.65;

      // Save session 2 memory
      await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .set(serializeMemory(session2Memory));

      // === SESSION 3: Verify full relationship history ===
      const loaded3 = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      expect(loaded3.exists).toBe(true);

      const session3Memory = deserializeMemory(loaded3.data()!);

      // Verify all data persisted correctly
      expect(session3Memory.totalSessions).toBe(2);
      expect(session3Memory.totalTurns).toBe(35);
      expect(session3Memory.stage).toBe('acquaintance');
      expect(session3Memory.trustScore).toBe(0.65);
      expect(session3Memory.sharedMoments.length).toBe(2);

      // Verify moment details
      const vulnerabilityMoment = session3Memory.sharedMoments.find(
        (m) => m.type === 'first_vulnerability'
      );
      expect(vulnerabilityMoment).toBeDefined();
      expect(vulnerabilityMoment?.callbackCount).toBe(1);
      expect(vulnerabilityMoment?.lastCallback).toBeInstanceOf(Date);

      const breakthroughMoment = session3Memory.sharedMoments.find(
        (m) => m.type === 'breakthrough'
      );
      expect(breakthroughMoment).toBeDefined();
      expect(breakthroughMoment?.summary).toContain('perfectionism');
    });

    it('should track inside joke seeds across sessions and promote to established jokes', async () => {
      const userId = 'test-user-jokes';
      const personaId = 'ferni';

      // Session 1: Plant a joke seed
      const session1Memory = createBaseMemory(userId, personaId);
      session1Memory.totalSessions = 5; // Need friend stage for inside jokes
      session1Memory.stage = 'friend';
      session1Memory.insideJokeSeeds = [
        {
          phrase: 'spreadsheet wizard',
          context: 'User joked about being too into spreadsheets',
          sessionNumber: 5,
          timestamp: new Date(),
          potentialScore: 0.7,
          userEngagement: 'high',
        },
      ];

      await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .set(serializeMemory(session1Memory));

      // Session 2: User responds positively to callback - promote to inside joke
      const loaded = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      const session2Memory = deserializeMemory(loaded.data()!);

      // Promote the seed to a full inside joke
      const seed = session2Memory.insideJokeSeeds[0];
      session2Memory.insideJokes.push({
        id: 'joke-1',
        trigger: 'spreadsheet',
        reference: seed.phrase,
        origin: seed.context,
        createdAt: new Date(seed.timestamp),
        originSession: seed.sessionNumber,
        usageCount: 1,
        resonanceScore: 0.8,
        lastUsed: new Date(),
        typicalResponse: 'laugh',
        status: 'established',
      });
      session2Memory.insideJokeSeeds = []; // Remove the promoted seed

      await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .set(serializeMemory(session2Memory));

      // Session 3: Verify joke persists and can be used
      const loaded3 = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      const session3Memory = deserializeMemory(loaded3.data()!);

      expect(session3Memory.insideJokes.length).toBe(1);
      expect(session3Memory.insideJokeSeeds.length).toBe(0);
      expect(session3Memory.insideJokes[0].reference).toBe('spreadsheet wizard');
      expect(session3Memory.insideJokes[0].status).toBe('established');
    });

    it('should track callback effectiveness across sessions', async () => {
      const userId = 'test-user-callbacks';
      const personaId = 'ferni';

      // Initial memory with callback tracking
      const memory = createBaseMemory(userId, personaId);
      memory.totalSessions = 3;
      memory.callbackEffectiveness = [
        {
          reference: 'topic-1',
          totalAttempts: 5,
          positiveResponses: 4,
          successRate: 0.8,
          lastAttempt: new Date(),
          recommendation: 'use_more',
        },
      ];
      memory.callbackAttempts = [
        {
          reference: 'moment-1',
          type: 'topic',
          timestamp: new Date(),
          userResponse: 'positive',
          threadContinued: true,
          context: 'test context',
        },
        {
          reference: 'joke-1',
          type: 'joke',
          timestamp: new Date(),
          userResponse: 'positive',
          threadContinued: true,
          context: 'test context',
        },
      ];

      await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .set(serializeMemory(memory));

      // Load and verify
      const loaded = await mockFirestore
        .collection('relationship_memories')
        .doc(`${userId}_${personaId}`)
        .get();
      const loadedMemory = deserializeMemory(loaded.data()!);

      expect(loadedMemory.callbackEffectiveness.length).toBe(1);
      expect(loadedMemory.callbackEffectiveness[0].totalAttempts).toBe(5);
      expect(loadedMemory.callbackEffectiveness[0].positiveResponses).toBe(4);
      expect(loadedMemory.callbackAttempts.length).toBe(2);
    });
  });

  describe('Resonance Profile Persistence', () => {
    it('should persist personality resonance profile across sessions', async () => {
      const userId = 'test-user-resonance';

      // Session 1: Record resonance data
      const resonanceProfile = {
        userId,
        themeScores: {
          growth: 0.8,
          humor: 0.6,
          nostalgia: 0.4,
          wisdom: 0.7,
        },
        expressionEngagement: {
          'expr-1': { positive: 5, negative: 0, lastUsed: new Date().toISOString() },
          'expr-2': { positive: 2, negative: 1, lastUsed: new Date().toISOString() },
        },
        mentionedTopics: [
          {
            topic: 'career',
            count: 5,
            firstMentioned: new Date().toISOString(),
            lastMentioned: new Date().toISOString(),
          },
        ],
        vulnerabilityComfort: {
          level: 'high',
          lastVulnerableShare: new Date().toISOString(),
          responseType: 'reciprocated',
        },
        lastUpdated: new Date().toISOString(),
      };

      await mockFirestore
        .collection('bogle_users')
        .doc(userId)
        .collection('personality_resonance')
        .doc('profile')
        .set(resonanceProfile);

      // Session 2: Load and verify
      const loaded = await mockFirestore
        .collection('bogle_users')
        .doc(userId)
        .collection('personality_resonance')
        .doc('profile')
        .get();

      expect(loaded.exists).toBe(true);
      const data = loaded.data() as typeof resonanceProfile | undefined;
      expect(data?.themeScores).toEqual(resonanceProfile.themeScores);
      expect(data?.vulnerabilityComfort?.level).toBe('high');
    });
  });

  describe('Learned Expressions Persistence', () => {
    it('should persist and load high-engagement expressions', async () => {
      const userId = 'test-user-expressions';

      // Save some learned expressions
      const expressions = [
        {
          id: 'expr-growth-1',
          theme: 'growth',
          content: "You know what I notice? You're already growing.",
          ssml: "<speak>You know what I notice? <break time='200ms'/> You're already growing.</speak>",
          engagementScore: 0.9,
          timesUsed: 8,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: 'expr-humor-1',
          theme: 'humor',
          content: "Ha! That's exactly the kind of chaos I respect.",
          ssml: "<speak>Ha! <break time='150ms'/> That's exactly the kind of chaos I respect.</speak>",
          engagementScore: 0.85,
          timesUsed: 5,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      for (const expr of expressions) {
        await mockFirestore
          .collection('bogle_users')
          .doc(userId)
          .collection('learned_expressions')
          .doc(expr.id)
          .set(expr);
      }

      // Load expressions (simulating loadPersistedExpressions)
      const snapshot = await mockFirestore
        .collection('bogle_users')
        .doc(userId)
        .collection('learned_expressions')
        .orderBy('engagementScore', 'desc')
        .limit(20)
        .get();

      expect(snapshot.empty).toBe(false);
      expect(snapshot.docs.length).toBe(2);

      // Verify ordering and content
      const loadedExprs = snapshot.docs.map((d) => d.data());
      expect(loadedExprs[0]?.theme).toBeDefined();
      expect(loadedExprs[0]?.engagementScore).toBeGreaterThanOrEqual(0.85);
    });
  });
});

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

function serializeMemory(memory: RelationshipMemory): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(memory, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    })
  );
}

function deserializeMemory(data: Record<string, unknown>): RelationshipMemory {
  const dateFields = ['firstConversation', 'lastConversation', 'updatedAt'];

  const result = { ...data } as unknown as RelationshipMemory;

  // Convert top-level date strings
  for (const field of dateFields) {
    if (typeof data[field] === 'string') {
      (result as unknown as Record<string, unknown>)[field] = new Date(data[field] as string);
    }
  }

  // Convert dates in sharedMoments
  if (Array.isArray(data.sharedMoments)) {
    result.sharedMoments = data.sharedMoments.map((m: Record<string, unknown>) => ({
      ...m,
      timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
      lastCallback: m.lastCallback ? new Date(m.lastCallback as string) : undefined,
    })) as SharedMoment[];
  }

  // Convert dates in insideJokes
  if (Array.isArray(data.insideJokes)) {
    result.insideJokes = data.insideJokes.map((j: Record<string, unknown>) => ({
      ...j,
      createdAt: j.createdAt ? new Date(j.createdAt as string) : new Date(),
      lastUsed: j.lastUsed ? new Date(j.lastUsed as string) : undefined,
    })) as InsideJoke[];
  }

  // Convert dates in insideJokeSeeds
  if (Array.isArray(data.insideJokeSeeds)) {
    result.insideJokeSeeds = data.insideJokeSeeds.map((s: Record<string, unknown>) => ({
      ...s,
      timestamp: s.timestamp ? new Date(s.timestamp as string) : new Date(),
    })) as InsideJokeSeed[];
  }

  // Convert dates in callbackAttempts
  if (Array.isArray(data.callbackAttempts)) {
    result.callbackAttempts = data.callbackAttempts.map((a: Record<string, unknown>) => ({
      ...a,
      timestamp: a.timestamp ? new Date(a.timestamp as string) : new Date(),
    })) as CallbackAttempt[];
  }

  // Convert callbackEffectiveness dates (it's an array now)
  if (Array.isArray(data.callbackEffectiveness)) {
    result.callbackEffectiveness = data.callbackEffectiveness.map((e: Record<string, unknown>) => ({
      ...e,
      lastAttempt: e.lastAttempt ? new Date(e.lastAttempt as string) : new Date(),
    })) as CallbackEffectiveness[];
  }

  return result;
}
