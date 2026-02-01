/**
 * Event Bus Tests
 *
 * Tests for the event bus service:
 * - Event subscription and publishing
 * - Event filtering
 * - Async/sync handlers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEventBus,
  resetEventBus,
  type EventPayload,
  type SystemEventType,
} from '../../services/workflows/events/event-bus.js';

// ============================================================================
// EVENT BUS TESTS
// ============================================================================

describe('EventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  describe('getEventBus', () => {
    it('should return singleton instance', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });
  });

  describe('subscribe/publish', () => {
    it('should call handler when event is published', async () => {
      const bus = getEventBus();
      const handler = vi.fn();

      bus.subscribe('custom', handler);
      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: { message: 'hello' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'custom',
          data: { message: 'hello' },
        })
      );
    });

    it('should support wildcard subscriptions', async () => {
      const bus = getEventBus();
      const handler = vi.fn();

      bus.subscribe('*', handler);
      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not call handler after unsubscribe', async () => {
      const bus = getEventBus();
      const handler = vi.fn();

      const subscriptionId = bus.subscribe('custom', handler);
      bus.unsubscribe(subscriptionId);

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeAsync', () => {
    it('should handle async handlers', async () => {
      const bus = getEventBus();
      let called = false;

      bus.subscribe('custom', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        called = true;
      });

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      expect(called).toBe(true);
    });
  });

  describe('subscribeOnce', () => {
    it('should only handle first event', async () => {
      const bus = getEventBus();
      const handler = vi.fn();

      // Use once() which returns a promise
      const oncePromise = bus.once('custom', handler);

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      // Wait for the once handler
      await oncePromise;

      // Publish again - handler should not be called
      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeWithFilter', () => {
    it('should only call handler when filter matches', async () => {
      const bus = getEventBus();
      const handler = vi.fn();

      // Use filter option in subscribe
      bus.subscribe('custom', handler, {
        filter: { dataMatch: { important: true } },
      });

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: { important: false },
      });

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: { important: true },
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should continue with other handlers if one throws', async () => {
      const bus = getEventBus();
      const handler1 = vi.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = vi.fn();

      bus.subscribe('custom', handler1);
      bus.subscribe('custom', handler2);

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should track event statistics', async () => {
      const bus = getEventBus();

      bus.subscribe('custom', () => {});

      await bus.publish({
        eventType: 'custom',
        source: 'test',
        userId: 'user-1',
        data: {},
      });

      const stats = bus.getStats();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
    });
  });
});
