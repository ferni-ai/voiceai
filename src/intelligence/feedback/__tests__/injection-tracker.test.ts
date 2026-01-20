/**
 * Injection Tracker Tests
 *
 * Tests for the BTH Communication System Phase 1 feedback loop.
 * Verifies injection tagging, response alignment analysis, user reaction capture,
 * and builder ROI metrics aggregation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import {
  tagInjectionsForTracking,
  analyzeResponseAlignment,
  recordUserReaction,
  getSessionFeedback,
  getSessionMetrics,
  cleanupSession,
  aggregateBuilderMetrics,
  type MinimalInjection,
  type InjectionFeedback,
} from '../injection-tracker.js';

describe('Injection Tracker', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up session state after each test
    cleanupSession(testSessionId);
  });

  // ============================================================================
  // TAG INJECTIONS FOR TRACKING
  // ============================================================================

  describe('tagInjectionsForTracking', () => {
    it('should add tracking IDs to injections', () => {
      const injections: MinimalInjection[] = [
        { category: 'emotional', content: 'User is feeling anxious', priority: 1 },
        { category: 'memory', content: 'User mentioned Sarah yesterday', priority: 2, source: 'memory-builder' },
      ];

      const tracked = tagInjectionsForTracking(injections, testSessionId);

      expect(tracked).toHaveLength(2);
      // nanoid uses URL-safe characters including hyphens and underscores
      expect(tracked[0].trackingId).toMatch(/^inj_[a-zA-Z0-9_-]+$/);
      expect(tracked[1].trackingId).toMatch(/^inj_[a-zA-Z0-9_-]+$/);
      expect(tracked[0].trackingId).not.toBe(tracked[1].trackingId);
    });

    it('should preserve original injection properties', () => {
      const injections: MinimalInjection[] = [
        { category: 'coaching', content: 'Consider checking in about their habit streak', priority: 3, source: 'maya-coaching' },
      ];

      const tracked = tagInjectionsForTracking(injections, testSessionId);

      expect(tracked[0].category).toBe('coaching');
      expect(tracked[0].content).toBe('Consider checking in about their habit streak');
      expect(tracked[0].priority).toBe(3);
      expect(tracked[0].builderName).toBe('maya-coaching');
    });

    it('should use "unknown" for missing source', () => {
      const injections: MinimalInjection[] = [
        { category: 'emotional', content: 'Test content', priority: 1 },
      ];

      const tracked = tagInjectionsForTracking(injections, testSessionId);

      expect(tracked[0].builderName).toBe('unknown');
    });

    it('should add timestamp to tracked injections', () => {
      const beforeTag = Date.now();
      const injections: MinimalInjection[] = [
        { category: 'test', content: 'Test', priority: 1 },
      ];

      const tracked = tagInjectionsForTracking(injections, testSessionId);
      const afterTag = Date.now();

      expect(tracked[0].deliveredAt).toBeGreaterThanOrEqual(beforeTag);
      expect(tracked[0].deliveredAt).toBeLessThanOrEqual(afterTag);
    });
  });

  // ============================================================================
  // RESPONSE ALIGNMENT ANALYSIS
  // ============================================================================

  describe('analyzeResponseAlignment', () => {
    it('should detect high alignment when response uses injection keywords', () => {
      const injections: MinimalInjection[] = [
        { category: 'memory', content: 'User mentioned their dog Max last week', priority: 1, source: 'memory-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(
        testSessionId,
        testUserId,
        'I remember you mentioned your dog Max last week! How is he doing?',
        'casual'
      );

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(1);
      expect(feedback[0].wasUsedInResponse).toBe(true);
      expect(feedback[0].responseAlignment).toBeGreaterThan(0.15);
    });

    it('should detect low alignment when response is unrelated', () => {
      const injections: MinimalInjection[] = [
        { category: 'emotional', content: 'User is experiencing work stress', priority: 1, source: 'emotion-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(
        testSessionId,
        testUserId,
        'The weather today is quite nice!',
        'casual'
      );

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(1);
      expect(feedback[0].wasUsedInResponse).toBe(false);
      expect(feedback[0].responseAlignment).toBeLessThan(0.15);
    });

    it('should analyze multiple injections independently', () => {
      const injections: MinimalInjection[] = [
        { category: 'memory', content: 'User loves hiking in the mountains', priority: 1, source: 'memory-builder' },
        { category: 'emotional', content: 'User mentioned feeling tired lately', priority: 2, source: 'emotion-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(
        testSessionId,
        testUserId,
        'Have you been hiking lately? I know you love the mountains!',
        'casual'
      );

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(2);

      // First injection should align well
      const memoryFeedback = feedback.find(f => f.category === 'memory');
      expect(memoryFeedback?.wasUsedInResponse).toBe(true);

      // Second injection should have low alignment
      const emotionFeedback = feedback.find(f => f.category === 'emotional');
      expect(emotionFeedback?.wasUsedInResponse).toBe(false);
    });

    it('should store content preview truncated to 100 chars', () => {
      const longContent = 'A'.repeat(200);
      const injections: MinimalInjection[] = [
        { category: 'test', content: longContent, priority: 1, source: 'test-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].contentPreview).toHaveLength(100);
    });

    it('should record conversation mode', () => {
      const injections: MinimalInjection[] = [
        { category: 'test', content: 'Test content', priority: 1 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'crisis');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].conversationMode).toBe('crisis');
    });

    it('should handle empty injections gracefully', () => {
      // No injections tagged
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(0);
    });
  });

  // ============================================================================
  // USER REACTION CAPTURE
  // ============================================================================

  describe('recordUserReaction', () => {
    it('should detect positive reactions', () => {
      const injections: MinimalInjection[] = [
        { category: 'coaching', content: 'Suggest habit tracking', priority: 1, source: 'coaching-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Try tracking your habits!', 'practical');
      // Use clearer positive indicators: "thanks", "great", "exactly"
      recordUserReaction(testSessionId, 'Thanks, that is great! Exactly what I needed.');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].userReaction).toBe('positive');
    });

    it('should detect negative reactions', () => {
      const injections: MinimalInjection[] = [
        { category: 'suggestion', content: 'Recommend meditation', priority: 1, source: 'wellness-builder' },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Have you tried meditation?', 'practical');
      recordUserReaction(testSessionId, "No, that's not what I'm looking for. I don't like meditation.");

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].userReaction).toBe('negative');
    });

    it('should detect neutral reactions', () => {
      const injections: MinimalInjection[] = [
        { category: 'info', content: 'Provide weather info', priority: 1 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, "It's sunny today.", 'casual');
      // Neutral: no strong positive or negative indicators, longer than question threshold
      recordUserReaction(testSessionId, 'I was thinking about going to the park later today to enjoy the weather and maybe read a book.');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].userReaction).toBe('neutral');
    });

    it('should handle short positive confirmations', () => {
      const injections: MinimalInjection[] = [
        { category: 'test', content: 'Test', priority: 1 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');
      recordUserReaction(testSessionId, 'Yeah');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].userReaction).toBe('positive');
    });

    it('should handle questions as potential confusion signals', () => {
      const injections: MinimalInjection[] = [
        { category: 'test', content: 'Test', priority: 1 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');
      recordUserReaction(testSessionId, 'What?');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback[0].userReaction).toBe('negative');
    });

    it('should complete all pending feedback with same reaction', () => {
      const injections: MinimalInjection[] = [
        { category: 'a', content: 'A', priority: 1 },
        { category: 'b', content: 'B', priority: 2 },
        { category: 'c', content: 'C', priority: 3 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');
      // Use stronger positive indicators: thanks + appreciate + love
      recordUserReaction(testSessionId, 'Thanks so much, I appreciate that and love your help!');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(3);
      expect(feedback.every(f => f.userReaction === 'positive')).toBe(true);
    });

    it('should handle no pending feedback gracefully', () => {
      // No injections, so no pending feedback
      recordUserReaction(testSessionId, 'Hello!');

      const feedback = getSessionFeedback(testSessionId);
      expect(feedback).toHaveLength(0);
    });
  });

  // ============================================================================
  // SESSION METRICS
  // ============================================================================

  describe('getSessionMetrics', () => {
    it('should calculate correct metrics for a session', () => {
      // Simulate a full session with multiple turns

      // Turn 1: One injection, positive reaction
      const injections1: MinimalInjection[] = [
        { category: 'memory', content: 'Relevant memory content', priority: 1, source: 'memory' },
      ];
      tagInjectionsForTracking(injections1, testSessionId);
      analyzeResponseAlignment(
        testSessionId,
        testUserId,
        'I recall that relevant memory content you shared!',
        'casual'
      );
      recordUserReaction(testSessionId, 'Thanks, I appreciate that!');

      // Turn 2: One injection, negative reaction
      const injections2: MinimalInjection[] = [
        { category: 'coaching', content: 'Another injection', priority: 1, source: 'coaching' },
      ];
      tagInjectionsForTracking(injections2, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Completely different response', 'practical');
      recordUserReaction(testSessionId, "No, that's not right, stop.");

      // Turn 3: One injection, neutral reaction
      const injections3: MinimalInjection[] = [
        { category: 'info', content: 'Info content', priority: 1, source: 'info' },
      ];
      tagInjectionsForTracking(injections3, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Some info for you', 'practical');
      recordUserReaction(testSessionId, 'I was thinking about going for a walk later today maybe.');

      const metrics = getSessionMetrics(testSessionId);

      expect(metrics.totalInjections).toBe(3);
      expect(metrics.usedCount).toBeGreaterThanOrEqual(1); // At least the memory one
      expect(metrics.positiveReactions).toBe(1); // Turn 1
      expect(metrics.negativeReactions).toBe(1); // Turn 2
      expect(metrics.avgAlignment).toBeGreaterThan(0);
    });

    it('should return zeros for empty session', () => {
      const metrics = getSessionMetrics(testSessionId);

      expect(metrics.totalInjections).toBe(0);
      expect(metrics.usedCount).toBe(0);
      expect(metrics.positiveReactions).toBe(0);
      expect(metrics.negativeReactions).toBe(0);
      expect(metrics.avgAlignment).toBe(0);
    });
  });

  // ============================================================================
  // BUILDER METRICS AGGREGATION
  // ============================================================================

  describe('aggregateBuilderMetrics', () => {
    it('should aggregate feedback by builder', () => {
      const feedbackItems: InjectionFeedback[] = [
        createFeedback('memory-builder', 'memory', true, 0.5, 'positive'),
        createFeedback('memory-builder', 'memory', true, 0.3, 'positive'),
        createFeedback('memory-builder', 'memory', false, 0.1, 'neutral'),
        createFeedback('emotion-builder', 'emotion', true, 0.4, 'negative'),
      ];

      const metrics = aggregateBuilderMetrics(feedbackItems);

      expect(metrics.size).toBe(2);

      const memoryMetrics = metrics.get('memory-builder')!;
      expect(memoryMetrics.deliveryCount).toBe(3);
      expect(memoryMetrics.alignmentCount).toBe(2);
      expect(memoryMetrics.positiveReactionCount).toBe(2);
      expect(memoryMetrics.neutralReactionCount).toBe(1);

      const emotionMetrics = metrics.get('emotion-builder')!;
      expect(emotionMetrics.deliveryCount).toBe(1);
      expect(emotionMetrics.negativeReactionCount).toBe(1);
    });

    it('should calculate ROI score correctly', () => {
      // Builder with perfect alignment and positive reactions
      const perfectFeedback: InjectionFeedback[] = [
        createFeedback('perfect-builder', 'test', true, 0.8, 'positive'),
        createFeedback('perfect-builder', 'test', true, 0.9, 'positive'),
      ];

      const perfectMetrics = aggregateBuilderMetrics(perfectFeedback);
      const perfect = perfectMetrics.get('perfect-builder')!;

      // ROI = (1.0 * 50) + (1.0 * 30) - (0 * 20) = 80
      expect(perfect.roiScore).toBe(80);

      // Builder with no alignment and negative reactions
      const badFeedback: InjectionFeedback[] = [
        createFeedback('bad-builder', 'test', false, 0.05, 'negative'),
        createFeedback('bad-builder', 'test', false, 0.02, 'negative'),
      ];

      const badMetrics = aggregateBuilderMetrics(badFeedback);
      const bad = badMetrics.get('bad-builder')!;

      // ROI = (0 * 50) + (0 * 30) - (1.0 * 20) = -20 -> clamped to 0
      expect(bad.roiScore).toBe(0);
    });

    it('should calculate average alignment score', () => {
      const feedbackItems: InjectionFeedback[] = [
        createFeedback('test-builder', 'test', true, 0.2, 'neutral'),
        createFeedback('test-builder', 'test', true, 0.4, 'neutral'),
        createFeedback('test-builder', 'test', false, 0.6, 'neutral'),
      ];

      const metrics = aggregateBuilderMetrics(feedbackItems);
      const testMetrics = metrics.get('test-builder')!;

      // Average: (0.2 + 0.4 + 0.6) / 3 = 0.4
      expect(testMetrics.avgAlignmentScore).toBeCloseTo(0.4, 2);
    });

    it('should clamp ROI score to 0-100 range', () => {
      // Even with all negative reactions, ROI shouldn't go below 0
      const terribleFeedback: InjectionFeedback[] = Array(10).fill(null).map(() =>
        createFeedback('terrible-builder', 'test', false, 0, 'negative')
      );

      const metrics = aggregateBuilderMetrics(terribleFeedback);
      const terrible = metrics.get('terrible-builder')!;

      expect(terrible.roiScore).toBeGreaterThanOrEqual(0);
      expect(terrible.roiScore).toBeLessThanOrEqual(100);
    });

    it('should handle empty feedback array', () => {
      const metrics = aggregateBuilderMetrics([]);
      expect(metrics.size).toBe(0);
    });
  });

  // ============================================================================
  // SESSION CLEANUP
  // ============================================================================

  describe('cleanupSession', () => {
    it('should clear all session state', () => {
      const injections: MinimalInjection[] = [
        { category: 'test', content: 'Test', priority: 1 },
      ];

      tagInjectionsForTracking(injections, testSessionId);
      analyzeResponseAlignment(testSessionId, testUserId, 'Response', 'casual');

      // Verify data exists
      expect(getSessionFeedback(testSessionId)).toHaveLength(1);

      // Cleanup
      cleanupSession(testSessionId);

      // Verify data is cleared
      expect(getSessionFeedback(testSessionId)).toHaveLength(0);
    });

    it('should handle cleanup of non-existent session', () => {
      // Should not throw
      expect(() => cleanupSession('non-existent-session')).not.toThrow();
    });
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createFeedback(
  builderName: string,
  category: string,
  wasUsedInResponse: boolean,
  responseAlignment: number,
  userReaction: 'positive' | 'neutral' | 'negative'
): InjectionFeedback {
  return {
    trackingId: `inj_test_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'test-session',
    userId: 'test-user',
    category,
    builderName,
    wasUsedInResponse,
    responseAlignment,
    userReaction,
    conversationMode: 'casual',
    priority: '1',
    contentPreview: 'Test content',
    deliveredAt: new Date(),
    capturedAt: new Date(),
  };
}
