/**
 * Session Registry Tests
 *
 * Tests for:
 * - createSessionRegistry factory function
 * - Session instance lifecycle (get, has, reset, resetAll)
 * - Global registry management
 * - Cleanup integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSessionRegistry,
  registerGlobalRegistry,
  resetSessionGlobally,
  resetAllSessionsGlobally,
  getGlobalRegistryStats,
  type SessionRegistry,
} from '../utils/session-registry.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

// Mock service for testing
class MockService {
  public sessionId: string;
  public resetCalled = false;
  public cleanupCalled = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  reset(): void {
    this.resetCalled = true;
  }
}

describe('Session Registry', () => {
  describe('createSessionRegistry', () => {
    it('should create a registry with required methods', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(registry.get).toBeDefined();
      expect(registry.has).toBeDefined();
      expect(registry.reset).toBeDefined();
      expect(registry.resetAll).toBeDefined();
      expect(registry.getActiveCount).toBeDefined();
      expect(registry.getActiveSessionIds).toBeDefined();
      expect(registry.getName).toBeDefined();
    });

    it('should use default name if not provided', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(registry.getName()).toBe('SessionRegistry');
    });

    it('should use custom name if provided', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId), {
        name: 'MyCustomRegistry',
      });

      expect(registry.getName()).toBe('MyCustomRegistry');
    });
  });

  describe('get()', () => {
    it('should create instance on first access', () => {
      const factory = vi.fn((sessionId: string) => new MockService(sessionId));
      const registry = createSessionRegistry(factory);

      const instance = registry.get('session-123');

      expect(factory).toHaveBeenCalledWith('session-123');
      expect(instance).toBeInstanceOf(MockService);
      expect(instance.sessionId).toBe('session-123');
    });

    it('should return same instance on subsequent access', () => {
      const factory = vi.fn((sessionId: string) => new MockService(sessionId));
      const registry = createSessionRegistry(factory);

      const instance1 = registry.get('session-123');
      const instance2 = registry.get('session-123');

      expect(factory).toHaveBeenCalledTimes(1);
      expect(instance1).toBe(instance2);
    });

    it('should create separate instances for different sessions', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      const instance1 = registry.get('session-1');
      const instance2 = registry.get('session-2');

      expect(instance1).not.toBe(instance2);
      expect(instance1.sessionId).toBe('session-1');
      expect(instance2.sessionId).toBe('session-2');
    });
  });

  describe('has()', () => {
    it('should return false for non-existent session', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(registry.has('non-existent')).toBe(false);
    });

    it('should return true for existing session', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      registry.get('session-123');

      expect(registry.has('session-123')).toBe(true);
    });
  });

  describe('reset()', () => {
    it('should remove session from registry', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      registry.get('session-123');
      expect(registry.has('session-123')).toBe(true);

      registry.reset('session-123');
      expect(registry.has('session-123')).toBe(false);
    });

    it('should call reset() method on instance if it exists', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      const instance = registry.get('session-123');
      registry.reset('session-123');

      expect(instance.resetCalled).toBe(true);
    });

    it('should call custom cleanup function', () => {
      const cleanupFn = vi.fn();
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId), {
        cleanup: cleanupFn,
      });

      const instance = registry.get('session-123');
      registry.reset('session-123');

      expect(cleanupFn).toHaveBeenCalledWith(instance);
    });

    it('should be safe to reset non-existent session', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(() => registry.reset('non-existent')).not.toThrow();
    });

    it('should create new instance after reset', () => {
      const factory = vi.fn((sessionId: string) => new MockService(sessionId));
      const registry = createSessionRegistry(factory);

      const instance1 = registry.get('session-123');
      registry.reset('session-123');
      const instance2 = registry.get('session-123');

      expect(factory).toHaveBeenCalledTimes(2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('resetAll()', () => {
    it('should reset all sessions', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      registry.get('session-1');
      registry.get('session-2');
      registry.get('session-3');

      expect(registry.getActiveCount()).toBe(3);

      registry.resetAll();

      expect(registry.getActiveCount()).toBe(0);
      expect(registry.has('session-1')).toBe(false);
      expect(registry.has('session-2')).toBe(false);
      expect(registry.has('session-3')).toBe(false);
    });

    it('should call reset on all instances', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      const instance1 = registry.get('session-1');
      const instance2 = registry.get('session-2');

      registry.resetAll();

      expect(instance1.resetCalled).toBe(true);
      expect(instance2.resetCalled).toBe(true);
    });

    it('should call cleanup for all instances', () => {
      const cleanupFn = vi.fn();
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId), {
        cleanup: cleanupFn,
      });

      registry.get('session-1');
      registry.get('session-2');

      registry.resetAll();

      expect(cleanupFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveCount()', () => {
    it('should return 0 for empty registry', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(registry.getActiveCount()).toBe(0);
    });

    it('should return correct count', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      registry.get('session-1');
      expect(registry.getActiveCount()).toBe(1);

      registry.get('session-2');
      expect(registry.getActiveCount()).toBe(2);

      registry.reset('session-1');
      expect(registry.getActiveCount()).toBe(1);
    });
  });

  describe('getActiveSessionIds()', () => {
    it('should return empty array for empty registry', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      expect(registry.getActiveSessionIds()).toEqual([]);
    });

    it('should return all active session IDs', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

      registry.get('session-a');
      registry.get('session-b');
      registry.get('session-c');

      const ids = registry.getActiveSessionIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('session-a');
      expect(ids).toContain('session-b');
      expect(ids).toContain('session-c');
    });
  });

  describe('Verbose Logging', () => {
    it('should log when verbose is enabled', () => {
      const registry = createSessionRegistry((sessionId) => new MockService(sessionId), {
        name: 'VerboseRegistry',
        verbose: true,
      });

      // Just verify it doesn't throw with verbose mode
      registry.get('session-123');
      registry.reset('session-123');
    });
  });
});

describe('Global Registry Management', () => {
  let registry1: SessionRegistry<MockService>;
  let registry2: SessionRegistry<MockService>;

  beforeEach(() => {
    // Create fresh registries for each test
    registry1 = createSessionRegistry((sessionId) => new MockService(sessionId), {
      name: 'Registry1',
    });
    registry2 = createSessionRegistry((sessionId) => new MockService(sessionId), {
      name: 'Registry2',
    });
  });

  describe('registerGlobalRegistry()', () => {
    it('should register a registry globally', () => {
      registerGlobalRegistry(registry1);

      const stats = getGlobalRegistryStats();
      expect(stats.some((s) => s.name === 'Registry1')).toBe(true);
    });

    it('should allow multiple registries to be registered', () => {
      registerGlobalRegistry(registry1);
      registerGlobalRegistry(registry2);

      const stats = getGlobalRegistryStats();
      expect(stats.some((s) => s.name === 'Registry1')).toBe(true);
      expect(stats.some((s) => s.name === 'Registry2')).toBe(true);
    });
  });

  describe('resetSessionGlobally()', () => {
    it('should reset session across all registered registries', () => {
      registerGlobalRegistry(registry1);
      registerGlobalRegistry(registry2);

      registry1.get('shared-session');
      registry2.get('shared-session');

      expect(registry1.has('shared-session')).toBe(true);
      expect(registry2.has('shared-session')).toBe(true);

      resetSessionGlobally('shared-session');

      expect(registry1.has('shared-session')).toBe(false);
      expect(registry2.has('shared-session')).toBe(false);
    });

    it('should not affect other sessions', () => {
      registerGlobalRegistry(registry1);

      registry1.get('session-1');
      registry1.get('session-2');

      resetSessionGlobally('session-1');

      expect(registry1.has('session-1')).toBe(false);
      expect(registry1.has('session-2')).toBe(true);
    });
  });

  describe('resetAllSessionsGlobally()', () => {
    it('should reset all sessions across all registries', () => {
      registerGlobalRegistry(registry1);
      registerGlobalRegistry(registry2);

      registry1.get('session-1');
      registry1.get('session-2');
      registry2.get('session-3');
      registry2.get('session-4');

      resetAllSessionsGlobally();

      expect(registry1.getActiveCount()).toBe(0);
      expect(registry2.getActiveCount()).toBe(0);
    });
  });

  describe('getGlobalRegistryStats()', () => {
    it('should return stats for all registered registries', () => {
      const testRegistry = createSessionRegistry((sessionId) => new MockService(sessionId), {
        name: 'StatsTestRegistry',
      });
      registerGlobalRegistry(testRegistry);

      testRegistry.get('session-1');
      testRegistry.get('session-2');

      const stats = getGlobalRegistryStats();
      const testStats = stats.find((s) => s.name === 'StatsTestRegistry');

      expect(testStats).toBeDefined();
      expect(testStats?.activeCount).toBe(2);
      expect(testStats?.sessionIds).toContain('session-1');
      expect(testStats?.sessionIds).toContain('session-2');
    });
  });
});

describe('Instance Without Reset Method', () => {
  it('should handle instances without reset() method', () => {
    class SimpleService {
      sessionId: string;
      constructor(sessionId: string) {
        this.sessionId = sessionId;
      }
    }

    const registry = createSessionRegistry((sessionId) => new SimpleService(sessionId));

    registry.get('session-123');

    // Should not throw when reset() doesn't exist
    expect(() => registry.reset('session-123')).not.toThrow();
    expect(registry.has('session-123')).toBe(false);
  });
});

describe('Edge Cases', () => {
  it('should handle empty string session ID', () => {
    const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

    const instance = registry.get('');
    expect(instance.sessionId).toBe('');
    expect(registry.has('')).toBe(true);
  });

  it('should handle special characters in session ID', () => {
    const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

    const specialId = 'session:with/special?chars&more=stuff';
    const instance = registry.get(specialId);

    expect(instance.sessionId).toBe(specialId);
    expect(registry.has(specialId)).toBe(true);
  });

  it('should handle rapid get/reset cycles', () => {
    const factory = vi.fn((sessionId: string) => new MockService(sessionId));
    const registry = createSessionRegistry(factory);

    for (let i = 0; i < 100; i++) {
      registry.get('cycling-session');
      registry.reset('cycling-session');
    }

    expect(factory).toHaveBeenCalledTimes(100);
    expect(registry.has('cycling-session')).toBe(false);
  });

  it('should handle concurrent access to multiple sessions', () => {
    const registry = createSessionRegistry((sessionId) => new MockService(sessionId));

    // Simulate concurrent access
    const sessions = Array.from({ length: 50 }, (_, i) => `session-${i}`);
    const instances = sessions.map((id) => registry.get(id));

    expect(registry.getActiveCount()).toBe(50);
    expect(instances.every((inst) => inst instanceof MockService)).toBe(true);
  });
});

