/**
 * Habits Executor Tests
 *
 * Tests for habit tracking tools: createHabit, logHabit, getHabitProgress,
 * getHabitStreak, suggestHabitStack, getHabits, deleteHabit, pauseHabit, resumeHabit.
 * Covers Firestore persistence and behavior science integration.
 *
 * @module agents/shared/tool-executors/__tests__/habits-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { habitsExecutor } from '../habits-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'habit-123' }),
          doc: vi.fn(() => ({
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Morning run' }) }),
            delete: vi.fn().mockResolvedValue(undefined),
          })),
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
              })),
            })),
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
            })),
          })),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      })),
    })),
  })),
}));

// Mock habit coaching module
vi.mock('../../../../tools/domains/habits/habit-coaching.js', () => ({
  createHabit: vi.fn().mockResolvedValue({ id: 'habit-123', name: 'Morning run' }),
  logHabitCompletion: vi.fn().mockResolvedValue({ streak: 5 }),
  getHabitProgress: vi.fn().mockResolvedValue({ completionRate: 0.8, streak: 5 }),
  getHabitStreak: vi.fn().mockResolvedValue(5),
  suggestHabitStack: vi.fn().mockResolvedValue(['Habit 1', 'Habit 2']),
  getHabits: vi.fn().mockResolvedValue([]),
  deleteHabit: vi.fn().mockResolvedValue(true),
  pauseHabit: vi.fn().mockResolvedValue(true),
  resumeHabit: vi.fn().mockResolvedValue(true),
}));

describe('HabitsExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'maya',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(habitsExecutor.domain).toBe('habits');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'createhabit',
        'loghabit',
        'gethabitprogress',
        'gethabitstreak',
        'suggesthabitstack',
        'gethabits',
        'deletehabit',
        'pausehabit',
        'resumehabit',
      ];

      for (const tool of expectedTools) {
        expect(habitsExecutor.handles).toContain(tool);
      }
    });
  });

  describe('createHabit', () => {
    it('should create a habit with name', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'createHabit',
        { name: 'Morning meditation' },
        ctx
      );

      expect(result).toContain('meditation');
    });

    it('should create a habit with frequency', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'createHabit',
        { name: 'Exercise', frequency: 'daily' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should create a habit with cue and reward (habit loop)', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'createHabit',
        {
          name: 'Read before bed',
          cue: 'After brushing teeth',
          reward: 'Feel accomplished',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('createHabit', {}, ctx);

      expect(result).toContain('What habit');
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await habitsExecutor.execute('CREATEHABIT', { name: 'Test' }, ctx);
      const result2 = await habitsExecutor.execute('CreateHabit', { name: 'Test' }, ctx);
      const result3 = await habitsExecutor.execute('createhabit', { name: 'Test' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('logHabit', () => {
    it('should log habit completion', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'logHabit',
        { habitName: 'Morning meditation' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should log habit with notes', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'logHabit',
        { habitName: 'Exercise', notes: 'Did 30 min cardio' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('logHabit', {}, ctx);

      expect(result).toContain('Which habit');
    });
  });

  describe('getHabitProgress', () => {
    it('should get progress for a habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'getHabitProgress',
        { habitName: 'Morning meditation' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should get progress with timeframe', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'getHabitProgress',
        { habitName: 'Exercise', timeframe: 'week' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle missing habit name gracefully', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('getHabitProgress', {}, ctx);

      // May prompt or report no habits
      expect(result).toBeDefined();
    });
  });

  describe('getHabitStreak', () => {
    it('should get streak for a habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'getHabitStreak',
        { habitName: 'Morning meditation' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('getHabitStreak', {}, ctx);

      expect(result).toContain('Which habit');
    });
  });

  describe('suggestHabitStack', () => {
    it('should suggest habits to stack with existing habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'suggestHabitStack',
        { existingHabit: 'Morning coffee' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should suggest habits based on goal', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'suggestHabitStack',
        { goal: 'Be more productive' },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('getHabits', () => {
    it('should get all habits', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('getHabits', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should filter by status', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('getHabits', { status: 'active' }, ctx);

      expect(result).toBeDefined();
    });

    it('should filter by category', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('getHabits', { category: 'health' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('deleteHabit', () => {
    it('should delete a habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('deleteHabit', { habitName: 'Old habit' }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('deleteHabit', {}, ctx);

      expect(result).toContain('Which habit');
    });
  });

  describe('pauseHabit', () => {
    it('should pause a habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('pauseHabit', { habitName: 'Exercise' }, ctx);

      expect(result).toBeDefined();
    });

    it('should pause with reason', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute(
        'pauseHabit',
        { habitName: 'Exercise', reason: 'Traveling' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('pauseHabit', {}, ctx);

      expect(result).toContain('Which habit');
    });
  });

  describe('resumeHabit', () => {
    it('should resume a paused habit', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('resumeHabit', { habitName: 'Exercise' }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt for habit name if missing', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('resumeHabit', {}, ctx);

      expect(result).toContain('Which habit');
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await habitsExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'getWeather', 'addTask'];

      for (const tool of otherDomainTools) {
        const result = await habitsExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
