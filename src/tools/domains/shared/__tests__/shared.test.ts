/**
 * Shared Domain Utilities Tests
 *
 * Tests for persistence, analytics, and feature flag utilities.
 *
 * Run with: npx vitest run src/tools/domains/shared/__tests__/shared.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: {
    apps: [],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => ({
      collection: vi.fn(() => ({
        add: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
        doc: vi.fn(() => ({
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({ exists: false }),
        })),
        get: vi.fn().mockResolvedValue({ docs: [] }),
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ docs: [] }),
            })),
          })),
        })),
      })),
    })),
  },
  firestore: {
    FieldValue: {
      increment: vi.fn((n) => ({ increment: n })),
    },
  },
}));

// Mock feature flags config
vi.mock('../../../../config/feature-flags.js', () => ({
  isLifeCoachDomainEnabled: vi.fn((domain: string) => {
    return domain !== 'disabled-domain';
  }),
  getEnabledLifeCoachDomains: vi.fn(() => ['health', 'career', 'crisis']),
  isLifeCoachAnalyticsEnabled: vi.fn(() => true),
  emergencyDisableLifeCoachDomain: vi.fn(),
  getFeatureFlags: vi.fn(() => ({})),
  isFeatureEnabled: vi.fn(() => true),
  reloadFeatureFlags: vi.fn(),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  persistInsight,
  persistKeyMoment,
  persistTrackedItem,
  addToSessionContext,
  type ToolCtxWithUserData,
} from '../persistence.js';

import { trackToolUsage, getToolMetrics, clearAnalytics, hasHighErrorRate } from '../analytics.js';

import {
  isLifeCoachDomainEnabled,
  getEnabledLifeCoachDomains,
  isLifeCoachAnalyticsEnabled,
} from '../feature-flags.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Shared Domain Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalytics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Persistence Utilities
  // --------------------------------------------------------------------------

  describe('Persistence Utilities', () => {
    describe('persistInsight', () => {
      it('should return false when no services available', () => {
        const toolCtx: ToolCtxWithUserData = {
          userData: {},
        };

        const result = persistInsight(toolCtx, {
          domain: 'health',
          type: 'exercise_log',
          data: { activity: 'running', duration: 30 },
        });

        expect(result).toBe(false);
      });

      it('should call captureInsight when service available', () => {
        const mockCaptureInsight = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              captureInsight: mockCaptureInsight,
            },
          },
        };

        const result = persistInsight(toolCtx, {
          domain: 'health',
          type: 'exercise_log',
          data: { activity: 'running', duration: 30 },
          confidence: 0.9,
        });

        expect(result).toBe(true);
        expect(mockCaptureInsight).toHaveBeenCalledWith(
          'exercise_log',
          'health_exercise_log',
          expect.any(String),
          0.9
        );
      });

      it('should use default confidence when not provided', () => {
        const mockCaptureInsight = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              captureInsight: mockCaptureInsight,
            },
          },
        };

        persistInsight(toolCtx, {
          domain: 'finance',
          type: 'spending_pattern',
          data: { category: 'food', amount: 150 },
        });

        expect(mockCaptureInsight).toHaveBeenCalledWith(
          'spending_pattern',
          'finance_spending_pattern',
          expect.any(String),
          0.7 // default confidence
        );
      });
    });

    describe('persistKeyMoment', () => {
      it('should store moment in session keyMoments', () => {
        const toolCtx: ToolCtxWithUserData = {
          userData: {},
        };

        persistKeyMoment(toolCtx, {
          domain: 'career',
          type: 'milestone',
          summary: 'Got promoted to senior engineer',
          emotionalWeight: 'heavy',
        });

        expect(toolCtx.userData?.keyMoments).toContain(
          '[career/milestone] Got promoted to senior engineer'
        );
      });

      it('should call learningEngine when available', () => {
        const mockCaptureExternalKeyMoment = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              learningEngine: {
                captureExternalKeyMoment: mockCaptureExternalKeyMoment,
              },
            },
          },
        };

        const result = persistKeyMoment(toolCtx, {
          domain: 'health',
          type: 'breakthrough',
          summary: 'First time running 5k',
          emotionalWeight: 'heavy',
          topics: ['exercise', 'running'],
        });

        expect(result).toBe(true);
        expect(mockCaptureExternalKeyMoment).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'breakthrough',
            summary: 'First time running 5k',
            emotionalWeight: 'heavy',
            topics: ['exercise', 'running'],
          })
        );
      });

      it('should map non-core types to milestone', () => {
        const mockCaptureExternalKeyMoment = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              learningEngine: {
                captureExternalKeyMoment: mockCaptureExternalKeyMoment,
              },
            },
          },
        };

        persistKeyMoment(toolCtx, {
          domain: 'career',
          type: 'custom_achievement',
          summary: 'Custom moment',
        });

        expect(mockCaptureExternalKeyMoment).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'milestone', // Should map to milestone
          })
        );
      });
    });

    describe('persistTrackedItem', () => {
      it('should wrap item as insight with appropriate confidence', () => {
        const mockCaptureInsight = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              captureInsight: mockCaptureInsight,
            },
          },
        };

        persistTrackedItem(toolCtx, {
          domain: 'health',
          itemType: 'workout',
          item: { exercise: 'squats', reps: 20 },
          importance: 'high',
        });

        expect(mockCaptureInsight).toHaveBeenCalledWith(
          'workout',
          'health_workout',
          expect.stringContaining('squats'),
          0.9 // high importance
        );
      });

      it('should use lower confidence for low importance items', () => {
        const mockCaptureInsight = vi.fn();
        const toolCtx: ToolCtxWithUserData = {
          userData: {
            services: {
              captureInsight: mockCaptureInsight,
            },
          },
        };

        persistTrackedItem(toolCtx, {
          domain: 'productivity',
          itemType: 'note',
          item: { content: 'random thought' },
          importance: 'low',
        });

        expect(mockCaptureInsight).toHaveBeenCalledWith(
          'note',
          'productivity_note',
          expect.any(String),
          0.5 // low importance
        );
      });
    });

    describe('addToSessionContext', () => {
      it('should add context to session keyMoments', () => {
        const toolCtx: ToolCtxWithUserData = {
          userData: {},
        };

        addToSessionContext(toolCtx, 'health', 'lastExercise', { type: 'running', duration: 30 });

        expect(toolCtx.userData?.keyMoments).toHaveLength(1);
        expect(toolCtx.userData?.keyMoments?.[0]).toContain('[health:lastExercise]');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Analytics Utilities
  // --------------------------------------------------------------------------

  describe('Analytics Utilities', () => {
    describe('trackToolUsage', () => {
      it('should return success and error functions', () => {
        const tracker = trackToolUsage('testTool', 'test-domain');

        expect(tracker.success).toBeDefined();
        expect(tracker.error).toBeDefined();
        expect(typeof tracker.success).toBe('function');
        expect(typeof tracker.error).toBe('function');
      });

      it('should track successful tool usage', () => {
        const tracker = trackToolUsage('logExercise', 'health');
        tracker.success({ workout: 'running' });

        const metrics = getToolMetrics('logExercise');
        expect(metrics).toBeDefined();
        expect(metrics?.totalCalls).toBe(1);
        expect(metrics?.successCount).toBe(1);
        expect(metrics?.errorCount).toBe(0);
      });

      it('should track errored tool usage', () => {
        const tracker = trackToolUsage('failingTool', 'test');
        tracker.error(new Error('Test error'));

        const metrics = getToolMetrics('failingTool');
        expect(metrics).toBeDefined();
        expect(metrics?.totalCalls).toBe(1);
        expect(metrics?.successCount).toBe(0);
        expect(metrics?.errorCount).toBe(1);
      });

      it('should track multiple calls to same tool', () => {
        const tracker1 = trackToolUsage('multiCallTool', 'test');
        tracker1.success();

        const tracker2 = trackToolUsage('multiCallTool', 'test');
        tracker2.success();

        const tracker3 = trackToolUsage('multiCallTool', 'test');
        tracker3.error(new Error('Failed'));

        const metrics = getToolMetrics('multiCallTool');
        expect(metrics?.totalCalls).toBe(3);
        expect(metrics?.successCount).toBe(2);
        expect(metrics?.errorCount).toBe(1);
      });
    });

    describe('hasHighErrorRate', () => {
      it('should return false for tools with no errors', () => {
        const tracker = trackToolUsage('perfectTool', 'test');
        tracker.success();
        tracker.success();
        tracker.success();

        expect(hasHighErrorRate('perfectTool')).toBe(false);
      });

      it('should return true for tools with high error rate', () => {
        // Need enough calls to get past minimum threshold
        for (let i = 0; i < 10; i++) {
          const tracker = trackToolUsage('brokenTool', 'test');
          tracker.error(new Error('Always fails'));
        }

        expect(hasHighErrorRate('brokenTool')).toBe(true);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------

  describe('Feature Flags', () => {
    describe('isLifeCoachDomainEnabled', () => {
      it('should return true for enabled domains', () => {
        expect(isLifeCoachDomainEnabled('health')).toBe(true);
        expect(isLifeCoachDomainEnabled('career')).toBe(true);
      });

      it('should return false for disabled domains', () => {
        // Cast to test invalid domain handling
        expect(
          isLifeCoachDomainEnabled(
            'disabled-domain' as unknown as Parameters<typeof isLifeCoachDomainEnabled>[0]
          )
        ).toBe(false);
      });
    });

    describe('getEnabledLifeCoachDomains', () => {
      it('should return list of enabled domains', () => {
        const domains = getEnabledLifeCoachDomains();

        expect(Array.isArray(domains)).toBe(true);
        expect(domains).toContain('health');
        expect(domains).toContain('crisis');
      });
    });

    describe('isLifeCoachAnalyticsEnabled', () => {
      it('should return analytics enabled state', () => {
        expect(isLifeCoachAnalyticsEnabled()).toBe(true);
      });
    });
  });
});
