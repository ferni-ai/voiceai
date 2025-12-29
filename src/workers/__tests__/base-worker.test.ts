/**
 * Base Worker Tests
 *
 * Tests the base worker class and LocalWorker functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Create a mock event emitter
const mockEventEmitter = new EventEmitter();

// Mock AsyncEvents class
const MockAsyncEvents = {
  getInstance() {
    return mockEventEmitter;
  },
  onAll(callback: (payload: unknown) => void) {
    // Subscribe to all events using a pattern
    const handler = (_type: string, payload: unknown) => callback(payload);
    mockEventEmitter.on('*', handler);
    // For testing, also directly pass events
    const wrappedHandler = (payload: unknown) => callback(payload);
    mockEventEmitter.on('trust:update', wrappedHandler);
    mockEventEmitter.on('trust:milestone', wrappedHandler);
    mockEventEmitter.on('analytics:interaction', wrappedHandler);

    // Return unsubscribe function
    return () => {
      mockEventEmitter.off('*', handler);
      mockEventEmitter.off('trust:update', wrappedHandler);
      mockEventEmitter.off('trust:milestone', wrappedHandler);
      mockEventEmitter.off('analytics:interaction', wrappedHandler);
    };
  },
};

vi.mock('../../services/async-events/index.js', () => ({
  asyncEvents: mockEventEmitter,
  AsyncEvents: MockAsyncEvents,
}));

import { LocalWorker, type WorkerConfig } from '../base-worker.js';

// Event types that the worker handles
type TestEventType = 'trust:update' | 'trust:milestone';

// Create a concrete implementation for testing
class TestWorker extends LocalWorker {
  public processedPayloads: unknown[] = [];

  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'TestWorker',
      subscriptionName: 'test-sub',
      handleTypes: ['trust:update', 'trust:milestone'] as TestEventType[],
      ...config,
    });
  }

  protected async process(payload: unknown): Promise<void> {
    this.processedPayloads.push(payload);
  }
}

describe('BaseWorker', () => {
  describe('LocalWorker', () => {
    let worker: TestWorker;

    beforeEach(() => {
      vi.clearAllMocks();
      worker = new TestWorker();
    });

    afterEach(async () => {
      await worker.stop();
    });

    describe('initialization', () => {
      it('should create worker with config', () => {
        expect(worker).toBeDefined();
      });

      it('should have correct initial stats', () => {
        const stats = worker.getStats();
        expect(stats.messagesReceived).toBe(0);
        expect(stats.messagesProcessed).toBe(0);
        expect(stats.messagesFailed).toBe(0);
        expect(stats.averageProcessingMs).toBe(0);
        expect(stats.lastProcessedAt).toBeNull();
      });
    });

    describe('lifecycle', () => {
      it('should start without error', async () => {
        await expect(worker.start()).resolves.not.toThrow();
      });

      it('should stop without error', async () => {
        await worker.start();
        await expect(worker.stop()).resolves.not.toThrow();
      });

      it('should be idempotent on multiple starts', async () => {
        await worker.start();
        await worker.start();
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe('event handling', () => {
      it('should receive events via local event bus', async () => {
        await worker.start();

        // Emit an event that matches handleTypes
        mockEventEmitter.emit('trust:update', {
          type: 'trust:update',
          userId: 'test-user',
          data: { foo: 'bar' },
        });

        // Give it time to process
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        expect(worker.processedPayloads.length).toBeGreaterThan(0);
      });

      it('should ignore events not in handleTypes', async () => {
        await worker.start();

        // Clear previous payloads
        // eslint-disable-next-line require-atomic-updates -- Test setup, no concurrent access
        worker.processedPayloads = [];

        // Emit an event NOT in handleTypes
        mockEventEmitter.emit('analytics:interaction', {
          type: 'analytics:interaction',
          userId: 'test-user',
          data: {},
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        // Should not have processed the event
        const processed = worker.processedPayloads.filter(
          (p) => (p as { type: string }).type === 'analytics:interaction'
        );
        expect(processed.length).toBe(0);
      });
    });

    describe('stats tracking', () => {
      it('should update stats after processing', async () => {
        await worker.start();

        mockEventEmitter.emit('trust:update', {
          type: 'trust:update',
          userId: 'test-user',
          data: {},
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        const stats = worker.getStats();
        expect(stats.messagesReceived).toBeGreaterThan(0);
        expect(stats.messagesProcessed).toBeGreaterThan(0);
        expect(stats.lastProcessedAt).not.toBeNull();
      });
    });

    describe('error handling', () => {
      it('should handle errors in process gracefully', async () => {
        // Create a worker that throws
        class ErrorWorker extends LocalWorker {
          constructor() {
            super({
              name: 'ErrorWorker',
              subscriptionName: 'error-sub',
              handleTypes: ['trust:milestone'] as TestEventType[],
            });
          }

          protected async process(): Promise<void> {
            throw new Error('Test error');
          }
        }

        const errorWorker = new ErrorWorker();
        await errorWorker.start();

        // Should not crash
        mockEventEmitter.emit('trust:milestone', {
          type: 'trust:milestone',
          userId: 'test-user',
          data: {},
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        const stats = errorWorker.getStats();
        expect(stats.messagesFailed).toBeGreaterThan(0);

        await errorWorker.stop();
      });
    });
  });
});
