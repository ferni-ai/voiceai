/**
 * Session Registry Tests
 *
 * Tests for session-scoped service instance management.
 *
 * @module utils/__tests__/session-registry.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSessionRegistry,
  registerGlobalRegistry,
  resetSessionGlobally,
  resetAllSessionsGlobally,
  getGlobalRegistryStats,
  safeSessionId,
  assertSessionId,
  isValidSessionId,
} from '../session-registry.js';

describe('Session Registry', () => {
  describe('createSessionRegistry', () => {
    it('should create instances lazily', () => {
      const factory = vi.fn((id: string) => ({ id, value: 'test' }));
      const registry = createSessionRegistry(factory);

      expect(factory).not.toHaveBeenCalled();

      const instance = registry.get('session-1');

      expect(factory).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledWith('session-1');
      expect(instance).toEqual({ id: 'session-1', value: 'test' });
    });

    it('should return same instance for same session', () => {
      const factory = vi.fn((id: string) => ({ id }));
      const registry = createSessionRegistry(factory);

      const instance1 = registry.get('session-1');
      const instance2 = registry.get('session-1');

      expect(instance1).toBe(instance2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should create different instances for different sessions', () => {
      const factory = vi.fn((id: string) => ({ id }));
      const registry = createSessionRegistry(factory);

      const instance1 = registry.get('session-1');
      const instance2 = registry.get('session-2');

      expect(instance1).not.toBe(instance2);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('should track active sessions', () => {
      const registry = createSessionRegistry((id: string) => ({ id }));

      registry.get('a');
      registry.get('b');
      registry.get('c');

      expect(registry.getActiveCount()).toBe(3);
      expect(registry.getActiveSessionIds()).toEqual(['a', 'b', 'c']);
    });

    it('should check if session exists', () => {
      const registry = createSessionRegistry((id: string) => ({ id }));

      expect(registry.has('session-1')).toBe(false);

      registry.get('session-1');

      expect(registry.has('session-1')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should call cleanup function', () => {
      const cleanup = vi.fn();
      const registry = createSessionRegistry((id: string) => ({ id }), { cleanup });

      registry.get('session-1');
      registry.reset('session-1');

      expect(cleanup).toHaveBeenCalledWith({ id: 'session-1' });
    });

    it('should call reset() method if exists on instance', () => {
      const resetMock = vi.fn();
      const registry = createSessionRegistry((id: string) => ({
        id,
        reset: resetMock,
      }));

      registry.get('session-1');
      registry.reset('session-1');

      expect(resetMock).toHaveBeenCalled();
    });

    it('should remove instance after reset', () => {
      const registry = createSessionRegistry((id: string) => ({ id }));

      registry.get('session-1');
      expect(registry.has('session-1')).toBe(true);

      registry.reset('session-1');
      expect(registry.has('session-1')).toBe(false);
    });

    it('should create new instance after reset', () => {
      const factory = vi.fn((id: string) => ({ id, time: Date.now() }));
      const registry = createSessionRegistry(factory);

      const first = registry.get('session-1');
      registry.reset('session-1');
      const second = registry.get('session-1');

      expect(first).not.toBe(second);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetAll', () => {
    it('should reset all sessions', () => {
      const cleanup = vi.fn();
      const registry = createSessionRegistry((id: string) => ({ id }), { cleanup });

      registry.get('a');
      registry.get('b');
      registry.get('c');

      registry.resetAll();

      expect(cleanup).toHaveBeenCalledTimes(3);
      expect(registry.getActiveCount()).toBe(0);
    });
  });

  describe('getName', () => {
    it('should return registry name', () => {
      const registry = createSessionRegistry((id: string) => ({ id }), { name: 'MyService' });
      expect(registry.getName()).toBe('MyService');
    });

    it('should use default name', () => {
      const registry = createSessionRegistry((id: string) => ({ id }));
      expect(registry.getName()).toBe('SessionRegistry');
    });
  });

  describe('Global Registry', () => {
    beforeEach(() => {
      resetAllSessionsGlobally();
    });

    it('should track registered registries', () => {
      const registry1 = createSessionRegistry((id: string) => ({ id }), { name: 'Service1' });
      const registry2 = createSessionRegistry((id: string) => ({ id }), { name: 'Service2' });

      registerGlobalRegistry(registry1);
      registerGlobalRegistry(registry2);

      registry1.get('session-1');
      registry2.get('session-1');
      registry2.get('session-2');

      const stats = getGlobalRegistryStats();

      expect(stats.length).toBeGreaterThanOrEqual(2);
    });

    it('should reset session across all registries', () => {
      const registry1 = createSessionRegistry((id: string) => ({ id }), { name: 'Global1' });
      const registry2 = createSessionRegistry((id: string) => ({ id }), { name: 'Global2' });

      registerGlobalRegistry(registry1);
      registerGlobalRegistry(registry2);

      registry1.get('shared-session');
      registry2.get('shared-session');

      resetSessionGlobally('shared-session');

      expect(registry1.has('shared-session')).toBe(false);
      expect(registry2.has('shared-session')).toBe(false);
    });
  });

  describe('Session ID Helpers', () => {
    describe('safeSessionId', () => {
      it('should return valid session id', () => {
        expect(safeSessionId('valid-id', 'test')).toBe('valid-id');
      });

      it('should return fallback for undefined', () => {
        expect(safeSessionId(undefined, 'test')).toBe('unknown');
      });

      it('should return fallback for null', () => {
        expect(safeSessionId(null, 'test')).toBe('unknown');
      });

      it('should return fallback for "unknown"', () => {
        expect(safeSessionId('unknown', 'test')).toBe('unknown');
      });

      it('should use custom fallback', () => {
        expect(safeSessionId(undefined, 'test', 'default-session')).toBe('default-session');
      });
    });

    describe('assertSessionId', () => {
      it('should not throw for valid id', () => {
        expect(() => assertSessionId('valid-id', 'test')).not.toThrow();
      });

      it('should throw for undefined', () => {
        expect(() => assertSessionId(undefined, 'test')).toThrow('SessionId is required');
      });

      it('should throw for null', () => {
        expect(() => assertSessionId(null, 'test')).toThrow('SessionId is required');
      });

      it('should throw for "unknown"', () => {
        expect(() => assertSessionId('unknown', 'test')).toThrow('SessionId is required');
      });
    });

    describe('isValidSessionId', () => {
      it('should return true for valid ids', () => {
        expect(isValidSessionId('valid-id')).toBe(true);
        expect(isValidSessionId('session-123')).toBe(true);
      });

      it('should return false for invalid ids', () => {
        expect(isValidSessionId(undefined)).toBe(false);
        expect(isValidSessionId(null)).toBe(false);
        expect(isValidSessionId('')).toBe(false);
        expect(isValidSessionId('unknown')).toBe(false);
      });
    });
  });
});
