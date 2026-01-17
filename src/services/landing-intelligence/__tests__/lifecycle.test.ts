/**
 * Lifecycle Tests
 *
 * Tests for landing intelligence initialization, shutdown, health checks,
 * and feature flags.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted for mocks that need to be referenced in vi.mock
const { mockCheckGeminiHealth, mockClearCache } = vi.hoisted(() => ({
  mockCheckGeminiHealth: vi.fn(),
  mockClearCache: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../gemini-client.js', () => ({
  checkGeminiHealth: mockCheckGeminiHealth,
  clearCache: mockClearCache,
}));

import {
  initLandingIntelligence,
  shutdownLandingIntelligence,
  getLandingIntelligenceHealth,
  setLandingIntelligenceFlags,
  getLandingIntelligenceFlags,
  isFeatureEnabled,
  type LandingIntelligenceHealth,
  type LandingIntelligenceFlags,
} from '../lifecycle.js';

describe('LandingIntelligenceLifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset state by shutting down
    await shutdownLandingIntelligence();
    mockCheckGeminiHealth.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initLandingIntelligence', () => {
    it('should initialize successfully when Gemini is healthy', async () => {
      mockCheckGeminiHealth.mockResolvedValue(true);

      const result = await initLandingIntelligence();

      expect(result).toBe(true);
      expect(mockCheckGeminiHealth).toHaveBeenCalled();
    });

    it('should return false when Gemini is unhealthy', async () => {
      mockCheckGeminiHealth.mockResolvedValue(false);

      const result = await initLandingIntelligence();

      expect(result).toBe(false);
    });

    it('should handle Gemini health check errors gracefully', async () => {
      mockCheckGeminiHealth.mockRejectedValue(new Error('Health check failed'));

      const result = await initLandingIntelligence();

      expect(result).toBe(false);
    });

    it('should return cached result on repeated calls', async () => {
      mockCheckGeminiHealth.mockResolvedValue(true);

      await initLandingIntelligence();
      const result = await initLandingIntelligence();

      // Second call should use cached result
      expect(result).toBe(true);
      expect(mockCheckGeminiHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutdownLandingIntelligence', () => {
    it('should clear cache on shutdown', async () => {
      await shutdownLandingIntelligence();

      expect(mockClearCache).toHaveBeenCalled();
    });

    it('should reset health status', async () => {
      mockCheckGeminiHealth.mockResolvedValue(true);
      await initLandingIntelligence();

      await shutdownLandingIntelligence();

      const health = getLandingIntelligenceHealth();
      expect(health.initialized).toBe(false);
      expect(health.geminiHealthy).toBe(false);
    });

    it('should allow re-initialization after shutdown', async () => {
      mockCheckGeminiHealth.mockResolvedValue(true);
      await initLandingIntelligence();
      await shutdownLandingIntelligence();

      // Re-initialize
      const result = await initLandingIntelligence();

      expect(result).toBe(true);
      expect(mockCheckGeminiHealth).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLandingIntelligenceHealth', () => {
    it('should return unhealthy when not initialized', () => {
      const health = getLandingIntelligenceHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.initialized).toBe(false);
    });

    it('should return healthy when initialized with Gemini', async () => {
      mockCheckGeminiHealth.mockResolvedValue(true);
      await initLandingIntelligence();

      const health = getLandingIntelligenceHealth();

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
      expect(health.geminiHealthy).toBe(true);
    });

    it('should return degraded when initialized without Gemini', async () => {
      mockCheckGeminiHealth.mockResolvedValue(false);
      await initLandingIntelligence();

      const health = getLandingIntelligenceHealth();

      expect(health.status).toBe('degraded');
      expect(health.initialized).toBe(true);
      expect(health.geminiHealthy).toBe(false);
    });

    it('should have correct type structure', () => {
      const health = getLandingIntelligenceHealth();

      expect(health).toHaveProperty('initialized');
      expect(health).toHaveProperty('geminiHealthy');
      expect(health).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('Feature Flags', () => {
    beforeEach(async () => {
      // Reset flags by setting defaults
      setLandingIntelligenceFlags({
        enableAIVariants: true,
        enableIntentDetection: true,
        enableLayoutOptimization: true,
        enableChatWidget: true,
        enableTimeAware: true,
        enableReturningVisitor: true,
      });
    });

    describe('getLandingIntelligenceFlags', () => {
      it('should return all flags', () => {
        const flags = getLandingIntelligenceFlags();

        expect(flags).toHaveProperty('enableAIVariants');
        expect(flags).toHaveProperty('enableIntentDetection');
        expect(flags).toHaveProperty('enableLayoutOptimization');
        expect(flags).toHaveProperty('enableChatWidget');
        expect(flags).toHaveProperty('enableTimeAware');
        expect(flags).toHaveProperty('enableReturningVisitor');
      });

      it('should return a copy, not the original object', () => {
        const flags1 = getLandingIntelligenceFlags();
        const flags2 = getLandingIntelligenceFlags();

        expect(flags1).not.toBe(flags2);
        expect(flags1).toEqual(flags2);
      });

      it('should have default values as true', () => {
        const flags = getLandingIntelligenceFlags();

        expect(flags.enableAIVariants).toBe(true);
        expect(flags.enableIntentDetection).toBe(true);
        expect(flags.enableLayoutOptimization).toBe(true);
      });
    });

    describe('setLandingIntelligenceFlags', () => {
      it('should update specific flags', () => {
        setLandingIntelligenceFlags({ enableAIVariants: false });

        const flags = getLandingIntelligenceFlags();
        expect(flags.enableAIVariants).toBe(false);
        expect(flags.enableIntentDetection).toBe(true); // Unchanged
      });

      it('should update multiple flags at once', () => {
        setLandingIntelligenceFlags({
          enableAIVariants: false,
          enableChatWidget: false,
        });

        const flags = getLandingIntelligenceFlags();
        expect(flags.enableAIVariants).toBe(false);
        expect(flags.enableChatWidget).toBe(false);
      });

      it('should preserve other flags when updating', () => {
        setLandingIntelligenceFlags({ enableAIVariants: false });
        setLandingIntelligenceFlags({ enableChatWidget: false });

        const flags = getLandingIntelligenceFlags();
        expect(flags.enableAIVariants).toBe(false);
        expect(flags.enableChatWidget).toBe(false);
      });
    });

    describe('isFeatureEnabled', () => {
      it('should return true for enabled features', () => {
        expect(isFeatureEnabled('enableAIVariants')).toBe(true);
        expect(isFeatureEnabled('enableIntentDetection')).toBe(true);
      });

      it('should return false for disabled features', () => {
        setLandingIntelligenceFlags({ enableAIVariants: false });

        expect(isFeatureEnabled('enableAIVariants')).toBe(false);
      });

      it('should reflect flag changes', () => {
        expect(isFeatureEnabled('enableChatWidget')).toBe(true);

        setLandingIntelligenceFlags({ enableChatWidget: false });

        expect(isFeatureEnabled('enableChatWidget')).toBe(false);
      });
    });
  });

  describe('Type Exports', () => {
    it('should export LandingIntelligenceHealth type correctly', () => {
      const health: LandingIntelligenceHealth = {
        initialized: true,
        geminiHealthy: true,
        status: 'healthy',
      };

      expect(health.status).toBe('healthy');
    });

    it('should export LandingIntelligenceFlags type correctly', () => {
      const flags: LandingIntelligenceFlags = {
        enableAIVariants: true,
        enableIntentDetection: false,
        enableLayoutOptimization: true,
        enableChatWidget: true,
        enableTimeAware: false,
        enableReturningVisitor: true,
      };

      expect(flags.enableAIVariants).toBe(true);
    });
  });
});
