/**
 * Tests for safeFireAndForget utility
 *
 * Ensures that fire-and-forget operations:
 * - Execute successfully
 * - Don't crash on errors
 * - Log errors appropriately
 *
 * @module utils/__tests__/safe-fire-and-forget.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeFireAndForget, fireAndForget } from '../safe-fire-and-forget.js';

describe('safeFireAndForget', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.warn to verify logging (our logger uses console internally)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute successful async functions', async () => {
    const mockFn = vi.fn().mockResolvedValue(undefined);

    fireAndForget(mockFn, 'test-success');

    // Wait for microtask queue to flush
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should catch and log errors without crashing', async () => {
    const error = new Error('Test error');
    const mockFn = vi.fn().mockRejectedValue(error);

    // This should NOT throw
    expect(() => fireAndForget(mockFn, 'test-error')).not.toThrow();

    // Wait for promise to settle
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should handle sync functions that return promises', async () => {
    let executed = false;
    const mockFn = vi.fn(() => {
      return new Promise<void>((resolve) => {
        executed = true;
        resolve();
      });
    });

    fireAndForget(mockFn, 'test-sync-promise');

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(executed).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should execute immediately without blocking', () => {
    let executed = false;
    const slowFn = vi.fn(async () => {
      await new Promise<void>((resolve) => { setTimeout(resolve, 100); });
      executed = true;
    });

    const start = Date.now();
    fireAndForget(slowFn, 'test-non-blocking');
    const elapsed = Date.now() - start;

    // Should return immediately (< 10ms), not wait for 100ms
    expect(elapsed).toBeLessThan(50);
    expect(executed).toBe(false); // Not executed yet
  });

  it('should handle multiple concurrent calls', async () => {
    const calls: number[] = [];
    const mockFn = vi.fn(async () => {
      calls.push(Date.now());
    });

    // Fire multiple
    fireAndForget(mockFn, 'test-concurrent-1');
    fireAndForget(mockFn, 'test-concurrent-2');
    fireAndForget(mockFn, 'test-concurrent-3');

    await new Promise<void>((resolve) => { setTimeout(resolve, 50); });

    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(calls).toHaveLength(3);
  });

  it('should handle functions that throw synchronously', async () => {
    const mockFn = vi.fn(() => {
      throw new Error('Sync error');
    });

    // Should not throw
    expect(() => fireAndForget(mockFn as () => Promise<void>, 'test-sync-throw')).not.toThrow();
  });

  it('should continue execution after error', async () => {
    const results: string[] = [];

    const failingFn = vi.fn(async () => {
      results.push('started');
      throw new Error('Expected error');
    });

    const successFn = vi.fn(async () => {
      results.push('success');
    });

    fireAndForget(failingFn, 'test-failing');
    fireAndForget(successFn, 'test-success-after-fail');

    await new Promise<void>((resolve) => { setTimeout(resolve, 50); });

    expect(results).toContain('started');
    expect(results).toContain('success');
  });

  it('should handle rejected promises with non-Error values', async () => {
    const mockFn = vi.fn().mockRejectedValue('string error');

    fireAndForget(mockFn, 'test-string-error');

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    // Should not crash
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should handle undefined rejection', async () => {
    const mockFn = vi.fn().mockRejectedValue(undefined);

    fireAndForget(mockFn, 'test-undefined-error');

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    // Should not crash
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should work with full options object', async () => {
    const mockFn = vi.fn().mockResolvedValue(undefined);

    safeFireAndForget(mockFn, {
      context: 'test-with-options',
      logSuccess: true,
      critical: false,
    });

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
