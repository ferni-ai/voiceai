/**
 * Firestore Integration Tests for Relationship Memory Persistence
 *
 * Tests the complete persistence layer:
 * - Serialization/deserialization of complex types (Date, arrays)
 * - CRUD operations (save, load, delete)
 * - User queries (load all for user)
 * - Error handling and edge cases
 *
 * Note: These tests use a mock Firestore implementation.
 * For actual Firestore integration, run with FIRESTORE_EMULATOR_HOST set.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RelationshipMemory,
  RelationshipStage,
  SharedMoment,
  InsideJoke,
  InsideJokeSeed,
  RelationshipMilestone,
  CallbackAttempt,
  CallbackEffectiveness,
  TemporalPattern,
  EmotionalTrajectory,
} from '../relationship-memory/types.js';

// ============================================================================
// MOCK FIRESTORE
// ============================================================================

interface MockDoc {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface MockDocRef {
  id: string;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface MockCollection {
  doc: (id: string) => MockDocRef;
  where: (field: string, op: string, value: unknown) => { get: ReturnType<typeof vi.fn> };
  get: ReturnType<typeof vi.fn>;
}

const mockDocs = new Map<string, Record<string, unknown>>();

const createMockFirestore = () => {
  return {
    collection: (collectionName: string): MockCollection => {
      return {
        doc: (docId: string): MockDocRef => {
          return {
            id: docId,
            set: vi.fn(async (data: Record<string, unknown>) => {
              mockDocs.set(`${collectionName}/${docId}`, data);
              return {};
            }),
            get: vi.fn(async (): Promise<MockDoc> => {
              const data = mockDocs.get(`${collectionName}/${docId}`);
              return {
                exists: !!data,
                data: () => data,
                id: docId,
              };
            }),
            delete: vi.fn(async () => {
              mockDocs.delete(`${collectionName}/${docId}`);
              return {};
            }),
          };
        },
        where: (_field: string, _op: string, value: unknown) => ({
          get: vi.fn(async () => {
            const docs: MockDoc[] = [];
            for (const [key, data] of mockDocs.entries()) {
              if (key.startsWith(`${collectionName}/`) && data.userId === value) {
                docs.push({
                  exists: true,
                  data: () => data,
                  id: key.split('/')[1],
                });
              }
            }
            return { empty: docs.length === 0, docs };
          }),
        }),
        get: vi.fn(async () => ({
          empty: true,
          docs: [],
        })),
      };
    },
  };
};

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestRelationshipMemory(
  overrides: Partial<RelationshipMemory> = {}
): RelationshipMemory {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const sharedMoments: SharedMoment[] = [
    {
      id: 'moment-1',
      type: 'trust_demonstration',
      timestamp: oneWeekAgo,
      sessionNumber: 5,
      summary: 'User shared about work stress',
      topic: 'work',
      userPhrase: 'I feel overwhelmed',
      significance: 0.8,
      callbackCount: 2,
      lastCallback: now,
      tags: ['work', 'stress'],
    },
  ];

  const insideJokes: InsideJoke[] = [
    {
      id: 'joke-1',
      trigger: 'coffee',
      reference: 'the fourth cup situation',
      origin: 'User joked about drinking too much coffee',
      createdAt: oneWeekAgo,
      originSession: 3,
      usageCount: 3,
      resonanceScore: 0.8,
      lastUsed: now,
      typicalResponse: 'laugh',
      status: 'established',
    },
  ];

  const insideJokeSeeds: InsideJokeSeed[] = [
    {
      phrase: 'monday blues',
      context: 'User mentioned hating Mondays',
      sessionNumber: 5,
      timestamp: now,
      potentialScore: 0.7,
      userEngagement: 'high',
    },
  ];

  const milestones: RelationshipMilestone[] = [
    {
      type: 'first_vulnerability_shared',
      reached: true,
      reachedAt: oneWeekAgo,
      acknowledged: true,
      acknowledgedAt: oneWeekAgo,
    },
    {
      type: 'session_10',
      reached: true,
      reachedAt: now,
      acknowledged: false,
    },
  ];

  const callbackAttempts: CallbackAttempt[] = [
    {
      reference: 'work stress conversation',
      type: 'moment',
      timestamp: now,
      userResponse: 'positive',
      threadContinued: true,
      context: 'Follow-up on previous discussion',
    },
  ];

  const callbackEffectiveness: CallbackEffectiveness[] = [
    {
      reference: 'work stress',
      totalAttempts: 5,
      positiveResponses: 4,
      successRate: 0.8,
      lastAttempt: now,
      recommendation: 'use_more',
    },
  ];

  const temporalPatterns: TemporalPattern = {
    dayOfWeekFrequency: {
      monday: 5,
      tuesday: 3,
      wednesday: 4,
      thursday: 2,
      friday: 6,
      saturday: 1,
      sunday: 0,
    },
    timeOfDayFrequency: {
      early_morning: 1,
      morning: 3,
      afternoon: 5,
      evening: 8,
      late_night: 2,
    },
    topicsByTime: {
      evening: ['reflection', 'goals'],
      morning: ['planning', 'energy'],
    },
    moodByDayOfWeek: {
      monday: 'struggling',
      friday: 'positive',
    },
    averageSessionLength: 15,
    sessionsPerWeek: 3,
    typicalGapDays: 2,
    longestGap: 7,
  };

  const emotionalTrajectory: EmotionalTrajectory = {
    recentSessions: [
      {
        sessionNumber: 8,
        date: now,
        overallMood: 'positive',
        energyLevel: 'medium',
        topics: ['work', 'goals'],
      },
    ],
    trendDirection: 'improving',
    trendConfidence: 0.75,
    concerns: [
      {
        concern: 'work stress',
        firstNoticed: oneWeekAgo,
        severity: 'medium',
        addressed: false,
      },
    ],
    growthAreas: [
      {
        area: 'boundaries',
        firstNoticed: oneWeekAgo,
        progressLevel: 'emerging',
      },
    ],
  };

  return {
    userId: 'test-user-123',
    personaId: 'ferni',
    stage: 'friend',
    trustScore: 0.75,
    trustFactors: {
      sessionCount: 10,
      vulnerabilityShared: 3,
      callbacksLanded: 8,
      crisesTogether: 1,
      consistencyScore: 0.8,
    },
    sharedMoments,
    insideJokes,
    insideJokeSeeds,
    milestones,
    callbackAttempts,
    callbackEffectiveness,
    temporalPatterns,
    emotionalTrajectory,
    firstConversation: oneWeekAgo,
    lastConversation: now,
    totalSessions: 10,
    totalTurns: 150,
    updatedAt: now,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('RelationshipMemoryPersistence', () => {
  beforeEach(() => {
    vi.resetModules();
    mockDocs.clear();
  });

  describe('Serialization', () => {
    it('should serialize Date objects to ISO strings', async () => {
      // Import the module fresh
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory();
      await persistence.save(memory);

      // Get the saved data
      const savedData = mockDocs.get('relationship_memories/test-user-123_ferni');
      expect(savedData).toBeDefined();

      // Check that dates are serialized as strings
      expect(typeof savedData?.firstConversation).toBe('string');
      expect(typeof savedData?.lastConversation).toBe('string');
      expect(typeof savedData?.updatedAt).toBe('string');

      // Check nested date serialization
      const savedMoments = savedData?.sharedMoments as Array<Record<string, unknown>>;
      expect(typeof savedMoments?.[0]?.timestamp).toBe('string');
      expect(typeof savedMoments?.[0]?.lastCallback).toBe('string');
    });

    it('should deserialize ISO strings back to Date objects', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      // Save and load
      const originalMemory = createTestRelationshipMemory();
      await persistence.save(originalMemory);
      const loadedMemory = await persistence.load('test-user-123', 'ferni');

      expect(loadedMemory).toBeDefined();

      // Check that dates are deserialized correctly
      expect(loadedMemory!.firstConversation).toBeInstanceOf(Date);
      expect(loadedMemory!.lastConversation).toBeInstanceOf(Date);
      expect(loadedMemory!.updatedAt).toBeInstanceOf(Date);

      // Check nested date deserialization
      expect(loadedMemory!.sharedMoments[0].timestamp).toBeInstanceOf(Date);
      expect(loadedMemory!.sharedMoments[0].lastCallback).toBeInstanceOf(Date);

      // Check inside jokes
      expect(loadedMemory!.insideJokes[0].createdAt).toBeInstanceOf(Date);
      expect(loadedMemory!.insideJokes[0].lastUsed).toBeInstanceOf(Date);

      // Check emotional trajectory
      expect(loadedMemory!.emotionalTrajectory.recentSessions[0].date).toBeInstanceOf(Date);
      expect(loadedMemory!.emotionalTrajectory.concerns[0].firstNoticed).toBeInstanceOf(Date);
    });

    it('should handle undefined optional dates', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory({
        sharedMoments: [
          {
            id: 'moment-2',
            type: 'breakthrough',
            timestamp: new Date(),
            sessionNumber: 5,
            summary: 'Test moment',
            significance: 0.7,
            callbackCount: 0,
            tags: [],
            // lastCallback is undefined
          },
        ],
        insideJokes: [
          {
            id: 'joke-2',
            trigger: 'test',
            reference: 'test joke',
            origin: 'test context',
            createdAt: new Date(),
            originSession: 3,
            usageCount: 0,
            resonanceScore: 0.5,
            status: 'emerging',
            // lastUsed is undefined
          },
        ],
      });

      await persistence.save(memory);
      const loadedMemory = await persistence.load('test-user-123', 'ferni');

      expect(loadedMemory).toBeDefined();
      expect(loadedMemory!.sharedMoments[0].lastCallback).toBeUndefined();
      expect(loadedMemory!.insideJokes[0].lastUsed).toBeUndefined();
    });
  });

  describe('CRUD Operations', () => {
    it('should save and load a relationship memory', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory();
      await persistence.save(memory);

      const loaded = await persistence.load('test-user-123', 'ferni');

      expect(loaded).toBeDefined();
      expect(loaded!.userId).toBe('test-user-123');
      expect(loaded!.personaId).toBe('ferni');
      expect(loaded!.stage).toBe('friend');
      expect(loaded!.trustScore).toBe(0.75);
      expect(loaded!.totalSessions).toBe(10);
    });

    it('should return null for non-existent memory', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const loaded = await persistence.load('nonexistent-user', 'ferni');

      expect(loaded).toBeNull();
    });

    it('should delete a relationship memory', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory();
      await persistence.save(memory);

      // Verify it exists
      const beforeDelete = await persistence.load('test-user-123', 'ferni');
      expect(beforeDelete).toBeDefined();

      // Delete
      await persistence.delete('test-user-123', 'ferni');

      // Verify it's gone
      const afterDelete = await persistence.load('test-user-123', 'ferni');
      expect(afterDelete).toBeNull();
    });

    it('should check if relationship exists', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      // Check non-existent
      const beforeSave = await persistence.exists('test-user-123', 'ferni');
      expect(beforeSave).toBe(false);

      // Save
      const memory = createTestRelationshipMemory();
      await persistence.save(memory);

      // Check exists
      const afterSave = await persistence.exists('test-user-123', 'ferni');
      expect(afterSave).toBe(true);
    });

    it('should load all memories for a user', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      // Save memories for same user with different personas
      const ferniMemory = createTestRelationshipMemory({ personaId: 'ferni' });
      const peterMemory = createTestRelationshipMemory({ personaId: 'peter-john' });
      const mayaMemory = createTestRelationshipMemory({ personaId: 'maya-santos' });

      await persistence.save(ferniMemory);
      await persistence.save(peterMemory);
      await persistence.save(mayaMemory);

      // Load all for user
      const allMemories = await persistence.loadAllForUser('test-user-123');

      expect(allMemories.length).toBe(3);

      const personaIds = allMemories.map((m) => m.personaId);
      expect(personaIds).toContain('ferni');
      expect(personaIds).toContain('peter-john');
      expect(personaIds).toContain('maya-santos');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory({
        sharedMoments: [],
        insideJokes: [],
        insideJokeSeeds: [],
        milestones: [],
        callbackAttempts: [],
        callbackEffectiveness: [],
      });

      await persistence.save(memory);
      const loaded = await persistence.load('test-user-123', 'ferni');

      expect(loaded).toBeDefined();
      expect(loaded!.sharedMoments).toEqual([]);
      expect(loaded!.insideJokes).toEqual([]);
      expect(loaded!.insideJokeSeeds).toEqual([]);
    });

    it('should update existing memory with merge', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      // Save initial
      const initialMemory = createTestRelationshipMemory({ trustScore: 0.5 });
      await persistence.save(initialMemory);

      // Update
      const updatedMemory = createTestRelationshipMemory({ trustScore: 0.8 });
      await persistence.save(updatedMemory);

      // Load and verify
      const loaded = await persistence.load('test-user-123', 'ferni');
      expect(loaded!.trustScore).toBe(0.8);
    });

    it('should handle all relationship stages', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const stages: RelationshipStage[] = [
        'stranger',
        'acquaintance',
        'friend',
        'trusted_advisor',
        'inner_circle',
      ];

      for (const stage of stages) {
        const memory = createTestRelationshipMemory({
          userId: `user-${stage}`,
          stage,
        });
        await persistence.save(memory);

        const loaded = await persistence.load(`user-${stage}`, 'ferni');
        expect(loaded!.stage).toBe(stage);
      }
    });

    it('should preserve complex emotional trajectory data', async () => {
      const { RelationshipMemoryPersistence } =
        await import('../relationship-memory/persistence.js');

      const mockFirestore = createMockFirestore();
      const persistence = new RelationshipMemoryPersistence(mockFirestore as any);

      const memory = createTestRelationshipMemory({
        emotionalTrajectory: {
          recentSessions: [
            {
              sessionNumber: 1,
              date: new Date('2024-01-01'),
              overallMood: 'positive',
              energyLevel: 'high',
              topics: ['goals'],
            },
            {
              sessionNumber: 2,
              date: new Date('2024-01-02'),
              overallMood: 'neutral',
              energyLevel: 'medium',
              topics: ['work'],
            },
            {
              sessionNumber: 3,
              date: new Date('2024-01-03'),
              overallMood: 'struggling',
              energyLevel: 'low',
              topics: ['stress'],
            },
          ],
          trendDirection: 'declining',
          trendConfidence: 0.6,
          concerns: [
            {
              concern: 'burnout',
              severity: 'high',
              firstNoticed: new Date('2024-01-01'),
              addressed: false,
            },
          ],
          growthAreas: [
            { area: 'self-care', firstNoticed: new Date('2024-01-02'), progressLevel: 'emerging' },
          ],
        },
      });

      await persistence.save(memory);
      const loaded = await persistence.load('test-user-123', 'ferni');

      expect(loaded!.emotionalTrajectory.recentSessions.length).toBe(3);
      expect(loaded!.emotionalTrajectory.trendDirection).toBe('declining');
      expect(loaded!.emotionalTrajectory.concerns[0].concern).toBe('burnout');
      expect(loaded!.emotionalTrajectory.growthAreas[0].progressLevel).toBe('emerging');
    });
  });
});
