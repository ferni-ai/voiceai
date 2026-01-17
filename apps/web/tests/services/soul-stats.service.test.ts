/**
 * Soul Stats Service Tests
 *
 * Tests the tracking of Avatar Soul response metrics including
 * micro-expressions, protective modes, comfort pulses, and memory sparks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock admin-api
vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: vi.fn().mockResolvedValue({
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-token',
  }),
}));

// Mock fetch
globalThis.fetch = vi.fn();

// Import after mocks
import { soulStatsService, initSoulStats, type SoulStats } from '../../src/services/soul-stats.service.js';

describe('SoulStatsService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    soulStatsService.resetLocalStats();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(() => initSoulStats()).not.toThrow();
    });

    it('should load persisted stats from localStorage', () => {
      const savedStats = {
        stats: {
          microExpressions24h: 10,
          protectiveModes: 2,
          comfortPulses: 5,
          memorySparks: 3,
        },
        savedAt: new Date().toISOString(),
      };
      localStorageMock.setItem('ferni_soul_stats', JSON.stringify(savedStats));

      // Re-initialize to load
      initSoulStats();

      const stats = soulStatsService.getStats();
      expect(stats.microExpressions24h).toBe(10);
      expect(stats.protectiveModes).toBe(2);
      expect(stats.comfortPulses).toBe(5);
      expect(stats.memorySparks).toBe(3);
    });

    it('should reset expired stats (older than 24h)', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      const savedStats = {
        stats: {
          microExpressions24h: 100,
          protectiveModes: 50,
          comfortPulses: 25,
          memorySparks: 10,
        },
        savedAt: oldDate.toISOString(),
      };
      localStorageMock.setItem('ferni_soul_stats', JSON.stringify(savedStats));

      initSoulStats();

      const stats = soulStatsService.getStats();
      // Stats should be reset to 0 because they're expired
      expect(stats.microExpressions24h).toBe(0);
    });
  });

  describe('recording metrics', () => {
    beforeEach(() => {
      initSoulStats();
    });

    it('should record micro-expressions', () => {
      soulStatsService.recordMicroExpression('recognition');
      soulStatsService.recordMicroExpression('concern');

      const stats = soulStatsService.getStats();
      expect(stats.microExpressions24h).toBe(2);
    });

    it('should record protective modes', () => {
      soulStatsService.recordProtectiveMode('session-123');

      const stats = soulStatsService.getStats();
      expect(stats.protectiveModes).toBe(1);
    });

    it('should record comfort pulses', () => {
      soulStatsService.recordComfortPulse();
      soulStatsService.recordComfortPulse();
      soulStatsService.recordComfortPulse();

      const stats = soulStatsService.getStats();
      expect(stats.comfortPulses).toBe(3);
    });

    it('should record memory sparks', () => {
      soulStatsService.recordMemorySpark();

      const stats = soulStatsService.getStats();
      expect(stats.memorySparks).toBe(1);
    });

    it('should persist stats to localStorage after recording', () => {
      soulStatsService.recordMicroExpression('test');

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)?.[1] || '{}');
      expect(savedData.stats.microExpressions24h).toBe(1);
    });
  });

  describe('fetching from server', () => {
    beforeEach(() => {
      initSoulStats();
    });

    it('should merge local and server stats', async () => {
      // Record some local stats
      soulStatsService.recordMicroExpression('test');
      soulStatsService.recordProtectiveMode();

      // Mock server response
      const mockServerStats: SoulStats = {
        microExpressions24h: 50,
        protectiveModes: 10,
        comfortPulses: 25,
        memorySparks: 5,
        lastUpdated: new Date().toISOString(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerStats),
      });

      const stats = await soulStatsService.fetchFromServer();

      // Should be merged: local (1, 1, 0, 0) + server (50, 10, 25, 5)
      expect(stats.microExpressions24h).toBe(51);
      expect(stats.protectiveModes).toBe(11);
      expect(stats.comfortPulses).toBe(25);
      expect(stats.memorySparks).toBe(5);
    });

    it('should return local stats when server returns 404', async () => {
      soulStatsService.recordMicroExpression('test');

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const stats = await soulStatsService.fetchFromServer();

      expect(stats.microExpressions24h).toBe(1);
    });

    it('should handle fetch errors gracefully', async () => {
      soulStatsService.recordMicroExpression('test');

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const stats = await soulStatsService.fetchFromServer();

      // Should still return local stats
      expect(stats.microExpressions24h).toBe(1);
    });
  });

  describe('resetLocalStats', () => {
    it('should reset all local stats to zero', () => {
      initSoulStats();
      soulStatsService.recordMicroExpression('test');
      soulStatsService.recordProtectiveMode();
      soulStatsService.recordComfortPulse();
      soulStatsService.recordMemorySpark();

      soulStatsService.resetLocalStats();

      const stats = soulStatsService.getStats();
      expect(stats.microExpressions24h).toBe(0);
      expect(stats.protectiveModes).toBe(0);
      expect(stats.comfortPulses).toBe(0);
      expect(stats.memorySparks).toBe(0);
    });
  });
});
