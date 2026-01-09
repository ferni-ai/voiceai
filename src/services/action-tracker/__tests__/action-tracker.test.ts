/**
 * Action Tracker Tests
 *
 * Tests for the unified action tracking system.
 * Tests the full lifecycle: create → start → complete/fail.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ActionTracker,
  getActionTracker,
  resetActionTracker,
} from '../tracker.js';
import type {
  FerniAction,
  CreateActionOptions,
  ActionFilter,
} from '../types.js';
import {
  isTrackableTool,
  getActionTypeForTool,
  TRACKABLE_TOOLS,
} from '../types.js';

// Mock Firestore to disable persistence for unit tests
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

describe('action-tracker', () => {
  let tracker: ActionTracker;

  const createTestAction = (overrides: Partial<CreateActionOptions> = {}): CreateActionOptions => ({
    userId: `test-user-${Date.now()}`,
    type: 'call',
    description: 'Call Mom about dinner',
    target: 'Mom',
    targetContact: '+1234567890',
    sessionId: `session-${Date.now()}`,
    ...overrides,
  });

  beforeEach(() => {
    resetActionTracker();
    tracker = getActionTracker();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // SINGLETON TESTS
  // ============================================================================

  describe('getActionTracker', () => {
    it('should return singleton instance', () => {
      const tracker1 = getActionTracker();
      const tracker2 = getActionTracker();
      expect(tracker1).toBe(tracker2);
    });

    it('should return new instance after reset', () => {
      const tracker1 = getActionTracker();
      resetActionTracker();
      const tracker2 = getActionTracker();
      expect(tracker1).not.toBe(tracker2);
    });
  });

  // ============================================================================
  // CREATE ACTION TESTS
  // ============================================================================

  describe('createAction', () => {
    it('should create an action with correct fields', async () => {
      const options = createTestAction();
      const action = await tracker.createAction(options);

      expect(action.id).toMatch(/^act_\d+_[a-z0-9]+$/);
      expect(action.userId).toBe(options.userId);
      expect(action.type).toBe('call');
      expect(action.status).toBe('requested');
      expect(action.request.description).toBe(options.description);
      expect(action.request.target).toBe('Mom');
      expect(action.request.targetContact).toBe('+1234567890');
      expect(action.events).toHaveLength(1);
      expect(action.events[0].type).toBe('requested');
    });

    it('should handle all action types', async () => {
      const types = ['call', 'text', 'email', 'calendar', 'reminder'] as const;

      for (const type of types) {
        const action = await tracker.createAction(createTestAction({ type }));
        expect(action.type).toBe(type);
      }
    });

    it('should set timestamps correctly', async () => {
      const action = await tracker.createAction(createTestAction());

      expect(action.createdAt).toEqual(new Date('2025-01-15T10:00:00Z'));
      expect(action.updatedAt).toEqual(new Date('2025-01-15T10:00:00Z'));
      expect(action.request.requestedAt).toEqual(new Date('2025-01-15T10:00:00Z'));
    });
  });

  // ============================================================================
  // EXECUTION LIFECYCLE TESTS
  // ============================================================================

  describe('startExecution', () => {
    it('should start execution and update status', async () => {
      const action = await tracker.createAction(createTestAction());
      const updated = await tracker.startExecution(action.id, {
        toolId: 'callAndConverse',
        toolArgs: { phone: '+1234567890' },
      });

      expect(updated?.status).toBe('in_progress');
      expect(updated?.execution?.toolId).toBe('callAndConverse');
      expect(updated?.execution?.toolArgs).toEqual({ phone: '+1234567890' });
      expect(updated?.execution?.startedAt).toBeDefined();
      expect(updated?.events).toHaveLength(2);
      expect(updated?.events[1].type).toBe('started');
    });

    it('should return null for non-existent action', async () => {
      const result = await tracker.startExecution('non-existent-id', {
        toolId: 'callAndConverse',
      });
      expect(result).toBeNull();
    });
  });

  describe('completeExecution', () => {
    it('should complete action successfully', async () => {
      const action = await tracker.createAction(createTestAction());
      await tracker.startExecution(action.id, { toolId: 'callAndConverse' });

      vi.advanceTimersByTime(30000); // 30 seconds later

      const completed = await tracker.completeExecution(action.id, {
        success: true,
        resultSummary: 'Left voicemail with Mom',
        callDurationSeconds: 25,
      });

      expect(completed?.status).toBe('completed');
      expect(completed?.execution?.success).toBe(true);
      expect(completed?.execution?.resultSummary).toBe('Left voicemail with Mom');
      expect(completed?.execution?.callDurationSeconds).toBe(25);
      expect(completed?.completedAt).toBeDefined();
      expect(completed?.events).toHaveLength(3);
      expect(completed?.events[2].type).toBe('completed');
    });

    it('should mark action as failed on failure', async () => {
      const action = await tracker.createAction(createTestAction());
      await tracker.startExecution(action.id, { toolId: 'callAndConverse' });

      const failed = await tracker.completeExecution(action.id, {
        success: false,
        resultSummary: 'Call failed - line busy',
      });

      expect(failed?.status).toBe('failed');
      expect(failed?.execution?.success).toBe(false);
      expect(failed?.events[2].type).toBe('failed');
    });
  });

  describe('completeExecution with failure', () => {
    it('should fail action with error in result summary', async () => {
      const action = await tracker.createAction(createTestAction());
      await tracker.startExecution(action.id, { toolId: 'callAndConverse' });

      const failed = await tracker.completeExecution(action.id, {
        success: false,
        resultSummary: 'Network error',
      });

      expect(failed?.status).toBe('failed');
      expect(failed?.execution?.success).toBe(false);
      expect(failed?.execution?.resultSummary).toBe('Network error');
      expect(failed?.events[2].type).toBe('failed');
    });
  });

  // ============================================================================
  // QUERY TESTS
  // ============================================================================

  describe('getUserActions', () => {
    it('should return actions for a user', async () => {
      const userId = 'test-user-123';
      await tracker.createAction(createTestAction({ userId, type: 'call' }));
      await tracker.createAction(createTestAction({ userId, type: 'text' }));
      await tracker.createAction(createTestAction({ userId, type: 'email' }));

      const actions = await tracker.getUserActions(userId);
      expect(actions).toHaveLength(3);
    });

    it('should filter by type', async () => {
      const userId = 'test-user-456';
      await tracker.createAction(createTestAction({ userId, type: 'call' }));
      await tracker.createAction(createTestAction({ userId, type: 'text' }));
      await tracker.createAction(createTestAction({ userId, type: 'call' }));

      const calls = await tracker.getUserActions(userId, { type: 'call' });
      expect(calls).toHaveLength(2);
      expect(calls.every((a) => a.type === 'call')).toBe(true);
    });

    it('should filter by multiple types', async () => {
      const userId = 'test-user-789';
      await tracker.createAction(createTestAction({ userId, type: 'call' }));
      await tracker.createAction(createTestAction({ userId, type: 'text' }));
      await tracker.createAction(createTestAction({ userId, type: 'email' }));

      const filter: ActionFilter = { type: ['call', 'text'] };
      const actions = await tracker.getUserActions(userId, filter);
      expect(actions).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const userId = 'test-user-status';
      const action1 = await tracker.createAction(createTestAction({ userId }));
      const action2 = await tracker.createAction(createTestAction({ userId }));
      await tracker.createAction(createTestAction({ userId }));

      await tracker.startExecution(action1.id, { toolId: 'callAndConverse' });
      await tracker.completeExecution(action1.id, { success: true, resultSummary: 'Done' });

      await tracker.startExecution(action2.id, { toolId: 'callAndConverse' });

      const completed = await tracker.getUserActions(userId, { status: 'completed' });
      expect(completed).toHaveLength(1);

      const inProgress = await tracker.getUserActions(userId, { status: 'in_progress' });
      expect(inProgress).toHaveLength(1);

      const requested = await tracker.getUserActions(userId, { status: 'requested' });
      expect(requested).toHaveLength(1);
    });

    it('should limit results', async () => {
      const userId = 'test-user-limit';
      for (let i = 0; i < 10; i++) {
        await tracker.createAction(createTestAction({ userId }));
      }

      const limited = await tracker.getUserActions(userId, { limit: 5 });
      expect(limited).toHaveLength(5);
    });

    it('should sort by createdAt descending (newest first)', async () => {
      const userId = 'test-user-sort';

      await tracker.createAction(createTestAction({ userId, description: 'First' }));
      vi.advanceTimersByTime(1000);
      await tracker.createAction(createTestAction({ userId, description: 'Second' }));
      vi.advanceTimersByTime(1000);
      await tracker.createAction(createTestAction({ userId, description: 'Third' }));

      const actions = await tracker.getUserActions(userId);
      expect(actions[0].request.description).toBe('Third');
      expect(actions[2].request.description).toBe('First');
    });
  });

  describe('getAction', () => {
    it('should return action by ID', async () => {
      const created = await tracker.createAction(createTestAction());
      const retrieved = await tracker.getAction(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const result = await tracker.getAction('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const userId = 'test-user-stats';

      // Create actions of different types
      await tracker.createAction(createTestAction({ userId, type: 'call' }));
      await tracker.createAction(createTestAction({ userId, type: 'call' }));
      await tracker.createAction(createTestAction({ userId, type: 'text' }));
      const toComplete = await tracker.createAction(createTestAction({ userId, type: 'email' }));
      const toFail = await tracker.createAction(createTestAction({ userId, type: 'reminder' }));

      // Complete one
      await tracker.startExecution(toComplete.id, { toolId: 'sendEmail' });
      await tracker.completeExecution(toComplete.id, { success: true, resultSummary: 'Sent' });

      // Fail one
      await tracker.startExecution(toFail.id, { toolId: 'setReminder' });
      await tracker.completeExecution(toFail.id, { success: false, resultSummary: 'Failed' });

      const stats = await tracker.getStats(userId);

      expect(stats.total).toBe(5);
      expect(stats.byType.call).toBe(2);
      expect(stats.byType.text).toBe(1);
      expect(stats.byType.email).toBe(1);
      expect(stats.byType.reminder).toBe(1);
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.requested).toBe(3);
    });
  });

  // ============================================================================
  // TYPE HELPER TESTS
  // ============================================================================

  describe('isTrackableTool', () => {
    it('should return true for trackable tools', () => {
      expect(isTrackableTool('callAndConverse')).toBe(true);
      expect(isTrackableTool('sendText')).toBe(true);
      expect(isTrackableTool('sendEmail')).toBe(true);
      expect(isTrackableTool('scheduleEvent')).toBe(true);
      expect(isTrackableTool('setReminder')).toBe(true);
    });

    it('should return false for non-trackable tools', () => {
      expect(isTrackableTool('playMusic')).toBe(false);
      expect(isTrackableTool('getWeather')).toBe(false);
      expect(isTrackableTool('searchWeb')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isTrackableTool('CALLANDCONVERSE')).toBe(true);
      expect(isTrackableTool('SendText')).toBe(true);
    });
  });

  describe('getActionTypeForTool', () => {
    it('should return correct action type for tools', () => {
      expect(getActionTypeForTool('callAndConverse')).toBe('call');
      expect(getActionTypeForTool('sendText')).toBe('text');
      expect(getActionTypeForTool('sendEmail')).toBe('email');
      expect(getActionTypeForTool('scheduleEvent')).toBe('calendar');
      expect(getActionTypeForTool('setReminder')).toBe('reminder');
    });

    it('should return undefined for unknown tools', () => {
      expect(getActionTypeForTool('playMusic')).toBeUndefined();
      expect(getActionTypeForTool('unknown')).toBeUndefined();
    });
  });

  describe('TRACKABLE_TOOLS constant', () => {
    it('should include all expected tools', () => {
      const expectedTools = [
        'callandconverse',
        'callonbehalf',
        'makephonecall',
        'sendtext',
        'sendsms',
        'sendmessage',
        'sendemail',
        'scheduleevent',
        'createcalendarevent',
        'addtask',
        'setreminder',
        'createreminder',
      ];

      for (const tool of expectedTools) {
        expect(TRACKABLE_TOOLS.has(tool)).toBe(true);
      }
    });
  });
});
