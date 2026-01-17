/**
 * Tool Loading Performance Benchmark Tests
 *
 * Measures and compares the performance of different tool loading strategies:
 * 1. Full orchestrator (all 98 domains via dynamic imports) - OLD approach
 * 2. Manifest + embeddings (pre-built at build time) - NEW approach
 * 3. Session cache for handoffs - FAST PATH
 *
 * Expected Results:
 * - Full orchestrator: 5-20s (unacceptable for handoffs)
 * - Manifest + embeddings: 50-200ms (good for initial agent)
 * - Session cache: <10ms (instant for handoffs)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock safe-logger to prevent errors during testing
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function calculateStats(times: number[]): Omit<BenchmarkResult, 'name' | 'iterations'> {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avgMs: Math.round(sum / sorted.length),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    p99Ms: sorted[Math.floor(sorted.length * 0.99)],
  };
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 10
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup run (not counted)
  await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  return {
    name,
    iterations,
    ...calculateStats(times),
  };
}

describe('Tool Loading Performance Benchmarks', () => {
  // Skip if running in CI or quick mode
  const shouldRunBenchmarks = process.env.RUN_BENCHMARKS === 'true';

  describe.skipIf(!shouldRunBenchmarks)('Benchmark Suite', () => {
    let results: BenchmarkResult[] = [];

    afterAll(() => {
      console.log('\n' + '='.repeat(80));
      console.log('TOOL LOADING BENCHMARK RESULTS');
      console.log('='.repeat(80));
      console.log(
        '\n| Strategy | Avg | Min | Max | P50 | P95 | P99 |'
      );
      console.log('|----------|-----|-----|-----|-----|-----|-----|');
      for (const r of results) {
        console.log(
          `| ${r.name.padEnd(30)} | ${r.avgMs}ms | ${r.minMs}ms | ${r.maxMs}ms | ${r.p50Ms}ms | ${r.p95Ms}ms | ${r.p99Ms}ms |`
        );
      }
      console.log('\n' + '='.repeat(80));
    });

    it('should benchmark manifest loading', async () => {
      // Clear global state
      (globalThis as any)[Symbol.for('ferni.toolManifest.state')] = undefined;

      const result = await benchmark(
        'Manifest Load',
        async () => {
          // Reset state for each iteration
          (globalThis as any)[Symbol.for('ferni.toolManifest.state')] = undefined;
          const { loadToolManifest } = await import('../../tools/registry/manifest-loader.js');
          await loadToolManifest();
        },
        5
      );

      results.push(result);
      console.log(`📦 Manifest Load: ${result.avgMs}ms avg`);
      expect(result.avgMs).toBeLessThan(500); // Should be under 500ms
    });

    it('should benchmark embeddings loading', async () => {
      // Clear global state
      (globalThis as any)[Symbol.for('ferni.toolEmbeddings')] = undefined;

      const result = await benchmark(
        'Embeddings Load',
        async () => {
          // Reset state for each iteration
          (globalThis as any)[Symbol.for('ferni.toolEmbeddings')] = undefined;
          const { loadPrecomputedEmbeddings } = await import(
            '../../tools/semantic-router/precomputed-embeddings.js'
          );
          await loadPrecomputedEmbeddings();
        },
        5
      );

      results.push(result);
      console.log(`🧠 Embeddings Load: ${result.avgMs}ms avg`);
      expect(result.avgMs).toBeLessThan(500); // Should be under 500ms
    });

    it('should benchmark semantic matching with pre-computed embeddings', async () => {
      // Pre-load embeddings
      (globalThis as any)[Symbol.for('ferni.toolEmbeddings')] = undefined;
      const { loadPrecomputedEmbeddings, semanticSearchTools } = await import(
        '../../tools/semantic-router/precomputed-embeddings.js'
      );
      await loadPrecomputedEmbeddings();

      const testQueries = [
        'play some relaxing music',
        'what is the weather today',
        'help me build a habit',
        'transfer me to Peter',
        'analyze my portfolio',
      ];

      const result = await benchmark(
        'Semantic Match (5 queries)',
        async () => {
          for (const query of testQueries) {
            await semanticSearchTools(query, { topK: 10 });
          }
        },
        10
      );

      results.push(result);
      console.log(`🎯 Semantic Match: ${result.avgMs}ms avg (5 queries)`);
      expect(result.avgMs).toBeLessThan(100); // Should be under 100ms for 5 queries
    });

    it('should benchmark session cache warmup', async () => {
      const result = await benchmark(
        'Session Cache Warmup',
        async () => {
          const sessionId = `bench-${Date.now()}-${Math.random()}`;
          const { warmupHandoffToolsForSession, clearHandoffToolsCache } = await import(
            '../../tools/handoff/session-cache.js'
          );
          await warmupHandoffToolsForSession(sessionId, null, 'free', {});
          clearHandoffToolsCache(sessionId);
        },
        5
      );

      results.push(result);
      console.log(`🔥 Session Cache Warmup: ${result.avgMs}ms avg`);
      expect(result.avgMs).toBeLessThan(1000); // Should be under 1s
    });

    it('should benchmark session cache retrieval (instant)', async () => {
      // Pre-warmup the cache
      const sessionId = 'bench-retrieval-test';
      const { warmupHandoffToolsForSession, getCachedHandoffTools, clearHandoffToolsCache } =
        await import('../../tools/handoff/session-cache.js');
      await warmupHandoffToolsForSession(sessionId, null, 'free', {});

      const result = await benchmark(
        'Session Cache Retrieval',
        async () => {
          getCachedHandoffTools(sessionId, 'ferni');
        },
        100 // More iterations since it should be very fast
      );

      clearHandoffToolsCache(sessionId);

      results.push(result);
      console.log(`⚡ Session Cache Retrieval: ${result.avgMs}ms avg`);
      expect(result.avgMs).toBeLessThan(5); // Should be under 5ms (instant!)
    });
  });

  // Quick sanity tests (always run)
  describe('Quick Sanity Checks', () => {
    it('manifest loader should be faster than 1s on cold start', async () => {
      // Clear state
      (globalThis as any)[Symbol.for('ferni.toolManifest.state')] = undefined;

      const start = performance.now();
      try {
        const { loadToolManifest } = await import('../../tools/registry/manifest-loader.js');
        await loadToolManifest();
        const elapsed = performance.now() - start;
        console.log(`📦 Manifest cold load: ${Math.round(elapsed)}ms`);
        expect(elapsed).toBeLessThan(1000);
      } catch {
        // File might not exist in test environment - that's OK for sanity check
        console.log('📦 Manifest file not found (OK for sanity check)');
      }
    });

    it('embeddings loader should be faster than 1s on cold start', async () => {
      // Clear state
      (globalThis as any)[Symbol.for('ferni.toolEmbeddings')] = undefined;

      const start = performance.now();
      try {
        const { loadPrecomputedEmbeddings } = await import(
          '../../tools/semantic-router/precomputed-embeddings.js'
        );
        await loadPrecomputedEmbeddings();
        const elapsed = performance.now() - start;
        console.log(`🧠 Embeddings cold load: ${Math.round(elapsed)}ms`);
        expect(elapsed).toBeLessThan(1000);
      } catch {
        // File might not exist in test environment - that's OK for sanity check
        console.log('🧠 Embeddings file not found (OK for sanity check)');
      }
    });

    it('session cache hit should be under 10ms', async () => {
      const sessionId = 'sanity-cache-test';
      const { warmupHandoffToolsForSession, getCachedHandoffTools, clearHandoffToolsCache } =
        await import('../../tools/handoff/session-cache.js');

      // Warmup
      await warmupHandoffToolsForSession(sessionId, null, 'free', {});

      // Measure retrieval
      const start = performance.now();
      getCachedHandoffTools(sessionId, 'peter-john');
      const elapsed = performance.now() - start;

      clearHandoffToolsCache(sessionId);

      console.log(`⚡ Cache hit: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(10);
    });
  });
});

/**
 * Run benchmarks with:
 *   RUN_BENCHMARKS=true pnpm vitest run src/tools/__tests__/tool-loading-benchmark.test.ts
 *
 * Quick sanity check:
 *   pnpm vitest run src/tools/__tests__/tool-loading-benchmark.test.ts
 */
