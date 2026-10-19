/**
 * The pure parts of the persona eval bar (bar.ts): arm flags, judge-output
 * parsing, rates with Wilson intervals, the n-gram copy check, the A/A noise
 * floor and the arm-vs-baseline comparison. No network, no repo services.
 */
import { wilson } from '../memory-eval/longmem-lib.js';

// ---------------------------------------------------------------- arm flags

const FLAG_KEY = /^[A-Z][A-Z0-9_]*$/;

/** `--set K=V` values as a map. A malformed one throws: a typo must not run the baseline by mistake. */
export function parseSets(list: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list) {
    const eq = item.indexOf('=');
    const key = eq > 0 ? item.slice(0, eq).trim() : '';
    if (!FLAG_KEY.test(key))
      throw new Error(`--set expects KEY=value with an UPPER_CASE key, got "${item}"`);
    out[key] = item.slice(eq + 1).trim();
  }
  return out;
}

/**
 * The flags an arm runs with: the prod file's values, then the arm's
 * overrides on top. Values are strings, as process.env holds them.
 */
export function armEnv(prod: unknown, sets: Record<string, string>): Record<string, string> {
  if (!prod || typeof prod !== 'object' || Array.isArray(prod))
    throw new Error('the flags file must be a flat JSON object of FLAG: value');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(prod as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object') throw new Error(`flag ${k} is not a scalar`);
    out[k] = String(v);
  }
  return { ...out, ...sets };
}

// ---------------------------------------------------------------- seeded order

/** FNV-1a, for seeding from a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A seeded Fisher-Yates shuffle (a copy): the same seed gives the same order on every run. */
export function shuffled<T>(xs: readonly T[], seed: string): T[] {
  let a = hashSeed(seed);
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------- judge output

/** The first JSON object in a judge reply (bare, or in a ```json fence), or null. */
export function judgeJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** {"companion":"C"} as an index into `count` lettered choices (C = 2), or null. */
export function parseCompanion(raw: string, count: number): number | null {
  const v = judgeJson(raw)?.companion;
  if (typeof v !== 'string') return null;
  const letter = v.trim().toUpperCase();
  if (!/^[A-Z]$/.test(letter)) return null;
  const i = letter.charCodeAt(0) - 65;
  return i < count ? i : null;
}

/** {"pick":"1"} or {"pick":2}: which of two replies, or null. */
export function parsePick(raw: string): 1 | 2 | null {
  const v = String(judgeJson(raw)?.pick ?? '').trim();
  return v === '1' ? 1 : v === '2' ? 2 : null;
}

export type Use = 'natural' | 'forced' | 'none';
/** {"use":"natural"|"forced"|"none"}, or null. */
export function parseUse(raw: string): Use | null {
  const v = String(judgeJson(raw)?.use ?? '')
    .trim()
    .toLowerCase();
  return v === 'natural' || v === 'forced' || v === 'none' ? v : null;
}

/** Each persona's name blanked out, so the judge reads voice, not a self-introduction. */
export function maskNames(text: string, names: readonly string[]): string {
  return names.reduce(
    (t, n) => t.replace(new RegExp(`\\b${n.replace(/[^a-z0-9]/gi, '')}\\b`, 'gi'), '___'),
    text
  );
}

// ---------------------------------------------------------------- rates

export interface Rate {
  k: number;
  n: number;
  p: number;
  /** 95% Wilson interval. */
  lo: number;
  hi: number;
}

export function rate(k: number, n: number): Rate {
  const [lo, hi] = wilson(k, n);
  return { k, n, p: n ? k / n : 0, lo, hi };
}

// ---------------------------------------------------------------- copy check

/** Speech markup a listener never hears: <break/>, <speed ...>, [laughter]. */
const MARKUP = /<[^>]*>|\[[a-z ]+\]/gi;

/** Lower-case words, apostrophes kept inside a word ("don't"), curly quotes folded. */
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? []
  );
}

/** Every n-word sequence in the text. */
export function ngramSet(text: string, n = 4): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** The distinct n-grams of a spoken reply that also appear in any of the instruction texts. */
export function copiedNgrams(
  reply: string,
  instructions: ReadonlyArray<Set<string>>,
  n = 4
): string[] {
  return [...ngramSet(reply.replace(MARKUP, ' '), n)].filter((g) =>
    instructions.some((s) => s.has(g))
  );
}

export interface CopyStats extends Rate {
  /** The n-grams found in the most replies. */
  top: Array<{ ngram: string; replies: number }>;
}

/** The share of replies with at least one copied n-gram, and the most-copied n-grams. */
export function copyStats(copied: ReadonlyArray<readonly string[]>, top = 15): CopyStats {
  const counts = new Map<string, number>();
  for (const list of copied) for (const g of new Set(list)) counts.set(g, (counts.get(g) ?? 0) + 1);
  return {
    ...rate(copied.filter((c) => c.length > 0).length, copied.length),
    top: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, top)
      .map(([ngram, replies]) => ({ ngram, replies })),
  };
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------- A/A and comparison

/** What one arm scores on its own. */
export interface Metrics {
  distinctness: Rate;
  insight: Rate;
  copy: CopyStats;
  medianWords: number;
}

/** A gap per metric, in rate units: what a change has to beat. */
export interface Floor {
  distinctness: number;
  insight: number;
  copy: number;
  /** For humanness, the distance from 0.5 of the second run's win rate over the first. */
  humanness: number;
}

/** How far apart two runs of the same arm actually landed. */
export function aaGap(a: Metrics, b: Metrics, humanness: Rate): Floor {
  return {
    distinctness: Math.abs(a.distinctness.p - b.distinctness.p),
    insight: Math.abs(a.insight.p - b.insight.p),
    copy: Math.abs(a.copy.p - b.copy.p),
    humanness: Math.abs(humanness.p - 0.5),
  };
}

/**
 * The 95% half-width of the difference between two independent runs at these
 * rates: the gap the sample sizes alone allow, whatever one A/A pair showed.
 */
export function samplingGap(a: Rate, b: Rate): number {
  return 1.96 * Math.sqrt(variance(a) + variance(b));
}
const variance = (r: Rate): number => (r.n ? (r.p * (1 - r.p)) / r.n : 0);

/**
 * The noise floor: the larger of the observed A/A gap and the sampling gap.
 * One A/A pair can land close by luck (0.6 points apart at n=180, where
 * sampling alone allows 8); on its own it would pass noise as a change.
 */
export function noiseFloor(a: Metrics, b: Metrics, humanness: Rate): Floor {
  const seen = aaGap(a, b, humanness);
  return {
    distinctness: Math.max(seen.distinctness, samplingGap(a.distinctness, b.distinctness)),
    insight: Math.max(seen.insight, samplingGap(a.insight, b.insight)),
    copy: Math.max(seen.copy, samplingGap(a.copy, b.copy)),
    // A pairwise win rate is one sample against 0.5, not a difference of two.
    humanness: Math.max(seen.humanness, 1.96 * Math.sqrt(variance({ ...humanness, p: 0.5 }))),
  };
}

export type Verdict = 'better' | 'worse' | 'noise' | 'no A/A';
export interface Row {
  metric: keyof Floor;
  baseline: number;
  arm: number;
  delta: number;
  floor: number | null;
  verdict: Verdict;
}

/** A gap counts only when it is larger than the A/A gap; lower is better for copy. */
export function verdictFor(delta: number, floor: number | null, lowerIsBetter = false): Verdict {
  if (floor === null) return 'no A/A';
  if (Math.abs(delta) <= floor) return 'noise';
  return delta > 0 !== lowerIsBetter ? 'better' : 'worse';
}

/**
 * The arm against the baseline, metric by metric. Humanness is already
 * pairwise (the arm's win rate over the baseline), so its baseline is 0.5.
 */
export function compareArms(
  base: Metrics,
  arm: Metrics,
  humanness: Rate | null,
  floor: Floor | null
): Row[] {
  const row = (metric: keyof Floor, b: number, a: number, lower = false): Row => ({
    metric,
    baseline: b,
    arm: a,
    delta: a - b,
    floor: floor ? floor[metric] : null,
    verdict: verdictFor(a - b, floor ? floor[metric] : null, lower),
  });
  return [
    row('distinctness', base.distinctness.p, arm.distinctness.p),
    ...(humanness ? [row('humanness', 0.5, humanness.p)] : []),
    row('insight', base.insight.p, arm.insight.p),
    row('copy', base.copy.p, arm.copy.p, true),
  ];
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const ci = (r: Rate): string => `${r.k}/${r.n} = ${pct(r.p)} [${pct(r.lo)}, ${pct(r.hi)}]`;

/** One arm's scores as a markdown table. */
export function metricsTable(label: string, m: Metrics, humanness?: Rate | null): string {
  return [
    `| ${label} | value (95% CI) |`,
    '|---|---|',
    `| distinctness (blind persona-ID, chance 16.7%) | ${ci(m.distinctness)} |`,
    ...(humanness ? [`| humanness (pairwise win rate) | ${ci(humanness)} |`] : []),
    `| insight (uses caller context naturally) | ${ci(m.insight)} |`,
    `| copy (replies with a 4-gram from their instructions) | ${ci(m.copy)} |`,
    `| median words per reply | ${m.medianWords} |`,
  ].join('\n');
}

/** The arm-vs-baseline rows as a markdown table. */
export function compareTable(rows: readonly Row[]): string {
  return [
    '| metric | baseline | arm | delta | A/A floor | verdict |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.metric} | ${pct(r.baseline)} | ${pct(r.arm)} | ${r.delta >= 0 ? '+' : ''}${pct(r.delta)} | ${r.floor === null ? '-' : pct(r.floor)} | ${r.verdict} |`
    ),
  ].join('\n');
}
