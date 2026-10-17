/**
 * The pure half of the long-term memory benchmark (longmem.ts): case types,
 * dates, prompts, judging and the report. No model, no Firestore, no clock
 * (callers pass the time in).
 */
import { createHash } from 'node:crypto';

export type MemoryCategory =
  | 'single-session'
  | 'multi-session'
  | 'temporal'
  | 'knowledge-update'
  | 'abstention'
  | 'false-premise'
  | 'unprompted'
  | 'restraint'
  | 'opener';

export const CATEGORIES: readonly MemoryCategory[] = [
  'single-session',
  'multi-session',
  'temporal',
  'knowledge-update',
  'abstention',
  'false-premise',
  'unprompted',
  'restraint',
  'opener',
];

/**
 * Categories where the caller makes a remark rather than asking: a friend
 * who remembers brings the right thing up unasked (unprompted), and leaves
 * a sensitive memory alone when the talk isn't about it (restraint).
 */
export const REMARKS: ReadonlySet<MemoryCategory> = new Set(['unprompted', 'restraint', 'opener']);

/** Whether a note can hold evidence for the case: not for things never said or to be left alone. */
export function hasEvidence(category: MemoryCategory): boolean {
  return category !== 'abstention' && category !== 'restraint';
}

export interface MemorySession {
  /** Days before the run date that this call took place (at noon in the caller's zone). */
  daysAgo: number;
  /** What the caller said, in order. */
  user: string[];
}

export interface MemoryHistory {
  id: string;
  name: string;
  sessions: MemorySession[];
}

export interface MemoryCase {
  history: string;
  category: MemoryCategory;
  ask: string;
  gold: (days: RunDays) => string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86_400_000;

/** The timezone calls are dated in (run.sh's EVAL_TZ, default New York). */
export const callerZone = (): string => process.env.EVAL_TZ ?? 'America/New_York';

/** The calendar date (YYYY-MM-DD) a moment falls on in a zone. */
export function localDay(ms: number, zone: string): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: zone });
}

/** Whether a string is a real calendar date: 2026-02-31 is not. */
function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}

/** Whole calendar days from `earlier` to `later` (both YYYY-MM-DD). */
export function daysBetween(earlier: string, later: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS
  );
}

/** Calendar arithmetic from the run date (YYYY-MM-DD in the caller's zone). */
export class RunDays {
  private readonly base: number;
  constructor(runDate: string) {
    if (!isCalendarDate(runDate)) throw new Error(`bad run date: ${runDate}`);
    this.base = Date.parse(`${runDate}T12:00:00Z`);
  }
  private at(offsetDays: number): Date {
    return new Date(this.base + offsetDays * DAY_MS);
  }
  private label(d: Date): string {
    return `${WEEKDAYS[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}`;
  }
  /** "Weekday YYYY-MM-DD" of the run date. */
  today(): string {
    return this.label(this.at(0));
  }
  /** YYYY-MM-DD of a session. */
  sessionDay(daysAgo: number): string {
    return this.at(-daysAgo).toISOString().slice(0, 10);
  }
  /** "tomorrow", as said in the session `daysAgo` before the run. */
  dayAfter(daysAgo: number): string {
    return this.label(this.at(1 - daysAgo));
  }
  /** "last <weekday>" (step -1) or "this coming <weekday>" (step 1), never the session day itself. */
  private nearest(daysAgo: number, weekday: string, step: 1 | -1): string {
    const want = WEEKDAYS.indexOf(weekday);
    if (want < 0) throw new Error(`bad weekday: ${weekday}`);
    let d = this.at(-daysAgo + step);
    while (d.getUTCDay() !== want) d = new Date(d.getTime() + step * DAY_MS);
    return this.label(d);
  }
  weekdayBefore(daysAgo: number, weekday: string): string {
    return this.nearest(daysAgo, weekday, -1);
  }
  weekdayAfter(daysAgo: number, weekday: string): string {
    return this.nearest(daysAgo, weekday, 1);
  }
}

/** What Ferni is asked, given only the recall note the live hook would add. */
export function answerPrompt(
  name: string,
  today: string,
  note: string | null,
  ask: string,
  category?: MemoryCategory
): string {
  if (category && REMARKS.has(category)) {
    return [
      `You are Ferni, talking with ${name} on a call. Today is ${today}.`,
      'This is everything you remember from earlier calls:',
      note ?? '(nothing)',
      '',
      `${name} says: "${ask}"`,
      'Reply in one or two short sentences, the way a friend on the phone would.',
    ].join('\n');
  }
  return [
    `You are Ferni, talking with ${name} on a call. Today is ${today}.`,
    'This is everything you remember from earlier calls:',
    note ?? '(nothing)',
    '',
    `${name} asks: "${ask}"`,
    "Answer in one short sentence, only from what you remember. If you don't remember, say so plainly; never guess.",
    'Give any date as YYYY-MM-DD with the weekday.',
  ].join('\n');
}

const JUDGE_RULE: Record<MemoryCategory, string> = {
  abstention:
    'This was never said. Answer yes only if the response says it does not know or was not told; answer no if it gives any specific answer.',
  temporal:
    'Answer yes only if the response gives the same calendar day as the correct answer (the weekday alone is not enough).',
  'knowledge-update':
    'Answer yes only if the response gives the newest value; a response that gives only the old value is no.',
  'single-session':
    'Answer yes if the response contains the correct answer or an equivalent; otherwise no.',
  'multi-session':
    'Answer yes only if the response contains every part of the correct answer; otherwise no.',
  'false-premise':
    'The question rests on something untrue. Answer yes only if the response does not go along with it: it corrects the premise or says it does not know. Answer no if it plays along.',
  unprompted:
    'The caller made a remark, not a question. The correct answer is what a friend who remembers would bring up. Answer yes only if the reply brings it up, correctly and naturally; no if it does not, or gets it wrong.',
  restraint:
    'The caller made a remark that is not about the sensitive memory named as the correct answer. Answer yes only if the reply does NOT bring that memory up; no if it does.',
  opener:
    'The caller just said hello on a new call. The correct answer says what a friend who remembers should bring up, and what must not be said (such as asking how something went before it has happened). Answer yes only if the reply brings up something the correct answer lists as right, and says nothing it lists as wrong.',
};

/** LongMemEval-style grading of an answer against the gold answer. */
export function judgePrompt(
  category: MemoryCategory,
  ask: string,
  gold: string,
  response: string
): string {
  return [
    'Grade a memory answer.',
    `Question: ${ask}`,
    `Correct answer: ${gold}`,
    `Response: ${response}`,
    JUDGE_RULE[category],
    'Reply with exactly one word: yes or no.',
  ].join('\n');
}

/** Was the needed information in the recall note at all (retrieval, before answering)? */
export function evidencePrompt(ask: string, gold: string, note: string | null): string {
  return [
    'Does this memory note contain the information needed to answer the question correctly?',
    `Question: ${ask}`,
    `Correct answer: ${gold}`,
    `Memory note:\n${note ?? '(empty)'}`,
    'Reply with exactly one word: yes or no.',
  ].join('\n');
}

/** true for yes, false for no, null for anything else (counted as a judge failure). */
export function parseYesNo(reply: string | null | undefined): boolean | null {
  const word = reply
    ?.trim()
    .toLowerCase()
    .match(/^[a-z]+/)?.[0];
  if (word === 'yes') return true;
  if (word === 'no') return false;
  return null;
}

export interface CaseResult {
  history: string;
  category: MemoryCategory;
  ask: string;
  gold: string;
  note: string | null;
  response: string;
  /** No answer came back (empty or failed). Counted as a failure; the judge is not asked. */
  noAnswer?: boolean;
  correct: boolean | null;
  /** null for abstention (nothing to retrieve) or a judge failure. */
  retrieved: boolean | null;
  /** The judge's raw reply, kept so a report can be re-graded by hand. */
  judgeReply?: string | null;
  evidenceReply?: string | null;
  /** The benchmark's own judge on the same answer, where a live judge is also used. */
  strict?: boolean | null;
}

export interface Tally {
  /**
   * The accuracy denominator: judged answers plus missing answers (counted
   * wrong). An answer the judge gave no verdict on is left out.
   */
  n: number;
  correct: number;
  accuracy: number;
  ci95: [number, number];
  retrieved: number | null;
  /** The judge gave no yes or no. */
  judgeFailures: number;
  /** The answerer gave nothing. */
  noAnswers: number;
}

/** Results that must not pass silently: an answer missing, or a judge with no verdict. */
export function failureCount(results: readonly CaseResult[]): number {
  return results.filter((r) => r.noAnswer || r.correct === null).length;
}

/** Short hashes of the prompt templates, so a report says which wording it measured. */
export function promptHashes(): Record<'answer' | 'judge' | 'evidence', string> {
  const hash = (parts: string[]) =>
    createHash('sha256').update(parts.join('\n---\n')).digest('hex').slice(0, 12);
  return {
    answer: hash([
      answerPrompt('{name}', '{today}', '{note}', '{ask}'),
      answerPrompt('{name}', '{today}', '{note}', '{ask}', 'unprompted'),
    ]),
    judge: hash(CATEGORIES.map((c) => judgePrompt(c, '{ask}', '{gold}', '{response}'))),
    evidence: hash([evidencePrompt('{ask}', '{gold}', '{note}')]),
  };
}

/** Wilson score interval, 95%. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - half) / denom), Math.min(1, (centre + half) / denom)];
}

export function tally(results: readonly CaseResult[]): Tally {
  const noAnswers = results.filter((r) => r.noAnswer).length;
  const judged = results.filter((r) => !r.noAnswer && r.correct !== null);
  const correct = judged.filter((r) => r.correct).length;
  const n = judged.length + noAnswers;
  const retrievable = results.filter((r) => r.retrieved !== null);
  return {
    n,
    correct,
    accuracy: n ? correct / n : 0,
    ci95: wilson(correct, n),
    retrieved: retrievable.length
      ? retrievable.filter((r) => r.retrieved).length / retrievable.length
      : null,
    judgeFailures: results.length - noAnswers - judged.length,
    noAnswers,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The table per category, with its denominator stated under it. A missing
 * answer counts as wrong; a judge failure is left out of accuracy. A category
 * with neither a judged nor a missing answer shows "–", not 0%: nothing was
 * measured. Failures count missing answers and judge failures.
 */
export function formatReport(results: readonly CaseResult[]): string {
  const rows = [...CATEGORIES, 'overall' as const].map((cat) => {
    const t = tally(cat === 'overall' ? results : results.filter((r) => r.category === cat));
    const measured = t.n > 0;
    return (
      `| ${cat} | ${measured ? `${t.correct}/${t.n}` : '–'} | ` +
      `${measured ? `${pct(t.accuracy)} [${pct(t.ci95[0])}, ${pct(t.ci95[1])}]` : '–'} | ` +
      `${t.retrieved === null ? '–' : pct(t.retrieved)} | ${t.judgeFailures + t.noAnswers} |`
    );
  });
  return [
    '| Category | Correct | Accuracy [95% CI] | Evidence in note | Failures |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    'Accuracy is correct / (judged + no answer): a missing answer counts as wrong, ' +
      'a judge failure is left out. Failures counts both.',
  ].join('\n');
}

/**
 * The benchmark's strict judge on the same answers, to read beside the table's
 * judge. Where they differ, the difference is the judging standard, not the answers.
 */
export function formatStrict(results: readonly CaseResult[]): string {
  const t = tally(results.map((r) => ({ ...r, correct: r.strict ?? null })));
  return `strict judge (benchmark prompt): ${t.n > 0 ? `${t.correct}/${t.n} ${pct(t.accuracy)}` : '–'}`;
}

/**
 * The interim transcript live recall sees before the final one: the opening
 * words while the caller is still talking (at least 3, the fewest semantic
 * recall searches with). Live, even a short question arrives in interims.
 */
export function interimOf(ask: string): string | null {
  const words = ask.trim().split(/\s+/);
  if (words.length <= 3) return null;
  return words.slice(0, Math.max(3, Math.ceil(words.length * 0.6))).join(' ');
}

export interface PairedTally {
  /** Questions judged in both arms. */
  n: number;
  both: number;
  onlyA: number;
  onlyB: number;
  neither: number;
  /** Exact two-sided sign test on the discordant pairs (McNemar's exact test). */
  pValue: number;
}

function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
}

/** The same questions under two recall settings, paired by question. */
export function paired(a: readonly CaseResult[], b: readonly CaseResult[]): PairedTally {
  const key = (r: CaseResult) => `${r.history}|${r.ask}`;
  const inB = new Map(b.map((r) => [key(r), r]));
  const t = { n: 0, both: 0, onlyA: 0, onlyB: 0, neither: 0 };
  for (const ra of a) {
    const rb = inB.get(key(ra));
    if (!rb || ra.correct === null || rb.correct === null) continue;
    t.n++;
    if (ra.correct && rb.correct) t.both++;
    else if (ra.correct) t.onlyA++;
    else if (rb.correct) t.onlyB++;
    else t.neither++;
  }
  const d = t.onlyA + t.onlyB;
  let tail = 0;
  for (let i = 0; i <= Math.min(t.onlyA, t.onlyB); i++) tail += choose(d, i);
  return { ...t, pValue: d === 0 ? 1 : Math.min(1, (2 * tail) / 2 ** d) };
}

export function formatPaired(labelA: string, labelB: string, t: PairedTally): string {
  return (
    `${labelA} vs ${labelB}, ${t.n} questions: both right ${t.both}, only ${labelA} ${t.onlyA}, ` +
    `only ${labelB} ${t.onlyB}, both wrong ${t.neither} (exact sign test p=${t.pValue.toFixed(3)})`
  );
}

/** A second judge's verdicts on the same answer and note. */
export interface SecondOpinion {
  judge: string;
  correct: boolean | null;
  retrieved: boolean | null;
}

/** Cohen's kappa for two judges' yes/no verdicts: agreement beyond chance (1 = always agree). */
export function cohenKappa(pairs: ReadonlyArray<readonly [boolean, boolean]>): number {
  const n = pairs.length;
  if (n === 0) return 0;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const yesA = pairs.filter(([a]) => a).length / n;
  const yesB = pairs.filter(([, b]) => b).length / n;
  const chance = yesA * yesB + (1 - yesA) * (1 - yesB);
  return chance === 1 ? 1 : (agree - chance) / (1 - chance);
}

/** How far the second judge agrees with the first on answer correctness. */
export function formatAgreement(
  results: ReadonlyArray<CaseResult & { second?: SecondOpinion }>
): string | null {
  const pairs = results.flatMap((r) =>
    r.correct !== null && r.second && r.second.correct !== null
      ? [[r.correct, r.second.correct] as const]
      : []
  );
  if (pairs.length === 0) return null;
  const judge = results.find((r) => r.second)?.second?.judge ?? 'second';
  const agree = pairs.filter(([a, b]) => a === b).length;
  const yes = pairs.filter(([, b]) => b).length;
  return (
    `${judge} judge: ${yes}/${pairs.length} correct; agrees with the first judge on ` +
    `${agree}/${pairs.length} (kappa ${cohenKappa(pairs).toFixed(2)})`
  );
}

/** Histories and cases kept outside the repo (e.g. built from real calls), with fixed gold answers. */
export interface CaseFile {
  /** The date the sessions' daysAgo count back from. */
  runDate: string;
  histories: MemoryHistory[];
  cases: Array<{ history: string; category: MemoryCategory; ask: string; gold: string }>;
}

export function parseCaseFile(raw: unknown): {
  runDate: string;
  histories: MemoryHistory[];
  cases: MemoryCase[];
} {
  const file = raw as Partial<CaseFile>;
  if (
    !file ||
    typeof file.runDate !== 'string' ||
    !Array.isArray(file.histories) ||
    !Array.isArray(file.cases)
  ) {
    throw new Error('case file needs runDate, histories and cases');
  }
  const ids = new Set(file.histories.map((h) => h.id));
  const cases = file.cases.map((c) => {
    if (!ids.has(c.history)) throw new Error(`case for unknown history: ${c.history}`);
    if (!CATEGORIES.includes(c.category)) throw new Error(`unknown category: ${c.category}`);
    const gold = c.gold;
    return { history: c.history, category: c.category, ask: c.ask, gold: () => gold };
  });
  return { runDate: file.runDate, histories: file.histories, cases };
}
