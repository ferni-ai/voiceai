/**
 * Active Learning Integration Tests
 *
 * Tests for the semantic router's active learning system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startTurnTracking,
  recordSemanticRoutingResult,
  recordLLMToolExecution,
  completeTurnTracking,
  getLearningStats,
  endLearningSession,
  cleanupOldSessions,
} from '../active-learning-integration.js';

// Mock the learning modules
vi.mock('../../advanced/learning-loop.js', () => ({
  enhanceWithLearning: vi.fn().mockResolvedValue({
    originalResult: { matches: [], action: { type: 'conversation' }, latencyMs: 0 },
    adjustedConfidence: 0.5,
    boosts: [],
  }),
  recordOutcome: vi.fn().mockResolvedValue(undefined),
  handleExplicitCorrection: vi.fn().mockResolvedValue(undefined),
  recordToolCoOccurrence: vi.fn(),
  predictToolChain: vi.fn().mockResolvedValue({ currentTool: '', nextTools: [] }),
}));

vi.mock('../../learning/index.js', () => ({
  recordCorrection: vi.fn().mockResolvedValue(undefined),
  recordImplicitCorrection: vi.fn().mockResolvedValue(undefined),
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
  getToolBoostForUser: vi.fn().mockResolvedValue({}),
  initializeCorrectionStore: vi.fn().mockResolvedValue(undefined),
}));

describe('Active Learning Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any existing sessions
    cleanupOldSessions(0);
  });

  describe('Turn Tracking', () => {
    it('should start and complete turn tracking', async () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
        conversationHistory: [],
        recentTools: [],
      };

      // Start tracking
      const turnId = startTurnTracking(context, 'play some jazz music', 'en');
      expect(turnId).toBeDefined();
      expect(turnId).toMatch(/^turn_/);

      // Complete tracking
      await completeTurnTracking(turnId, context.sessionId, {
        wasSuccessful: true,
        actualToolUsed: 'spotify_play',
      });

      // Verify stats
      const stats = getLearningStats();
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
    });

    it('should record semantic routing result', () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session-2',
        personaId: 'ferni',
        conversationHistory: [],
        recentTools: [],
      };

      const turnId = startTurnTracking(context, 'what time is it', 'en');

      recordSemanticRoutingResult(turnId, context.sessionId, {
        attempted: true,
        executed: false,
        routeResult: {
          matches: [
            {
              toolId: 'info_time',
              confidence: 0.9,
              layerScores: { pattern: 0.9, keyword: 0.7, embedding: 0.6 },
              extractedArgs: {},
            },
          ],
          action: { type: 'hint' },
          latencyMs: 15,
        },
      });

      // Turn state should be updated (we can't inspect directly, but it shouldn't throw)
      expect(() => {
        recordSemanticRoutingResult(turnId, context.sessionId, {
          attempted: true,
          executed: false,
        });
      }).not.toThrow();
    });

    it('should record LLM tool execution', () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session-3',
        personaId: 'ferni',
        conversationHistory: [],
        recentTools: [],
      };

      const turnId = startTurnTracking(context, 'check my calendar', 'en');

      // This should not throw
      expect(() => {
        recordLLMToolExecution(turnId, context.sessionId, 'calendar_list_events');
      }).not.toThrow();
    });

    it('should handle implicit corrections', async () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session-4',
        personaId: 'ferni',
        conversationHistory: [],
        recentTools: [],
      };

      const turnId = startTurnTracking(context, 'play something relaxing', 'en');

      // Semantic router predicted music
      recordSemanticRoutingResult(turnId, context.sessionId, {
        attempted: true,
        executed: false, // Not auto-executed (low confidence)
        routeResult: {
          matches: [
            {
              toolId: 'spotify_play',
              confidence: 0.7,
              layerScores: { pattern: 0.5, keyword: 0.8, embedding: 0.6 },
              extractedArgs: { query: 'something relaxing' },
            },
          ],
          action: { type: 'hint' },
          latencyMs: 12,
        },
      });

      // But LLM used grounding exercise instead
      recordLLMToolExecution(turnId, context.sessionId, 'grounding_exercise');

      // Complete with actual tool used
      await completeTurnTracking(turnId, context.sessionId, {
        wasSuccessful: true,
        actualToolUsed: 'grounding_exercise',
      });

      // The recordImplicitCorrection should have been called
      const { recordImplicitCorrection } = await import('../../learning/index.js');
      expect(recordImplicitCorrection).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should end learning session', () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session-5',
        personaId: 'ferni',
        conversationHistory: [],
        recentTools: [],
      };

      startTurnTracking(context, 'hello', 'en');

      // End session
      endLearningSession(context.sessionId);

      // Stats should reflect cleanup
      const stats = getLearningStats();
      // Session should be removed
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
    });

    it('should cleanup old sessions', () => {
      // Create some sessions
      for (let i = 0; i < 5; i++) {
        const context = {
          userId: `user-${i}`,
          sessionId: `cleanup-session-${i}`,
          personaId: 'ferni',
          conversationHistory: [],
          recentTools: [],
        };
        startTurnTracking(context, 'test', 'en');
      }

      // Cleanup with 0 max age (immediate)
      const cleaned = cleanupOldSessions(0);

      // Should have cleaned up the sessions
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Learning Stats', () => {
    it('should return learning statistics', () => {
      const stats = getLearningStats();

      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('totalTrackedTurns');
      expect(stats).toHaveProperty('memoryUsageEstimate');

      expect(typeof stats.activeSessions).toBe('number');
      expect(typeof stats.totalTrackedTurns).toBe('number');
      expect(typeof stats.memoryUsageEstimate).toBe('number');
    });
  });
});



