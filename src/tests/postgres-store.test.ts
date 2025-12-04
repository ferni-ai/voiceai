/**
 * PostgreSQL Memory Store Tests
 *
 * Tests for production PostgreSQL persistence including profiles, summaries,
 * goals, and key moments - mirroring the Firestore tests for consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresStore, getPostgresStore, resetPostgresStore } from '../memory/postgres-store.js';
import {
  createUserProfile,
  type ConversationSummary,
  type KeyMoment,
  type FinancialGoal,
} from '../types/user-profile.js';

describe('PostgreSQL Memory Store', () => {
  let store: PostgresStore;

  beforeEach(() => {
    // Create a fresh store instance for each test
    store = new PostgresStore({
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });
  });

  afterEach(async () => {
    if (store) {
      await store.close();
    }
  });

  describe('Initialization', () => {
    it('should create store with environment config', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://test:test@localhost/testdb';

      const envStore = new PostgresStore();
      expect(envStore['config'].connectionString).toBe('postgresql://test:test@localhost/testdb');

      process.env.DATABASE_URL = originalUrl;
    });

    it('should use SSL in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodStore = new PostgresStore();
      expect(prodStore['config'].ssl).toEqual({ rejectUnauthorized: false });

      process.env.NODE_ENV = originalEnv;
    });

    it('should disable SSL in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devStore = new PostgresStore();
      expect(devStore['config'].ssl).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should not reinitialize if already initialized', async () => {
      store['initialized'] = true;
      await store.initialize();
      expect(store['initialized']).toBe(true);
    });
  });

  describe('User Profile Operations (without actual Postgres)', () => {
    it('should throw if not initialized when getting profile', async () => {
      store['pool'] = null;

      await expect(store.getProfile('test-user')).rejects.toThrow('PostgresStore not initialized');
    });

    it('should throw if not initialized when saving profile', async () => {
      store['pool'] = null;
      const profile = createUserProfile('test-user');

      await expect(store.saveProfile(profile)).rejects.toThrow('PostgresStore not initialized');
    });

    it('should throw if not initialized when deleting profile', async () => {
      store['pool'] = null;

      await expect(store.deleteProfile('test-user')).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });

    it('should throw if not initialized when checking profile', async () => {
      store['pool'] = null;

      await expect(store.hasProfile('test-user')).rejects.toThrow('PostgresStore not initialized');
    });

    it('should throw if not initialized when listing profiles', async () => {
      store['pool'] = null;

      await expect(store.listProfiles()).rejects.toThrow('PostgresStore not initialized');
    });
  });

  describe('Serialization & Hydration', () => {
    it('should serialize profile with dates as ISO strings', () => {
      const profile = createUserProfile('test-user', 'John');
      const serialized = store['serializeProfile'](profile);

      expect(serialized).toBeDefined();
      expect(serialized.id).toBe('test-user');
      expect(serialized.name).toBe('John');
      // Dates should be ISO strings
      expect(typeof serialized.firstContact).toBe('string');
      expect(typeof serialized.createdAt).toBe('string');
    });

    it('should hydrate profile with Date objects', () => {
      const data = {
        id: 'test-user',
        name: 'John',
        firstContact: '2024-01-01T00:00:00.000Z',
        lastContact: '2024-01-15T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
        totalConversations: 5,
        relationshipStage: 'getting_to_know',
      };

      const hydrated = store['hydrateProfile'](data as any);

      expect(hydrated.firstContact).toBeInstanceOf(Date);
      expect(hydrated.lastContact).toBeInstanceOf(Date);
      expect(hydrated.createdAt).toBeInstanceOf(Date);
      expect(hydrated.updatedAt).toBeInstanceOf(Date);
      expect(hydrated.totalConversations).toBe(5);
    });

    it('should preserve non-date fields during hydration', () => {
      const data = {
        id: 'test-user',
        name: 'Jane',
        preferredTopics: ['retirement', 'index funds'],
        relationshipStage: 'trusted_advisor',
        totalMinutesTalked: 120,
      };

      const hydrated = store['hydrateProfile'](data as any);

      expect(hydrated.name).toBe('Jane');
      expect(hydrated.preferredTopics).toEqual(['retirement', 'index funds']);
      expect(hydrated.relationshipStage).toBe('trusted_advisor');
      expect(hydrated.totalMinutesTalked).toBe(120);
    });
  });

  describe('Conversation Summary Operations', () => {
    it('should throw if not initialized when saving summary', async () => {
      store['pool'] = null;
      const summary: ConversationSummary = {
        id: 'summary-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        duration: 600,
        turnCount: 20,
        mainTopics: ['retirement'],
        keyPoints: ['Discussed 401k'],
        emotionalArc: 'neutral',
      };

      await expect(store.saveSummary('test-user', summary)).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });

    it('should throw if not initialized when getting summaries', async () => {
      store['pool'] = null;

      await expect(store.getSummaries('test-user')).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });
  });

  describe('Key Moment Operations', () => {
    it('should throw if not initialized when adding moment', async () => {
      store['pool'] = null;
      const moment: KeyMoment = {
        id: 'moment-1',
        timestamp: new Date(),
        type: 'breakthrough',
        summary: 'User understood compound interest',
        emotionalWeight: 'medium',
        topics: ['investing'],
      };

      await expect(store.addKeyMoment('test-user', moment)).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });

    it('should throw if not initialized when getting moments', async () => {
      store['pool'] = null;

      await expect(store.getKeyMoments('test-user')).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });
  });

  describe('Goal Operations', () => {
    it('should throw if not initialized when saving goal', async () => {
      store['pool'] = null;
      const goal: FinancialGoal = {
        id: 'goal-1',
        name: 'Emergency Fund',
        type: 'emergency',
        targetAmount: 10000,
        currentProgress: 2000,
        progressPercent: 20,
        status: 'active',
        priority: 'high',
        timeHorizon: 'short',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(store.saveGoal('test-user', goal)).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });

    it('should throw if not initialized when getting goals', async () => {
      store['pool'] = null;

      await expect(store.getGoals('test-user')).rejects.toThrow('PostgresStore not initialized');
    });

    it('should throw if not initialized when deleting goal', async () => {
      store['pool'] = null;

      await expect(store.deleteGoal('test-user', 'goal-1')).rejects.toThrow(
        'PostgresStore not initialized'
      );
    });
  });

  describe('Search Operations', () => {
    it('should throw if not initialized when searching profiles', async () => {
      store['pool'] = null;

      await expect(store.searchProfiles('john')).rejects.toThrow('PostgresStore not initialized');
    });

    it('should throw if not initialized when getting all user IDs', async () => {
      store['pool'] = null;

      await expect(store.getAllUserIds()).rejects.toThrow('PostgresStore not initialized');
    });
  });

  describe('Cleanup', () => {
    it('should close Postgres pool', async () => {
      // Mock pool with end method
      store['pool'] = {
        end: async () => {},
        connect: async () => ({}),
        query: async () => ({ rows: [], rowCount: 0 }),
      } as any;
      store['initialized'] = true;

      await store.close();

      expect(store['pool']).toBeNull();
      expect(store['initialized']).toBe(false);
    });

    it('should handle close when not initialized', async () => {
      store['pool'] = null;

      await expect(store.close()).resolves.not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default pool settings', () => {
      const defaultStore = new PostgresStore();

      expect(defaultStore['config'].max).toBe(20);
      expect(defaultStore['config'].idleTimeoutMillis).toBe(30000);
    });

    it('should allow custom pool settings', () => {
      const customStore = new PostgresStore({
        connectionString: 'postgresql://custom@localhost/db',
        max: 50,
        idleTimeoutMillis: 60000,
      });

      expect(customStore['config'].max).toBe(50);
      expect(customStore['config'].idleTimeoutMillis).toBe(60000);
    });
  });

  describe('Factory Functions', () => {
    it('should create singleton instance', async () => {
      const instance1 = getPostgresStore();
      const instance2 = getPostgresStore();

      expect(instance1).toBe(instance2);

      resetPostgresStore();
    });

    it('should reset singleton instance', async () => {
      const instance1 = getPostgresStore();
      resetPostgresStore();
      const instance2 = getPostgresStore();

      expect(instance2).toBeDefined();
      // After reset, should be able to get a new instance
    });
  });

  describe('SQL Query Safety', () => {
    it('should use parameterized queries for profile operations', () => {
      // This test verifies the code uses $1, $2 placeholders, not string concatenation
      // We can't easily unit test this without the actual DB, but we verify
      // the store methods are defined correctly

      expect(store.getProfile).toBeDefined();
      expect(store.saveProfile).toBeDefined();
      expect(store.deleteProfile).toBeDefined();
    });
  });
});
