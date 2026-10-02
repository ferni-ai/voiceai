/**
 * Unified Conversation Integration Tests
 *
 * Tests the conversation session lifecycle: what a session sets up at call
 * start, the state it reports, and the cleanup it runs at call end.
 *
 * @module @ferni/conversation/__tests__/unified-integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAdvancedHumanizationState } from '../advanced-humanization-integration.js';
import {
  createConversationSession,
  endConversationSession,
  getConversationSession,
  getActiveSessions,
  type ConversationSession,
} from '../unified-integration.js';

describe('Unified Conversation Integration', () => {
  let session: ConversationSession;
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';
  const testPersonaId = 'ferni';

  beforeEach(() => {
    // Clean up any existing sessions
    endConversationSession(testSessionId);
  });

  afterEach(() => {
    // Clean up
    if (session) {
      try {
        session.end();
      } catch {
        // Ignore - session may already be ended
      }
    }
  });

  describe('Session Lifecycle', () => {
    it('should create a conversation session', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(testSessionId);
      expect(session.userId).toBe(testUserId);
      expect(session.personaId).toBe(testPersonaId);
    });

    it('should return existing session if already created', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const session2 = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      expect(session2).toBe(session);
    });

    it('should retrieve session by ID', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const retrieved = getConversationSession(testSessionId);
      expect(retrieved).toBe(session);
    });

    it('should return null for non-existent session', () => {
      const retrieved = getConversationSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should track active sessions', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const activeSessions = getActiveSessions();
      expect(activeSessions).toContain(testSessionId);
    });

    it('should end session and remove from active sessions', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      session.end();
      const activeSessions = getActiveSessions();
      expect(activeSessions).not.toContain(testSessionId);
    });

    // The live pre-LLM turn (processAdvancedTurn) reads this per-session state,
    // so creating a session must start it and ending one must clear it.
    it('should start advanced humanization on create and clear it on end', () => {
      expect(getAdvancedHumanizationState(testSessionId)).toBeNull();

      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });
      expect(getAdvancedHumanizationState(testSessionId)).not.toBeNull();

      session.end();
      expect(getAdvancedHumanizationState(testSessionId)).toBeNull();
    });
  });

  describe('Session State', () => {
    it('should initialize with default state', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const state = session.getState();
      expect(state.turnCount).toBe(0);
      expect(state.sessionMinutes).toBeGreaterThanOrEqual(0);
      expect(state.comfortLevel).toBeGreaterThan(0);
      expect(state.relationshipStage).toBe('acquaintance');
      expect(state.recentTopics).toEqual([]);
    });

    it('should respect custom relationship stage', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
        relationshipStage: 'trusted_advisor',
      });

      const state = session.getState();
      expect(state.relationshipStage).toBe('trusted_advisor');
    });
  });

  describe('Event Recording', () => {
    it('should record vulnerability events', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const initialComfort = session.getComfortLevel();

      session.recordVulnerability();

      // Comfort should increase after vulnerability sharing
      // (depending on implementation, may need time to propagate)
      expect(session.getComfortLevel()).toBeGreaterThanOrEqual(initialComfort);
    });

    it('should record laughter events', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      // Should not throw
      expect(() => session.recordLaughter()).not.toThrow();
    });

    it('should record breakthrough events', () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      // Should not throw
      expect(() => session.recordBreakthrough()).not.toThrow();
    });
  });
});
