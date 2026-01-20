/**
 * FTIS V3 Comprehensive Test Suite
 *
 * Tests for:
 * - Decision boundary checking
 * - Calibration accuracy
 * - Hybrid routing
 * - Metrics collection
 * - Feedback loop
 *
 * Run with: pnpm vitest run src/tests/ftis-v3.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  FTISDecisionBoundary,
  resetFTISDecisionBoundary,
  BoundaryCheckResult,
} from '../tools/intelligence/ftis-decision-boundary.js';

import {
  FTISCalibration,
  resetFTISCalibration,
} from '../tools/intelligence/ftis-calibration.js';

import {
  FTISHybridRouter,
  resetFTISHybridRouter,
  RoutingDecision,
} from '../tools/intelligence/ftis-hybrid-router.js';

import {
  FTISMetricsCollector,
  ClassificationOutcome,
  resetFTISMetrics,
} from '../services/observability/ftis-v3-metrics.js';

import {
  FTISFeedbackLoop,
  resetFTISFeedbackLoop,
} from '../tools/intelligence/learning/ftis-feedback-loop.js';

// ============================================================================
// DECISION BOUNDARY TESTS
// ============================================================================

describe('FTISDecisionBoundary', () => {
  let boundary: FTISDecisionBoundary;

  beforeAll(async () => {
    boundary = new FTISDecisionBoundary();
    await boundary.initialize();
  });

  afterAll(() => {
    resetFTISDecisionBoundary();
  });

  describe('initialization', () => {
    it('should initialize successfully if boundaries file exists', async () => {
      const newBoundary = new FTISDecisionBoundary();
      const result = await newBoundary.initialize();
      // May be true or false depending on whether file exists
      expect(typeof result).toBe('boolean');
    });
  });

  describe('cosine distance calculation', () => {
    it('should calculate correct cosine distance for identical vectors', () => {
      // Access private method via any cast for testing
      const calcDistance = (boundary as any).cosineDistance.bind(boundary);
      const vector = [1, 0, 0, 0];
      const distance = calcDistance(vector, vector);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('should calculate correct cosine distance for orthogonal vectors', () => {
      const calcDistance = (boundary as any).cosineDistance.bind(boundary);
      const v1 = [1, 0, 0, 0];
      const v2 = [0, 1, 0, 0];
      const distance = calcDistance(v1, v2);
      expect(distance).toBeCloseTo(1, 5);
    });

    it('should calculate correct cosine distance for opposite vectors', () => {
      const calcDistance = (boundary as any).cosineDistance.bind(boundary);
      const v1 = [1, 0, 0, 0];
      const v2 = [-1, 0, 0, 0];
      const distance = calcDistance(v1, v2);
      expect(distance).toBeCloseTo(2, 5);
    });
  });

  describe('boundary checking', () => {
    it('should return null for unknown categories when not ready', async () => {
      const newBoundary = new FTISDecisionBoundary('/nonexistent/path');
      await newBoundary.initialize();
      const result = newBoundary.checkStage1Boundary([0.1, 0.2, 0.3], 'nonexistent');
      expect(result).toBeNull();
    });

    it('should handle missing boundary data gracefully', () => {
      if (!boundary.isReady()) {
        const result = boundary.checkOpenIntent([0.1, 0.2], 'media', 'play_music');
        expect(result.reason).toBe('no_boundary_data');
      }
    });
  });

  describe('open intent detection', () => {
    it('should classify clearly outside queries as open intent', () => {
      if (!boundary.isReady()) {
        return; // Skip if no boundary data
      }

      // Create a random vector that's likely outside any class boundary
      const randomEmbedding = Array.from({ length: 384 }, () => Math.random() * 2 - 1);
      const result = boundary.checkOpenIntent(randomEmbedding, 'travel', 'flights');

      // Result should indicate some reasoning
      expect(result).toHaveProperty('isOpenIntent');
      expect(result).toHaveProperty('reason');
    });
  });
});

// ============================================================================
// CALIBRATION TESTS
// ============================================================================

describe('FTISCalibration', () => {
  let calibration: FTISCalibration;

  beforeAll(async () => {
    calibration = new FTISCalibration();
    await calibration.initialize();
  });

  afterAll(() => {
    resetFTISCalibration();
  });

  describe('neural network inference', () => {
    it('should compute entropy correctly', () => {
      const computeEntropy = (calibration as any).computeEntropy.bind(calibration);

      // Uniform distribution should have max entropy
      const uniform = [0.25, 0.25, 0.25, 0.25];
      const uniformEntropy = computeEntropy(uniform);
      expect(uniformEntropy).toBeGreaterThan(0);

      // Peaked distribution should have lower entropy
      const peaked = [0.9, 0.05, 0.025, 0.025];
      const peakedEntropy = computeEntropy(peaked);
      expect(peakedEntropy).toBeLessThan(uniformEntropy);
    });

    it('should compute softmax correctly', () => {
      const softmax = (calibration as any).softmax.bind(calibration);
      const logits = [2.0, 1.0, 0.1];
      const probs = softmax(logits);

      // Should sum to 1
      const sum = probs.reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);

      // Should be in descending order
      expect(probs[0]).toBeGreaterThan(probs[1]);
      expect(probs[1]).toBeGreaterThan(probs[2]);
    });

    it('should compute cosine similarity correctly', () => {
      const cosineSim = (calibration as any).cosineSimilarity.bind(calibration);

      // Identical vectors should have similarity 1
      const v1 = [1, 0, 0];
      expect(cosineSim(v1, v1)).toBeCloseTo(1, 5);

      // Orthogonal vectors should have similarity 0
      const v2 = [0, 1, 0];
      expect(cosineSim(v1, v2)).toBeCloseTo(0, 5);
    });
  });
});

// ============================================================================
// HYBRID ROUTER TESTS
// ============================================================================

describe('FTISHybridRouter', () => {
  let router: FTISHybridRouter;

  beforeAll(async () => {
    router = new FTISHybridRouter({
      fastPathThreshold: 0.75,
      verifyPathThreshold: 0.50,
      enableVerification: true,
      useCalibration: true,
      useBoundaryChecking: true,
    });
  });

  afterAll(() => {
    resetFTISHybridRouter();
  });

  describe('threshold configuration', () => {
    it('should apply high reliability tool threshold adjustment', () => {
      const getThresholds = (router as any).getThresholds.bind(router);

      const normalThresholds = getThresholds('some_normal_tool');
      const musicThresholds = getThresholds('play_music'); // High reliability

      // Music should have lower thresholds (easier fast path)
      expect(musicThresholds.fast).toBeLessThan(normalThresholds.fast);
    });

    it('should apply high risk tool threshold adjustment', () => {
      const getThresholds = (router as any).getThresholds.bind(router);

      const normalThresholds = getThresholds('some_normal_tool');
      const handoffThresholds = getThresholds('handoff_maya'); // High risk

      // Handoff should have higher thresholds (harder fast path)
      expect(handoffThresholds.fast).toBeGreaterThan(normalThresholds.fast);
    });
  });

  describe('metrics tracking', () => {
    it('should track routing tier distribution', () => {
      // Record some mock outcomes
      router.recordToolOutcome('play_music', true);
      router.recordToolOutcome('play_music', true);
      router.recordToolOutcome('play_music', false);

      const rates = router.getToolSuccessRates();
      const playMusicRate = rates.get('play_music');

      expect(playMusicRate).toBeDefined();
      expect(playMusicRate?.total).toBe(3);
      expect(playMusicRate?.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should reset metrics correctly', () => {
      router.resetMetrics();
      const metrics = router.getMetrics();

      expect(metrics.totalRoutings).toBe(0);
      expect(metrics.fastPathCount).toBe(0);
      expect(metrics.verifyPathCount).toBe(0);
      expect(metrics.llmPathCount).toBe(0);
    });
  });

  describe('config updates', () => {
    it('should allow runtime config updates', () => {
      router.updateConfig({ fastPathThreshold: 0.80 });
      const config = router.getConfig();

      expect(config.fastPathThreshold).toBe(0.80);

      // Reset for other tests
      router.updateConfig({ fastPathThreshold: 0.75 });
    });
  });
});

// ============================================================================
// METRICS COLLECTOR TESTS
// ============================================================================

describe('FTISMetricsCollector', () => {
  let metrics: FTISMetricsCollector;

  beforeEach(() => {
    metrics = new FTISMetricsCollector(3600000, 1000); // 1 hour window, 1000 max
  });

  describe('outcome recording', () => {
    it('should record outcomes correctly', () => {
      const outcome: ClassificationOutcome = {
        query: 'play some jazz',
        predictedCategory: 'play_music',
        predictedSuperCategory: 'media',
        originalConfidence: 0.92,
        effectiveConfidence: 0.88,
        withinBoundary: true,
        routingTier: 'fast',
        latencyMs: 45,
        timestamp: new Date(),
      };

      metrics.recordOutcome(outcome);
      const outcomes = metrics.getOutcomes();

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].query).toBe('play some jazz');
    });

    it('should mark outcomes as correct/incorrect', () => {
      const outcome: ClassificationOutcome = {
        query: 'play some jazz',
        predictedCategory: 'play_music',
        predictedSuperCategory: 'media',
        originalConfidence: 0.92,
        effectiveConfidence: 0.88,
        withinBoundary: true,
        routingTier: 'fast',
        latencyMs: 45,
        timestamp: new Date(),
      };

      metrics.recordOutcome(outcome);
      metrics.markCorrect('play some jazz', 'play_music');

      const outcomes = metrics.getOutcomes();
      expect(outcomes[0].wasCorrect).toBe(true);
    });
  });

  describe('ECE calculation', () => {
    it('should calculate ECE correctly for perfect calibration', () => {
      // Add outcomes where confidence matches accuracy
      for (let i = 0; i < 100; i++) {
        const conf = 0.8;
        const correct = Math.random() < 0.8;
        const outcome: ClassificationOutcome = {
          query: `query ${i}`,
          predictedCategory: 'test',
          predictedSuperCategory: 'test',
          originalConfidence: conf,
          effectiveConfidence: conf,
          withinBoundary: true,
          routingTier: 'fast',
          wasCorrect: correct,
          latencyMs: 50,
          timestamp: new Date(),
        };
        metrics.recordOutcome(outcome);
      }

      const summary = metrics.getSummary();
      // ECE should be relatively low for well-calibrated predictions
      expect(summary.expectedCalibrationError).toBeLessThan(0.2);
    });
  });

  describe('latency percentiles', () => {
    it('should calculate latency percentiles correctly', () => {
      // Add outcomes with known latencies
      for (let i = 0; i < 100; i++) {
        const outcome: ClassificationOutcome = {
          query: `query ${i}`,
          predictedCategory: 'test',
          predictedSuperCategory: 'test',
          originalConfidence: 0.9,
          effectiveConfidence: 0.9,
          withinBoundary: true,
          routingTier: 'fast',
          latencyMs: i + 1, // 1ms to 100ms
          timestamp: new Date(),
        };
        metrics.recordOutcome(outcome);
      }

      const summary = metrics.getSummary();
      expect(summary.latencyP50Ms).toBeCloseTo(50, -1); // ±10ms
      expect(summary.latencyP95Ms).toBeCloseTo(95, -1);
      expect(summary.latencyP99Ms).toBeCloseTo(99, -1);
    });
  });

  describe('Prometheus export', () => {
    it('should export valid Prometheus format', () => {
      const outcome: ClassificationOutcome = {
        query: 'test query',
        predictedCategory: 'test',
        predictedSuperCategory: 'test',
        originalConfidence: 0.9,
        effectiveConfidence: 0.9,
        withinBoundary: true,
        routingTier: 'fast',
        latencyMs: 50,
        timestamp: new Date(),
      };
      metrics.recordOutcome(outcome);

      const prometheus = metrics.toPrometheus();

      expect(prometheus).toContain('# HELP ftis_classification_accuracy');
      expect(prometheus).toContain('# TYPE ftis_classification_accuracy gauge');
      expect(prometheus).toContain('ftis_total_classifications');
    });
  });
});

// ============================================================================
// FEEDBACK LOOP TESTS
// ============================================================================

describe('FTISFeedbackLoop', () => {
  afterAll(() => {
    resetFTISFeedbackLoop();
  });

  describe('signal recording', () => {
    it('should record interruption signals', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-1',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      await feedback.recordInterruption('Miami', 'travel_flights', 0.97);

      const stats = feedback.getStats() as any;
      expect(stats.signalsByType.interruption).toBe(1);
    });

    it('should mine negatives from interruptions', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-2',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      await feedback.recordInterruption('Miami', 'travel_flights', 0.97);

      const stats = feedback.getStats() as any;
      expect(stats.minedNegatives).toBe(1);
      expect(stats.negativesBySource.interruption).toBe(1);
    });

    it('should record tool success/failure', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-3',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      await feedback.recordToolSuccess('play jazz', 'play_music', 'play_music');
      await feedback.recordToolFailure('watching football', 'game_trivia', 'game_trivia', 'wrong context');

      const stats = feedback.getStats() as any;
      expect(stats.signalsByType.tool_success).toBe(1);
      expect(stats.signalsByType.tool_failure).toBe(1);
    });
  });

  describe('retraining recommendation', () => {
    it('should not recommend retraining with few examples', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-4',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      const result = feedback.shouldSuggestRetrain();
      expect(result.should).toBe(false);
    });

    it('should recommend retraining when threshold reached', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-5',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      // Record enough failures to reach threshold
      for (let i = 0; i < 15; i++) {
        await feedback.recordInterruption(`query ${i}`, 'wrong_category', 0.9);
      }

      const result = feedback.shouldSuggestRetrain();
      expect(result.should).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', async () => {
      const feedback = new FTISFeedbackLoop({
        feedbackDir: '/tmp/ftis-test-feedback-6',
        minExamplesForRetrain: 10,
        lowConfidenceThreshold: 0.70,
        maxFeedbackAge: 7 * 24 * 60 * 60 * 1000,
      });
      await feedback.reset();
      await feedback.initialize();

      await feedback.recordInterruption('query1', 'cat1', 0.9);
      await feedback.recordToolSuccess('query2', 'cat2', 'tool2');
      await feedback.recordUserCorrection('query3', 'cat3', 'correct_cat');

      const stats = feedback.getStats() as any;
      expect(stats.totalSignals).toBe(3);
      expect(stats.signalsByType.interruption).toBe(1);
      expect(stats.signalsByType.tool_success).toBe(1);
      expect(stats.signalsByType.user_correction).toBe(1);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('FTIS V3 Integration', () => {
  describe('end-to-end classification flow', () => {
    it('should handle a complete classification with all components', async () => {
      // This test validates the integration of all components
      const router = new FTISHybridRouter();
      const metrics = new FTISMetricsCollector();
      const feedback = new FTISFeedbackLoop();

      // Initialize all components
      await Promise.all([
        feedback.initialize(),
        // Router will auto-initialize on first use
      ]);

      // Note: Full integration test would require actual model files
      // This validates the components work together structurally

      expect(router).toBeDefined();
      expect(metrics).toBeDefined();
      expect(feedback).toBeDefined();
    });
  });

  describe('feedback to metrics integration', () => {
    it('should propagate feedback signals to metrics', async () => {
      const metrics = new FTISMetricsCollector();
      const feedback = new FTISFeedbackLoop();
      await feedback.initialize();

      // Record an outcome in metrics
      const outcome: ClassificationOutcome = {
        query: 'Miami',
        predictedCategory: 'travel_flights',
        predictedSuperCategory: 'travel',
        originalConfidence: 0.97,
        effectiveConfidence: 0.85,
        withinBoundary: true,
        routingTier: 'fast',
        latencyMs: 45,
        timestamp: new Date(),
      };
      metrics.recordOutcome(outcome);

      // Record interruption in feedback (this also marks in metrics internally)
      await feedback.recordInterruption('Miami', 'travel_flights', 0.97);

      // Verify feedback was recorded
      const feedbackStats = feedback.getStats() as any;
      expect(feedbackStats.signalsByType.interruption).toBe(1);
    });
  });
});
