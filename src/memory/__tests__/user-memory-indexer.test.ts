/**
 * User Memory Indexer Tests
 *
 * Tests for vectorizing user profile data for semantic search.
 * These tests verify the "better than human" recall capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  UserProfile,
  KeyMoment,
  FamilyMember,
  LifeEvent,
  FinancialGoal,
} from '../../types/user-profile.js';
import type { VectorDocument } from '../vector-store.js';

// Mock the logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock vector stores
const mockAddDocument = vi.fn().mockResolvedValue(undefined);
const mockSearch = vi.fn().mockResolvedValue([]);
const mockRemoveDocument = vi.fn().mockResolvedValue(undefined);
const mockDeleteByMetadata = vi.fn().mockResolvedValue(0);

vi.mock('../firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({
    addDocument: mockAddDocument,
    search: mockSearch,
    removeDocument: mockRemoveDocument,
    deleteByMetadata: mockDeleteByMetadata,
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: true,
  }),
}));

vi.mock('../vector-store.js', () => ({
  getVectorStore: () => ({
    addDocument: mockAddDocument,
    search: mockSearch,
    removeDocument: mockRemoveDocument,
    deleteByMetadata: mockDeleteByMetadata,
  }),
}));

import {
  indexUserMemories,
  removeUserMemories,
  getUserMemoryStats,
  type IndexingResult,
  type UserMemoryCategory,
} from '../user-memory-indexer.js';

describe('User Memory Indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDocument.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
    mockRemoveDocument.mockResolvedValue(undefined);
    mockDeleteByMetadata.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create minimal user profile
  const createMinimalProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    ({
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date(),
      totalConversations: 5,
      ...overrides,
    }) as UserProfile;

  // Helper to create key moment
  const createKeyMoment = (id: string, type = 'breakthrough'): KeyMoment => ({
    id,
    type: type as KeyMoment['type'],
    summary: `Test moment ${id}`,
    topics: ['topic1', 'topic2'],
    emotionalWeight: 'medium' as KeyMoment['emotionalWeight'],
    timestamp: new Date(),
    followUpNeeded: false,
  });

  // Helper to create family member
  const createFamilyMember = (name: string): FamilyMember =>
    ({
      name,
      relationship: 'friend',
      topics: ['shared interest'],
      sentiment: 'positive',
    }) as FamilyMember;

  describe('indexUserMemories', () => {
    it('should handle minimal profile with missing arrays gracefully', async () => {
      // A minimal profile may be missing optional array properties
      // which could cause errors when trying to access .length
      const profile = createMinimalProfile();

      const result = await indexUserMemories('test-user', profile);

      // The indexer should handle missing/undefined arrays gracefully
      // It may log errors but should not throw
      expect(result).toBeDefined();
      expect(typeof result.indexed).toBe('number');
      expect(typeof result.errors).toBe('number');
    });

    it('should index profile with complete optional fields', async () => {
      // Profile with all necessary array fields populated
      const profile = createMinimalProfile({
        preferredTopics: ['career', 'health'],
        avoidTopics: [],
        communicationStyle: 'casual',
        speakingPace: 'moderate',
        humorAppreciation: 'high',
      });

      const result = await indexUserMemories('test-user', profile);

      // Should complete without errors when all fields are present
      expect(result.errors).toBe(0);
      expect(result.indexed).toBeGreaterThanOrEqual(0);
    });

    it('should index key moments', async () => {
      const profile = createMinimalProfile({
        keyMoments: [
          createKeyMoment('moment-1', 'breakthrough'),
          createKeyMoment('moment-2', 'vulnerability'),
        ],
      });

      const result = await indexUserMemories('test-user', profile);

      expect(result.indexed).toBe(2);
      expect(result.categories['key_moment']).toBe(2);
      expect(mockAddDocument).toHaveBeenCalledTimes(2);
    });

    it('should index family members/people', async () => {
      const profile = createMinimalProfile({
        familyMembers: [createFamilyMember('Alice'), createFamilyMember('Bob')],
      });

      const result = await indexUserMemories('test-user', profile);

      expect(result.indexed).toBeGreaterThan(0);
      expect(result.categories['person']).toBeDefined();
    });

    it('should filter by categories when specified', async () => {
      const profile = createMinimalProfile({
        keyMoments: [createKeyMoment('moment-1')],
        familyMembers: [createFamilyMember('Alice')],
      });

      const result = await indexUserMemories('test-user', profile, {
        categories: ['key_moment'],
      });

      // Should only index key_moment, not person
      expect(result.categories['key_moment']).toBe(1);
      expect(result.categories['person']).toBeUndefined();
    });

    it('should handle indexing errors gracefully', async () => {
      mockAddDocument.mockRejectedValueOnce(new Error('Failed to add'));

      const profile = createMinimalProfile({
        keyMoments: [createKeyMoment('moment-1'), createKeyMoment('moment-2')],
      });

      const result = await indexUserMemories('test-user', profile);

      // First document fails, second succeeds
      expect(result.indexed).toBe(1);
    });

    it('should include proper metadata in indexed documents', async () => {
      const profile = createMinimalProfile({
        keyMoments: [createKeyMoment('moment-1', 'celebration')],
      });

      await indexUserMemories('test-user', profile);

      expect(mockAddDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('key_moment_test-user'),
          text: expect.stringContaining('celebration'),
          metadata: expect.objectContaining({
            source: 'user_memory',
            category: 'key_moment',
            userId: 'test-user',
          }),
        })
      );
    });

    it('should use provided vector store', async () => {
      const customStore = {
        addDocument: vi.fn().mockResolvedValue(undefined),
        search: vi.fn(),
        deleteByMetadata: vi.fn(),
      };

      const profile = createMinimalProfile({
        keyMoments: [createKeyMoment('moment-1')],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await indexUserMemories('test-user', profile, {
        vectorStore: customStore,
      } as any);

      expect(customStore.addDocument).toHaveBeenCalled();
      expect(mockAddDocument).not.toHaveBeenCalled();
    });

    it('should index life events', async () => {
      const profile = createMinimalProfile({
        lifeEvents: [
          {
            id: 'event-1',
            type: 'career_change',
            description: 'Started new job',
            date: new Date(),
            impact: 'positive',
          } as unknown as LifeEvent,
        ],
      });

      const result = await indexUserMemories('test-user', profile);

      expect(result.categories['life_event']).toBe(1);
    });

    it('should index goals', async () => {
      const profile = createMinimalProfile({
        goals: [
          {
            id: 'goal-1',
            name: 'Save for retirement',
            priority: 'high',
            progress: 0.5,
            category: 'financial',
          } as unknown as FinancialGoal,
        ],
      });

      const result = await indexUserMemories('test-user', profile);

      expect(result.categories['goal']).toBeDefined();
    });
  });

  describe('removeUserMemories', () => {
    it('should remove all user memories found in search', async () => {
      // Setup: search returns 3 documents
      mockSearch.mockResolvedValue([
        { document: { id: 'doc-1', text: 'test', metadata: {} }, score: 1 },
        { document: { id: 'doc-2', text: 'test', metadata: {} }, score: 1 },
        { document: { id: 'doc-3', text: 'test', metadata: {} }, score: 1 },
      ]);
      mockRemoveDocument.mockResolvedValue(undefined);

      const removed = await removeUserMemories('test-user');

      expect(removed).toBe(3);
      expect(mockRemoveDocument).toHaveBeenCalledTimes(3);
    });

    it('should handle search errors gracefully', async () => {
      mockSearch.mockRejectedValue(new Error('Search failed'));

      const removed = await removeUserMemories('test-user');

      // Should return 0 on search error, not throw
      expect(removed).toBe(0);
    });

    it('should handle individual removal errors gracefully', async () => {
      mockSearch.mockResolvedValue([
        { document: { id: 'doc-1', text: 'test', metadata: {} }, score: 1 },
        { document: { id: 'doc-2', text: 'test', metadata: {} }, score: 1 },
      ]);
      // First removal fails, second succeeds
      mockRemoveDocument
        .mockRejectedValueOnce(new Error('Remove failed'))
        .mockResolvedValueOnce(undefined);

      const removed = await removeUserMemories('test-user');

      // Only 1 should succeed
      expect(removed).toBe(1);
    });

    it('should use provided vector store', async () => {
      const customStore = {
        addDocument: vi.fn(),
        search: vi
          .fn()
          .mockResolvedValue([{ document: { id: 'doc-1', text: 'test', metadata: {} }, score: 1 }]),
        removeDocument: vi.fn().mockResolvedValue(undefined),
        deleteByMetadata: vi.fn(),
      };

      const removed = await removeUserMemories(
        'test-user',
        customStore as unknown as Parameters<typeof removeUserMemories>[1]
      );

      expect(removed).toBe(1);
      expect(customStore.search).toHaveBeenCalled();
      expect(customStore.removeDocument).toHaveBeenCalled();
    });
  });

  describe('getUserMemoryStats', () => {
    it('should return empty stats when no documents', async () => {
      mockSearch.mockResolvedValue([]);

      const stats = await getUserMemoryStats('test-user');

      expect(stats.totalDocuments).toBe(0);
      expect(stats.byCategory).toEqual({});
    });

    it('should count documents by category', async () => {
      mockSearch.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            text: 'test',
            metadata: { category: 'key_moment', userId: 'test-user', source: 'user_memory' },
          },
          score: 1,
        },
        {
          document: {
            id: 'doc-2',
            text: 'test',
            metadata: { category: 'key_moment', userId: 'test-user', source: 'user_memory' },
          },
          score: 1,
        },
        {
          document: {
            id: 'doc-3',
            text: 'test',
            metadata: { category: 'person', userId: 'test-user', source: 'user_memory' },
          },
          score: 1,
        },
      ]);

      const stats = await getUserMemoryStats('test-user');

      expect(stats.totalDocuments).toBe(3);
      expect(stats.byCategory['key_moment']).toBe(2);
      expect(stats.byCategory['person']).toBe(1);
    });

    it('should track last indexed timestamp', async () => {
      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2024-06-01');

      mockSearch.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            text: 'test',
            metadata: {
              category: 'key_moment',
              userId: 'test-user',
              source: 'user_memory',
              timestamp: oldDate,
            },
          },
          score: 1,
        },
        {
          document: {
            id: 'doc-2',
            text: 'test',
            metadata: {
              category: 'key_moment',
              userId: 'test-user',
              source: 'user_memory',
              timestamp: newDate,
            },
          },
          score: 1,
        },
      ]);

      const stats = await getUserMemoryStats('test-user');

      expect(stats.lastIndexed).toEqual(newDate);
    });

    it('should handle search errors gracefully', async () => {
      mockSearch.mockRejectedValue(new Error('Search failed'));

      const stats = await getUserMemoryStats('test-user');

      expect(stats.totalDocuments).toBe(0);
      expect(stats.byCategory).toEqual({});
    });

    it('should handle documents with missing category', async () => {
      mockSearch.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            text: 'test',
            metadata: { userId: 'test-user', source: 'user_memory' },
          },
          score: 1,
        },
      ]);

      const stats = await getUserMemoryStats('test-user');

      expect(stats.totalDocuments).toBe(1);
      expect(stats.byCategory['unknown']).toBe(1);
    });
  });

  describe('UserMemoryCategory type', () => {
    it('should include all expected categories', () => {
      const expectedCategories: UserMemoryCategory[] = [
        'key_moment',
        'person',
        'thread',
        'followup',
        'life_event',
        'goal',
        'persona_learning',
        'shared_content',
        'emotional_pattern',
        'preference',
        'entertainment',
        'important_date',
        'emotional_signature',
        'inside_joke',
        'running_theme',
        'value',
        'dream',
        'fear',
        'growth_marker',
        'challenge',
        'avoidance',
        'temporal_pattern',
        'comfort_pattern',
        'stress_trigger',
        'emotional_tell',
      ];

      // TypeScript will catch if any category is invalid
      expectedCategories.forEach((category) => {
        expect(typeof category).toBe('string');
      });
    });
  });

  describe('IndexingResult type', () => {
    it('should have correct structure', () => {
      const result: IndexingResult = {
        indexed: 10,
        skipped: 2,
        errors: 1,
        categories: {
          key_moment: 5,
          person: 5,
        },
      };

      expect(result.indexed).toBe(10);
      expect(result.skipped).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.categories['key_moment']).toBe(5);
    });
  });
});

describe('User Memory Indexer Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDocument.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
    mockRemoveDocument.mockResolvedValue(undefined);
    mockDeleteByMetadata.mockResolvedValue(0);
  });

  it('should index and then retrieve stats', async () => {
    const profile = {
      id: 'integration-user',
      name: 'Integration Test User',
      email: 'test@example.com',
      createdAt: new Date(),
      totalConversations: 10,
      keyMoments: [
        {
          id: 'moment-1',
          type: 'breakthrough',
          summary: 'Had an important realization',
          topics: ['career', 'growth'],
          emotionalWeight: 'heavy',
          timestamp: new Date(),
          followUpNeeded: true,
        },
      ],
    } as unknown as UserProfile;

    // Index the profile
    const indexResult = await indexUserMemories('integration-user', profile);
    expect(indexResult.indexed).toBeGreaterThan(0);

    // Setup mock for stats
    mockSearch.mockResolvedValue([
      {
        document: {
          id: 'key_moment_integration-user_moment_1',
          text: 'breakthrough: Had an important realization',
          metadata: {
            category: 'key_moment',
            userId: 'integration-user',
            source: 'user_memory',
          },
        },
        score: 1,
      },
    ]);

    // Get stats
    const stats = await getUserMemoryStats('integration-user');
    expect(stats.totalDocuments).toBe(1);
    expect(stats.byCategory['key_moment']).toBe(1);
  });

  it('should support GDPR deletion workflow', async () => {
    // Setup existing documents for stats check
    mockSearch.mockResolvedValue([
      {
        document: {
          id: 'doc-1',
          text: 'test',
          metadata: { category: 'key_moment', userId: 'gdpr-user', source: 'user_memory' },
        },
        score: 1,
      },
    ]);

    // Check stats before deletion
    const beforeStats = await getUserMemoryStats('gdpr-user');
    expect(beforeStats.totalDocuments).toBe(1);

    // Remove all user memories (search returns docs, removeDocument removes them)
    mockRemoveDocument.mockResolvedValue(undefined);
    const removed = await removeUserMemories('gdpr-user');
    expect(removed).toBe(1);
    expect(mockRemoveDocument).toHaveBeenCalledWith('doc-1');

    // Verify deletion - after removal, search returns empty
    mockSearch.mockResolvedValue([]);
    const afterStats = await getUserMemoryStats('gdpr-user');
    expect(afterStats.totalDocuments).toBe(0);
  });
});
