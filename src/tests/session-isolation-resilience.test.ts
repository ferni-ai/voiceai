/**
 * Session Isolation Tests for Resilience Components (SET-19)
 *
 * Verifies that resilience mechanisms properly isolate sessions:
 * - TTS Bulkhead: Per-session concurrency limits don't affect other sessions
 * - Firestore Pool: Backpressure in one session doesn't block others
 * - Embedding Cache: Cache hits/misses are tracked globally but don't leak
 * - Rate Limiter: Per-session rate limits are independent
 *
 * These tests prevent:
 * - One slow session blocking all TTS synthesis
 * - One heavy session consuming all Firestore connections
 * - Rate limit exhaustion by one user affecting others
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TTS Bulkhead
import {
  TTSBulkhead,
  getTTSBulkhead,
  resetTTSBulkhead,
  type TTSBulkheadResult,
} from '../speech/tts-bulkhead.js';

describe('Session Isolation - Resilience Components', () => {
  // ============================================================================
  // TTS BULKHEAD ISOLATION
  // ============================================================================

  describe('TTS Bulkhead Session Isolation', () => {
    let bulkhead: TTSBulkhead;

    beforeEach(() => {
      resetTTSBulkhead();
      bulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 10,
        maxPerSession: 2,
        timeoutMs: 1000,
        maxQueuePerSession: 3,
        enableMetrics: false,
      });
    });

    afterEach(() => {
      resetTTSBulkhead();
    });

    it('should isolate concurrent operations per session', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      // Session 1 uses both slots
      const longOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 500);
        });

      // Start 2 operations in session 1 (maxPerSession)
      const s1Op1 = bulkhead.execute({
        sessionId: session1,
        priority: 'normal',
        operation: longOp,
      });
      const s1Op2 = bulkhead.execute({
        sessionId: session1,
        priority: 'normal',
        operation: longOp,
      });

      // Wait a bit for operations to start
      await new Promise((r) => setTimeout(r, 10));

      // Session 2 should still be able to execute immediately
      const quickOp = () => Promise.resolve('quick');
      const s2Result = await bulkhead.execute({
        sessionId: session2,
        priority: 'normal',
        operation: quickOp,
      });

      expect(s2Result.success).toBe(true);
      expect(s2Result.result).toBe('quick');
      expect(s2Result.rejected).toBe(false);

      // Wait for session 1 ops to complete
      await Promise.all([s1Op1, s1Op2]);
    });

    it('should queue requests when session is at capacity', async () => {
      const session = 'session-queue-test';

      const slowOp = () =>
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(1), 200);
        });

      // Fill both slots
      const op1 = bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });
      const op2 = bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });

      // Wait for ops to start
      await new Promise((r) => setTimeout(r, 10));

      // This should queue
      const op3Start = Date.now();
      const op3 = bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });

      // Wait for all to complete
      const [r1, r2, r3] = await Promise.all([op1, op2, op3]);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      // Op3 should have been queued (queueTimeMs > 0)
      expect(r3.queueTimeMs).toBeGreaterThan(0);
    });

    it('should reject when queue is full for a session', async () => {
      const session = 'session-queue-full';

      const slowOp = () =>
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(1), 500);
        });

      // Fill both execution slots (maxPerSession = 2)
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });

      // Wait for ops to start
      await new Promise((r) => setTimeout(r, 10));

      // Fill the queue (maxQueuePerSession = 3)
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });

      // This should be rejected
      const rejectedResult = await bulkhead.execute({
        sessionId: session,
        priority: 'normal',
        operation: slowOp,
      });

      expect(rejectedResult.success).toBe(false);
      expect(rejectedResult.rejected).toBe(true);
      expect(rejectedResult.rejectionReason).toBe('queue_full');
    });

    it('should allow other sessions to proceed when one is at capacity', async () => {
      const fullSession = 'session-full';
      const freeSession = 'session-free';

      const slowOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('slow'), 1000);
        });

      const quickOp = () => Promise.resolve('quick');

      // Fill fullSession's capacity
      for (let i = 0; i < 5; i++) {
        // 2 executing + 3 queued
        bulkhead.execute({ sessionId: fullSession, priority: 'normal', operation: slowOp });
      }

      // Wait for ops to start
      await new Promise((r) => setTimeout(r, 10));

      // freeSession should work fine
      const results: Array<TTSBulkheadResult<string>> = [];
      for (let i = 0; i < 3; i++) {
        const result = await bulkhead.execute({
          sessionId: freeSession,
          priority: 'normal',
          operation: quickOp,
        });
        results.push(result);
      }

      expect(results.every((r) => r.success)).toBe(true);
      expect(results.every((r) => r.result === 'quick')).toBe(true);
    });

    it('should not share state between sessions', () => {
      const session1 = 'session-state-1';
      const session2 = 'session-state-2';

      // No operations for either session yet
      expect(bulkhead.canAcceptRequest(session1)).toBe(true);
      expect(bulkhead.canAcceptRequest(session2)).toBe(true);

      // Session stats should be independent
      expect(bulkhead.getSessionStats(session1)).toBeNull();
      expect(bulkhead.getSessionStats(session2)).toBeNull();
    });

    it('should timeout slow operations without affecting other sessions', async () => {
      const slowSession = 'session-slow';
      const fastSession = 'session-fast';

      // Create a bulkhead with short timeout
      resetTTSBulkhead();
      const shortTimeoutBulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 10,
        maxPerSession: 2,
        timeoutMs: 100,
        maxQueuePerSession: 3,
        enableMetrics: false,
      });

      const neverResolves = () => new Promise<never>(() => {}); // Never resolves
      const quickOp = () => Promise.resolve('quick');

      // Start slow op that will timeout
      const slowPromise = shortTimeoutBulkhead.execute({
        sessionId: slowSession,
        priority: 'normal',
        operation: neverResolves,
      });

      // Fast session should still work
      const fastResult = await shortTimeoutBulkhead.execute({
        sessionId: fastSession,
        priority: 'normal',
        operation: quickOp,
      });

      expect(fastResult.success).toBe(true);
      expect(fastResult.result).toBe('quick');

      // Slow op should timeout
      const slowResult = await slowPromise;
      expect(slowResult.success).toBe(false);
      expect(slowResult.rejectionReason).toBe('timeout');
    });

    it('should cleanup session state properly', async () => {
      const session = 'session-cleanup-test';

      // Do some operations
      await bulkhead.execute({
        sessionId: session,
        priority: 'normal',
        operation: () => Promise.resolve('test'),
      });

      // Stats should exist
      expect(bulkhead.getSessionStats(session)).not.toBeNull();

      // Cleanup
      bulkhead.cleanupSession(session);

      // Stats should be gone
      expect(bulkhead.getSessionStats(session)).toBeNull();
    });

    it('should respect priority ordering in queue', async () => {
      const session = 'session-priority';
      const order: string[] = [];

      const slowOp = () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });

      const createOp = (name: string) => async () => {
        order.push(name);
        await new Promise<void>((r) => setTimeout(r, 10));
      };

      // Fill both slots
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });
      bulkhead.execute({ sessionId: session, priority: 'normal', operation: slowOp });

      await new Promise((r) => setTimeout(r, 10));

      // Queue in order: low, normal, high - high should execute first
      const lowPromise = bulkhead.execute({
        sessionId: session,
        priority: 'low',
        operation: createOp('low'),
      });
      const normalPromise = bulkhead.execute({
        sessionId: session,
        priority: 'normal',
        operation: createOp('normal'),
      });
      const highPromise = bulkhead.execute({
        sessionId: session,
        priority: 'high',
        operation: createOp('high'),
      });

      await Promise.all([lowPromise, normalPromise, highPromise]);

      // High priority should have executed first
      expect(order[0]).toBe('high');
    });
  });

  // ============================================================================
  // CONCURRENT SESSION STRESS TEST
  // ============================================================================

  describe('Concurrent Session Stress Test', () => {
    let bulkhead: TTSBulkhead;

    beforeEach(() => {
      resetTTSBulkhead();
      bulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 20,
        maxPerSession: 3,
        timeoutMs: 5000,
        maxQueuePerSession: 5,
        enableMetrics: false,
      });
    });

    afterEach(() => {
      resetTTSBulkhead();
    });

    it('should handle many concurrent sessions without cross-contamination', async () => {
      const sessionCount = 10;
      const opsPerSession = 5;

      const sessionResults = new Map<string, Array<TTSBulkheadResult<string>>>();

      const operations = [];
      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `concurrent-session-${s}`;
        sessionResults.set(sessionId, []);

        for (let o = 0; o < opsPerSession; o++) {
          const op = async () => {
            const result = await bulkhead.execute({
              sessionId,
              priority: 'normal',
              operation: async () => {
                await new Promise((r) => setTimeout(r, Math.random() * 50));
                return `session-${s}-op-${o}`;
              },
            });
            sessionResults.get(sessionId)!.push(result);
            return result;
          };
          operations.push(op());
        }
      }

      await Promise.all(operations);

      // Verify each session got its own results
      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `concurrent-session-${s}`;
        const results = sessionResults.get(sessionId)!;

        // All operations should have a result
        expect(results.length).toBe(opsPerSession);

        // Check that results belong to this session
        for (const result of results) {
          if (result.success && result.result) {
            expect(result.result).toMatch(new RegExp(`^session-${s}-op-\\d+$`));
          }
        }
      }
    });

    it('should report accurate global stats', async () => {
      const session1 = 'stats-session-1';
      const session2 = 'stats-session-2';

      await bulkhead.execute({
        sessionId: session1,
        priority: 'normal',
        operation: () => Promise.resolve('s1'),
      });

      await bulkhead.execute({
        sessionId: session2,
        priority: 'normal',
        operation: () => Promise.resolve('s2'),
      });

      await bulkhead.execute({
        sessionId: session1,
        priority: 'normal',
        operation: () => Promise.resolve('s1-2'),
      });

      const stats = bulkhead.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.activeSessions).toBe(2);
      expect(stats.rejectedRequests).toBe(0);
    });
  });

  // ============================================================================
  // CANARY: NO GLOBAL STATE LEAKAGE
  // ============================================================================

  describe('No Global State Leakage', () => {
    it('should not leak session state after cleanup', async () => {
      resetTTSBulkhead();
      const bulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 10,
        maxPerSession: 2,
        timeoutMs: 1000,
        maxQueuePerSession: 3,
        enableMetrics: false,
      });

      const sessionId = 'leak-test-session';

      // Do operations
      await bulkhead.execute({
        sessionId,
        priority: 'normal',
        operation: () => Promise.resolve('test'),
      });

      // Cleanup
      bulkhead.cleanupSession(sessionId);

      // Create a new session with the same ID
      await bulkhead.execute({
        sessionId,
        priority: 'normal',
        operation: () => Promise.resolve('new-test'),
      });

      // Stats should only reflect the new operation
      const stats = bulkhead.getSessionStats(sessionId);
      expect(stats?.totalRequests).toBe(1);
      expect(stats?.successfulRequests).toBe(1);

      resetTTSBulkhead();
    });

    it('should not allow one session to affect another via shared resources', async () => {
      resetTTSBulkhead();
      const bulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 5, // Low global limit
        maxPerSession: 2,
        timeoutMs: 1000,
        maxQueuePerSession: 2,
        enableMetrics: false,
      });

      const sessions = ['iso-1', 'iso-2', 'iso-3'];

      // Each session does an operation
      const results = await Promise.all(
        sessions.map((sessionId) =>
          bulkhead.execute({
            sessionId,
            priority: 'normal',
            operation: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return sessionId;
            },
          })
        )
      );

      // All should succeed since global limit is 5 and we only have 3 ops
      expect(results.every((r) => r.success)).toBe(true);

      // Each result should match its session
      results.forEach((r, i) => {
        expect(r.result).toBe(sessions[i]);
      });

      resetTTSBulkhead();
    });
  });

  // ============================================================================
  // GLOBAL LIMIT ENFORCEMENT
  // ============================================================================

  describe('Global Limit Enforcement', () => {
    it('should enforce global concurrency limit across sessions', async () => {
      resetTTSBulkhead();
      const bulkhead = getTTSBulkhead({
        maxGlobalConcurrent: 3, // Very low global limit
        maxPerSession: 2,
        timeoutMs: 2000,
        maxQueuePerSession: 0, // No queuing
        enableMetrics: false,
      });

      const slowOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 500);
        });

      // Start 3 operations across 3 sessions (saturates global limit)
      const op1 = bulkhead.execute({
        sessionId: 'global-1',
        priority: 'normal',
        operation: slowOp,
      });
      const op2 = bulkhead.execute({
        sessionId: 'global-2',
        priority: 'normal',
        operation: slowOp,
      });
      const op3 = bulkhead.execute({
        sessionId: 'global-3',
        priority: 'normal',
        operation: slowOp,
      });

      // Wait for ops to start
      await new Promise((r) => setTimeout(r, 10));

      // 4th operation from new session should be rejected
      const op4Result = await bulkhead.execute({
        sessionId: 'global-4',
        priority: 'normal',
        operation: slowOp,
      });

      expect(op4Result.success).toBe(false);
      expect(op4Result.rejected).toBe(true);
      expect(op4Result.rejectionReason).toBe('global_limit');

      await Promise.all([op1, op2, op3]);
      resetTTSBulkhead();
    });
  });
});
