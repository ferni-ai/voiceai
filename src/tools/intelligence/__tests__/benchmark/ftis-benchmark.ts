/**
 * FTIS Benchmark Suite
 *
 * Performance benchmarks for the Ferni Tool Intelligence System.
 * Target metrics are defined in the FTIS plan.
 */

import { performance } from 'perf_hooks';
import { createLogger } from '../../../../utils/safe-logger.js';

// Components to benchmark
import { ComplexityClassifier } from '../../planning/complexity-classifier.js';
import { SequencePredictor } from '../../planning/sequence-predictor.js';
import { MCTSPlanner } from '../../planning/mcts/planner.js';
import { TransitionMatrix } from '../../transitions/transition-matrix.js';
import { IntelligentExecutor } from '../../execution/intelligent-executor.js';
import type { RouterOutput } from '../../router/inference/types.js';

const log = createLogger({ module: 'ftis:benchmark' });

// ============================================================================
// TYPES
// ============================================================================

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  passedTarget: boolean;
  targetMs: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  startTime: Date;
  endTime: Date;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  options: {
    iterations?: number;
    warmupIterations?: number;
    targetMs: number;
  }
): Promise<BenchmarkResult> {
  const iterations = options.iterations || 100;
  const warmup = options.warmupIterations || 10;
  const timings: number[] = [];

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    timings.push(end - start);
  }

  // Calculate statistics
  timings.sort((a, b) => a - b);
  const totalMs = timings.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = timings[0];
  const maxMs = timings[timings.length - 1];
  const p50Ms = timings[Math.floor(iterations * 0.5)];
  const p95Ms = timings[Math.floor(iterations * 0.95)];
  const p99Ms = timings[Math.floor(iterations * 0.99)];

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    p99Ms,
    passedTarget: p95Ms <= options.targetMs,
    targetMs: options.targetMs,
  };
}

// ============================================================================
// BENCHMARKS
// ============================================================================

/**
 * Complexity Classifier Benchmark
 * Target: <5ms per classification
 */
async function benchmarkComplexityClassifier(): Promise<BenchmarkResult> {
  const classifier = new ComplexityClassifier();
  const queries = [
    'what is the weather',
    'help me plan my entire week with productivity strategies and compare options',
    'check calendar and tasks then play music',
    'analyze my spending patterns and suggest a budget',
    'how am I doing on my goals',
  ];

  let queryIndex = 0;

  return runBenchmark(
    'ComplexityClassifier.classify',
    () => {
      classifier.classify({ query: queries[queryIndex % queries.length] });
      queryIndex++;
    },
    { iterations: 1000, warmupIterations: 50, targetMs: 5 }
  );
}

/**
 * Sequence Predictor Benchmark
 * Target: <10ms per prediction
 */
async function benchmarkSequencePredictor(): Promise<BenchmarkResult> {
  const predictor = new SequencePredictor();
  const matrix = new TransitionMatrix();

  // Seed with test data
  for (let i = 0; i < 100; i++) {
    matrix.recordTransition('weather', 'calendar', { personaId: 'ferni' });
    matrix.recordTransition('calendar', 'tasks', { personaId: 'ferni' });
  }
  predictor.setTransitionMatrix(matrix);

  const routerOutput: RouterOutput = {
    predictions: [
      { toolId: 'weather', confidence: 0.8, rank: 1 },
      { toolId: 'calendar', confidence: 0.6, rank: 2 },
    ],
    topConfidence: 0.8,
    skipLLM: false,
    latencyMs: 10,
    modelVersion: 'test',
  };

  return runBenchmark(
    'SequencePredictor.predict',
    () => {
      predictor.predict(routerOutput, { personaId: 'ferni', timeOfDay: 'morning' });
    },
    { iterations: 500, warmupIterations: 50, targetMs: 10 }
  );
}

/**
 * MCTS Planner Benchmark
 * Target: <100ms for 50 simulations
 */
async function benchmarkMCTSPlanner(): Promise<BenchmarkResult> {
  const planner = new MCTSPlanner({
    maxSimulations: 50,
    timeoutMs: 200,
  });

  const availableTools = ['weather', 'calendar', 'tasks', 'habits', 'goals'];

  return runBenchmark(
    'MCTSPlanner.plan (50 sims)',
    () => {
      planner.plan({
        query: 'plan my morning routine',
        availableTools,
        personaId: 'ferni',
      });
    },
    { iterations: 50, warmupIterations: 5, targetMs: 100 }
  );
}

/**
 * Transition Matrix Lookup Benchmark
 * Target: <1ms per lookup
 */
async function benchmarkTransitionMatrix(): Promise<BenchmarkResult> {
  const matrix = new TransitionMatrix();

  // Seed with significant data
  const tools = ['weather', 'calendar', 'tasks', 'habits', 'goals', 'music', 'notes'];
  for (const from of tools) {
    for (const to of tools) {
      for (let i = 0; i < 50; i++) {
        matrix.recordTransition(from, to, { personaId: 'ferni' });
      }
    }
  }

  let toolIndex = 0;

  return runBenchmark(
    'TransitionMatrix.getPredictions',
    () => {
      matrix.getPredictions(tools[toolIndex % tools.length]);
      toolIndex++;
    },
    { iterations: 5000, warmupIterations: 100, targetMs: 1 }
  );
}

/**
 * Parallel Execution Benchmark
 * Target: <50ms for 5 parallel tools
 */
async function benchmarkParallelExecution(): Promise<BenchmarkResult> {
  const mockExecutor = async () => {
    await new Promise((r) => setTimeout(r, 5)); // 5ms per tool
    return { success: true, data: {} };
  };

  const executor = new IntelligentExecutor(mockExecutor, {
    maxParallelism: 5,
  });

  return runBenchmark(
    'IntelligentExecutor.executeTools (5 parallel)',
    async () => {
      await executor.executeTools(['tool_1', 'tool_2', 'tool_3', 'tool_4', 'tool_5'], {
        parallel: true,
      });
    },
    { iterations: 50, warmupIterations: 5, targetMs: 50 }
  );
}

// ============================================================================
// SUITE RUNNER
// ============================================================================

export async function runFTISBenchmarks(): Promise<BenchmarkSuite> {
  const startTime = new Date();
  const results: BenchmarkResult[] = [];

  log.info('Starting FTIS benchmark suite...');

  // Run all benchmarks
  results.push(await benchmarkComplexityClassifier());
  results.push(await benchmarkSequencePredictor());
  results.push(await benchmarkMCTSPlanner());
  results.push(await benchmarkTransitionMatrix());
  results.push(await benchmarkParallelExecution());

  const endTime = new Date();

  // Calculate summary
  const passedTests = results.filter((r) => r.passedTarget).length;
  const failedTests = results.length - passedTests;

  const suite: BenchmarkSuite = {
    name: 'FTIS Benchmarks',
    results,
    startTime,
    endTime,
    summary: {
      totalTests: results.length,
      passedTests,
      failedTests,
    },
  };

  // Log results
  console.log(`\n${'='.repeat(80)}`);
  console.log('FTIS BENCHMARK RESULTS');
  console.log('='.repeat(80));

  for (const result of results) {
    const status = result.passedTarget ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} ${result.name}`);
    console.log(
      `  Target: ${result.targetMs}ms | p95: ${result.p95Ms.toFixed(2)}ms | avg: ${result.avgMs.toFixed(2)}ms`
    );
    console.log(
      `  Range: ${result.minMs.toFixed(2)}ms - ${result.maxMs.toFixed(2)}ms (${result.iterations} iterations)`
    );
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SUMMARY: ${passedTests}/${results.length} benchmarks passed`);
  console.log(`Duration: ${endTime.getTime() - startTime.getTime()}ms`);
  console.log(`${'='.repeat(80)}\n`);

  return suite;
}

// CLI entry point
if (import.meta.url.endsWith(process.argv[1])) {
  runFTISBenchmarks()
    .then((suite) => {
      process.exit(suite.summary.failedTests > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}
