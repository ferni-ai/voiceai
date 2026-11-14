#!/usr/bin/env tsx
/**
 * Eval gate, "better than human" benchmark: no model, no network, no secrets.
 * Runs the benchmark's own runner on two of its three capabilities and compares
 * the counts with evals/baselines/bth.json.
 *
 *   pnpm tsx scripts/eval-gate/bth.ts [--json] [--write-baseline]
 *
 * Exits 1 when a count moves the wrong way (every band is 0: one more missed
 * row is red), when a capability has fewer rows than the baseline, and when a
 * capability stops reporting. A better count passes and asks for a re-baseline.
 *
 * Not measured here: crisis_detection. It runs the crisis guard, so its
 * baseline belongs to the crisis lane and gets its own change.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCapabilityBenchmark } from '../../src/services/superhuman/validation/benchmark-runner.js';
import { report } from './gate-lib.js';

/** The capabilities gated here, as the runner names them. */
export const CAPABILITIES = ['commitment_detection', 'reading_between_lines'] as const;

/** Per capability: the row count, the four cells of the confusion table, and F1. */
export async function measureBth(
  capabilities: readonly string[] = CAPABILITIES
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const capability of capabilities) {
    const b = await runCapabilityBenchmark(capability);
    out[`${capability}.rows`] = b.totalTestCases;
    out[`${capability}.true_positives`] = b.truePositives;
    out[`${capability}.true_negatives`] = b.trueNegatives;
    out[`${capability}.false_positives`] = b.falsePositives;
    out[`${capability}.false_negatives`] = b.falseNegatives;
    out[`${capability}.f1`] = b.f1Score;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const current = await measureBth();
  if (args.includes('--json')) console.log(JSON.stringify(current, null, 2));
  const baseline = fileURLToPath(new URL('../../evals/baselines/bth.json', import.meta.url));
  process.exit(report(baseline, current, args));
}
