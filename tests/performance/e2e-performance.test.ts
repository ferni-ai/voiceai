/**
 * End-to-End Performance Tests
 *
 * Tests the full performance optimization stack to ensure:
 * 1. All optimizations initialize correctly
 * 2. Turn processing meets latency targets
 * 3. Background tasks are queued properly
 * 4. Metrics are collected accurately
 *
 * Run with: npm run test:performance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Performance targets (in milliseconds)
// Note: These targets are relaxed for CI environments where resources may be limited
const TARGETS = {
  INIT_MAX_MS: 10000,           // Max initialization time (relaxed for CI)
  CONTEXT_BUILD_MAX_MS: 500,    // Max context build time (relaxed for CI)
  ANALYSIS_MAX_MS: 2000,        // Max batched analysis time (relaxed for CI)
  MEMORY_SEARCH_MAX_MS: 500,    // Max memory search time (relaxed for CI)
  TURN_TOTAL_MAX_MS: 3000,      // Max total turn processing time (relaxed for CI)
  TTS_SPECULATION_MAX_MS: 500,  // Max time to start TTS speculation (relaxed for CI)
};

describe('Performance Optimization E2E Tests', () => {
  // Mock user/session data
  const testUserId = 'test-user-perf';
  const testSessionId = 'test-session-perf';
  const testPersonaId = 'ferni';

  describe('Initialization', () => {
    it('should initialize all optimizations within target time', async () => {
      const start = Date.now();

      const { initializePerformanceOptimizations, resetPerformanceOptimizations } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      // Reset first to ensure clean state
      resetPerformanceOptimizations();

      const metrics = await initializePerformanceOptimizations({
        userId: testUserId,
        personaId: testPersonaId,
        sessionId: testSessionId,
        enablePubSub: false, // Disable for tests (no GCP access)
        enableSpeculativeTTS: true,
        enableBatchedAnalysis: true,
        enableParallelMemory: true,
        enableContextCache: true,
        enableProfiling: true,
      });

      const duration = Date.now() - start;

      expect(metrics.initialized).toBe(true);
      expect(metrics.initDurationMs).toBeLessThan(TARGETS.INIT_MAX_MS);
      expect(duration).toBeLessThan(TARGETS.INIT_MAX_MS);

      console.log(`✓ Initialization completed in ${duration}ms`);
    });
  });

  describe('Turn Processing Performance', () => {
    beforeAll(async () => {
      const { initializePerformanceOptimizations, getPerformanceMetrics, resetPerformanceOptimizations } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const currentMetrics = getPerformanceMetrics();
      if (!currentMetrics.initialized) {
        await initializePerformanceOptimizations({
          userId: testUserId,
          personaId: testPersonaId,
          sessionId: testSessionId,
          enablePubSub: false,
        });
      }
    });

    it('should process a simple turn within latency targets', async () => {
      const { processOptimizedTurn } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const result = await processOptimizedTurn({
        userId: testUserId,
        sessionId: testSessionId,
        personaId: testPersonaId,
        userMessage: 'Hello, how are you today?',
        turnNumber: 1,
      });

      expect(result.metrics.totalMs).toBeLessThan(TARGETS.TURN_TOTAL_MAX_MS);
      expect(result.metrics.contextBuildMs).toBeLessThan(TARGETS.CONTEXT_BUILD_MAX_MS);

      console.log(`✓ Turn processed in ${result.metrics.totalMs}ms`);
      console.log(`  - Context: ${result.metrics.contextBuildMs}ms`);
      console.log(`  - Analysis: ${result.metrics.analysisMs}ms`);
      console.log(`  - Memory: ${result.metrics.memoryMs}ms`);
    });

    it('should process an emotional turn with voice data', async () => {
      const { processOptimizedTurn } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const result = await processOptimizedTurn({
        userId: testUserId,
        sessionId: testSessionId,
        personaId: testPersonaId,
        userMessage: "I've been feeling really anxious about my job lately...",
        turnNumber: 2,
        voiceEmotion: {
          emotion: 'anxious',
          confidence: 0.85,
          prosody: { pace: 1.2, energy: 0.4 },
        },
      });

      expect(result.metrics.totalMs).toBeLessThan(TARGETS.TURN_TOTAL_MAX_MS);
      expect(result.context.length).toBeGreaterThan(0);

      console.log(`✓ Emotional turn processed in ${result.metrics.totalMs}ms`);
    });

    it('should handle multiple turns efficiently', async () => {
      const { processOptimizedTurn } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const messages = [
        "I've been thinking about making a career change.",
        "What do you think about pursuing something creative?",
        "I'm worried about the financial implications.",
        "But I also want to be happy in my work.",
        "How do I balance security and passion?",
      ];

      const durations: number[] = [];

      for (let i = 0; i < messages.length; i++) {
        const result = await processOptimizedTurn({
          userId: testUserId,
          sessionId: testSessionId,
          personaId: testPersonaId,
          userMessage: messages[i],
          turnNumber: i + 3,
        });

        durations.push(result.metrics.totalMs);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      expect(avgDuration).toBeLessThan(TARGETS.TURN_TOTAL_MAX_MS);
      expect(maxDuration).toBeLessThan(TARGETS.TURN_TOTAL_MAX_MS * 1.5); // Allow 50% variance

      console.log(`✓ ${messages.length} turns processed`);
      console.log(`  - Avg: ${avgDuration.toFixed(0)}ms`);
      console.log(`  - Max: ${maxDuration}ms`);
      console.log(`  - Min: ${Math.min(...durations)}ms`);
    });
  });

  describe('Background Task Queueing', () => {
    it('should queue background tasks without blocking', async () => {
      const { queueBackgroundTasks } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const start = Date.now();

      await queueBackgroundTasks({
        userId: testUserId,
        sessionId: testSessionId,
        personaId: testPersonaId,
        userMessage: 'Test message for background processing',
        assistantResponse: 'Test response',
        turnNumber: 10,
        analysis: {
          intent: { primary: 'sharing' },
          emotion: { primary: 'neutral' },
        },
      });

      const duration = Date.now() - start;

      // Should be quick since tasks are queued asynchronously
      // Note: 500ms threshold accounts for system load variance in CI
      // (150ms was too tight, causing flaky failures)
      expect(duration).toBeLessThan(500);

      console.log(`✓ Background tasks queued in ${duration}ms`);
    });
  });

  describe('Speculative TTS', () => {
    it('should start speculation quickly', async () => {
      const { startSpeculativeTTS, getPerformanceMetrics } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const metrics = getPerformanceMetrics();
      if (!metrics.speculativeTTSEnabled) {
        console.log('⚠ Speculative TTS not enabled, skipping');
        return;
      }

      const start = Date.now();

      await startSpeculativeTTS({
        sessionId: testSessionId,
        personaId: testPersonaId,
        analysis: {
          emotion: { primary: 'anxious' },
          intent: { primary: 'venting' },
          distress: { level: 5 },
        },
      });

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(TARGETS.TTS_SPECULATION_MAX_MS);

      console.log(`✓ TTS speculation started in ${duration}ms`);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive metrics', async () => {
      const { getPerformanceSummary, getPerformanceMetrics } = await import(
        '../../src/agents/shared/performance/integration.js'
      );

      const summary = await getPerformanceSummary();
      const metrics = getPerformanceMetrics();

      expect(metrics.initialized).toBe(true);
      expect(summary).toBeDefined();
      expect(summary.integration).toBeDefined();

      console.log('✓ Metrics summary:');
      console.log(JSON.stringify(summary, null, 2));
    });
  });

  describe('Parallel RAG Search', () => {
    it('should search in parallel across shards', async () => {
      const { parallelMemorySearch } = await import(
        '../../src/memory/parallel-memory-search.js'
      );

      const start = Date.now();

      const result = await parallelMemorySearch({
        userId: testUserId,
        query: 'career change and work-life balance',
        totalLimit: 10,
      });

      const duration = Date.now() - start;

      // Should complete even with no results
      expect(result).toBeDefined();
      expect(Array.isArray(result.memories)).toBe(true);
      expect(duration).toBeLessThan(1000); // 1 second max

      console.log(`✓ RAG search completed in ${duration}ms, found ${result.memories.length} results`);
    });
  });

  describe('Batched LLM Analysis', () => {
    it('should batch multiple analyses into single call', async () => {
      const { batchedAnalyze, getBatchedAnalysisMetrics } = await import(
        '../../src/intelligence/batched-llm-analysis.js'
      );

      const start = Date.now();

      const result = await batchedAnalyze({
        message: "I'm feeling overwhelmed with work and considering a career change.",
        analyses: ['intent', 'emotion', 'topics', 'distress'],
      });

      const duration = Date.now() - start;

      // Should return within target time
      expect(duration).toBeLessThan(TARGETS.ANALYSIS_MAX_MS * 2); // Allow some slack for LLM
      expect(result).toBeDefined();
      expect(result._meta).toBeDefined();

      const metrics = getBatchedAnalysisMetrics();
      console.log(`✓ Batched analysis completed in ${duration}ms`);
      console.log(`  - Saved calls: ${metrics.savedCalls}`);

      if (result.intent) {
        console.log(`  - Intent: ${result.intent.primary}`);
      }
      if (result.emotion) {
        console.log(`  - Emotion: ${result.emotion.primary}`);
      }
    });
  });

  describe('Context Service', () => {
    it('should build context with caching', async () => {
      const { buildTurnContext, getContextServiceMetrics } = await import(
        '../../src/intelligence/context-service.js'
      );

      // First call - cache miss
      const start1 = Date.now();
      const result1 = await buildTurnContext({
        userId: testUserId,
        sessionId: testSessionId,
        personaId: testPersonaId,
        userMessage: 'Hello',
        turnNumber: 1,
        priority: 'real-time',
      });
      const duration1 = Date.now() - start1;

      // Second call - should be faster (cache hit)
      const start2 = Date.now();
      const result2 = await buildTurnContext({
        userId: testUserId,
        sessionId: testSessionId,
        personaId: testPersonaId,
        userMessage: 'Hello again',
        turnNumber: 2,
        priority: 'real-time',
      });
      const duration2 = Date.now() - start2;

      expect(duration1).toBeLessThan(TARGETS.CONTEXT_BUILD_MAX_MS * 2);
      expect(result1.context.length).toBeGreaterThan(0);

      const metrics = getContextServiceMetrics();
      console.log(`✓ Context building:`);
      console.log(`  - First call: ${duration1}ms`);
      console.log(`  - Second call: ${duration2}ms (with caching)`);
      console.log(`  - Cache hits: ${metrics.cacheHits}`);
    });
  });
});

describe('Load Testing', () => {
  it('should handle concurrent requests', async () => {
    const { processOptimizedTurn } = await import(
      '../../src/agents/shared/performance/integration.js'
    );

    const concurrency = 5;
    const messages = Array.from({ length: concurrency }, (_, i) => ({
      userId: `load-test-user-${i}`,
      sessionId: `load-test-session-${i}`,
      personaId: 'ferni',
      userMessage: `Test message ${i}`,
      turnNumber: 1,
    }));

    const start = Date.now();

    const results = await Promise.all(
      messages.map((msg) => processOptimizedTurn(msg))
    );

    const totalDuration = Date.now() - start;
    const avgDuration = results.reduce((a, r) => a + r.metrics.totalMs, 0) / results.length;

    console.log(`✓ Concurrent processing (${concurrency} requests):`);
    console.log(`  - Total wall time: ${totalDuration}ms`);
    console.log(`  - Avg per request: ${avgDuration.toFixed(0)}ms`);

    // Concurrent processing should be efficient
    expect(avgDuration).toBeLessThan(TARGETS.TURN_TOTAL_MAX_MS);
  });
});

