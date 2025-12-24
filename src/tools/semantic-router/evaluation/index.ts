/**
 * Semantic Router Evaluation Module
 *
 * Tools for benchmarking and measuring routing accuracy.
 *
 * @module semantic-router/evaluation
 */

export {
  loadBenchmarkDataset,
  runBenchmark,
  runBenchmarkCLI,
  type BenchmarkTestCase,
  type BenchmarkDataset,
  type BenchmarkResults,
  type BenchmarkOptions,
  type TestCaseResult,
} from './benchmark-runner.js';
