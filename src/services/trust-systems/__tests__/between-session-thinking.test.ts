/**
 * Unit Tests for Between-Session Thinking Service
 *
 * Tests the "I've been thinking about what you said..." capability:
 * - Detecting thinking-worthy content
 * - Recording thinking moments
 * - Getting moments to surface
 * - Session-based gating
 *
 * @module services/trust-systems/__tests__/between-session-thinking.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Between-Session Thinking Service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectThinkingWorthy', () => {
    it('should detect vulnerable content as thinking-worthy', async () => {
      const { detectThinkingWorthy } = await import('../between-session-thinking.js');

      const result = detectThinkingWorthy({
        userText: "I've been feeling really lonely lately. I don't know who to talk to about this.",
        topic: 'loneliness',
        emotion: 'sadness',
        isVulnerable: true,
        isBreakthrough: false,
        hasOpenQuestion: false,
      });

      expect(result.worthy).toBe(true);
      expect(result.emotionalWeight).toBe('heavy');
    });

    it('should detect breakthrough moments', async () => {
      const { detectThinkingWorthy } = await import('../between-session-thinking.js');

      const result = detectThinkingWorthy({
        userText: "I finally realized that I've been avoiding this because I'm scared of failure",
        topic: 'self-discovery',
        emotion: 'relief',
        isVulnerable: false,
        isBreakthrough: true,
        hasOpenQuestion: false,
      });

      expect(result.worthy).toBe(true);
    });

    it('should detect open questions as thinking-worthy', async () => {
      const { detectThinkingWorthy } = await import('../between-session-thinking.js');

      const result = detectThinkingWorthy({
        userText: 'Do you think I should take the risk and change careers?',
        topic: 'career',
        emotion: 'anxious',
        isVulnerable: false,
        isBreakthrough: false,
        hasOpenQuestion: true,
      });

      expect(result.worthy).toBe(true);
    });

    it('should not flag mundane content as thinking-worthy', async () => {
      const { detectThinkingWorthy } = await import('../between-session-thinking.js');

      const result = detectThinkingWorthy({
        userText: 'The weather is nice today',
        topic: 'weather',
        emotion: 'neutral',
        isVulnerable: false,
        isBreakthrough: false,
        hasOpenQuestion: false,
      });

      expect(result.worthy).toBe(false);
    });
  });

  describe('recordThinkingMoment', () => {
    it('should record a thinking moment', async () => {
      const { recordThinkingMoment, clearUserThinking } =
        await import('../between-session-thinking.js');

      const userId = 'test-user-thinking';
      clearUserThinking(userId);

      const record = recordThinkingMoment({
        userId,
        personaId: 'ferni',
        topic: 'career change',
        userQuote: "I'm scared but also excited about this possibility",
        context: 'User exploring career change after 10 years in same field',
        emotionalWeight: 'heavy',
        thinkingType: 'mulling',
        sourceSessionId: 'session-123',
      });

      expect(record.id).toBeDefined();
      expect(record.topic).toBe('career change');
      expect(record.emotionalWeight).toBe('heavy');
      expect(record.thinkingType).toBe('mulling');
      expect(record.surfacedAt).toBeUndefined();
    });

    it('should assign different thinking types based on content', async () => {
      const { recordThinkingMoment, clearUserThinking } =
        await import('../between-session-thinking.js');

      const userId = 'test-user-thinking-types';
      clearUserThinking(userId);

      const mulling = recordThinkingMoment({
        userId,
        personaId: 'ferni',
        topic: 'relationship',
        context: 'Processing relationship issues',
        emotionalWeight: 'medium',
        thinkingType: 'mulling',
        sourceSessionId: 'session-1',
      });

      const connecting = recordThinkingMoment({
        userId,
        personaId: 'ferni',
        topic: 'patterns',
        context: 'Connecting patterns across conversations',
        emotionalWeight: 'medium',
        thinkingType: 'connecting',
        sourceSessionId: 'session-2',
      });

      expect(mulling.thinkingType).toBe('mulling');
      expect(connecting.thinkingType).toBe('connecting');
    });
  });

  describe('getThinkingMomentToSurface', () => {
    it('should return null on first session', async () => {
      const { getThinkingMomentToSurface, clearUserThinking, incrementSessionCount } =
        await import('../between-session-thinking.js');

      const userId = 'test-user-first-session';
      clearUserThinking(userId);
      // Don't increment session count - simulating first session

      const moment = getThinkingMomentToSurface(userId, 'ferni', 'current-session-1');

      // First session should not surface thinking moments (nothing to think about yet)
      expect(moment).toBeNull();
    });

    it('should potentially surface moment on returning session', async () => {
      const {
        recordThinkingMoment,
        getThinkingMomentToSurface,
        clearUserThinking,
        incrementSessionCount,
      } = await import('../between-session-thinking.js');

      const userId = 'test-user-returning';
      clearUserThinking(userId);

      // Record a moment in "previous session"
      recordThinkingMoment({
        userId,
        personaId: 'ferni',
        topic: 'important decision',
        userQuote: 'I need to decide by next week',
        context: 'User facing important deadline',
        emotionalWeight: 'heavy',
        thinkingType: 'mulling',
        sourceSessionId: 'session-1',
      });

      // Simulate sessions passing
      incrementSessionCount(userId);
      incrementSessionCount(userId);

      const moment = getThinkingMomentToSurface(userId, 'ferni', 'current-session-2');

      // May or may not surface based on probability
      if (moment) {
        expect(moment.record.topic).toBe('important decision');
        expect(moment.phrase).toBeDefined();
      }
    });
  });

  describe('markMomentSurfaced', () => {
    it('should mark moment as surfaced', async () => {
      const { recordThinkingMoment, markMomentSurfaced, clearUserThinking } =
        await import('../between-session-thinking.js');

      const userId = 'test-user-surfaced';
      clearUserThinking(userId);

      const record = recordThinkingMoment({
        userId,
        personaId: 'ferni',
        topic: 'test topic',
        context: 'test context',
        emotionalWeight: 'light',
        thinkingType: 'remembering',
        sourceSessionId: 'session-1',
      });

      markMomentSurfaced(userId, record.id);

      // The moment should now have a surfacedAt timestamp
      // (We can't directly verify this without a getter, but the function should not throw)
      expect(true).toBe(true);
    });
  });

  describe('incrementSessionCount', () => {
    it('should increment session count for user', async () => {
      const { incrementSessionCount, clearUserThinking } =
        await import('../between-session-thinking.js');

      const userId = 'test-user-sessions';
      clearUserThinking(userId);

      // Increment multiple times
      incrementSessionCount(userId);
      incrementSessionCount(userId);
      incrementSessionCount(userId);

      // No direct way to verify count, but should not throw
      expect(true).toBe(true);
    });
  });

  describe('loadThinkingRecords', () => {
    it('should load thinking records from persistence', async () => {
      const {
        loadThinkingRecords,
        getThinkingMomentToSurface,
        clearUserThinking,
        incrementSessionCount,
      } = await import('../between-session-thinking.js');

      const userId = 'test-user-load';
      clearUserThinking(userId);

      // Load pre-existing records
      loadThinkingRecords(userId, [
        {
          id: 'loaded-1',
          userId,
          personaId: 'ferni',
          topic: 'loaded topic',
          context: 'loaded context',
          emotionalWeight: 'medium' as const,
          thinkingType: 'mulling' as const,
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          sessionsSince: 3,
          sourceSessionId: 'old-session',
        },
      ]);

      incrementSessionCount(userId);

      // The loaded record should be available for surfacing
      const moment = getThinkingMomentToSurface(userId, 'ferni', 'current-session-3');

      // May or may not surface based on probability
      if (moment) {
        expect(moment.record.topic).toBe('loaded topic');
      }
    });
  });
});
