/**
 * ONNX Session Initialization Stress Test
 *
 * Validates that the session readiness tracking and exponential backoff
 * prevent "Session not initialized" race conditions during concurrent access.
 *
 * @module tools/intelligence/__tests__/onnx-stress.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock external dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../classifier-boundary.js', () => ({
  FTISDecisionBoundary: class MockDecisionBoundary {
    isReady() {
      return false;
    }
  },
  getFTISDecisionBoundary: () => new (class {
    isReady() {
      return false;
    }
  })(),
}));

vi.mock('../classifier-calibration.js', () => ({
  FTISCalibration: class MockCalibration {
    isReady() {
      return false;
    }
  },
  getFTISCalibration: () => new (class {
    isReady() {
      return false;
    }
  })(),
}));

// Import the session tracker for testing
import {
  getSessionReadinessTracker,
  retryWithBackoff,
} from '../../../utils/transformers-loader.js';

describe('Session Readiness Tracker', () => {
  let sessionTracker: ReturnType<typeof getSessionReadinessTracker>;

  beforeEach(() => {
    sessionTracker = getSessionReadinessTracker();
    sessionTracker.clear();
  });

  afterEach(() => {
    sessionTracker.clear();
    vi.clearAllMocks();
  });

  describe('registerSession', () => {
    it('should register a new session', () => {
      sessionTracker.registerSession('test-session');
      expect(sessionTracker.isReady('test-session')).toBe(false);
    });

    it('should not re-register an existing session', () => {
      sessionTracker.registerSession('test-session');
      sessionTracker.registerSession('test-session');
      const status = sessionTracker.getStatus();
      expect(status.sessions.length).toBe(1);
    });
  });

  describe('markReady', () => {
    it('should mark a session as ready', () => {
      sessionTracker.registerSession('test-session');
      sessionTracker.markReady('test-session');
      expect(sessionTracker.isReady('test-session')).toBe(true);
    });
  });

  describe('markFailed', () => {
    it('should mark a session as failed', async () => {
      sessionTracker.registerSession('test-session');
      sessionTracker.markFailed('test-session', new Error('Test error'));
      const status = sessionTracker.getStatus();
      expect(status.anyFailed).toBe(true);
      // Wait for rejected promise to be handled
      await expect(sessionTracker.waitForSession('test-session')).rejects.toThrow('Test error');
    });
  });

  describe('waitForSession', () => {
    it('should resolve immediately if session is ready', async () => {
      sessionTracker.registerSession('test-session');
      sessionTracker.markReady('test-session');
      await expect(sessionTracker.waitForSession('test-session')).resolves.toBeUndefined();
    });

    it('should wait for session to become ready', async () => {
      sessionTracker.registerSession('test-session');

      // Mark ready after a short delay
      setTimeout(() => sessionTracker.markReady('test-session'), 50);

      const start = Date.now();
      await sessionTracker.waitForSession('test-session');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(200);
    });

    it('should throw if session is already failed', async () => {
      sessionTracker.registerSession('test-session-failed');
      // Mark failed - this rejects the internal promise
      sessionTracker.markFailed('test-session-failed', new Error('Init failed'));
      // Waiting should throw the same error
      await expect(sessionTracker.waitForSession('test-session-failed')).rejects.toThrow(
        'Init failed'
      );
    });

    it('should timeout if session never becomes ready', async () => {
      sessionTracker.registerSession('test-session');
      await expect(sessionTracker.waitForSession('test-session', 100)).rejects.toThrow(
        'initialization timed out'
      );
    });
  });

  describe('getStatus', () => {
    it('should report all sessions status', () => {
      sessionTracker.registerSession('session-1');
      sessionTracker.registerSession('session-2');
      sessionTracker.markReady('session-1');

      const status = sessionTracker.getStatus();

      expect(status.sessions.length).toBe(2);
      expect(status.allReady).toBe(false);
      expect(status.anyFailed).toBe(false);
    });

    it('should track warmup attempts', () => {
      sessionTracker.registerSession('test-session');
      sessionTracker.recordWarmupAttempt('test-session');
      sessionTracker.recordWarmupAttempt('test-session');

      const status = sessionTracker.getStatus();
      const session = status.sessions.find((s) => s.id === 'test-session');
      expect(session?.warmupAttempts).toBe(2);
    });
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Session not initialized'))
      .mockRejectedValueOnce(new Error('Session not initialized'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: (error) => String(error).includes('Session not initialized'),
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Session not initialized'));

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        shouldRetry: () => true,
      })
    ).rejects.toThrow('Session not initialized');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if shouldRetry returns false', async () => {
    let callCount = 0;
    // Use "Permanent error" which does NOT contain "retryable"
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.reject(new Error('Permanent error'));
    });

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 5,
        baseDelayMs: 10,
        shouldRetry: (error) => {
          // Only retry if error message contains "retryable"
          return String(error).includes('retryable');
        },
      })
    ).rejects.toThrow('Permanent error');

    // Should have been called exactly once since shouldRetry returns false
    expect(callCount).toBe(1);
  });

  it('should call onRetry callback', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Retry me'))
      .mockResolvedValue('success');
    const onRetry = vi.fn();

    await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('should use exponential backoff with jitter', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Retry'))
      .mockRejectedValueOnce(new Error('Retry'))
      .mockResolvedValue('success');

    const start = Date.now();
    await retryWithBackoff(fn, {
      maxRetries: 5,
      baseDelayMs: 20,
      maxDelayMs: 200,
    });
    const elapsed = Date.now() - start;

    // First retry: ~20-30ms (20 * 1 + jitter)
    // Second retry: ~40-60ms (20 * 2 + jitter)
    // Total: ~60-90ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('Concurrent Session Access (Stress Test)', () => {
  let sessionTracker: ReturnType<typeof getSessionReadinessTracker>;

  beforeEach(() => {
    sessionTracker = getSessionReadinessTracker();
    sessionTracker.clear();
  });

  afterEach(() => {
    sessionTracker.clear();
  });

  it('should handle 100 concurrent waiters', async () => {
    const sessionId = 'stress-test-session';
    sessionTracker.registerSession(sessionId);

    // Create 100 concurrent waiters
    const waiters = Array.from({ length: 100 }, () =>
      sessionTracker.waitForSession(sessionId, 5000)
    );

    // Mark ready after a short delay
    setTimeout(() => sessionTracker.markReady(sessionId), 50);

    // All waiters should resolve
    const results = await Promise.allSettled(waiters);
    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes.length).toBe(100);
  });

  it('should handle multiple sessions concurrently', async () => {
    const sessionIds = ['session-1', 'session-2', 'session-3'];
    sessionIds.forEach((id) => sessionTracker.registerSession(id));

    // Create waiters for each session
    const waiters = sessionIds.flatMap((id) =>
      Array.from({ length: 10 }, () => sessionTracker.waitForSession(id, 5000))
    );

    // Mark sessions ready with staggered timing
    setTimeout(() => sessionTracker.markReady('session-1'), 30);
    setTimeout(() => sessionTracker.markReady('session-2'), 50);
    setTimeout(() => sessionTracker.markReady('session-3'), 70);

    const results = await Promise.allSettled(waiters);
    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes.length).toBe(30);
  });

  it('should not have race condition when session is marked ready during wait', async () => {
    const sessionId = 'race-test';
    sessionTracker.registerSession(sessionId);

    // Start waiting and mark ready almost simultaneously
    const waitPromise = sessionTracker.waitForSession(sessionId, 1000);

    // Use setImmediate to ensure we're in a different tick
    setImmediate(() => sessionTracker.markReady(sessionId));

    await expect(waitPromise).resolves.toBeUndefined();
    expect(sessionTracker.isReady(sessionId)).toBe(true);
  });
});
