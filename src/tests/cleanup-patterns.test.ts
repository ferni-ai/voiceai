/**
 * Cleanup Patterns Tests
 *
 * Tests for:
 * - CleanupManager class (listeners, timers, intervals, callbacks)
 * - addAutoCleanupListener helper
 * - addOnceListener helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CleanupManager,
  addAutoCleanupListener,
  addOnceListener,
} from '../utils/cleanup-patterns.js';

// Mock event target
function createMockEventTarget() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers.get(event)?.forEach((handler) => handler(...args));
    },
    getHandlerCount: (event: string) => handlers.get(event)?.size || 0,
  };
}

describe('CleanupManager', () => {
  let manager: CleanupManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new CleanupManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Listener Management', () => {
    it('should add and track listeners', () => {
      const target = createMockEventTarget();
      const handler = vi.fn();

      manager.addListener(target, 'test', handler);

      expect(target.on).toHaveBeenCalledWith('test', handler);
      expect(manager.size).toBe(1);
    });

    it('should remove listeners on dispose', async () => {
      const target = createMockEventTarget();
      const handler = vi.fn();

      manager.addListener(target, 'test', handler);
      await manager.dispose();

      expect(target.off).toHaveBeenCalledWith('test', handler);
      expect(manager.size).toBe(0);
    });

    it('should handle multiple listeners', async () => {
      const target = createMockEventTarget();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.addListener(target, 'event1', handler1);
      manager.addListener(target, 'event2', handler2);

      expect(manager.size).toBe(2);

      await manager.dispose();

      expect(target.off).toHaveBeenCalledTimes(2);
    });

    it('should throw when adding listener after dispose', async () => {
      const target = createMockEventTarget();
      await manager.dispose();

      expect(() => manager.addListener(target, 'test', vi.fn())).toThrow(
        'CleanupManager already disposed'
      );
    });
  });

  describe('Timer Management', () => {
    it('should add and track timeouts', () => {
      const callback = vi.fn();

      const id = manager.addTimeout(callback, 1000);

      expect(id).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('should clear timeouts on dispose', async () => {
      const callback = vi.fn();

      manager.addTimeout(callback, 1000);
      await manager.dispose();

      // Advance time past the timeout
      vi.advanceTimersByTime(2000);

      // Callback should not have been called
      expect(callback).not.toHaveBeenCalled();
    });

    it('should execute timeout if not disposed', () => {
      const callback = vi.fn();

      manager.addTimeout(callback, 1000);
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalled();
    });

    it('should throw when adding timeout after dispose', async () => {
      await manager.dispose();

      expect(() => manager.addTimeout(vi.fn(), 1000)).toThrow('CleanupManager already disposed');
    });
  });

  describe('Interval Management', () => {
    it('should add and track intervals', () => {
      const callback = vi.fn();

      const id = manager.addInterval(callback, 1000);

      expect(id).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('should clear intervals on dispose', async () => {
      const callback = vi.fn();

      manager.addInterval(callback, 1000);
      await manager.dispose();

      // Advance time
      vi.advanceTimersByTime(3000);

      // Callback should not have been called
      expect(callback).not.toHaveBeenCalled();
    });

    it('should execute interval multiple times if not disposed', () => {
      const callback = vi.fn();

      manager.addInterval(callback, 1000);
      vi.advanceTimersByTime(3500);

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should throw when adding interval after dispose', async () => {
      await manager.dispose();

      expect(() => manager.addInterval(vi.fn(), 1000)).toThrow('CleanupManager already disposed');
    });
  });

  describe('Callback Management', () => {
    it('should add dispose callbacks', () => {
      const callback = vi.fn();

      manager.onDispose(callback);

      expect(manager.size).toBe(1);
    });

    it('should execute callbacks on dispose', async () => {
      const callback = vi.fn();

      manager.onDispose(callback);
      await manager.dispose();

      expect(callback).toHaveBeenCalled();
    });

    it('should handle async callbacks', async () => {
      const results: number[] = [];
      const asyncCallback = async () => {
        await Promise.resolve();
        results.push(1);
      };

      manager.onDispose(asyncCallback);
      await manager.dispose();

      expect(results).toContain(1);
    });

    it('should throw when adding callback after dispose', async () => {
      await manager.dispose();

      expect(() => manager.onDispose(vi.fn())).toThrow('CleanupManager already disposed');
    });
  });

  describe('Clear Timer', () => {
    it('should clear a specific timer', () => {
      const callback = vi.fn();

      const id = manager.addTimeout(callback, 1000);
      const result = manager.clearTimer(id);

      expect(result).toBe(true);
      expect(manager.size).toBe(0);

      // Advance time - callback should not execute
      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear a specific interval', () => {
      const callback = vi.fn();

      const id = manager.addInterval(callback, 1000);
      const result = manager.clearTimer(id);

      expect(result).toBe(true);
      expect(manager.size).toBe(0);
    });

    it('should return false for non-existent timer', () => {
      const result = manager.clearTimer(setTimeout(() => {}, 1000));

      expect(result).toBe(false);
    });
  });

  describe('Dispose Behavior', () => {
    it('should process items in LIFO order', async () => {
      const order: number[] = [];

      manager.onDispose(() => order.push(1));
      manager.onDispose(() => order.push(2));
      manager.onDispose(() => order.push(3));

      await manager.dispose();

      expect(order).toEqual([3, 2, 1]);
    });

    it('should only dispose once', async () => {
      const callback = vi.fn();
      manager.onDispose(callback);

      await manager.dispose();
      await manager.dispose();
      await manager.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should report disposed state', async () => {
      expect(manager.isDisposed()).toBe(false);

      await manager.dispose();

      expect(manager.isDisposed()).toBe(true);
    });

    it('should handle errors in callbacks gracefully', async () => {
      const goodCallback = vi.fn();
      const badCallback = vi.fn(() => {
        throw new Error('Test error');
      });

      manager.onDispose(goodCallback);
      manager.onDispose(badCallback);

      // Should not throw
      await expect(manager.dispose()).resolves.toBeUndefined();

      // Both callbacks should have been attempted
      expect(badCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('Size Property', () => {
    it('should track item count correctly', () => {
      const target = createMockEventTarget();

      expect(manager.size).toBe(0);

      manager.addListener(target, 'test', vi.fn());
      expect(manager.size).toBe(1);

      manager.addTimeout(vi.fn(), 1000);
      expect(manager.size).toBe(2);

      manager.addInterval(vi.fn(), 1000);
      expect(manager.size).toBe(3);

      manager.onDispose(vi.fn());
      expect(manager.size).toBe(4);
    });
  });
});

describe('addAutoCleanupListener', () => {
  it('should add listener and return removal function', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addAutoCleanupListener(target, 'test', handler);

    expect(target.on).toHaveBeenCalledWith('test', handler);
    expect(typeof remove).toBe('function');
  });

  it('should remove listener when removal function is called', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addAutoCleanupListener(target, 'test', handler);
    remove();

    expect(target.off).toHaveBeenCalledWith('test', handler);
  });

  it('should allow handler to be called before removal', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addAutoCleanupListener(target, 'test', handler);

    target.emit('test', 'data');
    expect(handler).toHaveBeenCalledWith('data');
  });

  it('should not call handler after removal', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addAutoCleanupListener(target, 'test', handler);
    remove();

    target.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('addOnceListener', () => {
  it('should add listener and return removal function', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addOnceListener(target, 'test', handler);

    expect(target.on).toHaveBeenCalled();
    expect(typeof remove).toBe('function');
  });

  it('should call handler once and auto-remove', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addOnceListener(target, 'test', handler);

    // First emit - should call handler
    target.emit('test', 'data1');
    expect(handler).toHaveBeenCalledWith('data1');
    expect(handler).toHaveBeenCalledTimes(1);

    // Second emit - should not call handler (already removed)
    target.emit('test', 'data2');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should allow manual removal before event fires', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addOnceListener(target, 'test', handler);
    remove();

    target.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should pass all arguments to handler', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addOnceListener(target, 'test', handler);
    target.emit('test', 'arg1', 'arg2', 'arg3');

    expect(handler).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
  });
});
