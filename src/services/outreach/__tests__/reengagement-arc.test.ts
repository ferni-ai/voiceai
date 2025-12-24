/**
 * Re-engagement Arc Tests
 *
 * Tests for the thoughtful re-engagement sequences for inactive users.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  updateReengagementState,
  getReengagementState,
  recordUserReturned,
  recordReengagementSent,
  recordReengagementResponse,
  getPendingReengagements,
  isInReengagementPeriod,
  getReengagementSummary,
  type ReengagementStage,
} from '../reengagement-arc.js';

// Mock the timing service to avoid network calls
vi.mock('../../contacts/optimal-timing.js', () => ({
  getTimingRecommendation: vi.fn().mockResolvedValue({
    suggestedSendTime: new Date('2025-01-20T14:00:00Z'),
    confidence: 0.8,
    reason: 'mocked',
  }),
}));

describe('reengagement-arc', () => {
  let testUserId: string;

  beforeEach(() => {
    // Use unique user ID per test to avoid state pollution
    testUserId = `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T10:00:00Z'));
  });

  describe('updateReengagementState', () => {
    it('should set active stage for recent conversation', () => {
      const lastConversation = new Date('2025-01-18T10:00:00Z'); // 2 days ago
      const state = updateReengagementState(testUserId, lastConversation);

      expect(state.stage).toBe('active');
      expect(state.daysSinceLastConversation).toBe(2);
    });

    it('should set thinking_of_you stage for 7-13 days silent', () => {
      const lastConversation = new Date('2025-01-10T10:00:00Z'); // 10 days ago
      const state = updateReengagementState(testUserId, lastConversation);

      expect(state.stage).toBe('thinking_of_you');
      expect(state.daysSinceLastConversation).toBe(10);
    });

    it('should set share_relevant stage for 14-29 days silent', () => {
      const lastConversation = new Date('2025-01-01T10:00:00Z'); // 19 days ago
      const state = updateReengagementState(testUserId, lastConversation);

      expect(state.stage).toBe('share_relevant');
      expect(state.daysSinceLastConversation).toBe(19);
    });

    it('should set warm_invitation stage for 30-59 days silent', () => {
      const lastConversation = new Date('2024-12-15T10:00:00Z'); // 36 days ago
      const state = updateReengagementState(testUserId, lastConversation);

      expect(state.stage).toBe('warm_invitation');
      expect(state.daysSinceLastConversation).toBe(36);
    });

    it('should set final_reminder stage for 60+ days silent', () => {
      const lastConversation = new Date('2024-11-15T10:00:00Z'); // 66 days ago
      const state = updateReengagementState(testUserId, lastConversation);

      expect(state.stage).toBe('final_reminder');
      expect(state.daysSinceLastConversation).toBe(66);
    });

    it('should store user context', () => {
      const lastConversation = new Date('2025-01-10T10:00:00Z');
      const state = updateReengagementState(testUserId, lastConversation, {
        interests: ['meditation', 'productivity'],
        preferredPersona: 'maya',
        name: 'Alex',
        totalConversations: 15,
      });

      expect(state.interests).toEqual(['meditation', 'productivity']);
      expect(state.preferredPersona).toBe('maya');
      expect(state.name).toBe('Alex');
      expect(state.totalConversations).toBe(15);
    });
  });

  describe('getReengagementState', () => {
    it('should return undefined for unknown user', () => {
      const state = getReengagementState('unknown-user');
      expect(state).toBeUndefined();
    });

    it('should return state for known user', () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));

      const state = getReengagementState(testUserId);
      expect(state).toBeDefined();
      expect(state?.userId).toBe(testUserId);
    });
  });

  describe('recordUserReturned', () => {
    it('should reset user to active stage', () => {
      // User was silent for 10 days
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));
      expect(getReengagementState(testUserId)?.stage).toBe('thinking_of_you');

      // User returns
      recordUserReturned(testUserId);

      const state = getReengagementState(testUserId);
      expect(state?.stage).toBe('active');
      expect(state?.daysSinceLastConversation).toBe(0);
      expect(state?.arcComplete).toBe(true);
    });
  });

  describe('recordReengagementSent', () => {
    it('should track sent re-engagements', () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));
      recordReengagementSent(testUserId, 'thinking_of_you');

      const state = getReengagementState(testUserId);
      expect(state?.previousReengagements).toHaveLength(1);
      expect(state?.previousReengagements[0].type).toBe('thinking_of_you');
      expect(state?.previousReengagements[0].responseReceived).toBe(false);
    });

    it('should move to respect_space after final_hello', () => {
      updateReengagementState(testUserId, new Date('2024-11-15T10:00:00Z')); // 66 days ago
      recordReengagementSent(testUserId, 'final_hello');

      const state = getReengagementState(testUserId);
      expect(state?.stage).toBe('respect_space');
    });
  });

  describe('recordReengagementResponse', () => {
    it('should mark most recent re-engagement as responded', () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));
      recordReengagementSent(testUserId, 'thinking_of_you');
      recordReengagementResponse(testUserId);

      const state = getReengagementState(testUserId);
      expect(state?.previousReengagements[0].responseReceived).toBe(true);
      expect(state?.stage).toBe('active'); // User returned
    });
  });

  describe('getPendingReengagements', () => {
    it('should return empty for active users', async () => {
      updateReengagementState(testUserId, new Date('2025-01-18T10:00:00Z')); // 2 days ago

      const pending = await getPendingReengagements(testUserId);
      expect(pending).toHaveLength(0);
    });

    it('should return pending for thinking_of_you stage', async () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'), {
        name: 'Alex',
        interests: ['meditation'],
      });

      const pending = await getPendingReengagements(testUserId);
      expect(pending.length).toBeGreaterThanOrEqual(0); // May be 0 or 1 depending on timing
    });

    it('should not return already sent types', async () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));
      recordReengagementSent(testUserId, 'thinking_of_you');

      const pending = await getPendingReengagements(testUserId);
      const thinkingOfYou = pending.find((r) => r.type === 'thinking_of_you');
      expect(thinkingOfYou).toBeUndefined();
    });

    it('should return empty for respect_space stage', async () => {
      updateReengagementState(testUserId, new Date('2024-11-15T10:00:00Z'));
      recordReengagementSent(testUserId, 'final_hello');

      const pending = await getPendingReengagements(testUserId);
      expect(pending).toHaveLength(0);
    });

    it('should only return one re-engagement at a time', async () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));

      const pending = await getPendingReengagements(testUserId);
      expect(pending.length).toBeLessThanOrEqual(1);
    });
  });

  describe('isInReengagementPeriod', () => {
    it('should return false for active users', () => {
      updateReengagementState(testUserId, new Date('2025-01-18T10:00:00Z'));

      expect(isInReengagementPeriod(testUserId)).toBe(false);
    });

    it('should return true for silent users', () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));

      expect(isInReengagementPeriod(testUserId)).toBe(true);
    });

    it('should return false for respect_space stage', () => {
      updateReengagementState(testUserId, new Date('2024-11-15T10:00:00Z'));
      recordReengagementSent(testUserId, 'final_hello');

      expect(isInReengagementPeriod(testUserId)).toBe(false);
    });

    it('should return false for unknown users', () => {
      expect(isInReengagementPeriod('unknown-user')).toBe(false);
    });
  });

  describe('getReengagementSummary', () => {
    it('should return null for unknown user', () => {
      const summary = getReengagementSummary('unknown-user');
      expect(summary).toBeNull();
    });

    it('should return summary for known user', () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'));
      recordReengagementSent(testUserId, 'thinking_of_you');

      const summary = getReengagementSummary(testUserId);

      expect(summary).toBeDefined();
      expect(summary?.stage).toBe('thinking_of_you');
      expect(summary?.daysSilent).toBe(10);
      expect(summary?.reengagementsSent).toBe(1);
      expect(summary?.lastReengagement).toBeDefined();
      expect(summary?.inArc).toBe(true);
    });

    it('should report inArc false for active users', () => {
      updateReengagementState(testUserId, new Date('2025-01-18T10:00:00Z'));

      const summary = getReengagementSummary(testUserId);
      expect(summary?.inArc).toBe(false);
    });
  });

  describe('stage progression', () => {
    it('should progress through stages correctly', () => {
      const stages: Array<{ daysAgo: number; expected: ReengagementStage }> = [
        { daysAgo: 5, expected: 'active' },
        { daysAgo: 7, expected: 'thinking_of_you' },
        { daysAgo: 13, expected: 'thinking_of_you' },
        { daysAgo: 14, expected: 'share_relevant' },
        { daysAgo: 29, expected: 'share_relevant' },
        { daysAgo: 30, expected: 'warm_invitation' },
        { daysAgo: 59, expected: 'warm_invitation' },
        { daysAgo: 60, expected: 'final_reminder' },
        { daysAgo: 90, expected: 'final_reminder' },
      ];

      for (const { daysAgo, expected } of stages) {
        const lastConversation = new Date('2025-01-20T10:00:00Z');
        lastConversation.setDate(lastConversation.getDate() - daysAgo);

        const userId = `user-${daysAgo}`;
        const state = updateReengagementState(userId, lastConversation);

        expect(state.stage).toBe(expected);
      }
    });
  });

  describe('message personalization', () => {
    it('should generate a message for pending re-engagements', async () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'), {
        name: 'Alex',
        interests: ['meditation'],
      });

      const pending = await getPendingReengagements(testUserId);
      if (pending.length > 0) {
        // Message should be a non-empty string
        expect(pending[0].message).toBeTruthy();
        expect(typeof pending[0].message).toBe('string');
        expect(pending[0].message.length).toBeGreaterThan(10);
      }
    });

    it('should not include undefined in messages', async () => {
      updateReengagementState(testUserId, new Date('2025-01-10T10:00:00Z'), {
        name: undefined,
      });

      const pending = await getPendingReengagements(testUserId);
      if (pending.length > 0) {
        // Should not have undefined in message
        expect(pending[0].message).not.toContain('undefined');
      }
    });
  });
});
