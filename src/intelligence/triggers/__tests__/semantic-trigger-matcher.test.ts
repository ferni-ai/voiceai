/**
 * Semantic Trigger Matcher Tests
 *
 * Tests for hybrid semantic + pattern matching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  matchTriggersHybrid,
  getSemanticSimilarity,
  shouldSkipTriggers,
  getTriggerProbabilityBoost,
  getSemanticAnalytics,
  resetSemanticAnalytics,
  recordSemanticMatch,
} from '../semantic-trigger-matcher.js';
import type { TriggerContext, ProactiveTrigger, HybridMatchResult, SemanticMatch } from '../types.js';
import { resetTriggerEmbeddingService } from '../trigger-embedding-service.js';

// Mock the embedding service
vi.mock('../trigger-embedding-service.js', async () => {
  const actual = await vi.importActual<typeof import('../trigger-embedding-service.js')>('../trigger-embedding-service.js');

  const mockService = {
    isInitialized: vi.fn().mockReturnValue(true),
    initializeForPersona: vi.fn().mockResolvedValue(3),
    findSimilarTriggers: vi.fn().mockResolvedValue([
      {
        trigger: {
          name: 'distress_detection',
          trigger: 'User shows signs of distress',
          behavior: 'Offer gentle support',
          embedding: [],
          personaId: 'ferni',
          category: 'emotional',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        similarity: 0.85,
      },
    ]),
    embedUserText: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
    getTrigger: vi.fn().mockReturnValue({
      name: 'distress_detection',
      category: 'emotional',
    }),
  };

  return {
    ...actual,
    getTriggerEmbeddingService: vi.fn().mockReturnValue(mockService),
    resetTriggerEmbeddingService: vi.fn(),
  };
});

// Mock the dynamic trigger utils
vi.mock('../../context-builders/dynamic-trigger-utils.js', () => ({
  checkDynamicTriggers: vi.fn().mockReturnValue(null),
  calculateProbabilityBoost: vi.fn().mockReturnValue(1.3),
  shouldSkipDueToNeverWhen: vi.fn().mockReturnValue(false),
  recordTriggerCheck: vi.fn(),
  recordTriggerMatch: vi.fn(),
}));

// Mock embeddings for getSemanticSimilarity
vi.mock('../../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  cosineSimilarity: vi.fn().mockReturnValue(0.78),
}));

describe('SemanticTriggerMatcher', () => {
  const mockContext: TriggerContext = {
    userText: 'I\'m feeling really overwhelmed and anxious',
    emotion: 'worried',
    emotionIntensity: 0.7,
    turnCount: 5,
    relationshipStage: 'friend',
    isLateNight: true,
    currentHour: 23,
  };

  const mockTriggers: Record<string, ProactiveTrigger> = {
    distress_detection: {
      trigger: 'User shows signs of distress or anxiety',
      behavior: 'Offer gentle support and acknowledge their feelings',
    },
    late_night_worry: {
      trigger: 'Late night session with work concerns',
      behavior: 'Acknowledge the hour and offer grounding',
    },
    false_fine: {
      trigger: 'User says "I\'m fine" but voice suggests otherwise',
      behavior: 'Gently hold space',
    },
  };

  beforeEach(() => {
    resetSemanticAnalytics();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('matchTriggersHybrid', () => {
    it('should return hybrid match result', async () => {
      const result = await matchTriggersHybrid(
        mockContext.userText!, // Non-null assertion since we know mock has it defined
        mockContext,
        mockTriggers,
        'ferni'
      );

      expect(result.bestMatch).not.toBeNull();
      expect(result.matchingStrategy).toBe('hybrid');
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should include semantic and pattern scores', async () => {
      const result = await matchTriggersHybrid(
        mockContext.userText!, // Non-null assertion since we know mock has it defined
        mockContext,
        mockTriggers,
        'ferni'
      );

      if (result.bestMatch) {
        expect(result.bestMatch.semanticScore).toBeGreaterThanOrEqual(0);
        expect(result.bestMatch.patternScore).toBeGreaterThanOrEqual(0);
        expect(result.bestMatch.combinedScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle empty triggers gracefully', async () => {
      // When triggers is empty, we still try semantic matching
      // The result depends on whether any triggers were previously embedded
      const result = await matchTriggersHybrid(
        mockContext.userText!, // Non-null assertion since we know mock has it defined
        mockContext,
        {},
        'ferni'
      );

      // Should still return a valid result structure
      expect(result).toHaveProperty('bestMatch');
      expect(result).toHaveProperty('allMatches');
      expect(result).toHaveProperty('matchingStrategy');
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should return category for matches', async () => {
      const result = await matchTriggersHybrid(
        mockContext.userText!, // Non-null assertion since we know mock has it defined
        mockContext,
        mockTriggers,
        'ferni'
      );

      if (result.bestMatch) {
        expect(['emotional', 'behavioral', 'temporal', 'domain', 'relational', 'existential', 'growth'])
          .toContain(result.bestMatch.category);
      }
    });
  });

  describe('getSemanticSimilarity', () => {
    it('should return similarity score', async () => {
      const similarity = await getSemanticSimilarity(
        'I\'m feeling anxious',
        'User shows signs of distress'
      );

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('shouldSkipTriggers', () => {
    it('should skip based on never_when conditions', () => {
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'stranger',
      };

      const shouldSkip = shouldSkipTriggers(['first_3_turns'], context);
      expect(shouldSkip).toBe(false); // Mocked to return false
    });
  });

  describe('getTriggerProbabilityBoost', () => {
    it('should calculate probability boost', () => {
      const match: SemanticMatch = {
        triggerName: 'distress_detection',
        trigger: 'User shows distress',
        behavior: 'Offer support',
        semanticScore: 0.8,
        patternScore: 0.6,
        combinedScore: 0.72,
        category: 'emotional',
      };

      const boost = getTriggerProbabilityBoost(
        ['late_night_session', 'heavy_topic_detected'],
        mockContext,
        match
      );

      expect(boost).toBeGreaterThanOrEqual(1);
    });

    it('should return 1.0 for null match', () => {
      const boost = getTriggerProbabilityBoost(
        ['late_night_session'],
        mockContext,
        null
      );

      expect(boost).toBe(1.0);
    });
  });

  describe('analytics', () => {
    it('should track matches', () => {
      const result: HybridMatchResult = {
        bestMatch: {
          triggerName: 'test_trigger',
          trigger: 'Test trigger description',
          behavior: 'Test behavior',
          semanticScore: 0.8,
          patternScore: 0.6,
          combinedScore: 0.72,
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 45,
      };

      recordSemanticMatch(result);
      recordSemanticMatch(result);

      const stats = getSemanticAnalytics();
      expect(stats.totalHybridMatches).toBe(2);
      expect(stats.averageSemanticScore).toBe(0.8);
      expect(stats.averagePatternScore).toBe(0.6);
    });

    it('should track by category', () => {
      const emotionalResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'emotional_trigger',
          trigger: 'Emotional trigger',
          behavior: 'Response',
          semanticScore: 0.9,
          patternScore: 0.7,
          combinedScore: 0.82,
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 30,
      };

      const temporalResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'temporal_trigger',
          trigger: 'Temporal trigger',
          behavior: 'Response',
          semanticScore: 0.7,
          patternScore: 0.8,
          combinedScore: 0.74,
          category: 'temporal',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 25,
      };

      recordSemanticMatch(emotionalResult);
      recordSemanticMatch(temporalResult);

      const stats = getSemanticAnalytics();
      expect(stats.byCategoryArray.length).toBe(2);
      expect(stats.byCategoryArray.find((c) => c.category === 'emotional')?.count).toBe(1);
      expect(stats.byCategoryArray.find((c) => c.category === 'temporal')?.count).toBe(1);
    });

    it('should track different strategies', () => {
      recordSemanticMatch({
        bestMatch: { triggerName: 't1', trigger: 't', behavior: 'b', semanticScore: 0.8, patternScore: 0.6, combinedScore: 0.72, category: 'emotional' },
        allMatches: [],
        matchingStrategy: 'semantic',
        processingTimeMs: 20,
      });

      recordSemanticMatch({
        bestMatch: { triggerName: 't2', trigger: 't', behavior: 'b', semanticScore: 0, patternScore: 0.7, combinedScore: 0.7, category: 'behavioral' },
        allMatches: [],
        matchingStrategy: 'pattern',
        processingTimeMs: 5,
      });

      const stats = getSemanticAnalytics();
      expect(stats.totalSemanticOnly).toBe(1);
      expect(stats.totalPatternOnly).toBe(1);
    });

    it('should reset analytics', () => {
      recordSemanticMatch({
        bestMatch: { triggerName: 't', trigger: 't', behavior: 'b', semanticScore: 0.8, patternScore: 0.6, combinedScore: 0.72, category: 'emotional' },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 30,
      });

      resetSemanticAnalytics();

      const stats = getSemanticAnalytics();
      expect(stats.totalHybridMatches).toBe(0);
      expect(stats.averageSemanticScore).toBe(0);
    });
  });
});
