/**
 * Semantic Router Benchmark Runner
 *
 * Runs the benchmark dataset against the semantic router and generates
 * accuracy metrics, latency stats, and per-category breakdowns.
 *
 * Usage:
 *   pnpm test:semantic-benchmark
 *   pnpm test:semantic-benchmark --category=weather
 *   pnpm test:semantic-benchmark --difficulty=hard
 *
 * @module semantic-router/evaluation
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticRouterResult } from '../types.js';

const log = createLogger({ module: 'SemanticRouter.Benchmark' });

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkTestCase {
  id: string;
  input: string;
  expectedTool: string | null;
  expectedArgs: Record<string, unknown>;
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial';
  category: string;
  locale: string;
  requiresContext?: boolean;
  requiresUserHistory?: boolean;
  notes?: string;
}

export interface BenchmarkDataset {
  version: string;
  testCases: BenchmarkTestCase[];
  statistics: {
    total: number;
    byDifficulty: Record<string, number>;
    byCategory: Record<string, number>;
    byLocale: Record<string, number>;
  };
}

export interface TestCaseResult {
  testCase: BenchmarkTestCase;
  predicted: {
    toolId: string | null;
    confidence: number;
    args: Record<string, unknown>;
  };
  correct: boolean;
  argsMatch: boolean;
  latencyMs: number;
  error?: string;
}

export interface BenchmarkResults {
  timestamp: Date;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;

  accuracy: {
    overall: number;
    byDifficulty: Record<string, number>;
    byCategory: Record<string, number>;
    byLocale: Record<string, number>;
  };

  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };

  failures: TestCaseResult[];
  details: TestCaseResult[];
}

export interface BenchmarkOptions {
  category?: string;
  difficulty?: string;
  locale?: string;
  verbose?: boolean;
  saveResults?: boolean;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Load the benchmark dataset
 */
export async function loadBenchmarkDataset(): Promise<BenchmarkDataset> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const datasetPath = join(__dirname, 'benchmark.json');

  const content = await readFile(datasetPath, 'utf-8');
  return JSON.parse(content) as BenchmarkDataset;
}

/**
 * Run the benchmark
 */
export async function runBenchmark(
  router: { route: (input: string, context: unknown) => Promise<SemanticRouterResult> },
  options: BenchmarkOptions = {}
): Promise<BenchmarkResults> {
  const startTime = performance.now();

  // Load dataset
  const dataset = await loadBenchmarkDataset();
  let testCases = dataset.testCases;

  // Apply filters
  if (options.category) {
    testCases = testCases.filter((tc) => tc.category === options.category);
  }
  if (options.difficulty) {
    testCases = testCases.filter((tc) => tc.difficulty === options.difficulty);
  }
  if (options.locale) {
    testCases = testCases.filter((tc) => tc.locale === options.locale);
  }

  // Skip context-dependent tests (we can't evaluate those without context)
  testCases = testCases.filter((tc) => !tc.requiresContext && !tc.requiresUserHistory);

  log.info(
    {
      totalTests: testCases.length,
      category: options.category,
      difficulty: options.difficulty,
    },
    'Starting benchmark run'
  );

  // Run tests
  const results: TestCaseResult[] = [];

  for (const testCase of testCases) {
    const result = await runSingleTest(router, testCase);
    results.push(result);

    if (options.verbose) {
      const status = result.correct ? '✅' : '❌';
      log.info(
        {
          id: testCase.id,
          status,
          expected: testCase.expectedTool,
          predicted: result.predicted.toolId,
          confidence: result.predicted.confidence.toFixed(2),
        },
        `${status} ${testCase.id}`
      );
    }
  }

  // Calculate metrics
  const benchmarkResults = calculateMetrics(results, performance.now() - startTime);

  // Log summary
  log.info(
    {
      accuracy: (benchmarkResults.accuracy.overall * 100).toFixed(1) + '%',
      passed: benchmarkResults.passed,
      failed: benchmarkResults.failed,
      avgLatency: benchmarkResults.latency.mean.toFixed(1) + 'ms',
    },
    'Benchmark complete'
  );

  // Save results
  if (options.saveResults) {
    await saveResults(benchmarkResults);
  }

  return benchmarkResults;
}

/**
 * Run a single test case
 */
async function runSingleTest(
  router: { route: (input: string, context: unknown) => Promise<SemanticRouterResult> },
  testCase: BenchmarkTestCase
): Promise<TestCaseResult> {
  const startTime = performance.now();

  try {
    // Create minimal context
    const context = {
      userId: 'benchmark-user',
      sessionId: 'benchmark-session',
      personaId: 'ferni',
      conversationHistory: [],
      recentTools: [],
      locale: testCase.locale,
    };

    // Route
    const routingResult = await router.route(testCase.input, context);
    const latencyMs = performance.now() - startTime;

    // Extract prediction
    const predictedToolId =
      routingResult.action.type === 'execute' || routingResult.action.type === 'confirm'
        ? routingResult.action.toolId
        : routingResult.action.type === 'hint'
          ? routingResult.action.toolId
          : routingResult.matches.length > 0
            ? routingResult.matches[0].toolId
            : null;

    let predictedConfidence = 0;
    if (routingResult.action.type === 'execute') {
      predictedConfidence = routingResult.action.confidence;
    } else if (routingResult.action.type === 'hint') {
      predictedConfidence = routingResult.action.confidence;
    } else if (routingResult.matches.length > 0) {
      predictedConfidence = routingResult.matches[0].confidence;
    }

    const predictedArgs = routingResult.extractedArgs || {};

    // Check correctness
    const toolCorrect = predictedToolId === testCase.expectedTool;
    const argsMatch = checkArgsMatch(predictedArgs, testCase.expectedArgs);

    return {
      testCase,
      predicted: {
        toolId: predictedToolId,
        confidence: predictedConfidence,
        args: predictedArgs,
      },
      correct: toolCorrect,
      argsMatch,
      latencyMs,
    };
  } catch (error) {
    return {
      testCase,
      predicted: {
        toolId: null,
        confidence: 0,
        args: {},
      },
      correct: false,
      argsMatch: false,
      latencyMs: performance.now() - startTime,
      error: String(error),
    };
  }
}

/**
 * Check if extracted args match expected args
 */
function checkArgsMatch(
  predicted: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (predicted[key] !== value) {
      // Allow partial matches for strings
      if (typeof value === 'string' && typeof predicted[key] === 'string') {
        if (!(predicted[key] as string).toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      } else {
        return false;
      }
    }
  }
  return true;
}

/**
 * Calculate benchmark metrics
 */
function calculateMetrics(results: TestCaseResult[], durationMs: number): BenchmarkResults {
  const passed = results.filter((r) => r.correct).length;
  const failed = results.length - passed;

  // Calculate accuracy by difficulty
  const byDifficulty: Record<string, number> = {};
  const difficultyGroups = groupBy(results, (r) => r.testCase.difficulty);
  for (const [difficulty, group] of Object.entries(difficultyGroups)) {
    const correct = group.filter((r) => r.correct).length;
    byDifficulty[difficulty] = group.length > 0 ? correct / group.length : 0;
  }

  // Calculate accuracy by category
  const byCategory: Record<string, number> = {};
  const categoryGroups = groupBy(results, (r) => r.testCase.category);
  for (const [category, group] of Object.entries(categoryGroups)) {
    const correct = group.filter((r) => r.correct).length;
    byCategory[category] = group.length > 0 ? correct / group.length : 0;
  }

  // Calculate accuracy by locale
  const byLocale: Record<string, number> = {};
  const localeGroups = groupBy(results, (r) => r.testCase.locale);
  for (const [locale, group] of Object.entries(localeGroups)) {
    const correct = group.filter((r) => r.correct).length;
    byLocale[locale] = group.length > 0 ? correct / group.length : 0;
  }

  // Calculate latency percentiles
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const latencyStats = {
    min: latencies[0] || 0,
    max: latencies[latencies.length - 1] || 0,
    mean: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };

  return {
    timestamp: new Date(),
    duration: durationMs,
    totalTests: results.length,
    passed,
    failed,
    accuracy: {
      overall: results.length > 0 ? passed / results.length : 0,
      byDifficulty,
      byCategory,
      byLocale,
    },
    latency: latencyStats,
    failures: results.filter((r) => !r.correct),
    details: results,
  };
}

/**
 * Group array by key function
 */
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of array) {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }
  return groups;
}

/**
 * Calculate percentile
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Save results to file
 */
async function saveResults(results: BenchmarkResults): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const resultsPath = join(
    __dirname,
    `results-${results.timestamp.toISOString().replace(/[:.]/g, '-')}.json`
  );

  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  log.info({ path: resultsPath }, 'Results saved');
}

// ============================================================================
// CLI RUNNER
// ============================================================================

/**
 * Run benchmark from CLI
 */
export async function runBenchmarkCLI(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  const options: BenchmarkOptions = {
    verbose: true,
    saveResults: true,
  };

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    } else if (arg.startsWith('--difficulty=')) {
      options.difficulty = arg.split('=')[1];
    } else if (arg.startsWith('--locale=')) {
      options.locale = arg.split('=')[1];
    } else if (arg === '--quiet') {
      options.verbose = false;
    }
  }

  // Initialize router
  const { initializeVoiceRouter, getVoiceRouter } = await import('../voice-integration.js');
  await initializeVoiceRouter();

  const router = getVoiceRouter();
  if (!router) {
    throw new Error('Router not initialized');
  }

  // Create a wrapper that matches the expected interface
  const routerWrapper = {
    route: (input: string, context: unknown) => router.route(input, context as Parameters<typeof router.route>[1]),
  };

  // Run benchmark
  const results = await runBenchmark(routerWrapper, options);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.totalTests}`);
  console.log(`Passed: ${results.passed} (${(results.accuracy.overall * 100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Duration: ${results.duration.toFixed(0)}ms`);
  console.log(`\nLatency:`);
  console.log(`  Min: ${results.latency.min.toFixed(1)}ms`);
  console.log(`  Mean: ${results.latency.mean.toFixed(1)}ms`);
  console.log(`  P95: ${results.latency.p95.toFixed(1)}ms`);
  console.log(`  Max: ${results.latency.max.toFixed(1)}ms`);
  console.log(`\nAccuracy by Difficulty:`);
  for (const [diff, acc] of Object.entries(results.accuracy.byDifficulty)) {
    console.log(`  ${diff}: ${(acc * 100).toFixed(1)}%`);
  }
  console.log('\n' + '='.repeat(60));
}

