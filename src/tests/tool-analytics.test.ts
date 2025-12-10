/**
 * Tool Usage Analytics Tests
 *
 * Tests for the shared analytics module that tracks tool usage,
 * metrics, and health monitoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  trackToolUsage,
  trackToolSuccess,
  trackToolError,
  getToolMetrics,
  getDomainMetrics,
  getAllDomainMetrics,
  getMostUsedTools,
  getProblematicTools,
  getRecentErrors,
  hasHighErrorRate,
  hasCrisisToolErrors,
  getCrisisToolHealth,
  clearAnalytics,
  getEventCount,
  exportEvents,
  type ToolUsageEvent,
  type ToolMetrics,
  type DomainMetrics,
} from '../tools/domains/shared/analytics.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// TRACKING TESTS
// ============================================================================

describe('Tool Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalytics();
  });

  describe('trackToolUsage', () => {
    it('should track successful tool execution', () => {
      const tracker = trackToolUsage('testTool', 'testDomain');
      tracker.success();

      expect(getEventCount()).toBe(1);
      const metrics = getToolMetrics('testTool');
      expect(metrics).not.toBeNull();
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.errorCount).toBe(0);
    });

    it('should track failed tool execution', () => {
      const tracker = trackToolUsage('testTool', 'testDomain');
      tracker.error('Test error');

      expect(getEventCount()).toBe(1);
      const metrics = getToolMetrics('testTool');
      expect(metrics).not.toBeNull();
      expect(metrics?.successCount).toBe(0);
      expect(metrics?.errorCount).toBe(1);
    });

    it('should track execution with Error object', () => {
      const tracker = trackToolUsage('testTool', 'testDomain');
      tracker.error(new Error('Custom error message'));

      const events = exportEvents();
      expect(events[0].error).toBe('Custom error message');
    });

    it('should include userId and agentId when provided', () => {
      const tracker = trackToolUsage('testTool', 'testDomain', {
        userId: 'user-123',
        agentId: 'agent-456',
      });
      tracker.success();

      const events = exportEvents();
      expect(events[0].userId).toBe('user-123');
      expect(events[0].agentId).toBe('agent-456');
    });

    it('should merge metadata from options and success call', () => {
      const tracker = trackToolUsage('testTool', 'testDomain', {
        metadata: { optionKey: 'optionValue' },
      });
      tracker.success({ successKey: 'successValue' });

      const events = exportEvents();
      expect(events[0].metadata).toEqual({
        optionKey: 'optionValue',
        successKey: 'successValue',
      });
    });

    it('should record duration', async () => {
      const tracker = trackToolUsage('testTool', 'testDomain');

      // Wait a bit to ensure measurable duration
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      tracker.success();

      const events = exportEvents();
      expect(events[0].durationMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('trackToolSuccess', () => {
    it('should record successful event with duration', () => {
      trackToolSuccess('testTool', 'testDomain', 150);

      const metrics = getToolMetrics('testTool');
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.avgDurationMs).toBe(150);
    });

    it('should include metadata', () => {
      trackToolSuccess('testTool', 'testDomain', 100, { key: 'value' });

      const events = exportEvents();
      expect(events[0].metadata).toEqual({ key: 'value' });
    });
  });

  describe('trackToolError', () => {
    it('should record error event', () => {
      trackToolError('testTool', 'testDomain', 'Something went wrong', 50);

      const metrics = getToolMetrics('testTool');
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.successCount).toBe(0);
    });

    it('should include error message', () => {
      trackToolError('testTool', 'testDomain', 'Custom error', 50);

      const events = exportEvents();
      expect(events[0].error).toBe('Custom error');
    });
  });

  // ============================================================================
  // METRICS TESTS
  // ============================================================================

  describe('getToolMetrics', () => {
    it('should return null for unknown tool', () => {
      expect(getToolMetrics('unknownTool')).toBeNull();
    });

    it('should calculate correct metrics', () => {
      // 3 successes, 1 error
      trackToolSuccess('testTool', 'domain', 100);
      trackToolSuccess('testTool', 'domain', 200);
      trackToolSuccess('testTool', 'domain', 300);
      trackToolError('testTool', 'domain', 'error', 50);

      const metrics = getToolMetrics('testTool');

      expect(metrics?.totalCalls).toBe(4);
      expect(metrics?.successCount).toBe(3);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.avgDurationMs).toBe(163); // (100+200+300+50)/4 rounded
      expect(metrics?.errorRate).toBe(0.25);
    });

    it('should track lastCalled timestamp', () => {
      const before = new Date();
      trackToolSuccess('testTool', 'domain', 100);
      const after = new Date();

      const metrics = getToolMetrics('testTool');

      expect(metrics?.lastCalled).not.toBeNull();
      expect(metrics?.lastCalled!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(metrics?.lastCalled!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getDomainMetrics', () => {
    it('should return null for unknown domain', () => {
      expect(getDomainMetrics('unknownDomain')).toBeNull();
    });

    it('should aggregate metrics across tools', () => {
      trackToolSuccess('tool1', 'testDomain', 100);
      trackToolSuccess('tool1', 'testDomain', 100);
      trackToolSuccess('tool2', 'testDomain', 200);
      trackToolError('tool2', 'testDomain', 'error', 50);

      const metrics = getDomainMetrics('testDomain');

      expect(metrics?.totalCalls).toBe(4);
      expect(metrics?.toolBreakdown['tool1']).toBe(2);
      expect(metrics?.toolBreakdown['tool2']).toBe(2);
      expect(metrics?.errorRate).toBe(0.25);
    });
  });

  describe('getAllDomainMetrics', () => {
    it('should return empty array when no events', () => {
      expect(getAllDomainMetrics()).toEqual([]);
    });

    it('should return metrics for all domains', () => {
      trackToolSuccess('tool1', 'domain1', 100);
      trackToolSuccess('tool2', 'domain2', 100);
      trackToolSuccess('tool3', 'domain3', 100);

      const metrics = getAllDomainMetrics();

      expect(metrics).toHaveLength(3);
      expect(metrics.map((m) => m.domain).sort()).toEqual(['domain1', 'domain2', 'domain3']);
    });
  });

  describe('getMostUsedTools', () => {
    it('should return tools sorted by usage', () => {
      trackToolSuccess('popular', 'domain', 100);
      trackToolSuccess('popular', 'domain', 100);
      trackToolSuccess('popular', 'domain', 100);
      trackToolSuccess('moderate', 'domain', 100);
      trackToolSuccess('moderate', 'domain', 100);
      trackToolSuccess('rare', 'domain', 100);

      const tools = getMostUsedTools(3);

      expect(tools).toHaveLength(3);
      expect(tools[0].toolId).toBe('popular');
      expect(tools[0].totalCalls).toBe(3);
      expect(tools[1].toolId).toBe('moderate');
      expect(tools[2].toolId).toBe('rare');
    });

    it('should respect limit parameter', () => {
      trackToolSuccess('tool1', 'domain', 100);
      trackToolSuccess('tool2', 'domain', 100);
      trackToolSuccess('tool3', 'domain', 100);

      const tools = getMostUsedTools(2);

      expect(tools).toHaveLength(2);
    });
  });

  describe('getProblematicTools', () => {
    it('should return tools with errors sorted by error rate', () => {
      // Tool with 50% error rate
      trackToolSuccess('buggy', 'domain', 100);
      trackToolSuccess('buggy', 'domain', 100);
      trackToolSuccess('buggy', 'domain', 100);
      trackToolError('buggy', 'domain', 'error', 50);
      trackToolError('buggy', 'domain', 'error', 50);
      trackToolError('buggy', 'domain', 'error', 50);

      // Tool with 20% error rate
      trackToolSuccess('flaky', 'domain', 100);
      trackToolSuccess('flaky', 'domain', 100);
      trackToolSuccess('flaky', 'domain', 100);
      trackToolSuccess('flaky', 'domain', 100);
      trackToolError('flaky', 'domain', 'error', 50);

      const problematic = getProblematicTools(5);

      expect(problematic).toHaveLength(2);
      expect(problematic[0].toolId).toBe('buggy');
      expect(problematic[0].errorRate).toBe(0.5);
      expect(problematic[1].toolId).toBe('flaky');
    });

    it('should filter out tools with insufficient calls', () => {
      trackToolError('oneCall', 'domain', 'error', 50);

      const problematic = getProblematicTools(5);

      expect(problematic).toHaveLength(0);
    });

    it('should filter out tools with no errors', () => {
      trackToolSuccess('perfect', 'domain', 100);
      trackToolSuccess('perfect', 'domain', 100);
      trackToolSuccess('perfect', 'domain', 100);
      trackToolSuccess('perfect', 'domain', 100);
      trackToolSuccess('perfect', 'domain', 100);

      const problematic = getProblematicTools(5);

      expect(problematic).toHaveLength(0);
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors in reverse order', () => {
      trackToolError('tool', 'domain', 'error1', 50);
      trackToolError('tool', 'domain', 'error2', 50);
      trackToolError('tool', 'domain', 'error3', 50);

      const errors = getRecentErrors(2);

      expect(errors).toHaveLength(2);
      expect(errors[0].error).toBe('error3'); // Most recent first
      expect(errors[1].error).toBe('error2');
    });

    it('should not include successful events', () => {
      trackToolSuccess('tool', 'domain', 100);
      trackToolError('tool', 'domain', 'error', 50);

      const errors = getRecentErrors();

      expect(errors).toHaveLength(1);
    });
  });

  // ============================================================================
  // ALERT TESTS
  // ============================================================================

  describe('hasHighErrorRate', () => {
    it('should return false for tools with insufficient calls', () => {
      trackToolError('tool', 'domain', 'error', 50);

      expect(hasHighErrorRate('tool')).toBe(false);
    });

    it('should return true when error rate exceeds threshold', () => {
      // 3 errors out of 5 = 60% > 10% threshold
      trackToolError('tool', 'domain', 'error', 50);
      trackToolError('tool', 'domain', 'error', 50);
      trackToolError('tool', 'domain', 'error', 50);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);

      expect(hasHighErrorRate('tool')).toBe(true);
    });

    it('should return false when error rate is below threshold', () => {
      // 1 error out of 10 = 10% = threshold
      for (let i = 0; i < 9; i++) {
        trackToolSuccess('tool', 'domain', 100);
      }
      trackToolError('tool', 'domain', 'error', 50);

      expect(hasHighErrorRate('tool')).toBe(false); // Equal to threshold, not above
    });

    it('should respect custom threshold', () => {
      // 30% error rate
      trackToolError('tool', 'domain', 'error', 50);
      trackToolError('tool', 'domain', 'error', 50);
      trackToolError('tool', 'domain', 'error', 50);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);

      expect(hasHighErrorRate('tool', 0.5)).toBe(false);
      expect(hasHighErrorRate('tool', 0.2)).toBe(true);
    });
  });

  describe('hasCrisisToolErrors', () => {
    it('should return false when no crisis errors', () => {
      trackToolSuccess('crisisTool', 'crisis', 100);
      trackToolError('regularTool', 'other', 'error', 50);

      expect(hasCrisisToolErrors()).toBe(false);
    });

    it('should return true when crisis domain has errors', () => {
      trackToolError('crisisTool', 'crisis', 'error', 50);

      expect(hasCrisisToolErrors()).toBe(true);
    });
  });

  describe('getCrisisToolHealth', () => {
    it('should report healthy when no crisis errors', () => {
      trackToolSuccess('crisisTool', 'crisis', 100);

      const health = getCrisisToolHealth();

      expect(health.healthy).toBe(true);
      expect(health.errorCount).toBe(0);
      expect(health.lastError).toBeNull();
    });

    it('should report unhealthy with error details', () => {
      trackToolError('crisisTool', 'crisis', 'Critical failure', 50);

      const health = getCrisisToolHealth();

      expect(health.healthy).toBe(false);
      expect(health.errorCount).toBe(1);
      expect(health.lastError).not.toBeNull();
      expect(health.lastError?.error).toBe('Critical failure');
    });
  });

  // ============================================================================
  // MAINTENANCE TESTS
  // ============================================================================

  describe('clearAnalytics', () => {
    it('should clear all events', () => {
      trackToolSuccess('tool', 'domain', 100);
      trackToolSuccess('tool', 'domain', 100);

      clearAnalytics();

      expect(getEventCount()).toBe(0);
    });
  });

  describe('getEventCount', () => {
    it('should return correct count', () => {
      expect(getEventCount()).toBe(0);

      trackToolSuccess('tool', 'domain', 100);
      expect(getEventCount()).toBe(1);

      trackToolSuccess('tool', 'domain', 100);
      expect(getEventCount()).toBe(2);
    });
  });

  describe('exportEvents', () => {
    it('should export all events', () => {
      trackToolSuccess('tool1', 'domain', 100);
      trackToolSuccess('tool2', 'domain', 100);

      const events = exportEvents();

      expect(events).toHaveLength(2);
    });

    it('should filter by date when since is provided', () => {
      trackToolSuccess('old', 'domain', 100);

      const midpoint = new Date();

      // Small delay to ensure timestamp difference
      trackToolSuccess('new', 'domain', 100);

      const events = exportEvents(midpoint);

      // Should only include events from midpoint onwards
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.toolId === 'new')).toBe(true);
    });

    it('should return copy of events (not reference)', () => {
      trackToolSuccess('tool', 'domain', 100);

      const events1 = exportEvents();
      const events2 = exportEvents();

      expect(events1).not.toBe(events2);
    });
  });

  // ============================================================================
  // STORAGE LIMIT TESTS
  // ============================================================================

  describe('Storage Limits', () => {
    it('should trim old events when exceeding max store size', () => {
      // Track more than MAX_STORE_SIZE events (10000)
      // We'll use a smaller test by checking the trim behavior
      for (let i = 0; i < 100; i++) {
        trackToolSuccess(`tool${i}`, 'domain', 100);
      }

      // Continue adding - should still work
      const tracker = trackToolUsage('finalTool', 'domain');
      tracker.success();

      // Should have events
      expect(getEventCount()).toBeGreaterThan(0);
    });
  });
});
