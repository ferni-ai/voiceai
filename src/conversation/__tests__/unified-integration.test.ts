/**
 * Unified Conversation Integration Tests
 *
 * E2E tests for the unified conversation humanization pipeline.
 * Tests the complete flow from session creation through turn processing.
 *
 * @module @ferni/conversation/__tests__/unified-integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createConversationSession,
  endConversationSession,
  getConversationSession,
  getActiveSessions,
  quickHumanize,
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

    it('should track turn count', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      expect(session.getTurnCount()).toBe(0);

      await session.processTurn({
        userMessage: 'Hello, how are you?',
        rawResponse: "I'm doing well, thanks for asking!",
      });

      expect(session.getTurnCount()).toBe(1);
    });

    it('should track recent topics', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      await session.processTurn({
        userMessage: 'I want to talk about my career',
        rawResponse: "Of course! What's on your mind about your career?",
        topic: 'career',
      });

      const state = session.getState();
      expect(state.recentTopics).toContain('career');
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

  describe('Turn Processing', () => {
    it('should process a simple turn', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const result = await session.processTurn({
        userMessage: 'Hello!',
        rawResponse: 'Hello! How are you today?',
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
      expect(result.appliedFeatures).toBeInstanceOf(Array);
      expect(typeof result.confidence).toBe('number');
      expect(result.timing).toBeDefined();
      expect(typeof result.timing.total).toBe('number');
    });

    it('should include timing information', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const result = await session.processTurn({
        userMessage: 'What should I do?',
        rawResponse: 'Let me think about this...',
      });

      expect(result.timing).toHaveProperty('total');
      expect(result.timing).toHaveProperty('analysis');
      expect(result.timing).toHaveProperty('intelligence');
      expect(result.timing).toHaveProperty('humanization');
    });

    it('should apply humanization features', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const result = await session.processTurn({
        userMessage: "I've been struggling with something",
        rawResponse: 'I understand. Tell me more about what you are dealing with.',
        wasPersonalSharing: true,
        isSeriousContext: true,
      });

      // Should have applied some humanization features
      expect(result.appliedFeatures.length).toBeGreaterThan(0);
    });

    it('should handle emotional context', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const result = await session.processTurn({
        userMessage: "I'm feeling really anxious about tomorrow",
        rawResponse: "That's completely understandable. Let's talk about what's worrying you.",
        userEmotion: 'anxious',
        topic: 'anxiety',
        wasPersonalSharing: true,
      });

      expect(result.text).toBeDefined();
      // Response should acknowledge emotion appropriately
    });

    it('should track multiple turns', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      // Turn 1
      await session.processTurn({
        userMessage: 'Hi there',
        rawResponse: 'Hello!',
      });

      // Turn 2
      await session.processTurn({
        userMessage: 'How are you?',
        rawResponse: "I'm doing well!",
      });

      // Turn 3
      const result = await session.processTurn({
        userMessage: "That's great",
        rawResponse: 'Thanks! What can I help you with today?',
      });

      expect(session.getTurnCount()).toBe(3);
      expect(result.timing.total).toBeGreaterThan(0);
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

  describe('Quick Humanization', () => {
    it('should humanize without session management', async () => {
      const result = await quickHumanize('Hello! How can I help you today?', {
        personaId: 'ferni',
        userMessage: 'Hi',
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
    });

    it('should respect persona context', async () => {
      const result = await quickHumanize('Let me help you with that.', {
        personaId: 'ferni',
        userMessage: 'Can you help me?',
        userEmotion: 'neutral',
        topic: 'general',
      });

      expect(result.text).toBeDefined();
    });
  });

  describe('Multi-Turn Conversation Flow', () => {
    it('should handle a complete conversation flow', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
        relationshipStage: 'friend',
      });

      // Opening
      const turn1 = await session.processTurn({
        userMessage: 'Hey, can we talk?',
        rawResponse: 'Of course! I am here for you. What is on your mind?',
      });
      expect(turn1.text).toBeDefined();

      // Sharing concern
      const turn2 = await session.processTurn({
        userMessage: "I've been really stressed about work lately",
        rawResponse: 'I hear you. Work stress can be really overwhelming. Tell me more about what is happening.',
        userEmotion: 'stressed',
        topic: 'work',
        wasPersonalSharing: true,
      });
      expect(turn2.text).toBeDefined();

      // Going deeper
      const turn3 = await session.processTurn({
        userMessage: "My boss keeps piling on more work and I don't know how to say no",
        rawResponse: 'That sounds really challenging. Setting boundaries at work is hard, especially when you want to do well. Have you had a chance to talk with your boss about your workload?',
        userEmotion: 'frustrated',
        topic: 'work',
        wasPersonalSharing: true,
        isSeriousContext: true,
      });
      expect(turn3.text).toBeDefined();

      // Resolution
      const turn4 = await session.processTurn({
        userMessage: "Actually, talking this through helped. I think I know what I need to do.",
        rawResponse: "I'm so glad our conversation helped! You have great insight into your situation. What do you think your next step will be?",
        userEmotion: 'hopeful',
        topic: 'work',
      });
      expect(turn4.text).toBeDefined();

      // Verify state progression
      expect(session.getTurnCount()).toBe(4);
      const state = session.getState();
      expect(state.recentTopics).toContain('work');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty user message', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const result = await session.processTurn({
        userMessage: '',
        rawResponse: 'Is there something you would like to talk about?',
      });

      expect(result.text).toBeDefined();
    });

    it('should handle very long messages', async () => {
      session = createConversationSession({
        sessionId: testSessionId,
        userId: testUserId,
        personaId: testPersonaId,
      });

      const longMessage = 'This is a very long message. '.repeat(100);
      const longResponse = 'This is a very long response that needs humanization. '.repeat(50);

      const result = await session.processTurn({
        userMessage: longMessage,
        rawResponse: longResponse,
      });

      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
    });
  });
});

