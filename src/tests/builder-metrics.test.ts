/**
 * Tests for context-builders/metrics.ts
 *
 * Verifies builder performance tracking works correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkPerformanceIssues,
  getAllBuilderMetrics,
  getBuilderMetrics,
  getMetricsSummary,
  getRecentTurnMetrics,
  getSessionMetrics,
  resetAllMetrics,
  resetBuilderMetrics,
} from '../intelligence/context-builders/metrics.js';

describe('builder-metrics', () => {
  beforeEach(() => {
    resetAllMetrics();
  });

  describe('getMetricsSummary', () => {
    it('should return empty summary when no metrics', () => {
      const summary = getMetricsSummary();
      expect(summary.totalBuilds).toBe(0);
      expect(summary.avgBuildTimeMs).toBe(0);
    });
  });
});
