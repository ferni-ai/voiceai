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
/**
 * The distinct n-grams of a spoken reply that also appear in any of the
 * instruction texts. An n-gram in `exclude` (the speaker's own canon, say) is
 * not a copy: a persona naming its own cats is telling its life, not reading a script.
 */
export function copiedNgrams(
  reply: string,
  instructions: ReadonlyArray<Set<string>>,
  n = 4,
  exclude?: ReadonlySet<string>
): string[] {
  return [...ngramSet(reply.replace(MARKUP, ' '), n)].filter(
    (g) => !exclude?.has(g) && instructions.some((s) => s.has(g))
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
  /** The model's generic habits (tellsOf). Absent in results saved before the metric existed. */
  tells?: Tells;
}

/** A gap per metric, in rate units: what a change has to beat. */
export interface Floor {
  distinctness: number;
  insight: number;
  copy: number;
  /** For humanness, the distance from 0.5 of the second run's win rate over the first. */
  humanness: number;
  /** Per tell, when both runs carry tells. */
  tells?: Record<TellKey, number>;
}

/** How far apart two runs of the same arm actually landed. */
export function aaGap(a: Metrics, b: Metrics, humanness: Rate): Floor {
  const ta = a.tells;
  const tb = b.tells;
  return {
    distinctness: Math.abs(a.distinctness.p - b.distinctness.p),
    insight: Math.abs(a.insight.p - b.insight.p),
    copy: Math.abs(a.copy.p - b.copy.p),
    humanness: Math.abs(humanness.p - 0.5),
    ...(ta && tb ? { tells: perTell((k) => Math.abs(ta[k].p - tb[k].p)) } : {}),
  };
}

/**
 * The 95% half-width of the difference between two independent runs at these
 * rates: the gap the sample sizes alone allow, whatever one A/A pair showed.
 */
export function samplingGap(a: Rate, b: Rate): number {
  return 1.96 * Math.sqrt(atLeastOne(a) + atLeastOne(b));
}
const variance = (r: Rate): number => (r.n ? (r.p * (1 - r.p)) / r.n : 0);
/**
 * The variance with the rate kept at least one event from 0 or 1: two runs
 * that both saw none of a rare tell (0/144 twice) would otherwise set a floor
 * of 0, and a single reply with it in the arm would read as a change.
 */
const atLeastOne = (r: Rate): number => {
  if (!r.n) return 0;
  const p = Math.min(Math.max(r.p, 1 / r.n), 1 - 1 / r.n);
  return (p * (1 - p)) / r.n;
};

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
    ...(a.tells && b.tells && seen.tells
      ? {
          tells: perTell((k) => Math.max(seen.tells![k], samplingGap(a.tells![k], b.tells![k]))),
        }
      : {}),
  };
}

// ---------------------------------------------------------------- humanness, length-controlled

/** One pairwise humanness judgment: the arm's reply against the baseline's. */
export interface Pair {
  line: string;
  persona: string;
  armWords: number;
  baseWords: number;
  armWins: boolean;
}

/** Two replies count as the same length when the longer is at most `ratio` times the shorter. */
export const LENGTH_RATIO = 1.5;
/** Fewer length-matched pairs than this and the humanness verdict is withheld. */
export const MIN_MATCHED = 30;

export function lengthMatched(a: number, b: number, ratio = LENGTH_RATIO): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.max(a, b) <= ratio * Math.min(a, b);
}

export interface Humanness {
  /** Every judged pair. */
  overall: Rate;
  /** Only pairs whose word counts are within LENGTH_RATIO of each other: length can't decide these. */
  matched: Rate;
}

export function humannessOf(pairs: readonly Pair[], ratio = LENGTH_RATIO): Humanness {
  const m = pairs.filter((x) => lengthMatched(x.armWords, x.baseWords, ratio));
  return {
    overall: rate(pairs.filter((x) => x.armWins).length, pairs.length),
    matched: rate(m.filter((x) => x.armWins).length, m.length),
  };
}

/** The win rate a humanness verdict rests on: length-matched when there are enough pairs. */
export const humannessRate = (h: Humanness): Rate =>
  h.matched.n >= MIN_MATCHED ? h.matched : h.overall;

export type Verdict = 'better' | 'worse' | 'noise' | 'no A/A' | 'insufficient matched pairs';
export interface Row {
  metric: Exclude<keyof Floor, 'tells'> | `tells: ${TellKey}`;
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
  humanness: Humanness | null,
  floor: Floor | null
): Row[] {
  const row = (
    metric: Row['metric'],
    b: number,
    a: number,
    f: number | null,
    lower = false
  ): Row => ({
    metric,
    baseline: b,
    arm: a,
    delta: a - b,
    floor: f,
    verdict: verdictFor(a - b, f, lower),
  });
  const bt = base.tells;
  const at = arm.tells;
  return [
    row('distinctness', base.distinctness.p, arm.distinctness.p, floor?.distinctness ?? null),
    ...(humanness ? [humannessRow(humanness, floor)] : []),
    row('insight', base.insight.p, arm.insight.p, floor?.insight ?? null),
    row('copy', base.copy.p, arm.copy.p, floor?.copy ?? null, true),
    // Each tell is a generic model habit across all six personas: fewer is better overall.
    ...(bt && at
      ? TELL_KEYS.map((k) => row(`tells: ${k}`, bt[k].p, at[k].p, floor?.tells?.[k] ?? null, true))
      : []),
  ];
}

/**
 * The humanness row, on length-matched pairs only, so a reply can't win by
 * being longer or shorter. Its floor is at least the sampling gap at the
 * matched n, which can be far smaller than the A/A's.
 */
function humannessRow(h: Humanness, floor: Floor | null): Row {
  const m = h.matched;
  if (m.n < MIN_MATCHED)
    return {
      metric: 'humanness',
      baseline: 0.5,
      arm: m.p,
      delta: m.p - 0.5,
      floor: null,
      verdict: 'insufficient matched pairs',
    };
  const f = floor ? Math.max(floor.humanness, 1.96 * Math.sqrt(0.25 / m.n)) : null;
  return {
    metric: 'humanness',
    baseline: 0.5,
    arm: m.p,
    delta: m.p - 0.5,
    floor: f,
    verdict: verdictFor(m.p - 0.5, f),
  };
}

// ---------------------------------------------------------------- replicated runs, two judges

/** The metrics a judge model scores: each needs a second judge from another family to agree. */
export const JUDGED_METRICS = ['distinctness', 'humanness', 'insight'] as const;

/**
 * Per metric, the widest of several floors (each baseline run's A/A floor and
 * the spread between runs): one A/A pair in one run underestimates run-to-run variance.
 */
export function maxFloor(floors: readonly Floor[]): Floor {
  const top = (f: (x: Floor) => number): number => Math.max(...floors.map(f));
  const withTells = floors.every((f) => f.tells);
  return {
    distinctness: top((f) => f.distinctness),
    insight: top((f) => f.insight),
    copy: top((f) => f.copy),
    humanness: top((f) => f.humanness),
    ...(withTells ? { tells: perTell((k) => top((f) => f.tells![k])) } : {}),
  };
}

/** One judge's verdict on one metric in one run (arm run i against baseline run i). */
export interface Cell {
  run: number;
  judge: string;
  verdict: Verdict;
  delta: number;
  floor: number | null;
}
export interface MetricVerdict {
  metric: Row['metric'];
  verdict: 'better' | 'worse' | 'noise';
  /** Per run, e.g. "run 1: judges disagree (gemini +9.8/9.8 better, gpt-oss -2.0/9.8 noise)". */
  note: string;
  cells: Cell[];
}

/**
 * A metric over runs and judges. A run is better (worse) only when every judge
 * says so beyond its own floor, else noise. The metric is better only when
 * every run is, and worse when any run is: no pass on one lucky draw.
 */
export function combineMetric(metric: Row['metric'], cells: readonly Cell[]): MetricVerdict {
  const runs = [...new Set(cells.map((c) => c.run))].sort((a, b) => a - b);
  const byRun = runs.map((run) => {
    const cs = cells.filter((c) => c.run === run);
    const all = (v: Verdict): boolean => cs.every((c) => c.verdict === v);
    const v = all('better') ? 'better' : all('worse') ? 'worse' : 'noise';
    const split = v === 'noise' && cs.some((c) => c.verdict === 'better' || c.verdict === 'worse');
    // Each judge's arm-minus-baseline gap / its floor, in points, then its verdict.
    const each = cs.map(
      (c) =>
        `${cs.length > 1 ? `${c.judge} ` : ''}${c.delta >= 0 ? '+' : ''}${(100 * c.delta).toFixed(1)}/${c.floor === null ? '-' : (100 * c.floor).toFixed(1)} ${c.verdict}`
    );
    return { run, v, text: `${split ? 'judges disagree' : v} (${each.join(', ')})` };
  });
  const verdict =
    byRun.length && byRun.every((r) => r.v === 'better')
      ? 'better'
      : byRun.some((r) => r.v === 'worse')
        ? 'worse'
        : 'noise';
  return {
    metric,
    verdict,
    note: byRun.map((r) => `run ${r.run}: ${r.text}`).join('; '),
    cells: [...cells],
  };
}

/**
 * The bar's summary line. PASS needs two runs and two judges, distinctness or
 * humanness better (combineMetric), insight not worse, and no tell worse.
 */
export function barVerdict(
  metrics: readonly MetricVerdict[],
  runs: number,
  judges: number
): { pass: boolean; line: string } {
  const reasons: string[] = [];
  if (runs < 2) reasons.push(`${runs} run (a pass needs --runs 2 or more)`);
  if (judges < 2) reasons.push(`${judges} judge (a pass needs a second judge from another family)`);
  const of = (m: string): MetricVerdict | undefined => metrics.find((x) => x.metric === m);
  const gains = (['distinctness', 'humanness'] as const).filter((m) => of(m)?.verdict === 'better');
  if (!gains.length)
    reasons.push(
      'neither distinctness nor humanness is better in every run with the judges agreeing'
    );
  if (!of('insight')) reasons.push('no insight verdict');
  else if (of('insight')!.verdict === 'worse') reasons.push('insight worse');
  for (const m of metrics)
    if (m.metric.startsWith('tells: ') && m.verdict === 'worse') reasons.push(`${m.metric} worse`);
  if (reasons.length) return { pass: false, line: `NO PASS: ${reasons.join('; ')}` };
  return {
    pass: true,
    line: `PASS: ${gains.join(' and ')} better in all ${runs} runs with all ${judges} judges agreeing; insight and tells not worse`,
  };
}

// ---------------------------------------------------------------- model tells

/**
 * Generic model habits that read as "an assistant", not as a person: the
 * defaults that came back when the shared scripts were removed (2026-10-18,
 * SCRIPT_FREE_REMINDER: ends on a question 28% -> 94%, opens with a reaction
 * word 7% -> 59%). Deterministic, no LLM. Each is the share of replies that
 * show it; lower is better across the cast, but per persona a tell can be in
 * character (Maya exclaims), so per persona they are reported, not judged.
 */
export const TELL_KEYS = ['question', 'opener', 'checkin', 'exclaim'] as const;
export type TellKey = (typeof TELL_KEYS)[number];
export type Tells = Record<TellKey, Rate> & {
  /** Replies with any question mark (reported only; "rarely asks" is about this). */
  asks: Rate;
};

const perTell = (f: (k: TellKey) => number): Record<TellKey, number> =>
  Object.fromEntries(TELL_KEYS.map((k) => [k, f(k)])) as Record<TellKey, number>;

/** What a listener hears: no SSML tags, no [laughter]-style sound cues, curly quotes folded. */
function spoken(reply: string): string {
  return reply
    .replace(MARKUP, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The last thing said is a question: the reply ends on "?" (closing quotes, brackets or dots aside). */
export function endsOnQuestion(reply: string): boolean {
  return /\?[\s"')\].…]*$/.test(spoken(reply));
}

/** Stock reaction words a model opens with (Oh/Ugh/Yeah/Hmm/Wow/Ah/Well, stretched or not). */
const REACTION = /^(?:o+h+|u+g+h+|y+e+a+h*|h+m+|w+o+w+|a+h+|well)$/;

/** The reply's first spoken word is a stock reaction ("Oh,", "Hmm...", "Yeah so", "Ugh."). */
export function opensWithReaction(reply: string): boolean {
  const first = /^[^a-z0-9]*([a-z0-9]+(?:'[a-z]+)*)/.exec(spoken(reply).toLowerCase())?.[1];
  return first !== undefined && REACTION.test(first);
}

/** Therapist-style check-ins: how are you feeling / holding up, how does that make you feel, that sounds hard. */
const CHECK_INS = [
  /\bhow(?: are|'re| r) you (?:feeling|holding up)\b/,
  /\bhow (?:does|did|is|do) (?:that|this|it|all that) (?:make|making) you feel\b/,
  /\bthat (?:sounds|must be|must feel|must have been)(?: so| really| incredibly| super| just)? (?:hard|exhausting|tough|difficult|overwhelming)\b/,
];

export function therapistCheckIn(reply: string): boolean {
  const t = spoken(reply).toLowerCase();
  return CHECK_INS.some((re) => re.test(t));
}

export function exclaims(reply: string): boolean {
  return spoken(reply).includes('!');
}

/** The tells over a set of replies (empty replies are not counted). */
export function tellsOf(replies: readonly string[]): Tells {
  const rs = replies.filter((r) => spoken(r));
  const share = (f: (r: string) => boolean): Rate => rate(rs.filter(f).length, rs.length);
  return {
    question: share(endsOnQuestion),
    opener: share(opensWithReaction),
    checkin: share(therapistCheckIn),
    exclaim: share(exclaims),
    asks: share((r) => spoken(r).includes('?')),
  };
}

export type TellMove = 'up' | 'down' | 'noise';
export interface PersonaTellRow {
  persona: string;
  tell: TellKey | 'asks';
  baseline: number;
  arm: number;
  delta: number;
  floor: number;
  /** Direction only: per persona a tell may be in character, so this is not better/worse. */
  move: TellMove;
}

/**
 * Per persona, each tell against the baseline. The floor is the larger of the
 * persona's own A/A gap (when given) and the sampling gap at its n (about 30).
 */
export function comparePersonaTells(
  base: Record<string, Tells>,
  arm: Record<string, Tells>,
  aa?: Record<string, Tells>
): PersonaTellRow[] {
  const keys = [...TELL_KEYS, 'asks'] as const;
  return Object.keys(arm)
    .filter((p) => base[p])
    .flatMap((p) =>
      keys.map((tell) => {
        const b = base[p][tell];
        const a = arm[p][tell];
        const seen = aa?.[p] ? Math.abs(b.p - aa[p][tell].p) : 0;
        const floor = Math.max(seen, samplingGap(b, a));
        const delta = a.p - b.p;
        return {
          persona: p,
          tell,
          baseline: b.p,
          arm: a.p,
          delta,
          floor,
          move: Math.abs(delta) <= floor ? 'noise' : delta > 0 ? 'up' : 'down',
        };
      })
    );
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const ci = (r: Rate): string => `${r.k}/${r.n} = ${pct(r.p)} [${pct(r.lo)}, ${pct(r.hi)}]`;

/** One arm's scores as a markdown table. */
export function metricsTable(label: string, m: Metrics, humanness?: Humanness | null): string {
  return [
    `| ${label} | value (95% CI) |`,
    '|---|---|',
    `| distinctness (blind persona-ID, chance 16.7%) | ${ci(m.distinctness)} |`,
    ...(humanness
      ? [
          `| humanness, all pairs (pairwise win rate) | ${ci(humanness.overall)} |`,
          `| humanness, length-matched pairs (within ${LENGTH_RATIO}x) | ${ci(humanness.matched)} |`,
        ]
      : []),
    `| insight (uses caller context naturally) | ${ci(m.insight)} |`,
    `| copy (replies with a 4-gram from their instructions) | ${ci(m.copy)} |`,
    `| median words per reply | ${m.medianWords} |`,
    ...(m.tells
      ? [
          `| tells: ends on a question | ${ci(m.tells.question)} |`,
          `| tells: opens with Oh/Ugh/Yeah/Hmm/Wow/Ah/Well | ${ci(m.tells.opener)} |`,
          `| tells: therapist check-in | ${ci(m.tells.checkin)} |`,
          `| tells: exclamation mark | ${ci(m.tells.exclaim)} |`,
          `| tells: any question mark (reported only) | ${ci(m.tells.asks)} |`,
        ]
      : []),
  ].join('\n');
}

/** Each persona's tells as a markdown table (rates of that persona's replies). */
export function personaTellsTable(perPersona: Record<string, Tells>): string {
  return [
    '| persona | ends on ? | opener | check-in | ! | any ? |',
    '|---|---|---|---|---|---|',
    ...Object.entries(perPersona).map(
      ([p, t]) =>
        `| ${p} | ${pct(t.question.p)} | ${pct(t.opener.p)} | ${pct(t.checkin.p)} | ${pct(t.exclaim.p)} | ${pct(t.asks.p)} |`
    ),
  ].join('\n');
}

/** Per-persona tell moves vs the baseline, only the ones beyond their floor. */
export function personaTellsCompareTable(rows: readonly PersonaTellRow[]): string {
  const moved = rows.filter((r) => r.move !== 'noise');
  return [
    '| persona | tell | baseline | arm | delta | floor | move |',
    '|---|---|---|---|---|---|---|',
    ...moved.map(
      (r) =>
        `| ${r.persona} | ${r.tell} | ${pct(r.baseline)} | ${pct(r.arm)} | ${r.delta >= 0 ? '+' : ''}${pct(r.delta)} | ${pct(r.floor)} | ${r.move} |`
    ),
    ...(moved.length ? [] : ['| (none beyond their floor) | | | | | | |']),
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

// ---------------------------------------------------------------- multi-turn

/** One scripted call: fixed caller turns; the persona's replies are generated. */
export interface Conversation {
  id: string;
  kind: string;
  turns: string[];
  /** Caller facts, given as a memory-recall note at the start of the call. */
  context?: unknown[];
  /** The caller's local hour (0-23) the call is placed at (zoneAtLocalHour). */
  localHour?: number;
  /** Something said early in the call matters later: insight is judged here. */
  callback?: boolean;
}

/** A persona reply that gets scored: one of the last `last` caller turns of a call. */
export interface ScoredTurn {
  /** `<conversation id>#<turn index>`: the key replies are saved under. */
  key: string;
  conversation: string;
  turn: number;
  /** The caller's words this reply answers, and what they said before on the call. */
  text: string;
  earlier: string[];
  /** Judged for insight: the call has caller facts, a callback or a local time. */
  insight: boolean;
}

export function scoredTurns(convs: readonly Conversation[], last = 2): ScoredTurn[] {
  return convs.flatMap((c) =>
    c.turns.slice(-last).map((text, j) => {
      const turn = Math.max(0, c.turns.length - last) + j;
      return {
        key: `${c.id}#${turn}`,
        conversation: c.id,
        turn,
        text,
        earlier: c.turns.slice(0, turn),
        insight: Boolean(c.context?.length || c.callback || c.localHour !== undefined),
      };
    })
  );
}

/**
 * The notes a reply's reminder carried: the director's (formatNotes in
 * director-notes.ts, joined with " / ") and the deliberator's thought
 * (formatThought in deliberation.ts), for the audit trail.
 */
export function notesIn(reminder: string): { director: string[]; thought: string } {
  const director = /\[Director: ([^\]]*)\]/.exec(reminder)?.[1];
  const thought = /\[On your mind, if it fits: ([^\]]*)\]/.exec(reminder)?.[1] ?? '';
  return { director: director ? director.split(' / ') : [], thought };
}

/** The local hour (0-23) in a time zone at `now`. */
export function hourIn(zone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: zone }).format(
      now
    )
  );
}

/** Zones a call can be placed in, one per offset band, so some zone is at any hour. */
export const CALLER_ZONES = (
  'America/New_York America/Chicago America/Denver America/Los_Angeles America/Anchorage ' +
  'Pacific/Gambier Pacific/Honolulu Pacific/Auckland Pacific/Fiji Australia/Sydney ' +
  'Australia/Brisbane Asia/Tokyo Asia/Shanghai Asia/Bangkok Asia/Dhaka Asia/Karachi Asia/Dubai ' +
  'Europe/Moscow Europe/Athens Europe/Paris Europe/London Atlantic/Azores Atlantic/Cape_Verde ' +
  'America/Noronha America/Sao_Paulo America/Halifax'
).split(' ');

/**
 * A real zone where it is `hour` o'clock at `now` (else the nearest hour), so
 * a call can be placed at, say, 11 pm the caller's time on any run.
 */
export function zoneAtLocalHour(
  hour: number,
  now: Date,
  zones: readonly string[] = CALLER_ZONES
): string {
  const off = (z: string): number => {
    const d = Math.abs(hourIn(z, now) - hour);
    return Math.min(d, 24 - d);
  };
  return zones.reduce((best, z) => (off(z) < off(best) ? z : best));
}
