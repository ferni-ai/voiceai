/**
 * Session Cleanup Module Tests
 *
 * Tests for the session cleanup service that handles
 * orphaned session cleanup and memory leak prevention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies - must include both getLogger and createLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    serializeError: (e: unknown) => String(e),
  };
});

import {
  initializeCleanup,
  startSessionCleanup,
  stopSessionCleanup,
  cleanupOrphanedSessions,
  isCleanupRunning,
  SESSION_MAX_AGE_MS,
  SESSION_CLEANUP_INTERVAL_MS,
} from '../cleanup.js';
import type { SessionServices } from '../../types.js';

describe('Session Cleanup Module', () => {
  let mockSessions: Map<string, SessionServices>;

  const createMockServices = (sessionId: string, startTimeOffset = 0): SessionServices => {
    return {
      sessionId,
      userId: `user-${sessionId}`,
      sessionStartTime: Date.now() - startTimeOffset,
      endSession: vi.fn().mockResolvedValue(undefined),
      analyze: vi.fn(),
      addTurn: vi.fn(),
      getRecentTurns: vi.fn(() => []),
    } as unknown as SessionServices;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSessions = new Map();
    initializeCleanup(mockSessions);
  });

  afterEach(() => {
    stopSessionCleanup(); // Ensure cleanup is stopped between tests
    vi.useRealTimers();
    mockSessions.clear();
  });

  describe('Constants', () => {
    it('should have valid SESSION_MAX_AGE_MS (4 hours)', () => {
      expect(SESSION_MAX_AGE_MS).toBe(4 * 60 * 60 * 1000);
    });

    it('should have valid SESSION_CLEANUP_INTERVAL_MS (15 minutes)', () => {
      expect(SESSION_CLEANUP_INTERVAL_MS).toBe(15 * 60 * 1000);
    });

    it('should have cleanup interval less than max age', () => {
      expect(SESSION_CLEANUP_INTERVAL_MS).toBeLessThan(SESSION_MAX_AGE_MS);
    });
  });

  describe('startSessionCleanup', () => {
    it('should start the cleanup scheduler', () => {
      expect(isCleanupRunning()).toBe(false);

      startSessionCleanup();

      expect(isCleanupRunning()).toBe(true);
    });

    it('should not start multiple schedulers', () => {
      startSessionCleanup();
      startSessionCleanup(); // Second call should be no-op

      expect(isCleanupRunning()).toBe(true);
    });
  });

  describe('stopSessionCleanup', () => {
    it('should stop the cleanup scheduler', () => {
      startSessionCleanup();
      expect(isCleanupRunning()).toBe(true);

      stopSessionCleanup();

      expect(isCleanupRunning()).toBe(false);
    });

    it('should be safe to call when not running', () => {
      expect(isCleanupRunning()).toBe(false);

      // Should not throw
      stopSessionCleanup();

      expect(isCleanupRunning()).toBe(false);
    });
  });

  describe('isCleanupRunning', () => {
    it('should return false initially', () => {
      expect(isCleanupRunning()).toBe(false);
    });

    it('should return true after starting', () => {
      startSessionCleanup();
      expect(isCleanupRunning()).toBe(true);
    });

    it('should return false after stopping', () => {
      startSessionCleanup();
      stopSessionCleanup();
      expect(isCleanupRunning()).toBe(false);
    });
  });

  describe('cleanupOrphanedSessions', () => {
    it('should return 0 when no sessions exist', async () => {
      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(0);
    });

    it('should not clean up recent sessions', async () => {
      // Create a session that started 1 hour ago (well under max age)
      const recentSession = createMockServices('recent', 1 * 60 * 60 * 1000);
      mockSessions.set('recent', recentSession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(0);
      expect(mockSessions.has('recent')).toBe(true);
      expect(recentSession.endSession).not.toHaveBeenCalled();
    });

    it('should clean up sessions older than SESSION_MAX_AGE_MS', async () => {
      // Create a session that started 5 hours ago (over max age)
      const oldSession = createMockServices('old', 5 * 60 * 60 * 1000);
      mockSessions.set('old', oldSession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(1);
      expect(oldSession.endSession).toHaveBeenCalled();
    });

    it('should only clean up old sessions, keeping recent ones', async () => {
      // Create mix of old and new sessions
      const oldSession = createMockServices('old', 5 * 60 * 60 * 1000);
      const recentSession = createMockServices('recent', 1 * 60 * 60 * 1000);
      mockSessions.set('old', oldSession);
      mockSessions.set('recent', recentSession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(1);
      expect(oldSession.endSession).toHaveBeenCalled();
      expect(recentSession.endSession).not.toHaveBeenCalled();
      expect(mockSessions.has('recent')).toBe(true);
    });

    it('should handle endSession errors and force removal', async () => {
      const failingSession = createMockServices('failing', 5 * 60 * 60 * 1000);
      (failingSession.endSession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Failed to end')
      );
      mockSessions.set('failing', failingSession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(1);
      expect(mockSessions.has('failing')).toBe(false);
    });

    it('should clean up multiple orphaned sessions', async () => {
      const old1 = createMockServices('old1', 5 * 60 * 60 * 1000);
      const old2 = createMockServices('old2', 6 * 60 * 60 * 1000);
      const old3 = createMockServices('old3', 10 * 60 * 60 * 1000);
      mockSessions.set('old1', old1);
      mockSessions.set('old2', old2);
      mockSessions.set('old3', old3);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(3);
    });

    it('should handle sessions at exact boundary', async () => {
      // Create a session exactly at max age - should be cleaned
      const boundarySession = createMockServices('boundary', SESSION_MAX_AGE_MS + 1);
      mockSessions.set('boundary', boundarySession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(1);
    });

    it('should not clean session just under max age', async () => {
      // Create a session just under max age
      const almostOldSession = createMockServices('almostOld', SESSION_MAX_AGE_MS - 1000);
      mockSessions.set('almostOld', almostOldSession);

      const cleaned = await cleanupOrphanedSessions();

      expect(cleaned).toBe(0);
      expect(mockSessions.has('almostOld')).toBe(true);
    });
  });

  describe('Periodic Cleanup Integration', () => {
    it('should run cleanup at specified interval', async () => {
      const oldSession = createMockServices('old', 5 * 60 * 60 * 1000);
      mockSessions.set('old', oldSession);

      startSessionCleanup();

      // Advance time to trigger cleanup
      await vi.advanceTimersByTimeAsync(SESSION_CLEANUP_INTERVAL_MS);

      // Cleanup should have been triggered
      expect(oldSession.endSession).toHaveBeenCalled();
    });

    it('should run cleanup multiple times', async () => {
      startSessionCleanup();

      // Add session after first interval
      await vi.advanceTimersByTimeAsync(SESSION_CLEANUP_INTERVAL_MS);

      const oldSession = createMockServices('old', 5 * 60 * 60 * 1000);
      mockSessions.set('old', oldSession);

      // Advance to next cleanup
      await vi.advanceTimersByTimeAsync(SESSION_CLEANUP_INTERVAL_MS);

      expect(oldSession.endSession).toHaveBeenCalled();
    });
  });
});

describe('Session Cleanup Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopSessionCleanup();
    vi.useRealTimers();
  });

  it('should handle cleanup before initialization', async () => {
    // This tests the warning path when cleanup is called without init
    // The function should return 0 and not throw
    const result = await cleanupOrphanedSessions();
    expect(result).toBe(0);
  });
});
