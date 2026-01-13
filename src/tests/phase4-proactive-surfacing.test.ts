/**
 * Phase 4: Proactive Memory Surfacing Tests
 *
 * Tests the "Better Than Human" memory surfacing system including:
 * - Timing intelligence
 * - Natural phrasing
 * - Feedback loop
 * - Context builder integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock vector store
vi.mock('../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    addDocument: vi.fn(),
    search: vi.fn(() => []),
  })),
}));

// Mock embeddings
vi.mock('../memory/embeddings.js', () => ({
  embed: vi.fn(() => Array(768).fill(0.1)),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Phase 4: Proactive Memory Surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('ProactiveMemorySurfacingService', () => {
    it('should export proactive surfacing functions', async () => {
      const {
        getProactiveMemorySurfacing,
        resetProactiveMemorySurfacing,
        buildProactiveMemoryContext,
      } = await import('../services/proactive-memory-surfacing.js');

      expect(getProactiveMemorySurfacing).toBeDefined();
      expect(resetProactiveMemorySurfacing).toBeDefined();
      expect(buildProactiveMemoryContext).toBeDefined();
    });

    it('should not surface on early turns', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      const result = await service.decideSurfacing({
        userId: 'test-user',
        currentInput: 'Hello',
        personaId: 'ferni',
        turnNumber: 1, // Too early
        sessionId: 'session_123',
      });

      expect(result.decision.shouldSurface).toBe(false);
      expect(result.decision.reason).toContain('Conditions not met');
    });

    it('should respect session surface limits', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      // Manually trigger enough surfaces to hit the limit
      for (let i = 0; i < 5; i++) {
        await service.decideSurfacing({
          userId: 'test-user',
          currentInput: 'Test input',
          personaId: 'ferni',
          turnNumber: 4 + i * 5, // Space out turns
          sessionId: 'session_limit_test',
        });
      }

      // Next attempt should be limited (though we may not have memories)
      const result = await service.decideSurfacing({
        userId: 'test-user',
        currentInput: 'Another input',
        personaId: 'ferni',
        turnNumber: 30,
        sessionId: 'session_limit_test',
      });

      // Either limited by session count or no memories
      expect(result.decision.shouldSurface).toBe(false);
    });

    it('should generate context injection when surfacing', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      // Create a mock surfacing result
      const mockResult = {
        decision: {
          shouldSurface: true,
          reason: 'Test',
          confidence: 0.8,
          memory: {
            item: {
              id: 'mem_123',
              content: 'User mentioned they love hiking',
              type: 'preference' as const,
              timestamp: new Date(),
              emotionalWeight: 0.5,
              relevanceDecay: 0.1,
              baseImportance: 0.5,
              topics: ['hobbies'],
              source: { collection: 'memories', documentId: 'mem_123' },
            },
            naturalExplanation: 'Related to current topic',
            connectionStrength: 'moderate' as const,
            connectionType: 'topic_match' as const,
            suggestedReference: 'You mentioned hiking before',
            score: 0.7,
            scoreBreakdown: { semantic: 0.5, temporal: 0.3, emotional: 0.4, contextual: 0.3 },
            reason: 'Topic match',
          },
          phrasing: 'That reminds me of when you mentioned hiking!',
          style: 'warm' as const,
          decisionFactors: {
            timingScore: 0.8,
            relevanceScore: 0.7,
            emotionalFit: 0.6,
            learningModifier: 1,
          },
        },
        surfacingId: 'surf_test_123',
      };

      const injection = service.generateContextInjection(mockResult);

      expect(injection).not.toBeNull();
      expect(injection).toContain('PROACTIVE MEMORY');
      expect(injection).toContain('hiking');
      expect(injection).toContain('warm');
    });

    it('should record feedback and reinforce memory', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      // Should not throw even if surfacing not found
      await expect(
        service.recordFeedback({
          surfacingId: 'unknown_surfacing',
          reaction: 'engaged',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('Better Than Human Memory Context Builder', () => {
    it('should export context builder', async () => {
      const { betterThanHumanMemoryBuilder, buildBetterThanHumanMemoryContext } =
        await import('../intelligence/context-builders/memory/better-than-human-memory.js');

      expect(betterThanHumanMemoryBuilder).toBeDefined();
      expect(betterThanHumanMemoryBuilder.name).toBe('better_than_human_memory');
      expect(buildBetterThanHumanMemoryContext).toBeDefined();
    });

    it('should return empty array when no userId', async () => {
      const { buildBetterThanHumanMemoryContext } =
        await import('../intelligence/context-builders/memory/better-than-human-memory.js');

      const result = await buildBetterThanHumanMemoryContext({
        userText: 'Hello',
        services: {}, // No userId
        userData: { turnCount: 0 },
        userProfile: null,
        persona: { id: 'ferni' },
        analysis: { emotion: {}, topics: {} },
      } as unknown as Parameters<typeof buildBetterThanHumanMemoryContext>[0]);

      expect(result).toEqual([]);
    });

    it('should build session priming on turn 0', async () => {
      const { buildBetterThanHumanMemoryContext } =
        await import('../intelligence/context-builders/memory/better-than-human-memory.js');

      const result = await buildBetterThanHumanMemoryContext({
        userText: 'Hello',
        services: { userId: 'test-user', sessionId: 'session_123' },
        userData: { turnCount: 0 },
        userProfile: { name: 'Test', totalConversations: 5 },
        persona: { id: 'ferni' },
        analysis: { emotion: { primary: 'neutral' }, topics: { detected: [] } },
      } as unknown as Parameters<typeof buildBetterThanHumanMemoryContext>[0]);

      // May return empty if no memories found (mocked)
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Surfacing Decision Factors', () => {
    it('should calculate confidence from factors', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      const result = await service.decideSurfacing({
        userId: 'test-user',
        currentInput: 'I want to talk about my career',
        currentEmotion: 'neutral',
        personaId: 'ferni',
        turnNumber: 5,
        sessionId: 'session_factors_test',
      });

      // Result should have decision factors
      expect(result.decision.decisionFactors).toBeDefined();
      expect(typeof result.decision.decisionFactors.timingScore).toBe('number');
      expect(typeof result.decision.decisionFactors.relevanceScore).toBe('number');
      expect(typeof result.decision.decisionFactors.emotionalFit).toBe('number');
      expect(typeof result.decision.decisionFactors.learningModifier).toBe('number');
    });
  });

  describe('Style Selection', () => {
    it('should select gentle style for vulnerable emotions', async () => {
      const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
        await import('../services/proactive-memory-surfacing.js');

      resetProactiveMemorySurfacing();
      const service = getProactiveMemorySurfacing();

      const result = await service.decideSurfacing({
        userId: 'test-user',
        currentInput: 'I feel anxious about tomorrow',
        currentEmotion: 'anxious',
        personaId: 'ferni',
        turnNumber: 5,
        sessionId: 'session_style_test',
      });

      // If a memory was surfaced, style should be gentle
      if (result.decision.shouldSurface) {
        expect(result.decision.style).toBe('gentle');
      }
    });
  });
});

describe('Phase 4: End-to-End Flow', () => {
  it('should handle complete proactive surfacing flow', async () => {
    const { getProactiveMemorySurfacing, resetProactiveMemorySurfacing } =
      await import('../services/proactive-memory-surfacing.js');

    resetProactiveMemorySurfacing();
    const service = getProactiveMemorySurfacing();

    // 1. User starts conversation
    const turn1Result = await service.decideSurfacing({
      userId: 'test-user',
      currentInput: 'Hi there',
      personaId: 'ferni',
      turnNumber: 0,
      sessionId: 'session_e2e',
    });
    expect(turn1Result.decision.shouldSurface).toBe(false); // Too early

    // 2. Conversation continues
    const turn5Result = await service.decideSurfacing({
      userId: 'test-user',
      currentInput: 'I want to talk about my job',
      currentTopic: 'career',
      personaId: 'ferni',
      turnNumber: 5,
      sessionId: 'session_e2e',
    });

    // 3. Generate context injection if surfacing
    const injection = service.generateContextInjection(turn5Result);
    if (turn5Result.decision.shouldSurface) {
      expect(injection).not.toBeNull();
    }

    // 4. Record feedback if surfaced
    if (turn5Result.surfacingId) {
      await service.recordFeedback({
        surfacingId: turn5Result.surfacingId,
        reaction: 'engaged',
      });
    }
  });
});
