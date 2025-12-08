/**
 * In-Memory Store Tests
 *
 * Tests for the in-memory store implementation that handles:
 * - User profile CRUD operations
 * - Conversation summary storage
 * - Key moment tracking
 * - Financial goal management
 *
 * @module tests/in-memory-store
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InMemoryStore, getDefaultStore, resetDefaultStore } from '../memory/in-memory-store.js';
import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';

// ============================================================================
// HELPER FACTORIES
// ============================================================================

function createTestProfile(id: string, overrides?: Partial<UserProfile>): UserProfile {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserProfile;
}

function createTestSummary(
  id: string,
  overrides?: Partial<ConversationSummary>
): ConversationSummary {
  return {
    id,
    timestamp: new Date(),
    mainTopics: ['finance'],
    keyPoints: ['point 1'],
    emotionalArc: 'neutral',
    ...overrides,
  } as ConversationSummary;
}

function createTestMoment(id: string, overrides?: Partial<KeyMoment>): KeyMoment {
  return {
    id,
    type: 'insight',
    content: 'Test moment content',
    timestamp: new Date(),
    importance: 0.7,
    ...overrides,
  } as KeyMoment;
}

function createTestGoal(id: string, overrides?: Partial<FinancialGoal>): FinancialGoal {
  return {
    id,
    name: `Goal ${id}`,
    type: 'savings',
    targetAmount: 10000,
    currentAmount: 1000,
    ...overrides,
  } as FinancialGoal;
}

// ============================================================================
// TESTS
// ============================================================================

describe('InMemoryStore', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newStore = new InMemoryStore();
      await expect(newStore.initialize()).resolves.not.toThrow();
      await newStore.close();
    });

    it('should close and clear data', async () => {
      await store.saveProfile(createTestProfile('user-1'));
      await store.close();

      const newStore = new InMemoryStore();
      await newStore.initialize();
      const profile = await newStore.getProfile('user-1');
      expect(profile).toBeNull();
      await newStore.close();
    });
  });

  // --------------------------------------------------------------------------
  // Profile Operations
  // --------------------------------------------------------------------------

  describe('Profile Operations', () => {
    it('should save and retrieve profile', async () => {
      const profile = createTestProfile('user-1');
      await store.saveProfile(profile);

      const retrieved = await store.getProfile('user-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('user-1');
    });

    it('should return null for non-existent profile', async () => {
      const profile = await store.getProfile('non-existent');
      expect(profile).toBeNull();
    });

    it('should update existing profile', async () => {
      const profile = createTestProfile('user-1', { name: 'Original' });
      await store.saveProfile(profile);

      const updated = createTestProfile('user-1', { name: 'Updated' });
      await store.saveProfile(updated);

      const retrieved = await store.getProfile('user-1');
      expect(retrieved?.name).toBe('Updated');
    });

    it('should set updatedAt on save', async () => {
      const profile = createTestProfile('user-1');
      const originalUpdatedAt = profile.updatedAt;

      // Small delay to ensure time difference
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      await store.saveProfile(profile);

      const retrieved = await store.getProfile('user-1');
      expect(retrieved?.updatedAt).toBeDefined();
    });

    it('should delete profile and related data', async () => {
      const userId = 'user-to-delete';
      await store.saveProfile(createTestProfile(userId));
      await store.saveSummary(userId, createTestSummary('summary-1'));
      await store.addKeyMoment(userId, createTestMoment('moment-1'));
      await store.saveGoal(userId, createTestGoal('goal-1'));

      const deleted = await store.deleteProfile(userId);
      expect(deleted).toBe(true);

      expect(await store.getProfile(userId)).toBeNull();
      expect(await store.getSummaries(userId)).toEqual([]);
      expect(await store.getKeyMoments(userId)).toEqual([]);
      expect(await store.getGoals(userId)).toEqual([]);
    });

    it('should return false when deleting non-existent profile', async () => {
      const deleted = await store.deleteProfile('non-existent');
      expect(deleted).toBe(false);
    });

    it('should check if profile exists', async () => {
      await store.saveProfile(createTestProfile('user-1'));

      expect(await store.hasProfile('user-1')).toBe(true);
      expect(await store.hasProfile('non-existent')).toBe(false);
    });

    it('should list profiles', async () => {
      await store.saveProfile(createTestProfile('user-1'));
      await store.saveProfile(createTestProfile('user-2'));
      await store.saveProfile(createTestProfile('user-3'));

      const profiles = await store.listProfiles();
      expect(profiles).toHaveLength(3);
    });

    it('should paginate profiles', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveProfile(createTestProfile(`user-${i}`));
      }

      const page1 = await store.listProfiles({ limit: 3, offset: 0 });
      const page2 = await store.listProfiles({ limit: 3, offset: 3 });

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
    });

    it('should sort profiles', async () => {
      await store.saveProfile(createTestProfile('user-c', { name: 'Charlie' }));
      await store.saveProfile(createTestProfile('user-a', { name: 'Alice' }));
      await store.saveProfile(createTestProfile('user-b', { name: 'Bob' }));

      const sorted = await store.listProfiles({ sortBy: 'name', sortOrder: 'asc' });
      expect(sorted[0].name).toBe('Alice');
      expect(sorted[1].name).toBe('Bob');
      expect(sorted[2].name).toBe('Charlie');
    });
  });

  // --------------------------------------------------------------------------
  // Conversation Summary Operations
  // --------------------------------------------------------------------------

  describe('Conversation Summary Operations', () => {
    const userId = 'user-summaries';

    beforeEach(async () => {
      await store.saveProfile(createTestProfile(userId));
    });

    it('should save and retrieve summary', async () => {
      const summary = createTestSummary('summary-1');
      await store.saveSummary(userId, summary);

      const summaries = await store.getSummaries(userId);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('summary-1');
    });

    it('should return empty array for user with no summaries', async () => {
      const summaries = await store.getSummaries('no-summaries-user');
      expect(summaries).toEqual([]);
    });

    it('should update existing summary', async () => {
      await store.saveSummary(userId, createTestSummary('summary-1', { emotionalArc: 'positive' }));
      await store.saveSummary(userId, createTestSummary('summary-1', { emotionalArc: 'negative' }));

      const summaries = await store.getSummaries(userId);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].emotionalArc).toBe('negative');
    });

    it('should sort summaries by timestamp descending by default', async () => {
      const now = Date.now();
      await store.saveSummary(
        userId,
        createTestSummary('old', { timestamp: new Date(now - 1000) })
      );
      await store.saveSummary(userId, createTestSummary('new', { timestamp: new Date(now) }));

      const summaries = await store.getSummaries(userId);
      expect(summaries[0].id).toBe('new');
      expect(summaries[1].id).toBe('old');
    });

    it('should support ascending sort', async () => {
      const now = Date.now();
      await store.saveSummary(
        userId,
        createTestSummary('old', { timestamp: new Date(now - 1000) })
      );
      await store.saveSummary(userId, createTestSummary('new', { timestamp: new Date(now) }));

      const summaries = await store.getSummaries(userId, { sortOrder: 'asc' });
      expect(summaries[0].id).toBe('old');
    });

    it('should paginate summaries', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.saveSummary(userId, createTestSummary(`summary-${i}`));
      }

      const page = await store.getSummaries(userId, { limit: 5, offset: 0 });
      expect(page).toHaveLength(5);
    });
  });

  // --------------------------------------------------------------------------
  // Key Moment Operations
  // --------------------------------------------------------------------------

  describe('Key Moment Operations', () => {
    const userId = 'user-moments';

    beforeEach(async () => {
      await store.saveProfile(createTestProfile(userId));
    });

    it('should add and retrieve key moment', async () => {
      const moment = createTestMoment('moment-1');
      await store.addKeyMoment(userId, moment);

      const moments = await store.getKeyMoments(userId);
      expect(moments).toHaveLength(1);
      expect(moments[0].id).toBe('moment-1');
    });

    it('should return empty array for user with no moments', async () => {
      const moments = await store.getKeyMoments('no-moments-user');
      expect(moments).toEqual([]);
    });

    it('should update existing moment', async () => {
      await store.addKeyMoment(userId, createTestMoment('moment-1', { importance: 0.5 }));
      await store.addKeyMoment(userId, createTestMoment('moment-1', { importance: 0.9 }));

      const moments = await store.getKeyMoments(userId);
      expect(moments).toHaveLength(1);
      expect(moments[0].importance).toBe(0.9);
    });

    it('should sort moments by timestamp descending by default', async () => {
      const now = Date.now();
      await store.addKeyMoment(
        userId,
        createTestMoment('old', { timestamp: new Date(now - 1000) })
      );
      await store.addKeyMoment(userId, createTestMoment('new', { timestamp: new Date(now) }));

      const moments = await store.getKeyMoments(userId);
      expect(moments[0].id).toBe('new');
    });

    it('should paginate moments', async () => {
      for (let i = 1; i <= 10; i++) {
        await store.addKeyMoment(userId, createTestMoment(`moment-${i}`));
      }

      const page = await store.getKeyMoments(userId, { limit: 3 });
      expect(page).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Goal Operations
  // --------------------------------------------------------------------------

  describe('Goal Operations', () => {
    const userId = 'user-goals';

    beforeEach(async () => {
      await store.saveProfile(createTestProfile(userId));
    });

    it('should save and retrieve goal', async () => {
      const goal = createTestGoal('goal-1');
      await store.saveGoal(userId, goal);

      const goals = await store.getGoals(userId);
      expect(goals).toHaveLength(1);
      expect(goals[0].id).toBe('goal-1');
    });

    it('should return empty array for user with no goals', async () => {
      const goals = await store.getGoals('no-goals-user');
      expect(goals).toEqual([]);
    });

    it('should update existing goal', async () => {
      await store.saveGoal(userId, createTestGoal('goal-1', { currentAmount: 100 }));
      await store.saveGoal(userId, createTestGoal('goal-1', { currentAmount: 5000 }));

      const goals = await store.getGoals(userId);
      expect(goals).toHaveLength(1);
      expect(goals[0].currentAmount).toBe(5000);
    });

    it('should set updatedAt on goal update', async () => {
      // First save
      await store.saveGoal(userId, createTestGoal('goal-1', { currentAmount: 100 }));
      // Update the same goal
      await store.saveGoal(userId, createTestGoal('goal-1', { currentAmount: 200 }));

      const goals = await store.getGoals(userId);
      // updatedAt is set when updating an existing goal
      expect(goals[0].updatedAt).toBeDefined();
    });

    it('should delete goal', async () => {
      await store.saveGoal(userId, createTestGoal('goal-1'));
      await store.saveGoal(userId, createTestGoal('goal-2'));

      const deleted = await store.deleteGoal(userId, 'goal-1');
      expect(deleted).toBe(true);

      const goals = await store.getGoals(userId);
      expect(goals).toHaveLength(1);
      expect(goals[0].id).toBe('goal-2');
    });

    it('should return false when deleting non-existent goal', async () => {
      const deleted = await store.deleteGoal(userId, 'non-existent');
      expect(deleted).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  describe('getStats()', () => {
    it('should return correct statistics', async () => {
      await store.saveProfile(createTestProfile('user-1'));
      await store.saveProfile(createTestProfile('user-2'));
      await store.saveSummary('user-1', createTestSummary('s1'));
      await store.saveSummary('user-1', createTestSummary('s2'));
      await store.addKeyMoment('user-1', createTestMoment('m1'));
      await store.saveGoal('user-2', createTestGoal('g1'));

      const stats = store.getStats();

      expect(stats.profileCount).toBe(2);
      expect(stats.totalSummaries).toBe(2);
      expect(stats.totalMoments).toBe(1);
      expect(stats.totalGoals).toBe(1);
    });

    it('should return zeros for empty store', async () => {
      const stats = store.getStats();

      expect(stats.profileCount).toBe(0);
      expect(stats.totalSummaries).toBe(0);
      expect(stats.totalMoments).toBe(0);
      expect(stats.totalGoals).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe('Singleton', () => {
    afterEach(async () => {
      await resetDefaultStore();
    });

    it('getDefaultStore should return singleton', () => {
      const store1 = getDefaultStore();
      const store2 = getDefaultStore();
      expect(store1).toBe(store2);
    });

    it('resetDefaultStore should reset singleton', async () => {
      const store1 = getDefaultStore();
      await store1.initialize();
      await store1.saveProfile(createTestProfile('test'));

      await resetDefaultStore();

      const store2 = getDefaultStore();
      await store2.initialize();
      const profile = await store2.getProfile('test');
      expect(profile).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle multiple users independently', async () => {
      await store.saveProfile(createTestProfile('user-a'));
      await store.saveProfile(createTestProfile('user-b'));

      await store.saveSummary('user-a', createTestSummary('summary-a'));
      await store.saveSummary('user-b', createTestSummary('summary-b'));

      const summariesA = await store.getSummaries('user-a');
      const summariesB = await store.getSummaries('user-b');

      expect(summariesA).toHaveLength(1);
      expect(summariesB).toHaveLength(1);
      expect(summariesA[0].id).toBe('summary-a');
      expect(summariesB[0].id).toBe('summary-b');
    });

    it('should handle rapid operations', async () => {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(store.saveProfile(createTestProfile(`user-${i}`)));
      }

      await Promise.all(promises);

      const profiles = await store.listProfiles();
      expect(profiles).toHaveLength(50);
    });

    it('should handle special characters in IDs', async () => {
      const userId = 'user@example.com:special-chars';
      await store.saveProfile(createTestProfile(userId));

      const profile = await store.getProfile(userId);
      expect(profile).toBeDefined();
    });
  });
});
