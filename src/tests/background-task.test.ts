/**
 * Background Task Tests
 *
 * Tests for background task utilities:
 * - runBackground: fire-and-forget with error logging
 * - runBackgroundWithTimeout: with timeout warning
 * - runBackgroundBatch: multiple tasks with aggregated logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runBackground,
  runBackgroundWithTimeout,
  runBackgroundBatch,
} from '../utils/background-task.js';

// Mock the logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

describe('Background Task Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runBackground', () => {
    it('should execute promise without blocking', async () => {
      const fn = vi.fn().mockResolvedValue('done');
      const promise = fn();

      runBackground(promise, { task: 'testTask' });

      // Should not block
      expect(fn).toHaveBeenCalled();

      // Wait for promise to resolve
      await promise;
    });

    it('should log warning on failure', async () => {
      const error = new Error('task failed');
      const promise = Promise.reject(error);

      runBackground(promise, { task: 'failingTask', userId: 'user-123' });

      // Wait for the catch handler to execute
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'failingTask',
          userId: 'user-123',
          err: 'Error: task failed',
        }),
        'Background task failed: failingTask'
      );
    });

    it('should include context in error logs', async () => {
      const promise = Promise.reject(new Error('oops'));

      runBackground(promise, {
        task: 'contextTask',
        sessionId: 'session-456',
        attempt: 3,
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'contextTask',
          sessionId: 'session-456',
          attempt: 3,
        }),
        expect.any(String)
      );
    });

    it('should not throw on success', async () => {
      const promise = Promise.resolve('success');

      expect(() => runBackground(promise, { task: 'successTask' })).not.toThrow();

      await promise;
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('runBackgroundWithTimeout', () => {
    it('should not warn if task completes before timeout', async () => {
      vi.useFakeTimers();

      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 100);
      });

      runBackgroundWithTimeout(promise, 5000, { task: 'fastTask' });

      // Advance past task completion but before timeout
      vi.advanceTimersByTime(200);
      await Promise.resolve(); // Flush promises

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should warn if task exceeds timeout', async () => {
      vi.useFakeTimers();

      // Promise that takes 10 seconds
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 10000);
      });

      runBackgroundWithTimeout(promise, 1000, { task: 'slowTask' });

      // Advance past timeout
      vi.advanceTimersByTime(1100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'slowTask',
          timeoutMs: 1000,
        }),
        'Background task timed out: slowTask'
      );
    });

    it('should log debug if task completes after timeout', async () => {
      vi.useFakeTimers();

      // Promise that takes 2 seconds
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      runBackgroundWithTimeout(promise, 1000, { task: 'lateTask' });

      // Advance past timeout
      vi.advanceTimersByTime(1100);
      expect(mockLogger.warn).toHaveBeenCalled();

      // Now resolve the promise
      resolvePromise!();
      await Promise.resolve();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'lateTask',
        }),
        'Background task completed after timeout: lateTask'
      );
    });

    it('should log warning on failure regardless of timeout', async () => {
      vi.useFakeTimers();

      const promise = new Promise((_, reject) => setTimeout(() => reject(new Error('error')), 100));

      runBackgroundWithTimeout(promise, 5000, { task: 'failTask' });

      // Advance time and flush all pending promises/timers
      vi.advanceTimersByTime(200);
      await vi.runAllTimersAsync();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'failTask',
          err: 'Error: error',
        }),
        'Background task failed: failTask'
      );
    });
  });

  describe('runBackgroundBatch', () => {
    it('should not log if all tasks succeed', async () => {
      const promises = [Promise.resolve('a'), Promise.resolve('b'), Promise.resolve('c')];

      runBackgroundBatch(promises, { task: 'batchTask' });

      await Promise.allSettled(promises);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log partial failures', async () => {
      const promises = [
        Promise.resolve('a'),
        Promise.reject(new Error('fail1')),
        Promise.resolve('c'),
        Promise.reject(new Error('fail2')),
      ];

      runBackgroundBatch(promises, { task: 'batchTask', batchId: 'batch-1' });

      await Promise.allSettled(promises);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'batchTask',
          batchId: 'batch-1',
          total: 4,
          failed: 2,
          errors: expect.arrayContaining(['Error: fail1', 'Error: fail2']),
        }),
        'Background batch partially failed: batchTask'
      );
    });

    it('should log if all tasks fail', async () => {
      const promises = [Promise.reject(new Error('fail1')), Promise.reject(new Error('fail2'))];

      runBackgroundBatch(promises, { task: 'allFailTask' });

      await Promise.allSettled(promises);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2,
          failed: 2,
        }),
        expect.any(String)
      );
    });

    it('should handle empty batch', async () => {
      runBackgroundBatch([], { task: 'emptyBatch' });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});
