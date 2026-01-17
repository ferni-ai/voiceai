/**
 * Cleanup Patterns Tests
 *
 * Tests for CleanupManager and listener utilities.
 *
 * @module utils/__tests__/cleanup-patterns.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CleanupManager,
  addAutoCleanupListener,
  addOnceListener,
} from '../cleanup-patterns.js';

// Mock event target
function createMockEventTarget() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
    handlerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
  };
}

describe('CleanupManager', () => {
  let cleanup: CleanupManager;

  beforeEach(() => {
    cleanup = new CleanupManager();
  });

  describe('addListener', () => {
    it('should add and remove listeners', async () => {
      const target = createMockEventTarget();
      const handler = vi.fn();

      cleanup.addListener(target, 'test', handler);
      expect(target.handlerCount('test')).toBe(1);

      await cleanup.dispose();
      expect(target.handlerCount('test')).toBe(0);
    });

    it('should throw if already disposed', async () => {
      await cleanup.dispose();

      expect(() => {
        cleanup.addListener(createMockEventTarget(), 'test', vi.fn());
      }).toThrow('CleanupManager already disposed');
    });
  });

  describe('addTimeout', () => {
    it('should clear timeout on dispose', async () => {
      const callback = vi.fn();
      cleanup.addTimeout(callback, 1000);

      await cleanup.dispose();

      // Wait a bit to verify callback wasn't called
      await new Promise((r) => setTimeout(r, 50));
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return timeout id', () => {
      const id = cleanup.addTimeout(vi.fn(), 1000);
      expect(id).toBeDefined();
    });
  });

  describe('addInterval', () => {
    it('should clear interval on dispose', async () => {
      const callback = vi.fn();
      cleanup.addInterval(callback, 50);

      // Let it run once
      await new Promise((r) => setTimeout(r, 75));
      const callsBefore = callback.mock.calls.length;

      await cleanup.dispose();

      // Wait and verify no more calls
      await new Promise((r) => setTimeout(r, 100));
      expect(callback.mock.calls.length).toBe(callsBefore);
    });
  });

  describe('onDispose', () => {
    it('should call callback on dispose', async () => {
      const callback = vi.fn();
      cleanup.onDispose(callback);

      await cleanup.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle async callbacks', async () => {
      let resolved = false;
      cleanup.onDispose(async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
      });

      await cleanup.dispose();

      expect(resolved).toBe(true);
    });

    it('should call callbacks in reverse order (LIFO)', async () => {
      const order: number[] = [];

      cleanup.onDispose(() => {
        order.push(1);
      });
      cleanup.onDispose(() => {
        order.push(2);
      });
      cleanup.onDispose(() => {
        order.push(3);
      });

      await cleanup.dispose();

      expect(order).toEqual([3, 2, 1]);
    });
  });

  describe('clearTimer', () => {
    it('should clear and untrack specific timer', async () => {
      const callback = vi.fn();
      const id = cleanup.addTimeout(callback, 1000);

      expect(cleanup.size).toBe(1);

      const result = cleanup.clearTimer(id);

      expect(result).toBe(true);
      expect(cleanup.size).toBe(0);
    });

    it('should return false for unknown timer', () => {
      const result = cleanup.clearTimer(
        setTimeout(() => {}, 1000) as ReturnType<typeof setTimeout>
      );
      expect(result).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should be idempotent', async () => {
      const callback = vi.fn();
      cleanup.onDispose(callback);

      await cleanup.dispose();
      await cleanup.dispose();
      await cleanup.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in cleanup callbacks', async () => {
      cleanup.onDispose(() => {
        throw new Error('Cleanup error');
      });
      cleanup.onDispose(vi.fn()); // This should still run

      // Should not throw
      await expect(cleanup.dispose()).resolves.toBeUndefined();
    });
  });

  describe('isDisposed', () => {
    it('should return false initially', () => {
      expect(cleanup.isDisposed()).toBe(false);
    });

    it('should return true after dispose', async () => {
      await cleanup.dispose();
      expect(cleanup.isDisposed()).toBe(true);
    });
  });

  describe('size', () => {
    it('should track number of items', () => {
      expect(cleanup.size).toBe(0);

      cleanup.addTimeout(vi.fn(), 1000);
      expect(cleanup.size).toBe(1);

      cleanup.addInterval(vi.fn(), 1000);
      expect(cleanup.size).toBe(2);

      cleanup.onDispose(vi.fn());
      expect(cleanup.size).toBe(3);
    });
  });
});

describe('addAutoCleanupListener', () => {
  it('should add listener and return remove function', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addAutoCleanupListener(target, 'test', handler);

    expect(target.handlerCount('test')).toBe(1);

    remove();

    expect(target.handlerCount('test')).toBe(0);
  });

  it('should call handler when event fires', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addAutoCleanupListener(target, 'test', handler);

    target.emit('test', 'data');

    expect(handler).toHaveBeenCalledWith('data');
  });
});

describe('addOnceListener', () => {
  it('should only fire handler once', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addOnceListener(target, 'test', handler);

    target.emit('test', 'first');
    target.emit('test', 'second');
    target.emit('test', 'third');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should auto-remove after firing', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    addOnceListener(target, 'test', handler);

    expect(target.handlerCount('test')).toBe(1);

    target.emit('test');

    expect(target.handlerCount('test')).toBe(0);
  });

  it('should return manual remove function', () => {
    const target = createMockEventTarget();
    const handler = vi.fn();

    const remove = addOnceListener(target, 'test', handler);

    remove();

    target.emit('test');

    expect(handler).not.toHaveBeenCalled();
  });
});
