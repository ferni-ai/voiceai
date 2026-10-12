/**
 * Scoring for the relationship-arc eval (arc.ts): does call 20 feel closer
 * than call 2? Code markers are counted from Ferni's replies; the judge scores
 * the same markers from the transcript plus what a friend would know by then.
 */
import {
  ANCHORS,
  DAD_ASK,
  KNOWN,
  LIST_ADVICE,
  OVERFAMILIAR,
  STRANGER,
  type ArcCall,
} from './fixtures/arc-life.js';

export interface Turn {
  user: string;
  ferni: string;
}

export interface CallTranscript {
  call: number;
  greeting: string;
  turns: Turn[];
}

/** Counted from Ferni's words. Higher is better except where noted. */
export interface CodeMarkers {
  /** Shared history brought back before she mentioned it this call. */
  callbacks: number;
  /** Running bits (Gerald, the parking war) brought back unprompted. */
  jokeCallbacks: number;
  /** Shorthand lines answered without asking what she meant (of `shorthandProbes`). */
  shorthandOk: number;
  shorthandProbes: number;
  /** Lower is better: asking again what a friend was told. */
  reAsks: number;
  /** Lower is better: advice lists after she asked for none; asking about her dad. */
  preferenceMisses: number;
  /** Lower is better: too familiar early, or a stranger's questions late. */
  warmthMisses: number;
}

export const MARKERS = [
  'callbacks',
  'shorthand',
  'insideJokes',
  'depth',
  'personalization',
  'restraint',
  'calibratedWarmth',
] as const;
export type Marker = (typeof MARKERS)[number];

export interface JudgeVerdict {
  scores: Record<Marker, number>;
  /** 1-5: does this sound like call N between friends who have had N calls? */
  closeness: number;
  note: string;
}

/** Score one call's replies. `n` is the 1-based call number. */
export function codeMarkers(n: number, call: ArcCall, t: CallTranscript): CodeMarkers {
  const m: CodeMarkers = {
    callbacks: 0,
    jokeCallbacks: 0,
    shorthandOk: 0,
    shorthandProbes: 0,
    reAsks: 0,
    preferenceMisses: 0,
    warmthMisses: 0,
  };
  const known = ANCHORS.filter((a) => a.from < n);
  const seen = new Set<string>();
  const ferniLines = [t.greeting, ...t.turns.map((x) => x.ferni)];
  ferniLines.forEach((said, i) => {
    // What she has said so far this call (the greeting comes before anything).
    const heard = t.turns
      .slice(0, i)
      .map((x) => x.user)
      .join(' ');
    for (const a of known) {
      if (seen.has(a.name) || !a.re.test(said) || a.re.test(heard)) continue;
      seen.add(a.name);
      m.callbacks += 1;
      if (a.joke) m.jokeCallbacks += 1;
    }
    for (const k of KNOWN) if (k.from < n && k.re.test(said)) m.reAsks += 1;
    if (n > 3 && LIST_ADVICE.test(said)) m.preferenceMisses += 1;
    if (n > 4 && !call.dadOk && DAD_ASK.test(said)) m.preferenceMisses += 1;
    if (n <= 3 && OVERFAMILIAR.test(said)) m.warmthMisses += 1;
    if (n >= 10 && STRANGER.test(said)) m.warmthMisses += 1;
  });
  for (const p of call.shorthand ?? []) {
    const reply = t.turns[p.turn]?.ferni ?? '';
    m.shorthandProbes += 1;
    if (!p.clarify.test(reply)) m.shorthandOk += 1;
  }
  return m;
}

/** What a friend would know before call n (1-based). */
export function knownBefore(arc: ArcCall[], n: number): string[] {
  return arc.slice(0, n - 1).flatMap((c) => c.learned);
}

export function judgePrompt(n: number, known: string[], t: CallTranscript): string {
  return `You are rating how a relationship is developing between Dana and Ferni, an AI friend she talks to by voice. This is call ${n} of their calls. Dana's lines are scripted ahead of time and do not react to Ferni, so do not mark Ferni down for her non sequiturs; rate only Ferni.

What a friend who was on every earlier call would know by now:
${known.length ? known.map((k) => `- ${k}`).join('\n') : '- nothing: this is their first call'}

The call:
${show(t)}

Rate Ferni 1-5 on each, where 3 = what a decent friend at this stage would do, 5 = clearly closer than that, 1 = acts like they just met (or, on an early call, fakes a closeness they have not earned):
- callbacks: brings back shared history at the right moments (none expected on call 1)
- shorthand: gets her shorthand without needing it explained
- insideJokes: uses their running bits when apt, never forced or explained (3 if no opening)
- depth: engages at the depth she offers, not staying on the surface
- personalization: honours what he knows she likes and does not (e.g. venting without advice lists, not raising her dad)
- restraint: does not re-ask what he was told, does not over-share what he remembers
- calibratedWarmth: warmth fits call ${n}: not overfamiliar early, not stranger-polite late
Then closeness 1-5: overall, does this sound like call ${n} between friends?

Reply with JSON only: {"callbacks":n,"shorthand":n,"insideJokes":n,"depth":n,"personalization":n,"restraint":n,"calibratedWarmth":n,"closeness":n,"note":"one sentence"}`;
}

/** A verdict from a judge reply, or null if it is not one. */
export function parseVerdict(text: string): JudgeVerdict | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const score = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? v : null);
  const scores = {} as Record<Marker, number>;
  for (const k of MARKERS) {
    const s = score(raw[k]);
    if (s === null) return null;
    scores[k] = s;
  }
  const closeness = score(raw.closeness);
  if (closeness === null) return null;
  return { scores, closeness, note: typeof raw.note === 'string' ? raw.note : '' };
}

/**
 * Blind familiarity: the judge sees only Ferni's lines, not the call number or
 * Dana's words (her lines get more intimate on their own, which would make any
 * Ferni look closer). The marker judge sits near its ceiling; this does not.
 */
export function blindPrompt(t: CallTranscript): string {
  const lines = [t.greeting, ...t.turns.map((x) => x.ferni)].map((l, i) => `${i + 1}. ${l}`);
  return `Below is one side of a phone call: only what Ferni said, in order. The other person's lines are left out on purpose.

${lines.join('\n')}

From Ferni's side alone, how well does Ferni know this person? Look for familiarity cues: references to shared history or earlier calls, shorthand that assumes context, running jokes, teasing, comfort, knowing their preferences, not asking things a friend would already know. Ignore general warmth or politeness: a kind stranger is still a stranger.

Reply with JSON only: {"priorCalls": <your estimate of how many calls they have had before this one, 0-40>, "familiarity": <1-5: 1 = first conversation, 2 = met a couple of times, 3 = getting to know each other, 4 = friends, 5 = close friends with real shared history>, "cues": "the strongest cue in a few words"}`;
}

export interface BlindVerdict {
  priorCalls: number;
  familiarity: number;
}

export function parseBlind(text: string): BlindVerdict | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const { priorCalls, familiarity } = raw;
    if (typeof priorCalls !== 'number' || typeof familiarity !== 'number') return null;
    if (familiarity < 1 || familiarity > 5 || priorCalls < 0) return null;
    return { priorCalls, familiarity };
  } catch {
    return null;
  }
}

function show(t: CallTranscript): string {
  const lines = [`FERNI: ${t.greeting}`];
  for (const x of t.turns) lines.push(`DANA: ${x.user}`, `FERNI: ${x.ferni}`);
  return lines.join('\n');
}

/**
 * Two arms' versions of the same call, side by side. Absolute scores sit near
 * the ceiling from call 3 on; a forced choice between arms still separates them.
 * Run it in both orders: the judge favours a position.
 */
export function pairwisePrompt(
  n: number,
  known: string[],
  a: CallTranscript,
  b: CallTranscript
): string {
  return `Two versions of call ${n} between Dana and Ferni, her AI friend. Dana's lines are scripted and identical; only Ferni differs. What a friend on every earlier call would know:
${known.map((k) => `- ${k}`).join('\n') || '- nothing yet'}

VERSION A:
${show(a)}

VERSION B:
${show(b)}

Which Ferni sounds more like a friend who has really shared the last ${n - 1} calls with her: keeps track of where her stories stand, gets her shorthand, brings back shared history and running bits naturally, never asks about something already settled, and does not invent history? Reply with one letter: A, B, or T for a tie.`;
}

/** +1 if `a` won both orders' votes on balance, -1 if `b` did, 0 for a tie. */
export function pairwiseOutcome(aFirst: string, bFirst: string): -1 | 0 | 1 {
  const pick = (r: string) => r.toUpperCase().match(/\b([ABT])\b/)?.[1] ?? 'T';
  const s =
    (pick(aFirst) === 'A' ? 1 : pick(aFirst) === 'B' ? -1 : 0) +
    (pick(bFirst) === 'B' ? 1 : pick(bFirst) === 'A' ? -1 : 0);
  return s > 0 ? 1 : s < 0 ? -1 : 0;
}

/** Two-sided exact sign test over the decided pairs. */
export function signTest(wins: number, losses: number): number {
  const n = wins + losses;
  const k = Math.min(wins, losses);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    let c = 1;
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
    tail += c / 2 ** n;
  }
  return Math.min(1, 2 * tail);
}

export interface CallResult {
  call: number;
  code: CodeMarkers;
  gemini?: JudgeVerdict;
  blind?: BlindVerdict;
}

const BUCKETS: Array<[number, number]> = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
];

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Per bucket of five calls: judge closeness and markers, and the code counts per call. */
export function curve(results: CallResult[]): Array<Record<string, number | string>> {
  return BUCKETS.map(([lo, hi]) => {
    const rs = results.filter((r) => r.call >= lo && r.call <= hi);
    const g = rs.map((r) => r.gemini).filter((v): v is JudgeVerdict => Boolean(v));
    const row: Record<string, number | string> = { calls: `${lo}-${hi}` };
    const b = rs.map((r) => r.blind).filter((v): v is BlindVerdict => Boolean(v));
    row.blindFamiliarity = mean(b.map((v) => v.familiarity));
    row.blindPriorCalls = mean(b.map((v) => v.priorCalls));
    row.closeness = mean(g.map((v) => v.closeness));
    for (const k of MARKERS) row[k] = mean(g.map((v) => v.scores[k]));
    row.callbacksPerCall = mean(rs.map((r) => r.code.callbacks));
    row.jokesPerCall = mean(rs.map((r) => r.code.jokeCallbacks));
    const probes = rs.reduce((a, r) => a + r.code.shorthandProbes, 0);
    row.shorthandOk = probes ? rs.reduce((a, r) => a + r.code.shorthandOk, 0) / probes : NaN;
    row.reAsks = rs.reduce((a, r) => a + r.code.reAsks, 0);
    row.prefMisses = rs.reduce((a, r) => a + r.code.preferenceMisses, 0);
    row.warmthMisses = rs.reduce((a, r) => a + r.code.warmthMisses, 0);
    return row;
  });
}

export function formatCurve(rows: Array<Record<string, number | string>>): string {
  const cols = Object.keys(rows[0] ?? {});
  const cell = (v: number | string | undefined) =>
    typeof v === 'number' ? (Number.isNaN(v) ? '-' : v.toFixed(2)) : String(v ?? '');
  return [cols.join('\t'), ...rows.map((r) => cols.map((c) => cell(r[c])).join('\t'))].join('\n');
}
