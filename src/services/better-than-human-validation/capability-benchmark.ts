/**
 * Better Than Human - Capability Benchmark - Re-export Shim
 *
 * @deprecated Import from '../superhuman/validation/index.js' instead.
 * This file exists for backward compatibility during the DDD migration.
 *
 * The benchmark has been split into:
 * - ../superhuman/validation/capability-benchmark.ts (commitment test cases)
 * - ../superhuman/validation/crisis-test-cases.ts (crisis detection tests)
 * - ../superhuman/validation/reading-between-lines-cases.ts (reading tests)
 * - ../superhuman/validation/benchmark-runner.ts (runner + reporting)
 */
export {
  COMMITMENT_TEST_CASES,
  CRISIS_TEST_CASES,
  READING_BETWEEN_LINES_CASES,
  ALL_TEST_CASES,
  runCapabilityBenchmark,
  runFullBenchmark,
  formatBenchmarkReport,
} from '../superhuman/validation/index.js';
