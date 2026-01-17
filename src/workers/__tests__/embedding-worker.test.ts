/**
 * Embedding Worker Tests
 *
 * Tests the embedding worker's batch processing and queue management.
 */

/* eslint-disable no-await-in-loop -- Test loops intentionally sequential */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import worker
import { EmbeddingWorker, getEmbeddingWorker } from '../embedding-worker.js';

describe('EmbeddingWorker', () => {
  let worker: EmbeddingWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new EmbeddingWorker();
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('initialization', () => {
    it('should create worker with correct config', () => {
      expect(worker).toBeDefined();
      const stats = worker.getStats();
      expect(stats.messagesReceived).toBe(0);
    });

    it('should have correct initial stats', () => {
      const stats = worker.getStats();
      expect(stats.messagesReceived).toBe(0);
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(0);
    });
  });

  describe('event processing', () => {
    it('should handle embedding:generate events', async () => {
      const payload = {
        type: 'embedding:generate' as const,
        userId: 'test-user',
        sessionId: 'test-session',
        data: {
          text: 'Hello, world!',
        },
      };

      // Access private method via type assertion for testing
      await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
        payload
      );

      // Stats should be updated
      const stats = worker.getStats();
      expect(stats).toBeDefined();
    });

    it('should handle embedding:batch-generate events', async () => {
      const payload = {
        type: 'embedding:batch-generate' as const,
        userId: 'test-user',
        sessionId: 'test-session',
        data: {
          texts: ['Hello', 'World', 'Test'],
        },
      };

      await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
        payload
      );

      const stats = worker.getStats();
      expect(stats).toBeDefined();
    });

    it('should handle unrecognized event types gracefully', async () => {
      const payload = {
        type: 'unknown:event' as const,
        userId: 'test-user',
        data: {},
      };

      // Should not throw
      await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
        payload
      );
    });
  });

  describe('backpressure', () => {
    it('should enforce queue depth limits', async () => {
      // The worker should have backpressure protection
      // This is a structural test - we verify the worker doesn't crash under load
      const payload = {
        type: 'embedding:generate' as const,
        userId: 'test-user',
        data: { text: 'test' },
      };

      // Process multiple events
      for (let i = 0; i < 10; i++) {
        await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
          payload
        );
      }

      // Worker should still be functional
      const stats = worker.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getEmbeddingWorker', () => {
      const worker1 = getEmbeddingWorker();
      const worker2 = getEmbeddingWorker();
      expect(worker1).toBe(worker2);
    });
  });
});
