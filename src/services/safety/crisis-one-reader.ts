/**
 * Which classifier runs are one reader. Two runs that saw the same input with the same
 * prompt and model are one judgement, however many paths started them (the reply gate and
 * the turn pipeline read the same words a fraction of a second apart). Runs that saw
 * different words, earlier lines or Ferni's line are different judgements.
 *
 * Only the CRISIS_CONFIRMED_CALL_RISK confirm counts readers (crisis-confirmed-risk.ts).
 * Every other count of a turn's reads (agreement, graded response, adjudicator,
 * soft transfer) still counts each read, so no live reply changes.
 *
 * The reader is a hash: no caller words are kept beyond the run's own verdict.
 *
 * @module CrisisOneReader
 */

import { createHash } from 'crypto';
import { DEFAULT_CRISIS_CLASSIFIER_MODEL } from './crisis-classifier-gemini.js';

interface Verdict {
  risk: string;
}

/** Each run's verdict, by the reader that produced it. */
const readerOf = new WeakMap<object, string>();

/** What the model saw, the prompt and the model: equal for two runs only if one judgement. */
export function readerKey(
  seen: { latest: string; earlier: readonly string[]; companion?: string },
  prompt: string,
  env: Record<string, string | undefined>
): string {
  const model = env.CRISIS_CLASSIFIER_MODEL || DEFAULT_CRISIS_CLASSIFIER_MODEL;
  const what = [seen.latest, seen.earlier, seen.companion ?? '', prompt, model];
  return createHash('sha256').update(JSON.stringify(what)).digest('hex');
}

/** Notes which reader made this verdict, and returns it unchanged. */
export function markReader<T extends Verdict | null>(verdict: T, reader: string): T {
  if (verdict) readerOf.set(verdict, reader);
  return verdict;
}

/** A turn's risk reads, as counts only: no hash or other value derived from the words. */
export interface ReaderTally {
  /** Crisis and imminent reads. */
  riskReads: number;
  /** Distinct readers among them. A read with no reader counts alone. */
  readers: number;
  /** A risk read joined a reader already counted: two runs of one input, prompt and model. */
  sharedReader: boolean;
}

/** Counts the distinct readers among a turn's risk reads. */
export function readerTally(verdicts: ReadonlyArray<Verdict | null>): ReaderTally {
  const readers = new Set<unknown>();
  let riskReads = 0;
  let sharedReader = false;
  for (const v of verdicts) {
    if (v?.risk !== 'crisis' && v?.risk !== 'imminent') continue;
    riskReads += 1;
    const reader = readerOf.get(v) ?? v;
    if (readers.has(reader)) sharedReader = true;
    readers.add(reader);
  }
  return { riskReads, readers: readers.size, sharedReader };
}
