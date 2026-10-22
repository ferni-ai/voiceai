#!/usr/bin/env tsx
/**
 * Semantic recall bench: labelled turns (recall-cases.json) against the real
 * embedding model, scored at MIN_MARGIN and swept across margins. Run it
 * before SEMANTIC_RECALL goes to a wider cohort, and after any change to the
 * margin, the anchors or the embedding model.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/recall-bench.ts [--json]
 *     [--min-hit 0.8] [--max-false-recall 0.1] [--bq]
 *
 * Needs Google credentials (ADC). Exits 1 when a threshold given is missed.
 * --bq also writes the three rates to ferni_events.eval_results (env dev), and
 * exits 1 if that insert fails.
 * Prints the labelled turns only, never anything from a real caller.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ANCHORS, MIN_MARGIN } from '../../src/memory/recall/semantic-recall.js';
import { embedForRetrieval } from '../../src/memory/vectors/retrieval-embeddings.js';
import { scoreAt, sweepTable, type BenchCaller, type EmbeddedCaller } from './recall-bench-lib.js';
import { newRunId, recallMetrics, reportIfBq } from '../lib/eval-results-bq.js';

type Embed = (texts: string[], role: 'document' | 'query') => Promise<number[][]>;

export async function embedCallers(
  callers: BenchCaller[],
  embed: Embed
): Promise<EmbeddedCaller[]> {
  return Promise.all(
    callers.map(async (caller) => {
      const docs = await embed([...caller.items.map(([, t]) => t), ...ANCHORS], 'document');
      const turns = await embed(
        caller.turns.map(([t]) => t),
        'query'
      );
      return {
        caller,
        items: new Map(caller.items.map(([id], i) => [id, docs[i] ?? []])),
        anchors: docs.slice(caller.items.length),
        turns,
      };
    })
  );
}

/** A threshold flag's value, 0 to 1; a missing or malformed one is an error, never a silent pass. */
export function flag(args: string[], name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = Number(args[i + 1]);
  if (args[i + 1] === undefined || !Number.isFinite(v) || v < 0 || v > 1)
    throw new Error(`${name} needs a number from 0 to 1, not ${args[i + 1] ?? '(none)'}`);
  return v;
}

async function main(args: string[]): Promise<number> {
  const file = new URL('./recall-cases.json', import.meta.url);
  const { callers } = JSON.parse(readFileSync(file, 'utf8')) as { callers: BenchCaller[] };
  const embedded = await embedCallers(callers, embedForRetrieval);
  const score = scoreAt(embedded);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ...score, results: undefined, wrong: score.results.filter((r) => r.outcome !== 'hit' && r.outcome !== 'quiet') }, null, 2)); // prettier-ignore
  } else {
    for (const l of sweepTable(embedded, [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12]))
      console.log(l);
    console.log(`\nAt MIN_MARGIN ${MIN_MARGIN}: ${JSON.stringify(score.counts)}`);
    for (const r of score.results.filter((x) => x.outcome !== 'hit' && x.outcome !== 'quiet'))
      console.log(`  ${r.outcome.padEnd(12)} ${r.caller}: "${r.text}" -> ${r.found.join(', ') || '(nothing)'} (expected ${r.expect.join(' or ') || 'nothing'})`); // prettier-ignore
  }
  const minHit = flag(args, '--min-hit');
  const maxFalse = flag(args, '--max-false-recall');
  const failed =
    (minHit !== undefined && score.hitRate < minHit) ||
    (maxFalse !== undefined && score.falseRecallRate > maxFalse);
  const report = () => ({ runId: newRunId('recall'), arm: 'min-margin', scenario: 'recall' });
  await reportIfBq(args.includes('--bq'), () => [{ ...report(), metrics: recallMetrics(score) }]);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
