/**
 * Superhuman Validation - Barrel Exports
 *
 * Benchmark tests and validation for superhuman capabilities.
 *
 * @module services/superhuman/validation
 */

// Test case definitions
export { COMMITMENT_TEST_CASES } from './capability-benchmark.js';
export { CRISIS_TEST_CASES } from './crisis-test-cases.js';
export { READING_BETWEEN_LINES_CASES } from './reading-between-lines-cases.js';

// Runner and reporting
export {
  ALL_TEST_CASES,
  formatBenchmarkReport,
  runCapabilityBenchmark,
  runFullBenchmark,
} from './benchmark-runner.js';

// Types from the original validation module
export type {
  AdversarialTestCase,
  AdversarialTestResult,
  BTHBenchmarkReport,
  CapabilityBenchmark,
} from '../../better-than-human-validation/types.js';
