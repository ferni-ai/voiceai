/**
 * Scoring for the per-turn memory bench (turn-memory-bench.ts): which memories
 * a turn got, against the ones hand-labelled as about it (recall-cases.json).
 * Pure, so its tests need no model.
 */

/** One turn: the memories labelled as about it (none for small talk) and the ones it got. */
export interface TurnOutcome {
  expect: string[];
  found: string[];
}

export interface TurnBenchScore {
  /** Memories returned, over every turn. */
  returned: number;
  /** Of the memories returned, the share labelled as about the turn. */
  precision: number;
  /** Of the labelled memories, the share returned. */
  recall: number;
  /** Turns about a memory whose first memory is one it is about. */
  hitRate: number;
  /** Turns about nothing that got a memory anyway. */
  falseRecallRate: number;
}

export function scoreTurns(turns: TurnOutcome[]): TurnBenchScore {
  let returned = 0;
  let relevant = 0;
  let labelled = 0;
  let labelledFound = 0;
  let about = 0;
  let hits = 0;
  let nothing = 0;
  let falseRecalls = 0;
  for (const { expect, found } of turns) {
    returned += found.length;
    relevant += found.filter((id) => expect.includes(id)).length;
    if (expect.length > 0) {
      about++;
      labelled += expect.length;
      labelledFound += expect.filter((id) => found.includes(id)).length;
      if (found[0] !== undefined && expect.includes(found[0])) hits++;
    } else {
      nothing++;
      if (found.length > 0) falseRecalls++;
    }
  }
  return {
    returned,
    precision: returned ? relevant / returned : 1,
    recall: labelled ? labelledFound / labelled : 0,
    hitRate: about ? hits / about : 0,
    falseRecallRate: nothing ? falseRecalls / nothing : 0,
  };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** One table row: a gate and how it scored. */
export function formatRow(name: string, s: TurnBenchScore): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  const precision = s.returned ? pct(s.precision) : '  n/a'; // nothing sent: nothing to be right about
  return `${name.padEnd(44)} ${String(s.returned).padStart(4)} ${precision}     ${pct(s.recall)}  ${pct(s.hitRate)}   ${pct(s.falseRecallRate)}`; // prettier-ignore
}

export const TABLE_HEADER = `${'gate'.padEnd(44)} sent  precision recall  hit  false-recall`;
