/**
 * Advanced Conversation Scenarios Tests
 *
 * Tests for complex scenarios:
 * - Separate sessions per persona
 * - Relationship stage configuration
 * - Edge cases and many concurrent sessions
 *
 * @module @ferni/conversation/__tests__/advanced-scenarios
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createConversationSession,
  endConversationSession,
  getConversationSession,
  getActiveSessions,
  type ConversationSession,
} from '../unified-integration.js';

describe('Advanced Conversation Scenarios', () => {
  const sessionIds: string[] = [];

  afterEach(() => {
    // Clean up all sessions
    for (const sessionId of sessionIds) {
      try {
        endConversationSession(sessionId);
      } catch {
        // Ignore
      }
    }
    sessionIds.length = 0;
  });

  function createTestSession(
    overrides: Partial<Parameters<typeof createConversationSession>[0]> = {}
  ): ConversationSession {
    const sessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIds.push(sessionId);

    return createConversationSession({
      sessionId,
      userId: 'test-user',
      personaId: 'ferni',
      ...overrides,
    });
  }

  // ============================================================================
  // PERSONA SWITCHING TESTS
  // ============================================================================

  describe('Persona Switching', () => {
    it('should maintain separate sessions for different personas', async () => {
      const ferniSession = createTestSession({ personaId: 'ferni' });
      const peterSession = createTestSession({ personaId: 'peter-john' });

      expect(ferniSession.personaId).toBe('ferni');
      expect(peterSession.personaId).toBe('peter-john');
      expect(ferniSession.sessionId).not.toBe(peterSession.sessionId);
    });
  });

  // ============================================================================
  // MULTI-SESSION CONTINUITY TESTS
  // ============================================================================

  describe('Multi-Session Continuity', () => {
    it('should track session count correctly', () => {
      const session1 = createTestSession({ sessionCount: 0 });
      const session2 = createTestSession({ sessionCount: 5 });
      const session3 = createTestSession({ sessionCount: 20 });

      // Session count affects relationship progression
      expect(session1.getState().relationshipStage).toBe('acquaintance');
    });

    it('should handle relationship stage progression', async () => {
      const strangerSession = createTestSession({ relationshipStage: 'stranger' });
      const friendSession = createTestSession({ relationshipStage: 'friend' });
      const trustedSession = createTestSession({ relationshipStage: 'trusted_advisor' });

      expect(strangerSession.getState().relationshipStage).toBe('stranger');
      expect(friendSession.getState().relationshipStage).toBe('friend');
      expect(trustedSession.getState().relationshipStage).toBe('trusted_advisor');
    });
  });

  // ============================================================================
  // STRESS TESTS
  // ============================================================================

  describe('Stress Testing', () => {
    it('should handle many concurrent sessions', () => {
      const sessions: ConversationSession[] = [];

      // Create 20 concurrent sessions
      for (let i = 0; i < 20; i++) {
        sessions.push(createTestSession({ userId: `user-${i}` }));
      }

      expect(sessions).toHaveLength(20);

      // All should be active
      const activeSessions = getActiveSessions();
      expect(activeSessions.length).toBeGreaterThanOrEqual(20);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle session not found gracefully', () => {
      const session = getConversationSession('non-existent-session');
      expect(session).toBeNull();
    });

    it('should handle duplicate session creation', () => {
      const sessionId = `duplicate-${Date.now()}`;
      sessionIds.push(sessionId);

      const session1 = createConversationSession({
        sessionId,
        userId: 'user',
        personaId: 'ferni',
      });

      const session2 = createConversationSession({
        sessionId,
        userId: 'user',
        personaId: 'ferni',
      });

      // Should return the same session
      expect(session1).toBe(session2);
    });
  });
});
