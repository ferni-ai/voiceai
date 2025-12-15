/**
 * SessionDataManager Tests
 *
 * Tests for the centralized session data lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SessionDataManager', () => {
  let SessionDataManager: typeof import('../services/session-data-manager.js');

  beforeEach(async () => {
    vi.resetModules();
    SessionDataManager = await import('../services/session-data-manager.js');
  });

  afterEach(async () => {
    try {
      await SessionDataManager.shutdownSessionDataManager();
    } catch {
      // Ignore shutdown errors in tests
    }
  });

  describe('Service Registration', () => {
    it('should register a service successfully', () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn(),
        getStats: vi.fn().mockReturnValue({ users: 0, entries: 0 }),
      };

      manager.registerService(mockService);

      const stats = manager.getStats();
      expect(stats.services).toHaveProperty('TestService');
    });

    it('should warn when registering duplicate service', () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn(),
        getStats: vi.fn().mockReturnValue({ users: 0, entries: 0 }),
      };

      manager.registerService(mockService);
      manager.registerService(mockService); // Should warn

      // Service should still exist
      const stats = manager.getStats();
      expect(stats.services).toHaveProperty('TestService');
    });
  });

  describe('Session Tracking', () => {
    it('should track session start', () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      manager.sessionStarted('session-1', 'user-1');

      const stats = manager.getStats();
      expect(stats.activeSessions).toBe(1);
    });

    it('should clean up on session end', async () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn(),
        getStats: vi.fn().mockReturnValue({ users: 1, entries: 5 }),
      };

      manager.registerService(mockService);
      manager.sessionStarted('session-1', 'user-1');

      await manager.sessionEnded('user-1');

      expect(mockService.clearUserData).toHaveBeenCalledWith('user-1');
    });

    it('should touch session to update activity time', () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      manager.sessionStarted('session-1', 'user-1');

      manager.touchSession('user-1');

      // Session should still be active
      const stats = manager.getStats();
      expect(stats.activeSessions).toBe(1);
    });
  });

  describe('Memory Pressure Handling', () => {
    it('should return no cleanup needed when memory is low', async () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      // Mock low memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100MB
        heapTotal: 500 * 1024 * 1024, // 500MB (20% used)
        rss: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      });

      const result = await manager.checkMemoryPressure();

      expect(result.triggered).toBe(false);
      expect(result.level).toBe(0);
    });

    it('should trigger level 1 cleanup at 70% memory', async () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      // Add some sessions
      manager.sessionStarted('session-1', 'user-1');
      manager.sessionStarted('session-2', 'user-2');

      // Mock 75% memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 375 * 1024 * 1024, // 375MB
        heapTotal: 500 * 1024 * 1024, // 500MB (75% used)
        rss: 400 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      });

      const result = await manager.checkMemoryPressure();

      expect(result.triggered).toBe(true);
      expect(result.level).toBe(1);
    });

    it('should trigger level 3 cleanup at 90%+ memory', async () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn(),
        getStats: vi.fn().mockReturnValue({ users: 10, entries: 100 }),
      };

      manager.registerService(mockService);
      manager.sessionStarted('session-1', 'user-1');

      // Mock 92% memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 460 * 1024 * 1024, // 460MB
        heapTotal: 500 * 1024 * 1024, // 500MB (92% used)
        rss: 500 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      });

      const result = await manager.checkMemoryPressure();

      expect(result.triggered).toBe(true);
      expect(result.level).toBe(3);
      expect(mockService.clearAllData).toHaveBeenCalled();
    });
  });

  describe('Stats', () => {
    it('should return comprehensive stats', () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn(),
        getStats: vi.fn().mockReturnValue({ users: 5, entries: 50 }),
      };

      manager.registerService(mockService);
      manager.sessionStarted('session-1', 'user-1');

      const stats = manager.getStats();

      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('services');
      expect(stats).toHaveProperty('memory');
      expect(stats.memory).toHaveProperty('heapUsedMB');
      expect(stats.memory).toHaveProperty('percentUsed');
    });
  });

  describe('Shutdown', () => {
    it('should clear all services on shutdown', async () => {
      const manager = SessionDataManager.initializeSessionDataManager();

      const mockService = {
        name: 'TestService',
        clearUserData: vi.fn(),
        clearAllData: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn().mockReturnValue({ users: 5, entries: 50 }),
      };

      manager.registerService(mockService);

      await manager.shutdown();

      expect(mockService.clearAllData).toHaveBeenCalled();
    });
  });
});


