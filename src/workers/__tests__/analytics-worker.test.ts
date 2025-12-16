/**
 * Analytics Worker Tests
 *
 * Tests the analytics worker's integration with community insights and agent evolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock functions need to be declared before vi.mock
const mockRecordEngagementSignal = vi.fn();
const mockCreateAdjustment = vi.fn();
const mockUpdateStoryRankings = vi.fn();

vi.mock('../../intelligence/community-insights.js', () => ({
  getCommunityInsights: vi.fn(() => ({
    recordEngagementSignal: mockRecordEngagementSignal,
  })),
  saveCommunityInsightsToFirestore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../intelligence/agent-evolution.js', () => ({
  getAgentEvolution: vi.fn(() => ({
    createAdjustmentFromCommunityPattern: mockCreateAdjustment,
    updateStoryRankings: mockUpdateStoryRankings,
  })),
  saveAgentEvolutionToFirestore: vi.fn().mockResolvedValue(undefined),
}));

// Import worker after mocking
import { AnalyticsWorker } from '../analytics-worker.js';

// Import mocked modules for assertions
import {
  getCommunityInsights,
  saveCommunityInsightsToFirestore,
} from '../../intelligence/community-insights.js';
import {
  getAgentEvolution,
  saveAgentEvolutionToFirestore,
} from '../../intelligence/agent-evolution.js';

describe('AnalyticsWorker', () => {
  let worker: AnalyticsWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new AnalyticsWorker();
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('interaction batch processing', () => {
    it('should batch interaction events', async () => {
      const payload = {
        type: 'analytics:interaction' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {
          responseType: 'empathetic',
          topic: 'anxiety',
          engagementScore: 0.8,
        },
        timestamp: new Date(),
      };

      // Process single event - should be batched, not immediately flushed
      await (worker as any).process(payload);

      // Batch isn't full yet, so shouldn't have saved
      expect(saveCommunityInsightsToFirestore).not.toHaveBeenCalled();
    });

    it('should flush interaction batch when full', async () => {
      // Process 50 events to trigger flush
      for (let i = 0; i < 50; i++) {
        const payload = {
          type: 'analytics:interaction' as const,
          userId: `user-${i}`,
          personaId: 'ferni',
          data: {
            responseType: 'supportive',
            topic: 'stress',
            engagementScore: 0.7,
          },
          timestamp: new Date(),
        };
        await (worker as any).process(payload);
      }

      // Should have triggered a flush
      expect(getCommunityInsights).toHaveBeenCalled();
      expect(mockRecordEngagementSignal).toHaveBeenCalled();
      expect(saveCommunityInsightsToFirestore).toHaveBeenCalled();
    });
  });

  describe('emotion batch processing', () => {
    it('should batch emotion events', async () => {
      const payload = {
        type: 'analytics:emotion-detected' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {
          emotion: 'anxious',
          topic: 'work',
          engagementScore: 0.6,
        },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      // Batch isn't full yet
      expect(saveCommunityInsightsToFirestore).not.toHaveBeenCalled();
    });

    it('should flush emotion batch when full', async () => {
      // Process 20 events to trigger emotion batch flush
      for (let i = 0; i < 20; i++) {
        const payload = {
          type: 'analytics:emotion-detected' as const,
          userId: `user-${i}`,
          personaId: 'ferni',
          data: {
            emotion: i % 2 === 0 ? 'happy' : 'anxious',
            topic: 'general',
            engagementScore: 0.5,
          },
          timestamp: new Date(),
        };
        await (worker as any).process(payload);
      }

      expect(mockRecordEngagementSignal).toHaveBeenCalled();
      expect(saveCommunityInsightsToFirestore).toHaveBeenCalled();
    });
  });

  describe('pattern detection', () => {
    it('should create adjustment from detected pattern', async () => {
      const payload = {
        type: 'learning:pattern-detected' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {
          pattern: 'empathetic_first',
          bestStrategy: 'acknowledge_then_explore',
          improvement: 0.15,
          confidence: 0.75,
          userEmotion: 'anxious',
          topic: 'work_stress',
        },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(getAgentEvolution).toHaveBeenCalled();
      expect(mockCreateAdjustment).toHaveBeenCalledWith(
        'ferni',
        expect.objectContaining({
          bestStrategy: 'acknowledge_then_explore',
          improvement: 0.15,
          confidence: 0.75,
        })
      );
      expect(mockUpdateStoryRankings).toHaveBeenCalledWith('ferni');
      expect(saveAgentEvolutionToFirestore).toHaveBeenCalled();
    });

    it('should skip pattern without bestStrategy', async () => {
      const payload = {
        type: 'learning:pattern-detected' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {
          pattern: 'some_pattern',
          // No bestStrategy
        },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(mockCreateAdjustment).not.toHaveBeenCalled();
    });
  });

  describe('community insight handling', () => {
    it('should record community insights', async () => {
      const payload = {
        type: 'learning:community-insight' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {
          insight: 'Users respond well to validation',
          topic: 'anxiety',
          responseType: 'supportive',
          engagementScore: 0.85,
        },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(mockRecordEngagementSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: 'ferni',
          topic: 'anxiety',
          engagementScore: 0.85,
        })
      );
      expect(saveCommunityInsightsToFirestore).toHaveBeenCalled();
    });
  });

  describe('turn tracking', () => {
    it('should track conversation turns', async () => {
      const payload = {
        type: 'conversation:turn' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: {},
        timestamp: new Date(),
      };

      // Process multiple turns
      for (let i = 0; i < 5; i++) {
        await (worker as any).process(payload);
      }

      // Turn tracking is lightweight, no persistence expected per turn
      expect(saveCommunityInsightsToFirestore).not.toHaveBeenCalled();
    });
  });

  describe('event type handling', () => {
    it('should handle unrecognized event types gracefully', async () => {
      const payload = {
        type: 'unknown:event' as any,
        userId: 'test-user',
        personaId: 'ferni',
        data: {},
        timestamp: new Date(),
      };

      await expect((worker as any).process(payload)).resolves.not.toThrow();
    });
  });
});
