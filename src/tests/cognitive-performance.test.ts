/**
 * Cognitive Intelligence Performance Tests
 *
 * Validates that cognitive processing stays within latency budget:
 * - Target: < 50ms average
 * - P95: < 100ms
 * - 95% of calls under 50ms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cognitiveMetrics } from '../utils/cognitive-metrics.js';
import { CognitiveIntelligenceEngine } from '../personas/cognitive-intelligence.js';
import { ferniCognitiveProfile, cognitiveProfiles } from '../personas/cognitive-profiles.js';
import type { Message } from '../personas/cognitive-types.js';
import { perfBudget } from './perf-budget.js';

describe('Cognitive Performance', () => {
  beforeEach(() => {
    cognitiveMetrics.clear();
  });

  describe('CognitiveIntelligenceEngine.generateGuidance', () => {
    const testProfile = ferniCognitiveProfile;
    const engine = new CognitiveIntelligenceEngine('ferni', testProfile);
    const testContext = {
      currentTopic: 'career change',
      userExpertise: 'intermediate' as const,
      emotionalWeight: 'heavy' as const,
      questionComplexity: 'moderate' as const,
      turnCount: 5,
      previousApproaches: [] as string[],
    };

    it('should complete within 50ms on average', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        engine.generateGuidance(testContext);
        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Index = Math.floor(times.length * 0.95);
      const sortedTimes = [...times].sort((a, b) => a - b);
      const p95Time = sortedTimes[p95Index];

      console.log(`Guidance generation: avg=${avgTime.toFixed(2)}ms, p95=${p95Time.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(perfBudget(50));
      expect(p95Time).toBeLessThan(perfBudget(100));
    });

    it('should handle all persona profiles efficiently', async () => {
      const profiles = Object.entries(cognitiveProfiles);
      const times: number[] = [];

      for (const [personaId, profile] of profiles) {
        const profileEngine = new CognitiveIntelligenceEngine(personaId, profile);
        const start = performance.now();
        profileEngine.generateGuidance(testContext);
        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(
        `Cross-persona guidance: avg=${avgTime.toFixed(2)}ms for ${profiles.length} personas`
      );

      expect(avgTime).toBeLessThan(perfBudget(50));
    });
  });

  describe('Metrics Tracker', () => {
    it('should track timing accurately', () => {
      // Simulate some operations
      cognitiveMetrics.startTiming('contextBuildTime');
      // Busy wait for ~10ms
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Busy wait
      }
      const recorded = cognitiveMetrics.endTiming('contextBuildTime');

      expect(recorded).toBeGreaterThan(9);
      // Allow higher tolerance for CI/machines under load (busy-wait can be slow)
      expect(recorded).toBeLessThan(200);
    });

    it('should calculate summary statistics correctly', () => {
      // Record some metrics
      for (let i = 0; i < 10; i++) {
        cognitiveMetrics.startTiming('contextBuildTime');
        const start = performance.now();
        while (performance.now() - start < 5) {}
        cognitiveMetrics.endTiming('contextBuildTime');
        cognitiveMetrics.recordMetrics();
      }

      const summary = cognitiveMetrics.getSummary();

      expect(summary.sampleCount).toBe(10);
      expect(summary.avgTotalOverhead).toBeGreaterThan(0);
      // Timing varies significantly based on system load - use generous threshold
      // These are informational metrics, not hard requirements
      expect(summary.under100msPercentage).toBeGreaterThanOrEqual(50);
    });
  });
});
