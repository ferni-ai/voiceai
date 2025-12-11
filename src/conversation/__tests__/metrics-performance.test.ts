/**
 * Orchestrator Metrics & Performance Tests
 *
 * Tests for:
 * - MetricsCollector
 * - LRU Cache
 * - Circuit Breaker
 * - Timeout wrapper
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CircuitBreaker,
  clearDetectionCache,
  getAggregatedMetrics,
  getCircuitBreaker,
  getMetricsCollector,
  getOrComputeDetection,
  LRUCache,
  resetAllCircuitBreakers,
  resetAllMetrics,
  resetPerformanceOptimizations,
  withTimeout,
} from '../orchestrator/index.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('OrchestratorMetrics', () => {
  beforeEach(() => {
    resetAllMetrics();
  });

  afterEach(() => {
    resetAllMetrics();
  });

  // ==========================================================================
  // METRICS COLLECTOR TESTS
  // ==========================================================================

  describe('MetricsCollector', () => {
    it('should create a metrics collector', () => {
      const collector = getMetricsCollector('test-session', 'ferni');
      expect(collector).toBeDefined();
    });

    it('should return same collector for same session', () => {
      const collector1 = getMetricsCollector('test-session', 'ferni');
      const collector2 = getMetricsCollector('test-session', 'ferni');
      expect(collector1).toBe(collector2);
    });

    it('should record timing', () => {
      const collector = getMetricsCollector('timing-test', 'ferni');

      collector.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 65,
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalOrchestrations).toBe(1);
      expect(metrics.phases.total.avgMs).toBe(65);
    });

    it('should track min/max timing', () => {
      const collector = getMetricsCollector('minmax-test', 'ferni');

      collector.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 50,
      });
      collector.recordTiming({
        analysis: 5,
        intelligence: 40,
        humanization: 20,
        output: 10,
        total: 100,
      });
      collector.recordTiming({
        analysis: 15,
        intelligence: 10,
        humanization: 25,
        output: 3,
        total: 75,
      });

      const metrics = collector.getMetrics();
      expect(metrics.phases.total.minMs).toBe(50);
      expect(metrics.phases.total.maxMs).toBe(100);
    });

    it('should record features', () => {
      const collector = getMetricsCollector('features-test', 'ferni');

      collector.recordFeatures(
        ['speech_naturalization', 'vocal_humanization'],
        [{ name: 'advanced_humanization' }]
      );

      const metrics = collector.getMetrics();
      expect(metrics.features['speech_naturalization'].applied).toBe(1);
      expect(metrics.features['vocal_humanization'].applied).toBe(1);
      expect(metrics.features['advanced_humanization'].skipped).toBe(1);
    });

    it('should calculate application rate', () => {
      const collector = getMetricsCollector('rate-test', 'ferni');

      // Apply 3 times, skip 1 time
      collector.recordFeature('test_feature', true);
      collector.recordFeature('test_feature', true);
      collector.recordFeature('test_feature', true);
      collector.recordFeature('test_feature', false);

      const metrics = collector.getMetrics();
      expect(metrics.features['test_feature'].applicationRate).toBe(0.75);
    });

    it('should record errors', () => {
      const collector = getMetricsCollector('error-test', 'ferni');

      collector.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 65,
      });
      collector.recordError('intelligence');

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorRate).toBe(1); // 1 error / 1 orchestration
    });

    it('should record confidence', () => {
      const collector = getMetricsCollector('confidence-test', 'ferni');

      collector.recordConfidence({ analysis: 0.8, intelligence: 0.7, overall: 0.75 });
      collector.recordConfidence({ analysis: 0.6, intelligence: 0.9, overall: 0.75 });

      const metrics = collector.getMetrics();
      expect(metrics.confidence.analysis.avg).toBe(0.7);
      expect(metrics.confidence.intelligence.avg).toBe(0.8);
    });

    it('should record cache hits', () => {
      const collector = getMetricsCollector('cache-test', 'ferni');

      collector.recordCacheHit(true);
      collector.recordCacheHit(true);
      collector.recordCacheHit(false);

      const metrics = collector.getMetrics();
      expect(metrics.cache.hits).toBe(2);
      expect(metrics.cache.misses).toBe(1);
      expect(metrics.cache.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should get summary', () => {
      const collector = getMetricsCollector('summary-test', 'ferni');

      collector.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 65,
      });
      collector.recordFeatures(['speech_naturalization', 'vocal_humanization']);
      collector.recordConfidence({ analysis: 0.8, intelligence: 0.7, overall: 0.75 });

      const summary = collector.getSummary();
      expect(summary.totalOrchestrations).toBe(1);
      expect(summary.avgTotalMs).toBe(65);
      expect(summary.topFeatures.length).toBe(2);
      expect(summary.avgConfidence).toBe(0.75);
    });

    it('should detect slow orchestration', () => {
      const collector = getMetricsCollector('slow-test', 'ferni');

      // Record some fast orchestrations to establish baseline
      for (let i = 0; i < 10; i++) {
        collector.recordTiming({
          analysis: 5,
          intelligence: 10,
          humanization: 15,
          output: 5,
          total: 35,
        });
      }

      // 300ms should be considered slow (> 2x average or > 200ms)
      expect(collector.isSlowOrchestration(300)).toBe(true);
      expect(collector.isSlowOrchestration(40)).toBe(false);
    });

    it('should reset metrics', () => {
      const collector = getMetricsCollector('reset-test', 'ferni');

      collector.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 65,
      });
      collector.recordFeatures(['test_feature']);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalOrchestrations).toBe(0);
      expect(Object.keys(metrics.features)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // AGGREGATED METRICS TESTS
  // ==========================================================================

  describe('getAggregatedMetrics', () => {
    it('should aggregate across sessions', () => {
      const collector1 = getMetricsCollector('session-1', 'ferni');
      const collector2 = getMetricsCollector('session-2', 'ferni');

      collector1.recordTiming({
        analysis: 10,
        intelligence: 20,
        humanization: 30,
        output: 5,
        total: 50,
      });
      collector2.recordTiming({
        analysis: 15,
        intelligence: 25,
        humanization: 35,
        output: 10,
        total: 100,
      });

      const aggregated = getAggregatedMetrics();
      expect(aggregated.activeSessions).toBe(2);
      expect(aggregated.totalOrchestrations).toBe(2);
      expect(aggregated.avgTotalMs).toBe(75); // (50 + 100) / 2
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('OrchestratorPerformance', () => {
  beforeEach(() => {
    resetPerformanceOptimizations();
  });

  afterEach(() => {
    resetPerformanceOptimizations();
  });

  // ==========================================================================
  // LRU CACHE TESTS
  // ==========================================================================

  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(10);

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should evict oldest when at capacity', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // This should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update LRU order on access', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      cache.set('d', 4); // This should evict 'b' instead of 'a'

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
    });

    it('should expire after TTL', async () => {
      const cache = new LRUCache<string, number>(10, 50); // 50ms TTL

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get('a')).toBeUndefined();
    });

    it('should compute value on cache miss', () => {
      const cache = new LRUCache<string, number>(10);
      let computed = false;

      const value = cache.getOrCompute('key', () => {
        computed = true;
        return 42;
      });

      expect(value).toBe(42);
      expect(computed).toBe(true);

      // Second call should use cached value
      computed = false;
      const cached = cache.getOrCompute('key', () => {
        computed = true;
        return 0;
      });

      expect(cached).toBe(42);
      expect(computed).toBe(false);
    });
  });

  // ==========================================================================
  // DETECTION CACHE TESTS
  // ==========================================================================

  describe('Detection Cache', () => {
    it('should cache detection results', () => {
      let computeCount = 0;

      const result1 = getOrComputeDetection('test-key', () => {
        computeCount++;
        return { detected: true };
      });

      const result2 = getOrComputeDetection('test-key', () => {
        computeCount++;
        return { detected: false };
      });

      expect(result1).toEqual({ detected: true });
      expect(result2).toEqual({ detected: true }); // Same cached result
      expect(computeCount).toBe(1); // Only computed once
    });

    it('should clear detection cache', () => {
      getOrComputeDetection('clear-test', () => 'value');
      clearDetectionCache();

      let computed = false;
      getOrComputeDetection('clear-test', () => {
        computed = true;
        return 'new-value';
      });

      expect(computed).toBe(true);
    });
  });

  // ==========================================================================
  // CIRCUIT BREAKER TESTS
  // ==========================================================================

  describe('CircuitBreaker', () => {
    it('should start closed', () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getState().state).toBe('closed');
    });

    it('should open after threshold failures', () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(false);

      breaker.recordFailure(); // 3rd failure
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getState().state).toBe('open');
    });

    it('should reset failures on success', () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess(); // Reset

      expect(breaker.getState().failures).toBe(0);
    });

    it('should go half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });

      breaker.recordFailure(); // Opens
      expect(breaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getState().state).toBe('half-open');
    });

    it('should close after successful half-open attempts', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
        successThreshold: 2,
      });

      breaker.recordFailure();
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Call isOpen() to trigger transition to half-open
      expect(breaker.isOpen()).toBe(false); // Returns false, but transitions to half-open
      expect(breaker.getState().state).toBe('half-open');

      // First success in half-open
      breaker.recordSuccess();
      expect(breaker.getState().state).toBe('half-open'); // Still half-open, need 2 successes

      // Second success closes it
      breaker.recordSuccess();
      expect(breaker.getState().state).toBe('closed');
    });

    it('should reopen on failure in half-open', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });

      breaker.recordFailure();
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Half-open
      breaker.isOpen(); // Triggers transition to half-open
      breaker.recordFailure(); // Should reopen

      expect(breaker.getState().state).toBe('open');
    });

    it('should execute with protection', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
      });

      // Successful execution
      const success = await breaker.execute(async () => 'result');
      expect(success.success).toBe(true);
      expect(success.value).toBe('result');

      // Failed execution
      const failure = await breaker.execute(async () => {
        throw new Error('fail');
      }, 'fallback');
      expect(failure.success).toBe(false);
      expect(failure.value).toBe('fallback');
    });

    it('should return fallback when open', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
      });

      breaker.recordFailure(); // Open

      const result = await breaker.execute(async () => 'should-not-run', 'fallback');

      expect(result.success).toBe(false);
      expect(result.value).toBe('fallback');
      expect(result.fromCircuit).toBe(true);
    });
  });

  // ==========================================================================
  // NAMED CIRCUIT BREAKERS TESTS
  // ==========================================================================

  describe('Named Circuit Breakers', () => {
    it('should get named circuit breakers', () => {
      const sessionBreaker = getCircuitBreaker('sessionIntelligence');
      const superhumanBreaker = getCircuitBreaker('betterThanHuman');

      expect(sessionBreaker).toBeDefined();
      expect(superhumanBreaker).toBeDefined();
      expect(sessionBreaker).not.toBe(superhumanBreaker);
    });

    it('should return same breaker for same name', () => {
      const breaker1 = getCircuitBreaker('sessionIntelligence');
      const breaker2 = getCircuitBreaker('sessionIntelligence');

      expect(breaker1).toBe(breaker2);
    });

    it('should reset all breakers', () => {
      const breaker = getCircuitBreaker('sessionIntelligence');
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure(); // Open

      resetAllCircuitBreakers();

      expect(breaker.getState().state).toBe('closed');
    });
  });

  // ==========================================================================
  // TIMEOUT TESTS
  // ==========================================================================

  describe('withTimeout', () => {
    it('should return result before timeout', async () => {
      const result = await withTimeout(async () => 'success', 100);

      expect(result.value).toBe('success');
      expect(result.timedOut).toBe(false);
    });

    it('should timeout slow operations', async () => {
      const result = await withTimeout(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'too-late';
        },
        50,
        'fallback'
      );

      expect(result.timedOut).toBe(true);
      expect(result.value).toBe('fallback');
    });
  });
});
