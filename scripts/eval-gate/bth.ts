#!/usr/bin/env tsx
/**
 * Eval gate, "better than human" benchmark: no model, no secrets, no database client.
 * Runs the benchmark's own runner on two of its three capabilities and compares
 * the counts with evals/baselines/bth.json.
 *
 *   pnpm tsx scripts/eval-gate/bth.ts [--json] [--write-baseline]
 *
 * Exits 1 when a count moves the wrong way (every band is 0: one more missed
 * row is red), when a capability has fewer rows than the baseline, and when a
 * capability stops reporting. A better count passes and asks for a re-baseline.
 *
 * The detectors keep a profile per user in a store that asks for a Firestore
 * client. Run from here it gets none: before a detector loads, the client class
 * is replaced with one that counts the asking and refuses, and the store works
 * from memory. The asking is refused, not absent. The store's flush timer is
 * started and never reaches a write; this entry leaves through process.exit.
 *
 * Not measured here: crisis_detection. It runs the crisis guard, so its
 * baseline belongs to the crisis lane and gets its own change.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { report } from './gate-lib.js';

/** The capabilities gated here, as the runner names them. */
export const CAPABILITIES = ['commitment_detection', 'reading_between_lines'] as const;

/**
 * Replaces the Firestore client class for this process with one that refuses,
 * and returns a count of the clients asked for since. Only a module loaded
 * afterwards gets the refusal: one that already imported the class keeps the
 * real one, which is why nothing here imports the runner at the top.
 */
function refuseFirestore(): () => number {
  const firestore = createRequire(import.meta.url)('@google-cloud/firestore') as {
    Firestore: unknown;
  };
  let asked = 0;
  firestore.Firestore = class {
    constructor() {
      asked += 1;
      throw new Error('scripts/eval-gate/bth.ts stores nothing: no Firestore client here');
    }
  };
  return () => asked;
}

/** Per capability: the row count, the four cells of the confusion table, and F1. */
export async function measureBth(
  capabilities: readonly string[] = CAPABILITIES
): Promise<Record<string, number>> {
  // Loaded here, not at the top of the file: the entry below refuses Firestore first.
  const { runCapabilityBenchmark } =
    await import('../../src/services/superhuman/validation/benchmark-runner.js');
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
  const refused = refuseFirestore();
  const current = await measureBth();
  if (args.includes('--json')) console.log(JSON.stringify(current, null, 2));
  console.log(`Firestore clients asked for and refused: ${refused()}`);
  const baseline = fileURLToPath(new URL('../../evals/baselines/bth.json', import.meta.url));
  process.exit(report(baseline, current, args));
}
