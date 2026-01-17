/**
 * Productivity Executor Tests
 *
 * Tests for task, goal, timer, reminder, note, and journal tools.
 * Covers alias resolution, Firestore persistence, and edge cases.
 *
 * @module agents/shared/tool-executors/__tests__/productivity-executor.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { productivityExecutor } from '../productivity-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
          doc: vi.fn(() => ({
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
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

describe('ProductivityExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(productivityExecutor.domain).toBe('productivity');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'addtask',
        'completetask',
        'gettasks',
        'deletetask',
        'addgoal',
        'updategoal',
        'getgoals',
        'settimer',
        'gettimer',
        'canceltimer',
        'schedulereminder',
        'cancelreminder',
        'getreminders',
        'addnote',
        'getnotes',
        'searchnotes',
        'savenote',
        'addjournal',
        'getjournals',
        'journal',
      ];

      for (const tool of expectedTools) {
        expect(productivityExecutor.handles).toContain(tool);
      }
    });
  });

  describe('tool alias resolution', () => {
    it('should resolve saveNote to addNote', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'saveNote',
        { content: 'Test note via alias' },
        ctx
      );

      // Result contains "Noted" (case-insensitive check)
      expect((result as string).toLowerCase()).toContain('noted');
    });

    it('should resolve journal to addJournal', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'journal',
        { entry: 'Today was great' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await productivityExecutor.execute('ADDTASK', { title: 'Test' }, ctx);
      const result2 = await productivityExecutor.execute('AddTask', { title: 'Test' }, ctx);
      const result3 = await productivityExecutor.execute('addtask', { title: 'Test' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('addTask', () => {
    it('should add a task with title', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('addTask', { title: 'Buy groceries' }, ctx);

      expect(result).toContain('Buy groceries');
    });

    it('should prompt for title if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('addTask', {}, ctx);

      expect(result).toContain('What task');
    });

    it('should handle priority levels', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'addTask',
        { title: 'Urgent meeting', priority: 'high' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should work without userId (graceful fallback)', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await productivityExecutor.execute('addTask', { title: 'Test task' }, ctx);

      expect(result).toContain('Test task');
    });
  });

  describe('completeTask', () => {
    it('should complete a task by name', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'completeTask',
        { taskName: 'Buy groceries' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for task name if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('completeTask', {}, ctx);

      expect(result).toContain('Which task');
    });
  });

  describe('getTasks', () => {
    it('should get tasks with default filter', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('getTasks', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should filter by pending tasks', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('getTasks', { filter: 'pending' }, ctx);

      expect(result).toBeDefined();
    });

    it('should filter by completed tasks', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('getTasks', { filter: 'completed' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('addGoal', () => {
    it('should add a goal with title', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('addGoal', { title: 'Learn Spanish' }, ctx);

      expect(result).toContain('Learn Spanish');
    });

    it('should prompt for goal if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('addGoal', {}, ctx);

      expect(result).toContain('What goal');
    });
  });

  describe('setTimer', () => {
    it('should set a timer with duration', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('setTimer', { duration: '5 minutes' }, ctx);

      expect(result).toBeDefined();
    });

    it('should handle various duration formats', async () => {
      const ctx = createContext();

      const durations = ['10 minutes', '1 hour', '30 seconds', '1h 30m'];

      for (const duration of durations) {
        const result = await productivityExecutor.execute('setTimer', { duration }, ctx);
        expect(result).toBeDefined();
      }
    });

    it('should prompt for duration if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('setTimer', {}, ctx);

      expect(result).toContain('long');
    });
  });

  describe('scheduleReminder', () => {
    it('should schedule a reminder', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'scheduleReminder',
        { message: 'Call mom', when: '5pm' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for message if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('scheduleReminder', {}, ctx);

      expect(result).toContain('remind');
    });
  });

  describe('addNote', () => {
    it('should add a note with content', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'addNote',
        { content: 'Meeting notes: discussed Q1 goals' },
        ctx
      );

      // Result contains "Noted" (case-insensitive check)
      expect((result as string).toLowerCase()).toContain('noted');
    });

    it('should prompt for content if missing', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('addNote', {}, ctx);

      expect(result).toContain('note');
    });

    it('should handle tags', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'addNote',
        { content: 'Important insight', tags: ['work', 'ideas'] },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'getWeather', 'handoffToMaya'];

      for (const tool of otherDomainTools) {
        const result = await productivityExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });

  describe('placeholder implementations', () => {
    it('should acknowledge timer management as coming soon', async () => {
      const ctx = createContext();

      const result1 = await productivityExecutor.execute('getTimer', {}, ctx);
      const result2 = await productivityExecutor.execute('cancelTimer', {}, ctx);

      expect(result1).toContain('coming soon');
      expect(result2).toContain('coming soon');
    });

    it('should acknowledge reminder management as coming soon', async () => {
      const ctx = createContext();

      const result1 = await productivityExecutor.execute('cancelReminder', {}, ctx);
      const result2 = await productivityExecutor.execute('getReminders', {}, ctx);

      expect(result1).toContain('coming soon');
      expect(result2).toContain('coming soon');
    });

    it('should acknowledge goal update as being implemented', async () => {
      const ctx = createContext();
      const result = await productivityExecutor.execute(
        'updateGoal',
        { goalId: 'goal-123', progress: 50 },
        ctx
      );

      expect(result).toContain('being implemented');
    });
  });
});
