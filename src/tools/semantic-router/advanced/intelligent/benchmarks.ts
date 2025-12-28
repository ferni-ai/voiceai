/**
 * Intelligent Routing Benchmark Suite
 *
 * Benchmarks to measure:
 * - Intent classifier latency
 * - Bandit optimizer performance
 * - Thompson Sampling convergence
 *
 * Run with: npx tsx src/tools/semantic-router/advanced/intelligent/benchmarks.ts
 *
 * @module semantic-router/advanced/intelligent/benchmarks
 */

import { performance } from 'perf_hooks';
import { IntentClassifier, initializeIntentClassifier } from './intent-classifier.js';
import { BanditOptimizer, initializeBanditOptimizer } from './bandit-optimizer.js';
import { FERNI_INTENTS } from './ferni-intents.js';

// ============================================================================
// BENCHMARK DATA
// ============================================================================

const BENCHMARK_QUERIES = {
  clearIntents: [
    { input: 'play some music', expectedTool: 'spotify_play' },
    { input: 'talk to maya', expectedTool: 'handoff_maya' },
    { input: 'pause the music', expectedTool: 'spotify_pause' },
    { input: 'what is on my calendar', expectedTool: 'calendar_check' },
    { input: 'I just did my workout', expectedTool: 'habit_log' },
    { input: 'switch to peter', expectedTool: 'handoff_peter' },
    { input: 'start my morning routine', expectedTool: 'habit_routine' },
    { input: 'schedule a meeting', expectedTool: 'calendar_create' },
    { input: 'skip this song', expectedTool: 'spotify_skip' },
    { input: 'I need some wisdom', expectedTool: 'handoff_nayan' },
  ],
};

// ============================================================================
// BENCHMARK RESULTS
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
  accuracy?: number;
}

function calculatePercentile(sortedTimes: number[], percentile: number): number {
  const index = Math.ceil((percentile / 100) * sortedTimes.length) - 1;
  return sortedTimes[Math.max(0, index)];
}

function formatResult(result: BenchmarkResult): string {
  return `
${result.name}
${'='.repeat(result.name.length)}
  Iterations: ${result.iterations}
  Total time: ${result.totalMs.toFixed(2)}ms
  Average:    ${result.avgMs.toFixed(2)}ms
  Min:        ${result.minMs.toFixed(2)}ms
  Max:        ${result.maxMs.toFixed(2)}ms
  P50:        ${result.p50Ms.toFixed(2)}ms
  P95:        ${result.p95Ms.toFixed(2)}ms
  P99:        ${result.p99Ms.toFixed(2)}ms
  ${result.accuracy !== undefined ? `Accuracy:   ${(result.accuracy * 100).toFixed(1)}%` : ''}
`;
}

// ============================================================================
// INTENT CLASSIFIER BENCHMARK
// ============================================================================

async function benchmarkIntentClassifier(iterations = 1000): Promise<BenchmarkResult> {
  const classifier = initializeIntentClassifier();
  classifier.registerIntents(FERNI_INTENTS);

  const queries = BENCHMARK_QUERIES.clearIntents;
  const times: number[] = [];
  let correct = 0;
  let total = 0;

  // Warmup
  for (let i = 0; i < 10; i++) {
    classifier.classify(queries[i % queries.length].input);
  }

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const start = performance.now();
    const result = classifier.classify(query.input);
    const end = performance.now();

    times.push(end - start);

    if (result?.toolId === query.expectedTool) {
      correct++;
    }
    total++;
  }

  times.sort((a, b) => a - b);
  const totalMs = times.reduce((a, b) => a + b, 0);

  return {
    name: 'Intent Classifier',
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p50Ms: calculatePercentile(times, 50),
    p95Ms: calculatePercentile(times, 95),
    p99Ms: calculatePercentile(times, 99),
    accuracy: correct / total,
  };
}

// ============================================================================
// BANDIT OPTIMIZER BENCHMARK
// ============================================================================

async function benchmarkBanditOptimizer(iterations = 1000): Promise<BenchmarkResult> {
  const bandit = initializeBanditOptimizer();

  // Initialize with realistic tools
  const tools = [
    'spotify_play',
    'calendar_check',
    'habit_log',
    'handoff_maya',
    'handoff_peter',
    'weather_check',
    'reminder_set',
    'email_compose',
  ];

  await bandit.initialize(tools);

  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    const result = bandit.select(tools.slice(0, 3));
    bandit.recordReward(result.toolId, Math.random());
  }

  // Benchmark selection
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = bandit.select(tools, {
      intentCategory: ['music', 'calendar', 'habits'][i % 3],
    });
    const end = performance.now();

    times.push(end - start);

    // Record reward (simulates learning)
    bandit.recordReward(result.toolId, Math.random() > 0.3 ? 1 : 0);
  }

  times.sort((a, b) => a - b);
  const totalMs = times.reduce((a, b) => a + b, 0);

  return {
    name: 'Bandit Optimizer (Thompson Sampling)',
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p50Ms: calculatePercentile(times, 50),
    p95Ms: calculatePercentile(times, 95),
    p99Ms: calculatePercentile(times, 99),
  };
}

// ============================================================================
// THOMPSON SAMPLING CONVERGENCE BENCHMARK
// ============================================================================

async function benchmarkThompsonConvergence(): Promise<void> {
  console.log('\n📊 Thompson Sampling Convergence Test\n');

  const bandit = initializeBanditOptimizer();

  // Set up tools with known "true" reward rates
  const toolsWithTrueRates = [
    { id: 'best_tool', trueRate: 0.9 },
    { id: 'good_tool', trueRate: 0.7 },
    { id: 'ok_tool', trueRate: 0.5 },
    { id: 'bad_tool', trueRate: 0.2 },
  ];

  await bandit.initialize(toolsWithTrueRates.map((t) => t.id));

  // Track selection counts
  const selectionCounts: Record<string, number> = {};
  toolsWithTrueRates.forEach((t) => (selectionCounts[t.id] = 0));

  const iterations = 1000;
  const checkpoints = [100, 250, 500, 750, 1000];
  const toolIds = toolsWithTrueRates.map((t) => t.id);

  console.log('  Tool True Rates:');
  toolsWithTrueRates.forEach((t) => console.log(`    ${t.id}: ${t.trueRate}`));
  console.log();

  for (let i = 1; i <= iterations; i++) {
    const result = bandit.select(toolIds);
    selectionCounts[result.toolId]++;

    // Simulate reward based on true rate
    const tool = toolsWithTrueRates.find((t) => t.id === result.toolId);
    const reward = Math.random() < (tool?.trueRate || 0.5) ? 1 : 0;
    bandit.recordReward(result.toolId, reward);

    if (checkpoints.includes(i)) {
      console.log(`  After ${i} iterations:`);
      toolsWithTrueRates.forEach((t) => {
        const pct = ((selectionCounts[t.id] / i) * 100).toFixed(1);
        console.log(`    ${t.id}: ${selectionCounts[t.id]} selections (${pct}%)`);
      });
      console.log();
    }
  }

  // Final stats
  const stats = bandit.getExplorationStats();
  console.log('  Final Statistics:');
  console.log(`    Total selections: ${stats.totalSelections}`);
  console.log(`    Exploration rate: ${(stats.explorationRate * 100).toFixed(1)}%`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 Intelligent Routing Benchmark Suite\n');
  console.log('='.repeat(50));

  // Run benchmarks
  console.log('\n📊 Running benchmarks...\n');

  const intentResult = await benchmarkIntentClassifier(1000);
  console.log(formatResult(intentResult));

  const banditResult = await benchmarkBanditOptimizer(1000);
  console.log(formatResult(banditResult));

  // Thompson Sampling convergence
  await benchmarkThompsonConvergence();

  // Summary
  console.log('\n📈 Summary\n');
  console.log('  Strategy                 | Avg Latency | Accuracy | QPS');
  console.log('  ' + '-'.repeat(60));
  console.log(
    `  Intent Classifier        | ${intentResult.avgMs.toFixed(2).padStart(7)}ms | ` +
      `${((intentResult.accuracy || 0) * 100).toFixed(1).padStart(6)}% | ` +
      `${(1000 / intentResult.avgMs).toFixed(0).padStart(6)}`
  );
  console.log(
    `  Bandit Optimizer         | ${banditResult.avgMs.toFixed(2).padStart(7)}ms | ` +
      `   n/a  | ` +
      `${(1000 / banditResult.avgMs).toFixed(0).padStart(6)}`
  );

  console.log('\n✅ Benchmarks complete!\n');
}

// Export for programmatic use
export {
  benchmarkIntentClassifier,
  benchmarkBanditOptimizer,
  benchmarkThompsonConvergence,
  BENCHMARK_QUERIES,
  type BenchmarkResult,
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
