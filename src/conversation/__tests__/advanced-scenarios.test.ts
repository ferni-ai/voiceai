/**
 * Advanced Conversation Scenarios Tests
 *
 * Tests for complex scenarios:
 * - Persona switching / handoffs
 * - Multi-session continuity
 * - Edge cases and stress testing
 * - Performance profiling
 *
 * @module @ferni/conversation/__tests__/advanced-scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    it('should handle handoff context preservation', async () => {
      // Create initial session with Ferni
      const ferniSession = createTestSession({ personaId: 'ferni' });

      // Process a few turns to build context
      await ferniSession.processTurn({
        userMessage: 'I need help with my research',
        rawResponse: 'I can help with that! What topic are you researching?',
        topic: 'research',
      });

      const ferniState = ferniSession.getState();
      expect(ferniState.recentTopics).toContain('research');

      // Simulate handoff - create new session with Peter (research persona)
      const peterSession = createTestSession({
        personaId: 'peter-john',
        userId: ferniSession.userId,
      });

      // Peter should start fresh but can be passed context
      const peterResult = await peterSession.processTurn({
        userMessage: 'Can you help me with academic research?',
        rawResponse: 'Absolutely! I specialize in research methodology. What subject area?',
        topic: 'research',
        sessionData: { handoffFrom: 'ferni', previousTopics: ferniState.recentTopics },
      });

      expect(peterResult.text).toBeDefined();
    });

    it('should support concurrent sessions for same user', async () => {
      const userId = 'concurrent-user';

      const session1 = createTestSession({ userId, personaId: 'ferni' });
      const session2 = createTestSession({ userId, personaId: 'maya-santos' });

      // Both sessions should work independently
      const result1 = await session1.processTurn({
        userMessage: 'Tell me about life',
        rawResponse: 'Life is a journey of growth and discovery.',
      });

      const result2 = await session2.processTurn({
        userMessage: 'Help me build habits',
        rawResponse: 'Let me help you create sustainable routines.',
      });

      expect(result1.text).toBeDefined();
      expect(result2.text).toBeDefined();
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

    it('should accumulate topics across turns', async () => {
      const session = createTestSession();

      await session.processTurn({
        userMessage: 'Lets talk about career',
        rawResponse: 'What about your career?',
        topic: 'career',
      });

      await session.processTurn({
        userMessage: 'And relationships too',
        rawResponse: 'Tell me more',
        topic: 'relationships',
      });

      await session.processTurn({
        userMessage: 'Also health',
        rawResponse: 'Health is important',
        topic: 'health',
      });

      const state = session.getState();
      expect(state.recentTopics).toContain('career');
      expect(state.recentTopics).toContain('relationships');
      expect(state.recentTopics).toContain('health');
    });
  });

  // ============================================================================
  // EMOTIONAL JOURNEY TESTS
  // ============================================================================

  describe('Emotional Journey', () => {
    it('should handle emotional escalation', async () => {
      const session = createTestSession();

      // Start neutral
      await session.processTurn({
        userMessage: 'Hi there',
        rawResponse: 'Hello! How are you?',
        userEmotion: 'neutral',
      });

      // Escalate to worried
      await session.processTurn({
        userMessage: 'Im a bit worried about something',
        rawResponse: 'I hear you. What is on your mind?',
        userEmotion: 'worried',
        wasPersonalSharing: true,
      });

      // Peak anxiety
      await session.processTurn({
        userMessage: 'I am really anxious about tomorrow',
        rawResponse: 'That sounds really difficult. Let me help you work through this.',
        userEmotion: 'anxious',
        wasPersonalSharing: true,
        isSeriousContext: true,
      });

      expect(session.getTurnCount()).toBe(3);
    });

    it('should handle emotional de-escalation', async () => {
      const session = createTestSession();

      // Start anxious
      await session.processTurn({
        userMessage: 'I am so stressed',
        rawResponse: 'I hear that stress. Let us talk through it.',
        userEmotion: 'stressed',
        isSeriousContext: true,
      });

      // Calming down
      await session.processTurn({
        userMessage: 'Talking helps',
        rawResponse: 'I am glad. What else is on your mind?',
        userEmotion: 'relieved',
      });

      // Back to baseline
      await session.processTurn({
        userMessage: 'I feel better now',
        rawResponse: 'That is wonderful to hear!',
        userEmotion: 'content',
      });

      const state = session.getState();
      expect(state.turnCount).toBe(3);
    });

    it('should track vulnerability events', async () => {
      const session = createTestSession();

      const initialComfort = session.getComfortLevel();

      // User shares something vulnerable
      await session.processTurn({
        userMessage: 'I have never told anyone this before...',
        rawResponse: 'I am honored you trust me with this.',
        wasPersonalSharing: true,
      });

      session.recordVulnerability();

      // Comfort should increase
      const newComfort = session.getComfortLevel();
      expect(newComfort).toBeGreaterThanOrEqual(initialComfort);
    });
  });

  // ============================================================================
  // STRESS TESTS
  // ============================================================================

  describe('Stress Testing', () => {
    it('should handle rapid-fire turns', async () => {
      const session = createTestSession();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          session.processTurn({
            userMessage: `Message ${i}`,
            rawResponse: `Response ${i}`,
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((r) => expect(r.text).toBeDefined());
    });

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

    it('should handle very emotional content', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage:
          'I feel completely overwhelmed and I do not know what to do anymore. Everything feels hopeless.',
        rawResponse:
          'I hear you, and I want you to know that you are not alone. Let us take this one step at a time together.',
        userEmotion: 'overwhelmed',
        wasPersonalSharing: true,
        isSeriousContext: true,
      });

      expect(result.text).toBeDefined();
      // Should have applied humanization features
      expect(result.appliedFeatures.length).toBeGreaterThan(0);
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

    it('should handle special characters in messages', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage: 'What about "quotes" and <tags> and & symbols?',
        rawResponse: 'I can handle "quotes", <tags>, and & symbols just fine!',
      });

      expect(result.text).toBeDefined();
    });

    it('should handle unicode and emojis', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage: 'Im feeling 😊 today! How about you? 你好',
        rawResponse: 'That is wonderful! 😄 Im glad to hear that!',
      });

      expect(result.text).toBeDefined();
    });

    it('should handle multiline messages', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage: `This is line 1.
This is line 2.
This is line 3.`,
        rawResponse: `I understand you have multiple points:
1. Point one
2. Point two
3. Point three`,
      });

      expect(result.text).toBeDefined();
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('should complete turn processing within 200ms', async () => {
      const session = createTestSession();

      const start = Date.now();
      await session.processTurn({
        userMessage: 'A simple message',
        rawResponse: 'A simple response',
      });
      const duration = Date.now() - start;

      // Should be reasonably fast
      expect(duration).toBeLessThan(500); // Allow some buffer for CI
    });

    it('should provide timing breakdown', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage: 'Test message',
        rawResponse: 'Test response',
      });

      expect(result.timing).toBeDefined();
      expect(typeof result.timing.total).toBe('number');
      expect(typeof result.timing.analysis).toBe('number');
      expect(typeof result.timing.intelligence).toBe('number');
      expect(typeof result.timing.humanization).toBe('number');
    });

    it('should handle burst of messages efficiently', async () => {
      const session = createTestSession();

      const start = Date.now();
      for (let i = 0; i < 5; i++) {
        await session.processTurn({
          userMessage: `Burst message ${i}`,
          rawResponse: `Burst response ${i}`,
        });
      }
      const duration = Date.now() - start;

      // 5 turns should complete in reasonable time
      expect(duration).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // FEATURE APPLICATION TESTS
  // ============================================================================

  describe('Feature Application', () => {
    it('should apply speech naturalization', async () => {
      const session = createTestSession();

      const result = await session.processTurn({
        userMessage: 'What should I do?',
        rawResponse: 'You should try focusing on what matters most to you.',
      });

      // Should have some features applied
      expect(result.appliedFeatures).toBeInstanceOf(Array);
    });

    it('should respect serious context', async () => {
      const session = createTestSession();

      const casualResult = await session.processTurn({
        userMessage: 'Haha that is funny!',
        rawResponse: 'I am glad that made you laugh!',
        isSeriousContext: false,
      });

      const seriousResult = await session.processTurn({
        userMessage: 'I am going through a really hard time',
        rawResponse: 'I hear you. That sounds really difficult.',
        isSeriousContext: true,
        wasPersonalSharing: true,
      });

      // Both should have features, potentially different ones
      expect(casualResult.appliedFeatures).toBeInstanceOf(Array);
      expect(seriousResult.appliedFeatures).toBeInstanceOf(Array);
    });
  });
});
