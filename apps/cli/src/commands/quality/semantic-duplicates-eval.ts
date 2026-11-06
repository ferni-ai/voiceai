/**
 * The dev and sealed sets for the duplicate check (semantic-duplicates.ts): each labelled pair
 * scored with the same thresholds and size floor as a real run, and precision and recall of the
 * flags against the labels. Run: `npx tsx apps/cli/src/commands/quality/semantic-duplicates-eval.ts <pairs.json>`.
 *
 * @module quality/semantic-duplicates-eval
 */
import { readFileSync } from 'fs';
import {
  cosine,
  embedAll,
  exportedFunctions,
  jaccard,
  localEmbed,
  NONE,
  related,
  shingles,
  sized,
  THRESHOLDS,
  type Embed,
  type ExportedFn,
} from './semantic-duplicates.js';

/** A labelled pair: two exported functions with their repo paths, and whether they duplicate. */
export interface LabelledPair {
  a: string;
  b: string;
  fileA: string;
  fileB: string;
  dup: boolean;
  note?: string;
}
export type PairScore = { pair: LabelledPair; cosine: number; jaccard: number; flagged: boolean };

/** Scores each pair; `flagged` uses the same thresholds and size floor as findDuplicates. */
export async function scorePairs(
  pairs: LabelledPair[],
  embed: Embed,
  thresholds = THRESHOLDS
): Promise<PairScore[]> {
  const fnOf = (file: string, code: string, i: number): ExportedFn => {
    const [fn] = exportedFunctions(file, code);
    if (!fn) throw new Error(`pair ${i}: no exported function in the snippet`);
    return fn;
  };
  const fns = pairs.map((p, i) => [fnOf(p.fileA, p.a, i), fnOf(p.fileB, p.b, i)] as const);
  const vectors = await embedAll(fns.flat(), embed);
  return fns.map(([a, b], i) => {
    const pair = pairs[i] as LabelledPair;
    const c = cosine(vectors.get(a) ?? NONE, vectors.get(b) ?? NONE);
    const j = jaccard(shingles(a.tokens), shingles(b.tokens));
    const flagged =
      sized(a) && sized(b) && !related(a, b) && (c >= thresholds.cosine || j >= thresholds.jaccard);
    return { pair, cosine: c, jaccard: j, flagged };
  });
}

/** Precision and recall of `flagged` against the labels. */
export function precisionRecall(scores: PairScore[]) {
  const count = (flagged: boolean, dup: boolean): number =>
    scores.filter((s) => s.flagged === flagged && s.pair.dup === dup).length;
  const [tp, fp, fn] = [count(true, true), count(true, false), count(false, true)];
  const ratio = (n: number, d: number): number => (d === 0 ? 1 : n / d);
  return { precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), tp, fp, fn };
}

async function main(devSet: string): Promise<void> {
  const pairs = JSON.parse(readFileSync(devSet, 'utf8')) as LabelledPair[];
  const scores = await scorePairs(pairs, await localEmbed());
  for (const { pair: p, flagged, cosine: c, jaccard: j } of scores)
    console.log(
      p.dup ? 'dup ' : 'diff',
      flagged ? 'FLAG' : '-',
      c.toFixed(3),
      j.toFixed(2),
      p.note
    );
  console.log(JSON.stringify(precisionRecall(scores)));
}

if (process.argv[1]?.endsWith('semantic-duplicates-eval.ts')) {
  const devSet = process.argv[2];
  if (!devSet) throw new Error('usage: semantic-duplicates-eval.ts <pairs.json>');
  main(devSet).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
