/**
 * Capability Benchmark Runner
 *
 * Runs adversarial test cases against capability detectors and
 * generates F1/precision/recall metrics with regression detection.
 *
 * @module services/superhuman/validation/benchmark-runner
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  AdversarialTestCase,
  AdversarialTestResult,
  CapabilityBenchmark,
  BTHBenchmarkReport,
} from '../../better-than-human-validation/types.js';
import { COMMITMENT_TEST_CASES } from './capability-benchmark.js';
import { CRISIS_TEST_CASES } from './crisis-test-cases.js';
import { READING_BETWEEN_LINES_CASES } from './reading-between-lines-cases.js';

const log = createLogger({ module: 'BTHBenchmarkRunner' });

/**
 * All test cases combined.
 */
export const ALL_TEST_CASES: AdversarialTestCase[] = [
  ...COMMITMENT_TEST_CASES,
  ...CRISIS_TEST_CASES,
  ...READING_BETWEEN_LINES_CASES,
];

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

type CapabilityDetector = (input: string) => {
  detected: boolean;
  confidence?: number;
  value?: unknown;
};

/**
 * Get detector function for a capability.
 */
async function getDetector(capability: string): Promise<CapabilityDetector | null> {
  try {
    switch (capability) {
      case 'commitment_detection': {
        const { detectCommitment } = await import('../../superhuman/commitment-keeper.js');
        return (input: string) => {
          const result = detectCommitment(input, 'benchmark-user');
          return {
            detected: result.detected,
            confidence: result.confidence,
            value: result.commitment,
          };
        };
      }
      case 'crisis_detection': {
        const { detectCrisis } = await import('../../superhuman/emotional-first-aid.js');
        return (input: string) => {
          const result = detectCrisis(input);
          return {
            detected: result !== null,
            confidence: result?.confidence,
            value: result?.severity,
          };
        };
      }
      case 'reading_between_lines': {
        const { detectUnsaidSignals } = await import('../../trust-systems/reading-between-lines.js');
        return (input: string) => {
          const signals = detectUnsaidSignals('benchmark-user', input, {
            recentTopics: [],
          });
          return {
            detected: signals.length > 0,
            confidence: signals[0]?.confidence,
            value: signals[0]?.type,
          };
        };
      }
      default:
        return null;
    }
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to load detector');
    return null;
  }
}

/**
 * Run a single test case.
 */
async function runTestCase(
  testCase: AdversarialTestCase,
  detector: CapabilityDetector
): Promise<AdversarialTestResult> {
  const startTime = performance.now();

  try {
    const result = detector(testCase.input);

    const passed =
      testCase.expectedResult.shouldDetect === result.detected ||
      // Handle "maybe" cases - both true and false are acceptable
      testCase.expectedResult.expectedValue === 'maybe';

    return {
      testCaseId: testCase.id,
      capability: testCase.capability,
      runAt: new Date(),
      expected: {
        shouldDetect: testCase.expectedResult.shouldDetect,
        value: testCase.expectedResult.expectedValue,
      },
      actual: {
        detected: result.detected,
        value: result.value,
        confidence: result.confidence,
      },
      passed,
      failureReason: passed
        ? undefined
        : `Expected ${testCase.expectedResult.shouldDetect ? 'detection' : 'no detection'}, got ${result.detected ? 'detected' : 'not detected'}`,
      durationMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      capability: testCase.capability,
      runAt: new Date(),
      expected: {
        shouldDetect: testCase.expectedResult.shouldDetect,
        value: testCase.expectedResult.expectedValue,
      },
      actual: {
        detected: false,
      },
      passed: false,
      failureReason: `Error: ${String(error)}`,
      durationMs: performance.now() - startTime,
    };
  }
}

/**
 * Run benchmark for a single capability.
 */
export async function runCapabilityBenchmark(
  capability: string,
  previousBenchmark?: CapabilityBenchmark
): Promise<CapabilityBenchmark> {
  const detector = await getDetector(capability);
  const testCases = ALL_TEST_CASES.filter((tc) => tc.capability === capability);

  if (!detector || testCases.length === 0) {
    log.warn({ capability }, 'No detector or test cases for capability');
    return {
      capability,
      runAt: new Date(),
      totalTestCases: 0,
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      accuracy: 0,
      trend: 'stable',
      knownGaps: [],
    };
  }

  // Run all test cases
  const results: AdversarialTestResult[] = [];
  for (const testCase of testCases) {
    const result = await runTestCase(testCase, detector);
    results.push(result);
  }

  // Calculate metrics
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const gaps: Map<string, string[]> = new Map();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const testCase = testCases[i];

    if (testCase.expectedResult.expectedValue === 'maybe') {
      // Skip "maybe" cases from accuracy calculation
      continue;
    }

    if (testCase.expectedResult.shouldDetect) {
      if (result.actual.detected) {
        truePositives++;
      } else {
        falseNegatives++;
        const category = testCase.category;
        if (!gaps.has(category)) {
          gaps.set(category, []);
        }
        gaps.get(category)!.push(testCase.input);
      }
    } else {
      if (result.actual.detected) {
        falsePositives++;
        const category = testCase.category;
        if (!gaps.has(category)) {
          gaps.set(category, []);
        }
        gaps.get(category)!.push(testCase.input);
      } else {
        trueNegatives++;
      }
    }
  }

  const total = truePositives + trueNegatives + falsePositives + falseNegatives;
  const precision =
    truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall =
    truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = total > 0 ? (truePositives + trueNegatives) / total : 0;

  // Determine trend
  let trend: 'improving' | 'degrading' | 'stable' = 'stable';
  let deltaFromPrevious: number | undefined;

  if (previousBenchmark) {
    deltaFromPrevious = f1Score - previousBenchmark.f1Score;
    if (deltaFromPrevious > 0.02) {
      trend = 'improving';
    } else if (deltaFromPrevious < -0.02) {
      trend = 'degrading';
    }
  }

  // Format known gaps
  const knownGaps: CapabilityBenchmark['knownGaps'] = [];
  for (const [category, examples] of gaps.entries()) {
    knownGaps.push({
      category,
      examples: examples.slice(0, 3),
      priority: examples.length > 3 ? 'high' : examples.length > 1 ? 'medium' : 'low',
    });
  }

  const benchmark: CapabilityBenchmark = {
    capability,
    runAt: new Date(),
    totalTestCases: testCases.length,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    accuracy,
    previousF1Score: previousBenchmark?.f1Score,
    deltaFromPrevious,
    trend,
    knownGaps,
  };

  log.info(
    {
      capability,
      f1Score: f1Score.toFixed(3),
      precision: precision.toFixed(3),
      recall: recall.toFixed(3),
      trend,
      gapCount: knownGaps.length,
    },
    'Capability benchmark completed'
  );

  return benchmark;
}

/**
 * Run full benchmark report across all capabilities.
 */
export async function runFullBenchmark(
  previousReport?: BTHBenchmarkReport
): Promise<BTHBenchmarkReport> {
  const capabilities = ['commitment_detection', 'crisis_detection', 'reading_between_lines'];

  const benchmarks: CapabilityBenchmark[] = [];

  for (const capability of capabilities) {
    const previous = previousReport?.capabilities.find((c) => c.capability === capability);
    const benchmark = await runCapabilityBenchmark(capability, previous);
    benchmarks.push(benchmark);
  }

  // Calculate overall metrics
  const validBenchmarks = benchmarks.filter((b) => b.totalTestCases > 0);
  const overallF1Score =
    validBenchmarks.length > 0
      ? validBenchmarks.reduce((sum, b) => sum + b.f1Score, 0) / validBenchmarks.length
      : 0;
  const overallAccuracy =
    validBenchmarks.length > 0
      ? validBenchmarks.reduce((sum, b) => sum + b.accuracy, 0) / validBenchmarks.length
      : 0;

  // Detect regressions and improvements
  const regressions: BTHBenchmarkReport['regressions'] = [];
  const improvements: BTHBenchmarkReport['improvements'] = [];

  for (const benchmark of benchmarks) {
    if (benchmark.previousF1Score !== undefined && benchmark.deltaFromPrevious !== undefined) {
      if (benchmark.deltaFromPrevious < -0.05) {
        regressions.push({
          capability: benchmark.capability,
          previousF1: benchmark.previousF1Score,
          currentF1: benchmark.f1Score,
          delta: benchmark.deltaFromPrevious,
        });
      } else if (benchmark.deltaFromPrevious > 0.05) {
        improvements.push({
          capability: benchmark.capability,
          previousF1: benchmark.previousF1Score,
          currentF1: benchmark.f1Score,
          delta: benchmark.deltaFromPrevious,
        });
      }
    }
  }

  const report: BTHBenchmarkReport = {
    reportId: `bth_${Date.now()}`,
    generatedAt: new Date(),
    capabilities: benchmarks,
    overallF1Score,
    overallAccuracy,
    hasRegressions: regressions.length > 0,
    regressions,
    improvements,
  };

  log.info(
    {
      reportId: report.reportId,
      overallF1: overallF1Score.toFixed(3),
      hasRegressions: report.hasRegressions,
      regressionCount: regressions.length,
      improvementCount: improvements.length,
    },
    'Full BTH benchmark report generated'
  );

  return report;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Format benchmark report as human-readable string.
 */
export function formatBenchmarkReport(report: BTHBenchmarkReport): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║              BETTER THAN HUMAN - BENCHMARK REPORT                ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Report ID: ${report.reportId.padEnd(51)}║`,
    `║  Generated: ${report.generatedAt.toISOString().padEnd(51)}║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  OVERALL F1 SCORE: ${(report.overallF1Score * 100).toFixed(1)}%`.padEnd(67) + '║',
    `║  OVERALL ACCURACY: ${(report.overallAccuracy * 100).toFixed(1)}%`.padEnd(67) + '║',
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  CAPABILITY BREAKDOWN                                            ║',
    '╠──────────────────────────┬────────┬────────┬────────┬───────────╣',
    '║ Capability               │ F1     │ Prec   │ Recall │ Trend     ║',
    '╠──────────────────────────┼────────┼────────┼────────┼───────────╣',
  ];

  for (const cap of report.capabilities) {
    const trendIcon = cap.trend === 'improving' ? '↑' : cap.trend === 'degrading' ? '↓' : '─';
    const line = `║ ${cap.capability.padEnd(24)} │ ${(cap.f1Score * 100).toFixed(1).padStart(5)}% │ ${(cap.precision * 100).toFixed(1).padStart(5)}% │ ${(cap.recall * 100).toFixed(1).padStart(5)}% │ ${trendIcon} ${cap.trend.padEnd(8)} ║`;
    lines.push(line);
  }

  lines.push('╠──────────────────────────┴────────┴────────┴────────┴───────────╣');

  if (report.regressions.length > 0) {
    lines.push('║  ⚠️  REGRESSIONS DETECTED                                        ║');
    for (const reg of report.regressions) {
      lines.push(
        `║    ${reg.capability}: ${(reg.previousF1 * 100).toFixed(1)}% → ${(reg.currentF1 * 100).toFixed(1)}% (${(reg.delta * 100).toFixed(1)}%)`.padEnd(
          66
        ) + '║'
      );
    }
  }

  if (report.improvements.length > 0) {
    lines.push('║  ✅ IMPROVEMENTS                                                 ║');
    for (const imp of report.improvements) {
      lines.push(
        `║    ${imp.capability}: ${(imp.previousF1 * 100).toFixed(1)}% → ${(imp.currentF1 * 100).toFixed(1)}% (+${(imp.delta * 100).toFixed(1)}%)`.padEnd(
          66
        ) + '║'
      );
    }
  }

  // Known gaps
  lines.push('╠══════════════════════════════════════════════════════════════════╣');
  lines.push('║  KNOWN GAPS                                                      ║');

  for (const cap of report.capabilities) {
    if (cap.knownGaps.length > 0) {
      lines.push(`║  ${cap.capability}:`.padEnd(66) + '║');
      for (const gap of cap.knownGaps) {
        lines.push(
          `║    - [${gap.priority}] ${gap.category}: ${gap.examples[0]?.slice(0, 30)}...`.padEnd(
            66
          ) + '║'
        );
      }
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
