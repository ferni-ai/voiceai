/**
 * Speculative Persona Preloading Tests
 *
 * Tests the handoff prediction and preloading system that
 * provides "Better than Human" instant handoff performance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock persona insights cache
vi.mock('../../../../intelligence/context-builders/persona-insights-cache.js', () => ({
  preloadPersonaInsights: vi.fn().mockResolvedValue(undefined),
}));

// Mock persona preloader
vi.mock('../../../../personas/bundles/preloader.js', () => ({
  preloadAllBundles: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import {
  predictHandoff,
  analyzeAndPreload,
  clearSpeculativeState,
  getRecentPrediction,
  initializeSpeculativePreloading,
  type SpeculativePreloadContext,
} from '../speculative-preloading.js';
import { preloadPersonaInsights } from '../../../../intelligence/context-builders/persona-insights-cache.js';

describe('Speculative Persona Preloading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearSpeculativeState('test-session');
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSpeculativeState('test-session');
  });

  describe('predictHandoff', () => {
    it('should predict Peter for stock-related queries', () => {
      const prediction = predictHandoff('I want to invest in some stocks', 'ferni');

      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('peter-john');
      expect(prediction!.confidence).toBeGreaterThan(0.5);
      expect(prediction!.matchedTopics).toContain('invest');
      expect(prediction!.matchedTopics).toContain('stocks');
    });

    it('should predict Alex for calendar/email queries', () => {
      const prediction = predictHandoff('Can you schedule a meeting for tomorrow?', 'ferni');

      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('alex-chen');
      expect(prediction!.matchedTopics).toContain('schedule');
      expect(prediction!.matchedTopics).toContain('meeting');
    });

    it('should predict Maya for habit/budget queries', () => {
      const prediction = predictHandoff('I need help with my budget and savings', 'ferni');

      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('maya-santos');
      expect(prediction!.matchedTopics).toContain('budget');
      expect(prediction!.matchedTopics).toContain('savings');
    });

    it('should predict Jordan for vacation/life event queries', () => {
      const prediction = predictHandoff("I'm planning a vacation to Hawaii", 'ferni');

      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('jordan-taylor');
      expect(prediction!.matchedTopics).toContain('vacation');
    });

    it('should predict Nayan for wisdom/philosophy queries', () => {
      const prediction = predictHandoff("I've been reflecting on my purpose in life", 'ferni');

      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('nayan-patel');
      expect(prediction!.matchedTopics).toContain('purpose');
    });

    it('should return null for current persona', () => {
      // When asking about stocks while already with Peter
      const prediction = predictHandoff('Tell me about stock picking', 'peter-john');

      // Should return null since we don't want to predict handoff to current persona
      expect(prediction).toBeNull();
    });

    it('should return null for generic queries with no clear match', () => {
      const prediction = predictHandoff('How are you today?', 'ferni');

      // Generic greeting shouldn't trigger any handoff prediction
      expect(prediction).toBeNull();
    });

    it('should boost confidence for explicit intent signals', () => {
      const withIntent = predictHandoff('Can you help me with my budget?', 'ferni');
      const withoutIntent = predictHandoff('budget', 'ferni');

      // Both should match Maya, but explicit intent should have higher confidence
      expect(withIntent).not.toBeNull();
      expect(withoutIntent).not.toBeNull();
      expect(withIntent!.confidence).toBeGreaterThan(withoutIntent!.confidence);
    });

    it('should cap confidence at 1.0', () => {
      // Query with multiple signals that could boost confidence
      const prediction = predictHandoff(
        'Can you help me invest in stocks and portfolio management? I need to buy shares!',
        'ferni'
      );

      expect(prediction).not.toBeNull();
      expect(prediction!.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('analyzeAndPreload', () => {
    const mockContext: SpeculativePreloadContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      currentPersona: 'ferni',
      buildInsightsFn: vi.fn().mockResolvedValue({
        personaId: 'peter-john',
        userId: 'test-user',
        generatedAt: Date.now(),
      }),
    };

    it('should debounce rapid calls', async () => {
      // Call multiple times rapidly
      analyzeAndPreload('I want stocks', mockContext);
      analyzeAndPreload('I want to invest in stocks', mockContext);
      analyzeAndPreload('I want to buy some stocks today', mockContext);

      // Before debounce fires
      expect(preloadPersonaInsights).not.toHaveBeenCalled();

      // After debounce (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      // Should only have called once (debounced)
      expect(preloadPersonaInsights).toHaveBeenCalledTimes(1);
    });

    it('should trigger preload for high-confidence predictions', async () => {
      analyzeAndPreload('I want to invest in stocks and build a portfolio', mockContext);

      await vi.advanceTimersByTimeAsync(1100);

      expect(preloadPersonaInsights).toHaveBeenCalledWith(
        'test-session',
        'peter-john',
        'test-user',
        expect.any(Function)
      );
    });

    it('should not trigger preload for low-confidence predictions', async () => {
      // Single word match = low confidence
      analyzeAndPreload('stock', mockContext);

      await vi.advanceTimersByTimeAsync(1100);

      // Low confidence shouldn't trigger preload
      expect(preloadPersonaInsights).not.toHaveBeenCalled();
    });

    it('should track recent predictions', async () => {
      analyzeAndPreload('I need help investing in stocks', mockContext);

      await vi.advanceTimersByTimeAsync(1100);

      const recent = getRecentPrediction('test-session');
      expect(recent).not.toBeNull();
      expect(recent!.persona).toBe('peter-john');
    });

    it('should avoid duplicate predictions within 30 seconds', async () => {
      // First prediction
      analyzeAndPreload('I want to invest in stocks', mockContext);
      await vi.advanceTimersByTimeAsync(1100);

      expect(preloadPersonaInsights).toHaveBeenCalledTimes(1);

      // Second call within 30 seconds (same prediction)
      analyzeAndPreload('Tell me about stock investing', mockContext);
      await vi.advanceTimersByTimeAsync(1100);

      // Should still only be 1 call (duplicate skipped)
      expect(preloadPersonaInsights).toHaveBeenCalledTimes(1);
    });

    it('should allow new predictions after 30 seconds', async () => {
      // First prediction
      analyzeAndPreload('I want to invest in stocks', mockContext);
      await vi.advanceTimersByTimeAsync(1100);

      expect(preloadPersonaInsights).toHaveBeenCalledTimes(1);

      // Advance past 30-second window
      await vi.advanceTimersByTimeAsync(31000);

      // Second call after 30 seconds
      analyzeAndPreload('Tell me more about stock investing', mockContext);
      await vi.advanceTimersByTimeAsync(1100);

      // Should now be 2 calls
      expect(preloadPersonaInsights).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearSpeculativeState', () => {
    const mockContext: SpeculativePreloadContext = {
      sessionId: 'clear-test-session',
      userId: 'test-user',
      currentPersona: 'ferni',
      buildInsightsFn: vi.fn().mockResolvedValue({
        personaId: 'peter-john',
        userId: 'test-user',
        generatedAt: Date.now(),
      }),
    };

    it('should clear recent predictions for session', async () => {
      analyzeAndPreload('I want to invest in stocks', mockContext);
      await vi.advanceTimersByTimeAsync(1100);

      expect(getRecentPrediction('clear-test-session')).not.toBeNull();

      clearSpeculativeState('clear-test-session');

      expect(getRecentPrediction('clear-test-session')).toBeNull();
    });

    it('should cancel pending debounce timers', async () => {
      analyzeAndPreload('I want to invest in stocks', mockContext);

      // Clear before debounce fires
      clearSpeculativeState('clear-test-session');

      await vi.advanceTimersByTimeAsync(1100);

      // Should not have called preload because timer was cleared
      expect(preloadPersonaInsights).not.toHaveBeenCalled();
    });
  });

  describe('initializeSpeculativePreloading', () => {
    it('should preload all bundles on initialization', async () => {
      const { preloadAllBundles } = await import('../../../../personas/bundles/preloader.js');

      await initializeSpeculativePreloading();

      expect(preloadAllBundles).toHaveBeenCalled();
    });
  });

  describe('persona ID normalization', () => {
    it('should normalize short persona IDs', () => {
      // Using 'peter' instead of 'peter-john' as current persona
      const prediction = predictHandoff('I want to invest in stocks', 'peter');

      // Should return null since peter = peter-john (normalized)
      expect(prediction).toBeNull();
    });

    it('should normalize legacy persona IDs', () => {
      // Using 'jack-b' instead of 'ferni'
      const prediction = predictHandoff('I want to invest in stocks', 'jack-b');

      // jack-b normalizes to ferni, so Peter should be predicted
      expect(prediction).not.toBeNull();
      expect(prediction!.targetPersona).toBe('peter-john');
    });
  });
});
