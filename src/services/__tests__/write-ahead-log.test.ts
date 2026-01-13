/**
 * Write-Ahead Log Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

import { WriteAheadLog, type WALEntry } from '../write-ahead-log.js';

describe('WriteAheadLog', () => {
  let wal: WriteAheadLog;

  beforeEach(() => {
    vi.clearAllMocks();
    wal = new WriteAheadLog({
      maxQueueSize: 5,
      flushIntervalMs: 100000, // Long interval so we control flushing
      maxRetries: 2,
    });
  });

  afterEach(async () => {
    await wal.shutdown();
  });

  describe('write operations', () => {
    it('should queue write operations', () => {
      const id = wal.set('users', 'user123', { name: 'John' });

      expect(id).toMatch(/^wal_/);
      expect(wal.getStats().queueSize).toBe(1);
    });

    it('should queue multiple operations', () => {
      wal.set('users', 'user1', { name: 'John' });
      wal.update('users', 'user2', { name: 'Jane' });
      wal.merge('users', 'user3', { name: 'Bob' });

      expect(wal.getStats().queueSize).toBe(3);
      expect(wal.getStats().totalQueued).toBe(3);
    });

    it('should auto-flush when queue is full', async () => {
      // Configure batch writer that succeeds
      let flushedCount = 0;
      wal.configureBatchWriter(async (entries) => {
        flushedCount = entries.length;
        return { success: true, failedIds: [] };
      });

      // Queue 5 items (maxQueueSize)
      for (let i = 0; i < 5; i++) {
        wal.set('users', `user${i}`, { index: i });
      }

      // Wait for auto-flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(flushedCount).toBe(5);
      expect(wal.getStats().queueSize).toBe(0);
    });

    it('should prioritize high priority writes', () => {
      wal.set('users', 'low', { p: 'low' }, { priority: 'low' });
      wal.set('users', 'normal', { p: 'normal' }, { priority: 'normal' });
      wal.set('users', 'high', { p: 'high' }, { priority: 'high' });

      const pending = wal.getPendingEntries();
      expect(pending[0].priority).toBe('high');
      expect(pending[1].priority).toBe('normal');
      expect(pending[2].priority).toBe('low');
    });
  });

  describe('flush', () => {
    it('should flush all pending entries', async () => {
      const flushedEntries: WALEntry[] = [];
      wal.configureBatchWriter(async (entries) => {
        flushedEntries.push(...entries);
        return { success: true, failedIds: [] };
      });

      wal.set('users', 'user1', { name: 'John' });
      wal.update('users', 'user2', { age: 30 });

      const result = await wal.flush();

      expect(result.flushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(flushedEntries).toHaveLength(2);
    });

    it('should re-queue failed entries for retry', async () => {
      let callCount = 0;
      wal.configureBatchWriter(async (entries) => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          return { success: false, failedIds: entries.map((e) => e.id) };
        }
        // Second call succeeds
        return { success: true, failedIds: [] };
      });

      wal.set('users', 'user1', { name: 'John' });

      // First flush - fails
      await wal.flush();

      // Entry should be re-queued
      expect(wal.getStats().queueSize).toBe(1);
      expect(wal.getPendingEntries()[0].retryCount).toBe(1);

      // Second flush - succeeds
      await wal.flush();

      expect(wal.getStats().queueSize).toBe(0);
    });

    it('should drop entries after max retries', async () => {
      wal.configureBatchWriter(async (entries) => {
        return { success: false, failedIds: entries.map((e) => e.id) };
      });

      wal.set('users', 'user1', { name: 'John' });

      // Retry 3 times (initial + 2 retries)
      await wal.flush(); // retry 1
      await wal.flush(); // retry 2
      await wal.flush(); // max retries reached, dropped

      expect(wal.getStats().queueSize).toBe(0);
      expect(wal.getStats().totalFailed).toBe(1);
    });

    it('should skip flush if already in progress', async () => {
      let flushStarted = 0;
      wal.configureBatchWriter(async () => {
        flushStarted++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true, failedIds: [] };
      });

      wal.set('users', 'user1', { name: 'John' });
      wal.set('users', 'user2', { name: 'Jane' });

      // Start two flushes concurrently
      const [result1, result2] = await Promise.all([wal.flush(), wal.flush()]);

      // Only one should have processed
      expect(flushStarted).toBe(1);
      expect(result1.flushed + result2.flushed).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track statistics correctly', async () => {
      wal.configureBatchWriter(async () => {
        return { success: true, failedIds: [] };
      });

      wal.set('users', 'user1', { name: 'John' });
      wal.set('users', 'user2', { name: 'Jane' });
      await wal.flush();

      const stats = wal.getStats();
      expect(stats.totalQueued).toBe(2);
      expect(stats.totalFlushed).toBe(2);
      expect(stats.queueSize).toBe(0);
      expect(stats.lastFlushTime).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should flush remaining entries on shutdown', async () => {
      const flushedEntries: WALEntry[] = [];
      wal.configureBatchWriter(async (entries) => {
        flushedEntries.push(...entries);
        return { success: true, failedIds: [] };
      });

      wal.set('users', 'user1', { name: 'John' });

      await wal.shutdown();

      expect(flushedEntries).toHaveLength(1);
    });
  });
});
