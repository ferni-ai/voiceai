/**
 * Growth Metrics Tests
 *
 * Tests for the growth automation observability and metrics system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getGrowthMetrics,
  resetGrowthMetrics,
  trackOperation,
  formatMetricsSummary,
  OperationTracker,
  type OperationMetric,
  type AggregatedMetrics,
  type GrowthMetricsSummary,
} from '../../../apps/cli/src/commands/growth/growth-metrics.js';

describe('Growth Metrics - Observability', () => {
  beforeEach(() => {
    resetGrowthMetrics();
  });

  afterEach(() => {
    resetGrowthMetrics();
  });

  // ============================================================================
  // SINGLETON PATTERN
  // ============================================================================

  describe('Metrics Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const metrics1 = getGrowthMetrics();
      const metrics2 = getGrowthMetrics();

      expect(metrics1).toBe(metrics2);
    });

    it('should reset to new instance after resetGrowthMetrics', () => {
      const metrics1 = getGrowthMetrics();
      metrics1.recordContentGenerated('tiktok');

      resetGrowthMetrics();

      const metrics2 = getGrowthMetrics();
      const summary = metrics2.getSummary();

      expect(summary.content.generated).toBe(0);
    });
  });

  // ============================================================================
  // OPERATION TRACKING
  // ============================================================================

  describe('Operation Tracking', () => {
    it('should start operation and return tracker', () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('test_operation');

      expect(tracker).toBeInstanceOf(OperationTracker);
    });

    it('should track successful operation', () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('test_operation');

      tracker.success();

      const recent = metrics.getRecentOperations(1);
      expect(recent[0].success).toBe(true);
      expect(recent[0].duration).toBeDefined();
      expect(recent[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should track failed operation', () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('test_operation');

      tracker.failure('Test error message');

      const recent = metrics.getRecentOperations(1);
      expect(recent[0].success).toBe(false);
      expect(recent[0].error).toBe('Test error message');
    });

    it('should include metadata in operation', () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('test_operation', { platform: 'tiktok' });

      tracker.success({ result: 'posted' });

      const recent = metrics.getRecentOperations(1);
      expect(recent[0].metadata).toEqual({ platform: 'tiktok', result: 'posted' });
    });

    it('should calculate duration correctly', async () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('slow_operation');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      tracker.success();

      const recent = metrics.getRecentOperations(1);
      expect(recent[0].duration).toBeGreaterThanOrEqual(10);
    });
  });

  // ============================================================================
  // API CALL TRACKING
  // ============================================================================

  describe('API Call Tracking', () => {
    it('should track successful API calls', () => {
      const metrics = getGrowthMetrics();

      metrics.recordApiCall('reddit', true);
      metrics.recordApiCall('reddit', true);
      metrics.recordApiCall('reddit', false);

      const summary = metrics.getSummary();
      expect(summary.apiCalls.reddit.calls).toBe(3);
      expect(summary.apiCalls.reddit.errors).toBe(1);
    });

    it('should track all API platforms', () => {
      const metrics = getGrowthMetrics();

      metrics.recordApiCall('reddit', true);
      metrics.recordApiCall('tiktok', true);
      metrics.recordApiCall('email', true);
      metrics.recordApiCall('openai', true);
      metrics.recordApiCall('anthropic', true);

      const summary = metrics.getSummary();
      expect(summary.apiCalls.reddit.calls).toBe(1);
      expect(summary.apiCalls.tiktok.calls).toBe(1);
      expect(summary.apiCalls.email.calls).toBe(1);
      expect(summary.apiCalls.openai.calls).toBe(1);
      expect(summary.apiCalls.anthropic.calls).toBe(1);
    });
  });

  // ============================================================================
  // CONTENT STATS
  // ============================================================================

  describe('Content Stats', () => {
    it('should track content generated', () => {
      const metrics = getGrowthMetrics();

      metrics.recordContentGenerated('tiktok');
      metrics.recordContentGenerated('tiktok');
      metrics.recordContentGenerated('reddit');

      const summary = metrics.getSummary();
      expect(summary.content.generated).toBe(3);
      expect(summary.content.platforms.tiktok).toBe(2);
      expect(summary.content.platforms.reddit).toBe(1);
    });

    it('should track content posted', () => {
      const metrics = getGrowthMetrics();

      metrics.recordContentPosted('tiktok');
      metrics.recordContentPosted('reddit');

      const summary = metrics.getSummary();
      expect(summary.content.posted).toBe(2);
    });

    it('should track content failures', () => {
      const metrics = getGrowthMetrics();

      metrics.recordContentFailed();
      metrics.recordContentFailed();

      const summary = metrics.getSummary();
      expect(summary.content.failed).toBe(2);
    });
  });

  // ============================================================================
  // INFLUENCER STATS
  // ============================================================================

  describe('Influencer Stats', () => {
    it('should track influencer funnel', () => {
      const metrics = getGrowthMetrics();

      metrics.recordInfluencerContacted();
      metrics.recordInfluencerContacted();
      metrics.recordInfluencerResponded();
      metrics.recordInfluencerConverted();

      const summary = metrics.getSummary();
      expect(summary.influencers.contacted).toBe(2);
      expect(summary.influencers.responded).toBe(1);
      expect(summary.influencers.converted).toBe(1);
    });
  });

  // ============================================================================
  // TASK STATS
  // ============================================================================

  describe('Task Stats', () => {
    it('should track task lifecycle', () => {
      const metrics = getGrowthMetrics();

      metrics.recordTaskScheduled();
      metrics.recordTaskScheduled();
      metrics.recordTaskCompleted();
      metrics.recordTaskFailed();

      const summary = metrics.getSummary();
      expect(summary.tasks.scheduled).toBe(2);
      expect(summary.tasks.completed).toBe(1);
      expect(summary.tasks.failed).toBe(1);
    });
  });

  // ============================================================================
  // AGGREGATED METRICS
  // ============================================================================

  describe('Aggregated Metrics', () => {
    it('should return zeros when no operations', () => {
      const metrics = getGrowthMetrics();
      const aggregated = metrics.getAggregatedMetrics();

      expect(aggregated.totalOperations).toBe(0);
      expect(aggregated.successCount).toBe(0);
      expect(aggregated.failureCount).toBe(0);
      expect(aggregated.successRate).toBe(0);
      expect(aggregated.averageDuration).toBe(0);
    });

    it('should calculate success rate correctly', () => {
      const metrics = getGrowthMetrics();

      for (let i = 0; i < 8; i++) {
        const tracker = metrics.startOperation('test');
        tracker.success();
      }
      for (let i = 0; i < 2; i++) {
        const tracker = metrics.startOperation('test');
        tracker.failure('error');
      }

      const aggregated = metrics.getAggregatedMetrics();
      expect(aggregated.totalOperations).toBe(10);
      expect(aggregated.successCount).toBe(8);
      expect(aggregated.failureCount).toBe(2);
      expect(aggregated.successRate).toBe(0.8);
    });

    it('should calculate percentiles', () => {
      const metrics = getGrowthMetrics();

      // Create operations with known durations (using success metadata to track)
      for (let i = 1; i <= 100; i++) {
        const tracker = metrics.startOperation('test');
        tracker.success();
      }

      const aggregated = metrics.getAggregatedMetrics();
      expect(aggregated.p50Duration).toBeGreaterThanOrEqual(0);
      expect(aggregated.p95Duration).toBeGreaterThanOrEqual(aggregated.p50Duration);
      expect(aggregated.p99Duration).toBeGreaterThanOrEqual(aggregated.p95Duration);
    });

    it('should group by operation type', () => {
      const metrics = getGrowthMetrics();

      const tracker1 = metrics.startOperation('generate_content');
      tracker1.success();
      const tracker2 = metrics.startOperation('generate_content');
      tracker2.success();
      const tracker3 = metrics.startOperation('post_content');
      tracker3.success();
      const tracker4 = metrics.startOperation('post_content');
      tracker4.failure('error');

      const aggregated = metrics.getAggregatedMetrics();
      expect(aggregated.operationsByType.generate_content.count).toBe(2);
      expect(aggregated.operationsByType.generate_content.successRate).toBe(1);
      expect(aggregated.operationsByType.post_content.count).toBe(2);
      expect(aggregated.operationsByType.post_content.successRate).toBe(0.5);
    });
  });

  // ============================================================================
  // CONVENIENCE FUNCTIONS
  // ============================================================================

  describe('trackOperation helper', () => {
    it('should track successful async operation', async () => {
      const result = await trackOperation('async_test', async () => {
        return 'success';
      });

      expect(result).toBe('success');

      const metrics = getGrowthMetrics();
      const recent = metrics.getRecentOperations(1);
      expect(recent[0].operation).toBe('async_test');
      expect(recent[0].success).toBe(true);
    });

    it('should track failed async operation', async () => {
      await expect(
        trackOperation('async_fail', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      const metrics = getGrowthMetrics();
      const recent = metrics.getRecentOperations(1);
      expect(recent[0].success).toBe(false);
      expect(recent[0].error).toBe('Test error');
    });

    it('should include metadata in tracked operation', async () => {
      await trackOperation(
        'with_metadata',
        async () => 'done',
        { platform: 'tiktok' }
      );

      const metrics = getGrowthMetrics();
      const recent = metrics.getRecentOperations(1);
      expect(recent[0].metadata).toEqual({ platform: 'tiktok' });
    });
  });

  // ============================================================================
  // FORMATTING
  // ============================================================================

  describe('formatMetricsSummary', () => {
    it('should format summary as string', () => {
      const metrics = getGrowthMetrics();
      metrics.recordContentGenerated('tiktok');
      metrics.recordContentPosted('tiktok');
      metrics.recordApiCall('reddit', true);

      const summary = metrics.getSummary();
      const formatted = formatMetricsSummary(summary);

      expect(formatted).toContain('Growth Metrics Summary');
      expect(formatted).toContain('Content');
      expect(formatted).toContain('Generated: 1');
      expect(formatted).toContain('Posted: 1');
      expect(formatted).toContain('API Calls');
      expect(formatted).toContain('reddit: 1 calls');
    });

    it('should include performance stats', () => {
      const metrics = getGrowthMetrics();
      const tracker = metrics.startOperation('test');
      tracker.success();

      const summary = metrics.getSummary();
      const formatted = formatMetricsSummary(summary);

      expect(formatted).toContain('Performance');
      expect(formatted).toContain('Total Operations: 1');
      expect(formatted).toContain('Success Rate:');
    });
  });

  // ============================================================================
  // FILTERING
  // ============================================================================

  describe('Filtering Operations', () => {
    it('should get recent operations with limit', () => {
      const metrics = getGrowthMetrics();

      for (let i = 0; i < 20; i++) {
        const tracker = metrics.startOperation(`op_${i}`);
        tracker.success();
      }

      const recent = metrics.getRecentOperations(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].operation).toBe('op_15');
      expect(recent[4].operation).toBe('op_19');
    });

    it('should get failed operations only', () => {
      const metrics = getGrowthMetrics();

      const success1 = metrics.startOperation('success_1');
      success1.success();

      const fail1 = metrics.startOperation('fail_1');
      fail1.failure('error 1');

      const success2 = metrics.startOperation('success_2');
      success2.success();

      const fail2 = metrics.startOperation('fail_2');
      fail2.failure('error 2');

      const failed = metrics.getFailedOperations();
      expect(failed).toHaveLength(2);
      expect(failed[0].operation).toBe('fail_1');
      expect(failed[1].operation).toBe('fail_2');
    });
  });

  // ============================================================================
  // RESET
  // ============================================================================

  describe('Reset', () => {
    it('should reset all metrics to initial state', () => {
      const metrics = getGrowthMetrics();

      metrics.recordContentGenerated('tiktok');
      metrics.recordApiCall('reddit', true);
      metrics.recordInfluencerContacted();
      metrics.recordTaskScheduled();

      const tracker = metrics.startOperation('test');
      tracker.success();

      metrics.reset();

      const summary = metrics.getSummary();
      expect(summary.content.generated).toBe(0);
      expect(summary.apiCalls.reddit.calls).toBe(0);
      expect(summary.influencers.contacted).toBe(0);
      expect(summary.tasks.scheduled).toBe(0);
      expect(summary.performance.totalOperations).toBe(0);
    });
  });
});
