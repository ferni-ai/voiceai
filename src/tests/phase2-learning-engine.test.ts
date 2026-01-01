/**
 * Phase 2 Integration Tests - Learning Engine & Lifecycle
 *
 * Tests the Learning Engine integration with the Unified Memory Service:
 * - User reaction tracking
 * - Threshold adaptation
 * - Memory reinforcement
 * - Consolidation and decay wiring
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LearningEngine,
  getLearningEngine,
  resetLearningEngine,
  type SurfacingEvent,
  type MemoryReaction,
} from '../memory/learning-engine.js';

// Mock Firestore
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null), // Return null to skip persistence in tests
}));

describe('LearningEngine', () => {
  let engine: LearningEngine;

  beforeEach(() => {
    resetLearningEngine();
    engine = getLearningEngine();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetLearningEngine();
  });

  describe('Reaction Inference', () => {
    it('should infer "engaged" reaction for detailed responses', () => {
      const reaction = engine.inferReaction(
        'Yes, I was just thinking about that! Last time we talked about my career goals, ' +
          "I realized I need to focus more on building relationships with my team. It's been " +
          "on my mind a lot lately and I've started making changes.",
        false, // didn't change topic
        false, // no gratitude
        false // no discomfort
      );

      expect(reaction).toBe('engaged');
    });

    it('should infer "grateful" reaction when gratitude is expressed', () => {
      const reaction = engine.inferReaction(
        'Thanks for remembering that!',
        false,
        true, // expressed gratitude
        false
      );

      expect(reaction).toBe('grateful');
    });

    it('should infer "negative" reaction when discomfort is expressed', () => {
      const reaction = engine.inferReaction(
        "I'd rather not talk about that.",
        false,
        false,
        true // expressed discomfort
      );

      expect(reaction).toBe('negative');
    });

    it('should infer "ignored" reaction when topic changed', () => {
      const reaction = engine.inferReaction(
        'Anyway, what about the weather?',
        true, // changed topic
        false,
        false
      );

      expect(reaction).toBe('ignored');
    });

    it('should infer "acknowledged" for short neutral responses', () => {
      const reaction = engine.inferReaction('Oh yeah, right.', false, false, false);

      expect(reaction).toBe('acknowledged');
    });
  });

  describe('Surfacing Recording', () => {
    it('should record surfacing events and return event ID', () => {
      const mockMemory = {
        id: 'mem_123',
        type: 'topic' as const,
        content: 'User mentioned career goals',
        timestamp: new Date(),
        emotionalWeight: 0.6,
        relevanceDecay: 0,
        baseImportance: 0.7,
        topics: ['career', 'goals'],
        source: { collection: 'memories', documentId: 'mem_123' },
      };

      const eventId = engine.recordSurfacing('user_123', mockMemory, {
        surfacingMethod: 'query_response',
        conversationPhase: 'mid',
        userEmotionalState: 'neutral',
        timeSinceSessionStart: 5,
      });

      expect(eventId).toBeDefined();
      expect(eventId).toContain('surf_user_123_');
    });

    it('should track pending events for later reaction recording', async () => {
      const mockMemory = {
        id: 'mem_123',
        type: 'topic' as const,
        content: 'User mentioned career goals',
        timestamp: new Date(),
        emotionalWeight: 0.6,
        relevanceDecay: 0,
        baseImportance: 0.7,
        topics: ['career', 'goals'],
        source: { collection: 'memories', documentId: 'mem_123' },
      };

      const eventId = engine.recordSurfacing('user_123', mockMemory, {
        surfacingMethod: 'proactive',
        conversationPhase: 'opening',
        userEmotionalState: 'positive',
        timeSinceSessionStart: 2,
      });

      // Recording a reaction should work
      await engine.recordReaction(eventId, 'engaged');

      // Recording reaction for unknown event should not throw
      await expect(engine.recordReaction('unknown_event', 'engaged')).resolves.not.toThrow();
    });
  });

  describe('Threshold Management', () => {
    it('should return default thresholds for new users', async () => {
      const thresholds = await engine.getThresholds('new_user_123');

      expect(thresholds).toBeDefined();
      expect(thresholds.minConfidence).toBe(0.6);
      expect(thresholds.maxProactivePerSession).toBe(3);
      expect(thresholds.emotionalSensitivity).toBe(0.5);
    });
  });

  describe('Proposed Surfacing Scoring', () => {
    it('should return default score for users without learnings', async () => {
      const mockMemory = {
        id: 'mem_123',
        type: 'topic' as const,
        content: 'Test memory',
        timestamp: new Date(),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        topics: ['test'],
        source: { collection: 'memories', documentId: 'mem_123' },
      };

      const result = await engine.scoreProposedSurfacing('new_user', mockMemory, {
        conversationPhase: 'mid',
        userEmotionalState: 'neutral',
      });

      expect(result.score).toBe(0.5);
      expect(result.recommendation).toBe('surface');
      expect(result.factors).toEqual({ default: 0.5 });
    });
  });

  describe('Learnings Summary', () => {
    it('should return empty summary for users without learnings', async () => {
      const summary = await engine.getLearningsSummary('new_user_123');

      expect(summary.hasLearnings).toBe(false);
      expect(summary.totalInteractions).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.topTopics).toEqual([]);
      expect(summary.avoidTopics).toEqual([]);
      expect(summary.bestPhase).toBeNull();
    });
  });

  describe('Memory Reinforcement', () => {
    it('should return reinforcement metadata', async () => {
      const result = await engine.reinforceMemory('user_123', 'mem_456', 0.8);

      expect(result).toBeDefined();
      expect(result.previousStrength).toBeDefined();
      expect(result.newStrength).toBeDefined();
      expect(result.boostApplied).toBeGreaterThan(0);
    });
  });

  describe('Decay and Maintenance', () => {
    it('should handle decay for users without learnings', async () => {
      // Should not throw even for users without learnings
      await expect(engine.decayLearnings('nonexistent_user')).resolves.not.toThrow();
    });

    it('should clear learnings', async () => {
      // Create some in-memory learnings first by recording
      const mockMemory = {
        id: 'mem_123',
        type: 'topic' as const,
        content: 'Test',
        timestamp: new Date(),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        source: { collection: 'memories', documentId: 'mem_123' },
      };

      const eventId = engine.recordSurfacing('user_to_clear', mockMemory, {
        surfacingMethod: 'proactive',
        conversationPhase: 'mid',
        userEmotionalState: 'neutral',
        timeSinceSessionStart: 1,
      });
      await engine.recordReaction(eventId, 'engaged');

      // Clear should work
      await expect(engine.clearLearnings('user_to_clear')).resolves.not.toThrow();
    });
  });
});

describe('UnifiedMemoryService Phase 2 Integration', () => {
  // Note: Full integration tests would require more mocking.
  // These tests verify the service initializes with Phase 2 components.

  it('should initialize with learning engine', async () => {
    // Import dynamically to avoid initialization issues
    const { getUnifiedMemoryService, resetUnifiedMemoryService } =
      await import('../services/unified-memory-service.js');

    resetUnifiedMemoryService();
    const service = getUnifiedMemoryService();

    // Service should be created without errors
    expect(service).toBeDefined();

    // Check that it has the Phase 2 methods
    expect(typeof service.recordLearning).toBe('function');
    expect(typeof service.getLearnings).toBe('function');
    expect(typeof service.scoreMemorySurfacing).toBe('function');
    expect(typeof service.consolidateMemories).toBe('function');
    expect(typeof service.applyDecay).toBe('function');
    expect(typeof service.reinforceMemory).toBe('function');
    expect(typeof service.getAssociatedMemories).toBe('function');
    expect(typeof service.runMaintenance).toBe('function');

    resetUnifiedMemoryService();
  });
});
