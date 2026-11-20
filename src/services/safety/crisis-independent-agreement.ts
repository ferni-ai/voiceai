/**
 * Reads of a turn agree on risk only when they are independent
 * (CRISIS_INDEPENDENT_AGREEMENT=on, off by default).
 *
 * The reply gate and the turn pipeline both read each turn. They share one classifier run, or
 * ask the same prompt twice when their inputs differ, and each is kept as a read of the turn
 * (crisis-classifier.ts turnVerdicts). Counted by verdicts, those are two reads agreeing, which
 * confirms the call (crisis-confirmed-risk.ts): one alarm read confirms itself, and no later
 * turn of the call gets the after-check. A turn with no second prompt hands its one read in for
 * both (crisis-imminent-agreement.ts readTurn), which marks the call as agreed risk for 6 hours.
 *
 * With the flag on, one classifier run is one reader, however many prompts it asks: the read
 * with the everyday rules, the read without them and v3's second read are asked of the same words
 * in the same run (owner decision, 2026-11-20). A run's reader is its base prompt, so runs of one
 * prompt count once. Agreement needs two readers that found risk; the turn's reads never note the
 * call as agreed risk (crisis-imminent-agreement.ts). However many paths kept it, one reader
 * counts once. A read whose readers are not known counts
 * as a reader of its own, as on main. The after-check read and the patterns confirm as before.
 * In memory only; nothing is logged here.
 *
 * @module CrisisIndependentAgreement
 */

import type { CrisisVerdict } from './crisis-classifier.js';

type Read = Promise<CrisisVerdict | null>;
type Env = Record<string, string | undefined>;
/** One run's reads, by reader: a run has one. */
type Asked = Map<string, Read[]>;

export function resolveIndependentAgreement(env: Env = process.env): boolean {
  return env.CRISIS_INDEPENDENT_AGREEMENT?.trim().toLowerCase() === 'on';
}

/** Every promise that stands for a run (the run's own, and each path's copy of it) → its reads. */
const runReaders = new WeakMap<Read, Asked>();

/** A run's read function that keeps every read it asks with the run's one reader. */
export function readersOfRun(
  read: (prompt: string) => Read,
  reader: string
): {
  read: (prompt: string) => Read;
  asked: Asked;
} {
  const asked: Asked = new Map();
  return {
    asked,
    read: (prompt) => {
      const verdict = read(prompt);
      asked.set(reader, [...(asked.get(reader) ?? []), verdict]);
      return verdict;
    },
  };
}

/** `run` stands for the run whose reads are `asked`, or for the run another promise stands for. */
export function standsFor(run: Read, asked: Asked | Read | undefined): Read {
  const reads = asked instanceof Promise ? runReaders.get(asked) : asked;
  if (reads) runReaders.set(run, reads);
  return run;
}

const risky = (v: CrisisVerdict | null): boolean => v?.risk === 'crisis' || v?.risk === 'imminent';

/** Two or more of these verdicts of one turn read risk: main's count, which ignores readers. */
export const verdictsAgreeOnRisk = (verdicts: ReadonlyArray<CrisisVerdict | null>): boolean =>
  verdicts.filter(risky).length >= 2;
const settled = (read: Read): Promise<CrisisVerdict | null> => read.catch(() => null);

/** How many independent readers found risk in these reads of one turn. */
export async function riskReaders(reads: readonly Read[]): Promise<number> {
  const found = new Set<unknown>();
  await Promise.all(
    reads.map(async (run) => {
      const asked = runReaders.get(run);
      const byPrompt = asked ? [...asked] : [];
      const risk = await Promise.all(
        byPrompt.map(async ([, all]) => (await Promise.all(all.map(settled))).some(risky))
      );
      byPrompt.forEach(([prompt], i) => risk[i] && found.add(prompt));
      // Unknown readers, or risk no kept read shows: the run is a reader of its own.
      if (!risk.some(Boolean) && risky(await settled(run))) found.add(asked ?? run);
    })
  );
  return found.size;
}
