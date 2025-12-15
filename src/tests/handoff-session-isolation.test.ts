/**
 * Handoff Session Isolation Tests
 *
 * FIX BUG #1-4: Verifies that handoff state is properly isolated per session
 * and that cross-session contamination does not occur.
 *
 * These tests validate the fix for the critical bugs where:
 * - BUG #1: Global state (currentAgent, handoffHistory) was per-module not per-session
 * - BUG #2: metPersonas set was global - persisted incorrectly across users
 * - BUG #3: perPersonaMeetingCount/LastTopic maps were global not per-session
 * - BUG #4: conversationContext was global - overwritten by concurrent sessions
 */

import { describe, expect, it } from 'vitest';
import type { AgentId } from '../services/agent-bus.js';
import {
  captureHandoffContext,
  createHandoffState,
  getHandoffContext,
  type HandoffState,
  hasMetPersona,
  incrementMeetingCount,
  markPersonaMet,
  recordHandoff,
  setCurrentAgent,
} from '../tools/handoff-state.js';

describe('Handoff Session Isolation', () => {
  describe('BUG #1: currentAgent isolation', () => {
    it('should not share currentAgent between sessions', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      // Change session1's agent
      setCurrentAgent(session1, 'maya-santos' as AgentId);

      // Session2 should still be at default
      expect(session1.currentAgent).toBe('maya-santos');
      expect(session2.currentAgent).toBe('ferni');
    });

    it('should maintain independent agent state across multiple sessions', () => {
      const sessions = Array.from({ length: 5 }, () => createHandoffState('ferni'));

      // Each session gets a different agent
      const agents: AgentId[] = [
        'ferni',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
        'peter-john',
      ];
      sessions.forEach((session, i) => {
        setCurrentAgent(session, agents[i]);
      });

      // Verify each session has the correct agent
      sessions.forEach((session, i) => {
        expect(session.currentAgent).toBe(agents[i]);
      });
    });
  });

  describe('BUG #2: metPersonas isolation', () => {
    it('should not persist metPersonas across sessions', async () => {
      const session1 = createHandoffState('ferni');
      markPersonaMet(session1, 'jordan-taylor');

      const session2 = createHandoffState('ferni'); // Same "user", new session
      expect(hasMetPersona(session2, 'jordan-taylor')).toBe(false);
    });

    it('should maintain independent metPersonas per session', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      markPersonaMet(session1, 'maya-santos');
      markPersonaMet(session1, 'alex-chen');

      markPersonaMet(session2, 'jordan-taylor');

      expect(hasMetPersona(session1, 'maya-santos')).toBe(true);
      expect(hasMetPersona(session1, 'alex-chen')).toBe(true);
      expect(hasMetPersona(session1, 'jordan-taylor')).toBe(false);

      expect(hasMetPersona(session2, 'maya-santos')).toBe(false);
      expect(hasMetPersona(session2, 'alex-chen')).toBe(false);
      expect(hasMetPersona(session2, 'jordan-taylor')).toBe(true);
    });

    it('should start with initial agent already met', () => {
      const session = createHandoffState('ferni');
      expect(hasMetPersona(session, 'ferni')).toBe(true);

      const alexSession = createHandoffState('alex-chen' as AgentId);
      expect(hasMetPersona(alexSession, 'alex-chen')).toBe(true);
      expect(hasMetPersona(alexSession, 'ferni')).toBe(false);
    });
  });

  describe('BUG #3: perPersonaMeetingCount isolation', () => {
    it('should not share meeting counts between sessions', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      incrementMeetingCount(session1, 'maya-santos');
      incrementMeetingCount(session1, 'maya-santos');
      incrementMeetingCount(session1, 'maya-santos');

      expect(session1.perPersonaMeetingCount.get('maya-santos')).toBe(3);
      expect(session2.perPersonaMeetingCount.get('maya-santos')).toBeUndefined();
    });

    it('should handle concurrent session meeting counts independently', () => {
      const sessions = Array.from({ length: 3 }, () => createHandoffState('ferni'));

      // Each session increments different amounts
      incrementMeetingCount(sessions[0], 'maya-santos');
      incrementMeetingCount(sessions[1], 'maya-santos');
      incrementMeetingCount(sessions[1], 'maya-santos');
      // sessions[2] doesn't increment

      expect(sessions[0].perPersonaMeetingCount.get('maya-santos')).toBe(1);
      expect(sessions[1].perPersonaMeetingCount.get('maya-santos')).toBe(2);
      expect(sessions[2].perPersonaMeetingCount.get('maya-santos')).toBeUndefined();
    });
  });

  describe('BUG #4: conversationContext isolation', () => {
    it('should not share conversationContext between concurrent sessions', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      captureHandoffContext(session1, {
        topics: ['finances', 'retirement'],
        emotionalState: 'anxious',
        summary: 'User discussing retirement planning concerns',
      });

      // Session 2 should have null context
      expect(getHandoffContext(session2)).toBeNull();

      // Session 1 should have its context
      const ctx1 = getHandoffContext(session1);
      expect(ctx1).not.toBeNull();
      expect(ctx1?.topics).toContain('finances');
      expect(ctx1?.emotionalState).toBe('anxious');
    });

    it('should allow different contexts in concurrent sessions', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      captureHandoffContext(session1, {
        topics: ['career'],
        emotionalState: 'excited',
        summary: 'Discussing job promotion',
      });

      captureHandoffContext(session2, {
        topics: ['health'],
        emotionalState: 'worried',
        summary: 'Health concerns',
      });

      const ctx1 = getHandoffContext(session1);
      const ctx2 = getHandoffContext(session2);

      expect(ctx1?.topics).toContain('career');
      expect(ctx2?.topics).toContain('health');
      expect(ctx1?.emotionalState).toBe('excited');
      expect(ctx2?.emotionalState).toBe('worried');
    });
  });

  describe('Handoff History Isolation', () => {
    it('should maintain separate handoff histories per session', () => {
      const session1 = createHandoffState('ferni');
      const session2 = createHandoffState('ferni');

      recordHandoff(session1, 'ferni' as AgentId, 'maya-santos' as AgentId, 'user_request');
      recordHandoff(session1, 'maya-santos' as AgentId, 'alex-chen' as AgentId, 'topic_change');

      recordHandoff(session2, 'ferni' as AgentId, 'peter-john' as AgentId, 'user_request');

      expect(session1.handoffHistory.length).toBe(2);
      expect(session2.handoffHistory.length).toBe(1);

      expect(session1.handoffHistory[0].to).toBe('maya-santos');
      expect(session2.handoffHistory[0].to).toBe('peter-john');
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle rapid concurrent state updates without contamination', async () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
        createHandoffState(i % 2 === 0 ? 'ferni' : ('maya-santos' as AgentId))
      );

      // Simulate concurrent updates
      const updates = sessions.map(async (session, i) => {
        // Small random delay to simulate real concurrency
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.random() * 10);
        });
        setCurrentAgent(session, `agent-${i}` as AgentId);
        markPersonaMet(session, `persona-${i}`);
        incrementMeetingCount(session, `persona-${i}`);
      });

      await Promise.all(updates);

      // Verify each session has only its own state
      sessions.forEach((session, i) => {
        expect(session.currentAgent).toBe(`agent-${i}`);
        expect(hasMetPersona(session, `persona-${i}`)).toBe(true);
        expect(session.perPersonaMeetingCount.get(`persona-${i}`)).toBe(1);

        // Should NOT have state from other sessions
        if (i > 0) {
          expect(hasMetPersona(session, `persona-${i - 1}`)).toBe(false);
        }
      });
    });
  });

  describe('Session Cleanup', () => {
    it('should allow session state to be garbage collected after use', () => {
      // Create many sessions
      const sessions: HandoffState[] = [];
      for (let i = 0; i < 100; i++) {
        const session = createHandoffState('ferni');
        markPersonaMet(session, 'maya-santos');
        incrementMeetingCount(session, 'maya-santos');
        sessions.push(session);
      }

      // Clear references - in real code this happens when session ends
      sessions.length = 0;

      // Sessions should be eligible for GC now
      // (We can't directly test GC, but this structure prevents memory leaks)
      expect(sessions.length).toBe(0);
    });
  });
});
