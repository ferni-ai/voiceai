/**
 * Progressive Executor Tests
 *
 * Tests the progressive feedback system that provides user acknowledgment
 * during slow operations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock circuit breaker
vi.mock('../circuit-breaker.js', () => ({
  circuitBreaker: {
    shouldSkip: vi.fn(() => false),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordLatency: vi.fn(),
  },
}));

// Import after mocks
import {
  executeWithProgressiveFeedback,
  makeProgressive,
  DEFAULT_PROGRESSIVE_CONFIG,
  ACKNOWLEDGMENTS,
  UPDATES,
  APOLOGIES,
} from '../progressive-executor.js';
import { toolCache } from '../tool-cache.js';
import { circuitBreaker } from '../circuit-breaker.js';

describe('Progressive Executor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toolCache.clear();
    vi.clearAllMocks();
    // Reset mock implementations to defaults (clearAllMocks only clears call history)
    vi.mocked(circuitBreaker.shouldSkip).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWithProgressiveFeedback', () => {
    it('should execute fast operations without feedback', async () => {
      const feedbackMock = vi.fn();
      const executor = vi.fn().mockResolvedValue('result');

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock);

      // Fast resolution
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(result.usedFallback).toBe(false);
      expect(result.source).toBe('live');
      expect(feedbackMock).not.toHaveBeenCalled();
    });

    it('should send acknowledgment for slow operations', async () => {
      const feedbackMock = vi.fn();
      let resolveExecutor: (value: string) => void;
      const executor = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveExecutor = resolve;
          })
      );

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock, {
        acknowledgmentAt: 1000,
        updateAt: 3000,
        hardTimeout: 5000,
      });

      // Advance past acknowledgment threshold
      await vi.advanceTimersByTimeAsync(1500);

      expect(feedbackMock).toHaveBeenCalledTimes(1);
      expect(feedbackMock).toHaveBeenCalledWith(expect.any(String), 'acknowledgment');

      // Resolve before update
      resolveExecutor!('result');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(feedbackMock).toHaveBeenCalledTimes(1); // No update sent
    });

    it('should send update for very slow operations', async () => {
      const feedbackMock = vi.fn();
      let resolveExecutor: (value: string) => void;
      const executor = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveExecutor = resolve;
          })
      );

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock, {
        acknowledgmentAt: 1000,
        updateAt: 3000,
        hardTimeout: 10000,
      });

      // Advance past acknowledgment
      await vi.advanceTimersByTimeAsync(1500);
      expect(feedbackMock).toHaveBeenCalledTimes(1);

      // Advance past update threshold
      await vi.advanceTimersByTimeAsync(2000);
      expect(feedbackMock).toHaveBeenCalledTimes(2);
      expect(feedbackMock).toHaveBeenLastCalledWith(expect.any(String), 'update');

      // Resolve
      resolveExecutor!('result');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
    });

    it('should timeout and return cached data if available', async () => {
      const feedbackMock = vi.fn();
      const executor = vi.fn(
        () => new Promise<string>(() => {}) // Never resolves
      );

      // Pre-populate cache
      toolCache.set('testTool', 'default-query', { value: 'cached' }, 'news');

      const resultPromise = executeWithProgressiveFeedback(
        'testTool',
        executor,
        feedbackMock,
        { hardTimeout: 2000, acknowledgmentAt: 5000 } // Delay acknowledgment past timeout
      );

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(2500);

      const result = await resultPromise;

      expect(result.usedFallback).toBe(true);
      expect(result.source).toBe('cache');
      expect(result.data).toEqual({ value: 'cached' });
    });

    it('should return error on timeout with no cache', async () => {
      const feedbackMock = vi.fn();
      const executor = vi.fn(
        () => new Promise<string>(() => {}) // Never resolves
      );

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock, {
        hardTimeout: 2000,
      });

      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.usedFallback).toBe(true);
      expect(result.source).toBe('fallback');
      expect(result.error).toBeDefined();
    });

    it('should handle executor errors gracefully', async () => {
      const feedbackMock = vi.fn();
      const executor = vi.fn().mockRejectedValue(new Error('API error'));

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should try fallback strategies
      expect(result.usedFallback).toBe(true);
    });

    it('should fall back to stale cache on error', async () => {
      const feedbackMock = vi.fn();
      const executor = vi.fn().mockRejectedValue(new Error('API error'));

      // Pre-populate cache
      toolCache.set('testTool', 'default-query', { value: 'stale' }, 'news');

      const resultPromise = executeWithProgressiveFeedback('testTool', executor, feedbackMock);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.usedFallback).toBe(true);
      expect(result.source).toBe('cache');
      expect(result.data).toEqual({ value: 'stale' });
    });

    it('should record metrics to circuit breaker', async () => {
      const executor = vi.fn().mockResolvedValue('result');

      const resultPromise = executeWithProgressiveFeedback('testTool', executor);

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(circuitBreaker.recordLatency).toHaveBeenCalledWith('testTool', expect.any(Number));
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('testTool');
    });

    it('should use circuit breaker fallback when circuit is open', async () => {
      vi.mocked(circuitBreaker.shouldSkip).mockReturnValue(true);

      // Pre-populate cache
      toolCache.set('testTool', 'default-query', { value: 'cached' }, 'news');

      const executor = vi.fn();

      const result = await executeWithProgressiveFeedback('testTool', executor);

      expect(executor).not.toHaveBeenCalled();
      expect(result.usedFallback).toBe(true);
      expect(result.source).toBe('cache');
    });
  });

  describe('makeProgressive', () => {
    it('should wrap a function with progressive feedback', async () => {
      const feedbackMock = vi.fn();
      const originalFn = vi.fn().mockResolvedValue('result');

      const progressiveFn = makeProgressive('testTool', originalFn, {
        acknowledgmentAt: 1000,
        hardTimeout: 5000,
      });

      // makeProgressive puts feedback first, then args
      const resultPromise = progressiveFn(feedbackMock, 'arg1', 'arg2');

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
    });
  });

  describe('DEFAULT_PROGRESSIVE_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_PROGRESSIVE_CONFIG.silentWindow).toBe(1500);
      expect(DEFAULT_PROGRESSIVE_CONFIG.acknowledgmentAt).toBe(2000);
      expect(DEFAULT_PROGRESSIVE_CONFIG.updateAt).toBe(5000);
      expect(DEFAULT_PROGRESSIVE_CONFIG.hardTimeout).toBe(8000);
      expect(DEFAULT_PROGRESSIVE_CONFIG.fallbackStrategy).toBe('cache');
    });
  });

  describe('Feedback Message Objects', () => {
    it('should have acknowledgment messages for various categories', () => {
      expect(ACKNOWLEDGMENTS).toHaveProperty('news');
      expect(ACKNOWLEDGMENTS).toHaveProperty('weather');
      expect(ACKNOWLEDGMENTS).toHaveProperty('stocks');
      expect(ACKNOWLEDGMENTS).toHaveProperty('default');

      expect(ACKNOWLEDGMENTS.news.length).toBeGreaterThan(0);
      expect(ACKNOWLEDGMENTS.default.length).toBeGreaterThan(0);
    });

    it('should have update messages for various categories', () => {
      expect(UPDATES).toHaveProperty('news');
      expect(UPDATES).toHaveProperty('default');

      expect(UPDATES.news.length).toBeGreaterThan(0);
      expect(UPDATES.default.length).toBeGreaterThan(0);
    });

    it('should have apology messages for various categories', () => {
      expect(APOLOGIES).toHaveProperty('news');
      expect(APOLOGIES).toHaveProperty('default');

      expect(APOLOGIES.news.length).toBeGreaterThan(0);
      expect(APOLOGIES.default.length).toBeGreaterThan(0);
    });
  });
});
