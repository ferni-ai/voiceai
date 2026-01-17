/**
 * Personality Telemetry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  startTiming,
  recordTelemetry,
  getSessionMetrics,
  getRecentSnapshots,
  formatMetricsReport,
  clearSessionMetrics,
} from '../personality-telemetry.js';

describe('personality-telemetry', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    clearSessionMetrics(testSessionId);
  });

  describe('startTiming', () => {
    it('returns an object with elapsed function', () => {
      const timer = startTiming();
      expect(timer.elapsed).toBeInstanceOf(Function);
    });

    it('measures elapsed time', async () => {
      const timer = startTiming();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      const elapsed = timer.elapsed();
      expect(elapsed).toBeGreaterThanOrEqual(8); // Allow some variance
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('recordTelemetry', () => {
    it('records telemetry snapshot', () => {
      recordTelemetry(testSessionId, {
        sessionId: testSessionId,
        turnCount: 1,
        timing: {
          contextAssemblyMs: 10,
          noticingDetectionMs: 5,
          expressionLookupMs: 3,
          totalMs: 18,
        },
        decisions: {
          timeOfDay: 'morning',
          momentum: 'cruising',
          emotionalState: 'neutral',
          relationshipStage: 'acquaintance',
          distressLevel: 0,
          expressionSource: 'llm',
          decisionReason: 'test',
        },
        output: {
          injected: true,
          content: 'test expression',
        },
      });

      const snapshots = getRecentSnapshots(testSessionId);
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].turnCount).toBe(1);
    });

    it('limits snapshots to max', () => {
      for (let i = 0; i < 25; i++) {
        recordTelemetry(testSessionId, {
          sessionId: testSessionId,
          turnCount: i,
          timing: {
            contextAssemblyMs: 1,
            noticingDetectionMs: 1,
            expressionLookupMs: 1,
            totalMs: 3,
          },
          decisions: {
            timeOfDay: 'morning',
            momentum: 'cruising',
            emotionalState: 'neutral',
            relationshipStage: 'acquaintance',
            distressLevel: 0,
            decisionReason: 'test',
          },
          output: { injected: false },
        });
      }

      const snapshots = getRecentSnapshots(testSessionId);
      expect(snapshots.length).toBe(20); // MAX_SNAPSHOTS
    });
  });

  describe('getSessionMetrics', () => {
    it('returns null for unknown session', () => {
      const metrics = getSessionMetrics('unknown-session');
      expect(metrics).toBeNull();
    });

    it('calculates rolling averages', () => {
      // Record multiple turns
      for (let i = 0; i < 5; i++) {
        recordTelemetry(testSessionId, {
          sessionId: testSessionId,
          turnCount: i,
          timing: {
            contextAssemblyMs: 10,
            noticingDetectionMs: 5,
            expressionLookupMs: 5,
            totalMs: 20,
          },
          decisions: {
            timeOfDay: 'morning',
            momentum: 'cruising',
            emotionalState: 'neutral',
            relationshipStage: 'acquaintance',
            distressLevel: 0,
            expressionSource: i % 2 === 0 ? 'llm' : 'composed',
            decisionReason: 'test',
          },
          output: { injected: i % 2 === 0 },
        });
      }

      const metrics = getSessionMetrics(testSessionId);
      expect(metrics).not.toBeNull();
      expect(metrics!.totalTurns).toBe(5);
      expect(metrics!.avgTotalMs).toBe(20);
      expect(metrics!.turnsWithInjection).toBe(3);
      expect(metrics!.llmExpressions).toBe(3);
      expect(metrics!.composedExpressions).toBe(2);
    });
  });

  describe('formatMetricsReport', () => {
    it('returns default message for unknown session', () => {
      const report = formatMetricsReport('unknown-session');
      expect(report).toContain('No metrics available');
    });

    it('formats a readable report', () => {
      recordTelemetry(testSessionId, {
        sessionId: testSessionId,
        turnCount: 1,
        timing: {
          contextAssemblyMs: 10,
          noticingDetectionMs: 5,
          expressionLookupMs: 5,
          totalMs: 20,
        },
        decisions: {
          timeOfDay: 'morning',
          momentum: 'cruising',
          emotionalState: 'neutral',
          relationshipStage: 'acquaintance',
          distressLevel: 0,
          expressionSource: 'llm',
          decisionReason: 'test',
        },
        output: { injected: true },
      });

      const report = formatMetricsReport(testSessionId);
      expect(report).toContain('Performance');
      expect(report).toContain('Avg Total');
      expect(report).toContain('Activity');
      expect(report).toContain('Expression Sources');
      expect(report).toContain('Cache Performance');
    });
  });
});
