/**
 * Scoring for the semantic recall bench (recall-bench.ts): how often a turn
 * finds the memory it is about, and how often a turn about nothing finds
 * something anyway (false recall). Pure: the vectors are inputs, so tests
 * need no model.
 */
import { MIN_MARGIN, MIN_QUERY_WORDS, standouts } from '../../src/memory/recall/semantic-recall.js';

export interface BenchCaller {
  name: string;
  items: Array<[id: string, text: string]>;
  turns: Array<[text: string, expect: string[]]>;
}

/** One caller, embedded: item and anchor vectors, and one vector per turn. */
export interface EmbeddedCaller {
  caller: BenchCaller;
  items: Map<string, number[]>;
  anchors: number[][];
  turns: number[][];
}

export interface TurnResult {
  caller: string;
  text: string;
  expect: string[];
  found: string[];
  outcome: 'hit' | 'wrong' | 'miss' | 'false-recall' | 'quiet';
}

export interface BenchScore {
  minMargin: number;
  /** Turns about a memory whose top match is one it is about. */
  hitRate: number;
  /** Of the turns that recalled anything, the share whose top match was right. */
  precision: number;
  /** Turns about nothing that recalled something anyway. */
  falseRecallRate: number;
  counts: Record<TurnResult['outcome'], number>;
  results: TurnResult[];
}

export function scoreAt(callers: EmbeddedCaller[], minMargin: number = MIN_MARGIN): BenchScore {
  const results: TurnResult[] = [];
  for (const c of callers) {
    c.caller.turns.forEach(([text, expect], i) => {
      const short = text.trim().split(/\s+/).length < MIN_QUERY_WORDS;
      const found = short ? [] : [...standouts(c.turns[i], c.items, c.anchors, minMargin).keys()];
      const top = found[0];
      const outcome: TurnResult['outcome'] =
        expect.length === 0
          ? top
            ? 'false-recall'
            : 'quiet'
          : !top
            ? 'miss'
            : expect.includes(top)
              ? 'hit'
              : 'wrong';
      results.push({ caller: c.caller.name, text, expect, found, outcome });
    });
  }
  const counts = { hit: 0, wrong: 0, miss: 0, 'false-recall': 0, quiet: 0 };
  for (const r of results) counts[r.outcome]++;
  const about = counts.hit + counts.wrong + counts.miss;
  const recalled = counts.hit + counts.wrong + counts['false-recall'];
  const nothing = counts['false-recall'] + counts.quiet;
  return {
    minMargin,
    hitRate: about ? counts.hit / about : 0,
    precision: recalled ? counts.hit / recalled : 1,
    falseRecallRate: nothing ? counts['false-recall'] / nothing : 0,
    counts,
    results,
  };
}

/** One line per margin: the trade-off between finding memories and inventing links. */
export function sweepTable(callers: EmbeddedCaller[], margins: number[]): string[] {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  const lines = ['margin  hit  precision  false-recall'];
  for (const m of margins) {
    const s = scoreAt(callers, m);
    const mark = Math.abs(m - MIN_MARGIN) < 1e-9 ? '  <- MIN_MARGIN' : '';
    lines.push(
      `${m.toFixed(2)}  ${pct(s.hitRate)}      ${pct(s.precision)}         ${pct(s.falseRecallRate)}${mark}`
    );
  }
  return lines;
}
