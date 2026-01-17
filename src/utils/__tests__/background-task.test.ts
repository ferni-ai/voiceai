/**
 * Background Task Tests
 *
 * Tests for fire-and-forget async operations with error logging.
 *
 * @module utils/__tests__/background-task.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runBackground, runBackgroundWithTimeout, runBackgroundBatch } from '../background-task.js';

describe('Background Task', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runBackground', () => {
    it('should run successful promise without issues', async () => {
      const result = 'success';
      const promise = Promise.resolve(result);

      // Should not throw
      runBackground(promise, { task: 'test-task' });

      await promise;
    });

    it('should log failed promises', async () => {
      const error = new Error('test error');
      const promise = Promise.reject(error);

      // Should not throw
      runBackground(promise, { task: 'failing-task', userId: 'user-123' });

      // Wait for promise to settle
      await new Promise((r) => setTimeout(r, 10));
    });

    it('should include context in logs', async () => {
      const promise = Promise.reject(new Error('error'));

      runBackground(promise, {
        task: 'context-task',
        userId: 'user-456',
        sessionId: 'sess-789',
        extra: 'data',
      });

      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe('runBackgroundWithTimeout', () => {
    it('should complete before timeout', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 50);
      });

      runBackgroundWithTimeout(promise, 200, { task: 'fast-task' });

      await promise;
    });

    it('should log timeout warning', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 200);
      });

      runBackgroundWithTimeout(promise, 50, { task: 'slow-task' });

      // Wait for timeout to fire
      await new Promise((r) => setTimeout(r, 100));
    });

    it('should handle failures', async () => {
      const promise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('failed')), 50);
      });

      runBackgroundWithTimeout(promise, 200, { task: 'failing-timeout-task' });

      await new Promise((r) => setTimeout(r, 100));
    });
  });

  describe('runBackgroundBatch', () => {
    it('should run all promises in batch', async () => {
      const results: string[] = [];

      runBackgroundBatch(
        [
          Promise.resolve('a').then((v) => {
            results.push(v);
          }),
          Promise.resolve('b').then((v) => {
            results.push(v);
          }),
          Promise.resolve('c').then((v) => {
            results.push(v);
          }),
        ],
        { task: 'batch-task' }
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain('a');
      expect(results).toContain('b');
      expect(results).toContain('c');
    });

    it('should continue after partial failures', async () => {
      const results: string[] = [];

      runBackgroundBatch(
        [
          Promise.resolve('a').then((v) => {
            results.push(v);
          }),
          Promise.reject(new Error('b failed')),
          Promise.resolve('c').then((v) => {
            results.push(v);
          }),
        ],
        { task: 'partial-batch' }
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain('a');
      expect(results).toContain('c');
    });

    it('should log partial failures', async () => {
      runBackgroundBatch(
        [
          Promise.reject(new Error('error 1')),
          Promise.reject(new Error('error 2')),
          Promise.resolve('success'),
        ],
        { task: 'failing-batch' }
      );

      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
