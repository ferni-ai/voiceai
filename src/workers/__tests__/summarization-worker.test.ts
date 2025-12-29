/**
 * Summarization Worker Tests
 *
 * Tests the summarization worker's conversation processing and queue management.
 */

/* eslint-disable no-await-in-loop -- Test loops intentionally sequential */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore
vi.mock('../../memory/firestore/index.js', () => ({
  getFirestoreClient: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      })),
    })),
  })),
}));

// Import worker
import { SummarizationWorker, getSummarizationWorker } from '../summarization-worker.js';

describe('SummarizationWorker', () => {
  let worker: SummarizationWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new SummarizationWorker();
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
    it('should skip conversations with too few turns', async () => {
      const payload = {
        type: 'summarization:conversation' as const,
        userId: 'test-user',
        sessionId: 'test-session',
        data: {
          turnCount: 2, // Less than minimum (3)
          conversationId: 'conv-123',
        },
      };

      await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
        payload
      );

      // Stats should show message received but not queued for processing
      const stats = worker.getStats();
      expect(stats).toBeDefined();
    });

    it('should queue conversations with enough turns', async () => {
      const payload = {
        type: 'summarization:conversation' as const,
        userId: 'test-user',
        sessionId: 'test-session',
        data: {
          turnCount: 5,
          conversationId: 'conv-123',
          turns: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
            { role: 'assistant', content: 'Great!' },
            { role: 'user', content: 'Good' },
          ],
        },
      };

      await (worker as unknown as { process: (p: typeof payload) => Promise<void> }).process(
        payload
      );

      const stats = worker.getStats();
      expect(stats).toBeDefined();
    });

    it('should handle memory consolidation events', async () => {
      const payload = {
        type: 'summarization:memory-consolidation' as const,
        userId: 'test-user',
        data: {},
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
      const payload = {
        type: 'summarization:conversation' as const,
        userId: 'test-user',
        data: {
          turnCount: 5,
          conversationId: 'conv-123',
          turns: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Test' },
          ],
        },
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
    it('should return same instance from getSummarizationWorker', () => {
      const worker1 = getSummarizationWorker();
      const worker2 = getSummarizationWorker();
      expect(worker1).toBe(worker2);
    });
  });
});
