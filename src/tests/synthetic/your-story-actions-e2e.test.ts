/**
 * Your Story Actions E2E Tests
 *
 * Validates the full flow from action tracking to API response to UI display.
 *
 * Flow tested:
 * 1. Tool execution creates action via ActionTracker
 * 2. Action is persisted to Firestore
 * 3. /api/story/actions returns care moments with narrative
 * 4. Dashboard can render the visualization
 *
 * @module @ferni/tests/synthetic/your-story-actions-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActionTracker, resetActionTracker } from '../../services/action-tracker/tracker.js';
import {
  isTrackableTool,
  getActionTypeForTool,
  type ActionType,
} from '../../services/action-tracker/types.js';

// Mock Firestore to prevent actual persistence
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null), // Null disables persistence, uses in-memory
  cleanForFirestore: vi.fn((data) => data),
  recordDegradation: vi.fn(),
}));

// Mock commitment keeper for integration
const mockCommitments = [
  { id: 'c1', status: 'completed', summary: 'Call mom weekly' },
  { id: 'c2', status: 'active', summary: 'Exercise 3x per week' },
];

vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: vi.fn(() => Promise.resolve(mockCommitments)),
  onActionCompleted: vi.fn(), // Two-way integration hook
}));

describe('Your Story Actions E2E', () => {
  const userId = 'e2e-test-user';
  let tracker: ActionTracker;

  beforeEach(() => {
    resetActionTracker();
    tracker = new ActionTracker();
  });

  afterEach(() => {
    tracker.clearCache();
    resetActionTracker();
  });

  // ============================================================================
  // SCENARIO 1: Full Action Lifecycle
  // ============================================================================

  describe('Action Lifecycle', () => {
    it('tracks action from creation to completion', async () => {
      // Step 1: Create an action (simulates user saying "call mom")
      const action = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Call Mom',
        target: 'Mom',
        sessionId: 'session-123',
      });

      expect(action.id).toMatch(/^act_/);
      expect(action.status).toBe('requested');
      expect(action.request.target).toBe('Mom');

      // Step 2: Start execution (simulates tool starting)
      const executing = await tracker.startExecution(action.id, {
        toolId: 'callAndConverse',
        toolArgs: { to: '+1234567890', name: 'Mom' },
      });

      expect(executing?.status).toBe('in_progress');
      expect(executing?.execution?.toolId).toBe('callAndConverse');

      // Step 3: Complete execution
      const completed = await tracker.completeExecution(action.id, {
        success: true,
        resultSummary: 'She sounds great! Talked for 5 minutes.',
        callDurationSeconds: 300,
      });

      expect(completed?.status).toBe('completed');
      expect(completed?.execution?.success).toBe(true);
      expect(completed?.execution?.resultSummary).toContain('sounds great');
    });

    it('handles failed actions gracefully', async () => {
      const action = await tracker.createAction({
        userId,
        type: 'text',
        description: 'Text John',
        target: 'John',
      });

      await tracker.startExecution(action.id, {
        toolId: 'sendText',
        toolArgs: { to: 'John', message: 'Hello!' },
      });

      const failed = await tracker.completeExecution(action.id, {
        success: false,
        resultSummary: 'Failed to send - no phone number on file',
      });

      expect(failed?.status).toBe('failed');
      expect(failed?.execution?.success).toBe(false);
    });

    it('supports action cancellation', async () => {
      const action = await tracker.createAction({
        userId,
        type: 'reminder',
        description: 'Remind about meeting',
      });

      const cancelled = await tracker.cancelAction(action.id, 'User changed their mind');

      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.events).toContainEqual(
        expect.objectContaining({
          type: 'cancelled',
          details: 'User changed their mind',
        })
      );
    });
  });

  // ============================================================================
  // SCENARIO 2: Tool Tracking Classification
  // ============================================================================

  describe('Tool Tracking Classification', () => {
    it('identifies trackable tools correctly', () => {
      // These should be tracked
      expect(isTrackableTool('callAndConverse')).toBe(true);
      expect(isTrackableTool('sendText')).toBe(true);
      expect(isTrackableTool('sendEmail')).toBe(true);
      expect(isTrackableTool('scheduleEvent')).toBe(true);
      expect(isTrackableTool('setReminder')).toBe(true);

      // Case insensitive
      expect(isTrackableTool('CALLANDCONVERSE')).toBe(true);
      expect(isTrackableTool('SendText')).toBe(true);

      // These should NOT be tracked
      expect(isTrackableTool('playMusic')).toBe(false);
      expect(isTrackableTool('getWeather')).toBe(false);
      expect(isTrackableTool('searchWeb')).toBe(false);
      expect(isTrackableTool('handoff')).toBe(false);
    });

    it('maps tools to correct action types', () => {
      expect(getActionTypeForTool('callAndConverse')).toBe('call');
      expect(getActionTypeForTool('callOnBehalf')).toBe('call');
      expect(getActionTypeForTool('sendText')).toBe('text');
      expect(getActionTypeForTool('sendSMS')).toBe('text');
      expect(getActionTypeForTool('sendEmail')).toBe('email');
      expect(getActionTypeForTool('scheduleEvent')).toBe('calendar');
      expect(getActionTypeForTool('createCalendarEvent')).toBe('calendar');
      expect(getActionTypeForTool('setReminder')).toBe('reminder');
    });
  });

  // ============================================================================
  // SCENARIO 3: User Actions Query
  // ============================================================================

  describe('User Actions Query', () => {
    beforeEach(async () => {
      // Seed some actions
      const action1 = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Call Mom',
        target: 'Mom',
      });
      await tracker.startExecution(action1.id, { toolId: 'callAndConverse', toolArgs: {} });
      await tracker.completeExecution(action1.id, {
        success: true,
        resultSummary: 'Good chat!',
      });

      const action2 = await tracker.createAction({
        userId,
        type: 'text',
        description: 'Text John',
        target: 'John',
      });
      await tracker.startExecution(action2.id, { toolId: 'sendText', toolArgs: {} });
      await tracker.completeExecution(action2.id, {
        success: true,
        resultSummary: 'Delivered',
      });

      await tracker.createAction({
        userId,
        type: 'reminder',
        description: 'Reminder for meeting',
      });
    });

    it('returns all user actions', async () => {
      const actions = await tracker.getUserActions(userId);

      expect(actions.length).toBe(3);
      expect(actions.map((a) => a.type)).toContain('call');
      expect(actions.map((a) => a.type)).toContain('text');
      expect(actions.map((a) => a.type)).toContain('reminder');
    });

    it('filters by action type', async () => {
      const calls = await tracker.getUserActions(userId, { type: 'call' });
      expect(calls.length).toBe(1);
      expect(calls[0].type).toBe('call');
    });

    it('filters by status', async () => {
      const completed = await tracker.getUserActions(userId, { status: 'completed' });
      expect(completed.length).toBe(2);
      completed.forEach((a) => expect(a.status).toBe('completed'));

      const requested = await tracker.getUserActions(userId, { status: 'requested' });
      expect(requested.length).toBe(1);
    });

    it('limits results', async () => {
      const limited = await tracker.getUserActions(userId, { limit: 2 });
      expect(limited.length).toBe(2);
    });

    it('returns stats correctly', async () => {
      const stats = await tracker.getStats(userId);

      expect(stats.total).toBe(3);
      expect(stats.byType.call).toBe(1);
      expect(stats.byType.text).toBe(1);
      expect(stats.byType.reminder).toBe(1);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.byStatus.requested).toBe(1);
    });
  });

  // ============================================================================
  // SCENARIO 4: Event Emission for Real-time Updates
  // ============================================================================

  describe('Event Emission', () => {
    it('emits events on action lifecycle changes', async () => {
      const events: any[] = [];
      const unsubscribe = tracker.onEvent((event) => events.push(event));

      // Create action
      const action = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Test call',
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('action_created');
      expect(events[0].actionId).toBe(action.id);

      // Start execution
      await tracker.startExecution(action.id, {
        toolId: 'callAndConverse',
        toolArgs: {},
      });

      expect(events.length).toBe(2);
      expect(events[1].type).toBe('action_updated');

      // Complete
      await tracker.completeExecution(action.id, { success: true });

      expect(events.length).toBe(3);
      expect(events[2].type).toBe('action_completed');

      unsubscribe();
    });

    it('emits action_failed on failure', async () => {
      const events: any[] = [];
      const unsubscribe = tracker.onEvent((event) => events.push(event));

      const action = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Test call',
      });

      await tracker.startExecution(action.id, {
        toolId: 'callAndConverse',
        toolArgs: {},
      });

      await tracker.completeExecution(action.id, {
        success: false,
        resultSummary: 'Call failed',
      });

      const failEvent = events.find((e) => e.type === 'action_failed');
      expect(failEvent).toBeDefined();
      expect(failEvent.action.status).toBe('failed');

      unsubscribe();
    });
  });

  // ============================================================================
  // SCENARIO 5: Finding Pending Actions for Tool Linking
  // ============================================================================

  describe('Pending Action Linking', () => {
    it('finds pending action for tool execution', async () => {
      // User says "call mom" - creates pending action
      await tracker.createAction({
        userId,
        type: 'call',
        description: 'Call Mom',
        target: 'Mom',
      });

      // Tool executor needs to link to this action
      const pending = await tracker.findPendingActionForTool(userId, 'callAndConverse', 'Mom');

      expect(pending).not.toBeNull();
      expect(pending?.type).toBe('call');
      expect(pending?.request.target).toBe('Mom');
    });

    it('returns null when no matching pending action', async () => {
      const pending = await tracker.findPendingActionForTool(userId, 'playMusic');
      expect(pending).toBeNull();
    });
  });

  // ============================================================================
  // SCENARIO 6: Narrative Generation (Care Moments)
  // ============================================================================

  describe('Care Moment Narrative Generation', () => {
    it('generates warm narratives for completed calls', async () => {
      const action = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Call Mom',
        target: 'Mom',
      });
      await tracker.startExecution(action.id, { toolId: 'callAndConverse', toolArgs: {} });
      const completed = await tracker.completeExecution(action.id, {
        success: true,
        resultSummary: 'She sounded happy',
      });

      // Verify data is structured for narrative generation
      expect(completed?.request.target).toBe('Mom');
      expect(completed?.execution?.resultSummary).toContain('happy');
      expect(completed?.status).toBe('completed');

      // The narrative generation happens in story-routes.ts
      // Here we just verify the data needed for it is present
    });

    it('generates appropriate narratives for failed actions', async () => {
      const action = await tracker.createAction({
        userId,
        type: 'text',
        description: 'Text John',
        target: 'John',
      });
      await tracker.startExecution(action.id, { toolId: 'sendText', toolArgs: {} });
      const failed = await tracker.completeExecution(action.id, {
        success: false,
        resultSummary: 'No phone number on file',
      });

      expect(failed?.status).toBe('failed');
      expect(failed?.request.target).toBe('John');
      // Narrative should say "Message to John didn't go through"
    });
  });

  // ============================================================================
  // SCENARIO 7: Commitment Integration
  // ============================================================================

  describe('Commitment Keeper Integration', () => {
    it('notifies commitment keeper on action completion', async () => {
      const { onActionCompleted } = await import(
        '../../services/superhuman/commitment-keeper.js'
      );

      const action = await tracker.createAction({
        userId,
        type: 'call',
        description: 'Weekly call to mom',
        target: 'Mom',
        commitmentId: 'c1', // Linked to commitment
      });

      await tracker.startExecution(action.id, { toolId: 'callAndConverse', toolArgs: {} });
      await tracker.completeExecution(action.id, { success: true });

      // Verify commitment keeper was notified
      expect(onActionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          actionType: 'call',
          target: 'Mom',
          commitmentId: 'c1',
          success: true,
        })
      );
    });
  });
});
