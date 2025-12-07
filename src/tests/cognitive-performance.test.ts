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
import { detectUserCognitiveStyle } from '../personas/cognitive-advanced.js';
import { ferniCognitiveProfile, cognitiveProfiles } from '../personas/cognitive-profiles.js';
import type { Message } from '../personas/cognitive-types.js';

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

      expect(avgTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(100);
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

      expect(avgTime).toBeLessThan(50);
    });
  });

  describe('detectUserCognitiveStyle', () => {
    // Function expects string[] of user messages
    const testHistory: string[] = [
      'I need to understand the data behind this decision',
      'Can you analyze why this approach works better?',
      'What evidence supports this conclusion?',
    ];

    it('should complete within 20ms on average', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        detectUserCognitiveStyle(testHistory);
        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Index = Math.floor(times.length * 0.95);
      const sortedTimes = [...times].sort((a, b) => a - b);
      const p95Time = sortedTimes[p95Index];

      console.log(`User style detection: avg=${avgTime.toFixed(2)}ms, p95=${p95Time.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(20);
      expect(p95Time).toBeLessThan(50);
    });

    it('should handle long conversation histories', async () => {
      // Create a longer history (50 messages)
      const longHistory: string[] = [];
      for (let i = 0; i < 50; i++) {
        longHistory.push(
          `Message ${i}: This is a test message with some analytical and emotional content.`
        );
      }

      const start = performance.now();
      const result = detectUserCognitiveStyle(longHistory);
      const duration = performance.now() - start;

      console.log(`Long history detection (50 messages): ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(50);
      expect(result.primary).toBeDefined();
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
      expect(recorded).toBeLessThan(20);
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
      // Timing can vary, allow for some tolerance (90%+)
      expect(summary.under50msPercentage).toBeGreaterThanOrEqual(90);
      expect(summary.under100msPercentage).toBeGreaterThanOrEqual(90);
    });
  });

  describe('End-to-End Performance', () => {
    it('should complete full cognitive processing under 50ms', async () => {
      const profile = ferniCognitiveProfile;
      const engine = new CognitiveIntelligenceEngine('ferni', profile);
      const history: string[] = [
        'I feel stuck in my career',
        "I analyze the options but can't decide",
      ];
      const context = {
        currentTopic: 'career decisions',
        userExpertise: 'beginner' as const,
        emotionalWeight: 'heavy' as const,
        questionComplexity: 'complex' as const,
        turnCount: 3,
        previousApproaches: [],
      };

      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        // Full pipeline
        const userStyle = detectUserCognitiveStyle(history);
        const guidance = engine.generateGuidance(context);

        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const under50 = (times.filter((t) => t < 50).length / times.length) * 100;

      console.log(
        `Full cognitive pipeline: avg=${avgTime.toFixed(2)}ms, under50ms=${under50.toFixed(1)}%`
      );

      expect(avgTime).toBeLessThan(50);
      expect(under50).toBeGreaterThan(95);
    });
  });
});
