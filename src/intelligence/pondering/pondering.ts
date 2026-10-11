/**
 * Between calls, think about the person the way a friend does: what to ask
 * about next time and when ("how did the dentist go?" on Thursday), and one
 * or two things worth bringing up because they mentioned them.
 *
 * Every call already saves a summary with open threads and follow-ups, but
 * nothing reads them back between calls: the greeting only knows when they
 * last talked, and follow-ups surface mid-call at best. A nightly pass reads
 * the last few summaries and writes dated follow-ups and "thinking of you"
 * notes to bogle_users/{uid}/predictive_intelligence/pondering, for the next
 * call's opener and for outreach.
 *
 * Grounded by construction: every item must name the summary it came from,
 * and anything that doesn't is dropped. Off unless PONDERING=on.
 *
 * @module intelligence/pondering/pondering
 */
import { contentWords, isForgotten } from '../../memory/recall/session-recall.js';

export function isPonderingOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.PONDERING === 'on';
}

/** One past call, as the pondering pass sees it. */
export interface PonderSummary {
  /** The summary's id, which items must cite. */
  id: string;
  /** YYYY-MM-DD of the call. */
  date: string;
  topics: string[];
  keyPoints: string[];
  openThreads: string[];
  followUps: string[];
}

export interface PonderFollowUp {
  /** What to ask or check, in plain words. */
  text: string;
  /** YYYY-MM-DD when it is worth raising, if the summaries say. */
  when?: string;
  /** The summary it came from. */
  basis: string;
}

export interface PonderNote {
  text: string;
  basis: string;
}

export interface Pondering {
  followUps: PonderFollowUp[];
  thinkingOf: PonderNote[];
}

export const MAX_FOLLOW_UPS = 3;
export const MAX_NOTES = 2;
const MAX_TEXT = 200;
const DAY_MS = 86_400_000;
/** A follow-up date further out than this is a guess. */
const MAX_DAYS_AHEAD = 60;

/**
 * A summary line about Ferni, not the caller: "The assistant shared ...",
 * "Assistant is a proud parent", "Share more about myself (the AI)". Summaries
 * are written from the whole transcript, so Ferni's own stories land in the
 * same lists as what the caller said; a dry run credited Ferni's Silk Road
 * story to the caller this way.
 */
const FERNI_LINE = /^\s*(?:the\s+)?(?:assistant|ai|ferni|fern)\b|\b(?:myself|itself)\b|\(the ai\)/i;

export function isFerniLine(line: string): boolean {
  return FERNI_LINE.test(line);
}

/** Lines naming a topic the caller asked to forget or to avoid are left out. */
function keep(lines: readonly string[], avoid: readonly string[]): string[] {
  return lines.filter((l) => !isFerniLine(l) && !isForgotten(l, avoid));
}

/** The summary with Ferni's own lines, and anything about an avoided topic, removed. */
export function callerOnly(s: PonderSummary, avoid: readonly string[] = []): PonderSummary {
  return {
    ...s,
    topics: s.topics.filter((t) => !isForgotten(t, avoid)),
    keyPoints: keep(s.keyPoints, avoid),
    openThreads: keep(s.openThreads, avoid),
    followUps: keep(s.followUps, avoid),
  };
}

/**
 * Ferni as the subject ("What did Jack think of me", "when I called your
 * mom", "how we're both the third of seven"): about Ferni, or an event
 * Ferni can't know happened.
 */
const FIRST_PERSON = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|we|we're|we've|us|our|ours)\b/i;

/** Words too common to show an item came from a line. */
const GENERIC = new Set(['doing', 'still', 'next', 'time', 'thing', 'things', 'lately']);

/** True when the item shares a real word with one of these lines. */
export function drawnFrom(item: string, lines: readonly string[]): boolean {
  const have = new Set(lines.flatMap((l) => [...contentWords(l)]));
  return [...contentWords(item)].some((w) => !GENERIC.has(w) && have.has(w));
}

/** A call with something in it, not the keyword fallback's "User asked:" lines. */
export function isSubstantive(s: Pick<PonderSummary, 'topics' | 'keyPoints'>): boolean {
  const real = s.keyPoints.filter((k) => !/^user asked:/i.test(k.trim()));
  return s.topics.length > 0 && real.length >= 2;
}

/** Calls older than this are not a friend's fresh afterthought. */
export const MAX_CALL_AGE_DAYS = 30;

function isRecent(date: string, today: string): boolean {
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
  return age >= 0 && age <= MAX_CALL_AGE_DAYS;
}

/** Below this the pass has nothing honest to say. */
export const MIN_SUBSTANTIVE = 2;

export function buildPonderingPrompt(summaries: readonly PonderSummary[], today: string): string {
  const calls = summaries
    .map(
      (s) =>
        `[${s.id}] ${s.date}\n- Topics: ${s.topics.join('; ') || 'none'}\n- Said: ${s.keyPoints.join('; ') || 'none'}\n- Open: ${s.openThreads.join('; ') || 'none'}\n- Follow up: ${s.followUps.join('; ') || 'none'}`
    )
    .join('\n\n');
  return `You are Ferni, thinking about a friend between phone calls. Today is ${today}. Below are short summaries of your recent calls with them, newest first, each with an id in brackets.

Write down, as a friend would:
- followUps: up to ${MAX_FOLLOW_UPS} things worth asking about next time, each written as the question itself, said straight to them ("How did the Stripe interview go?"), never "Ask how..." and never "they". Be specific, not generic ("How's work?"). Only what a close friend would ask about: a plan, an event, a worry, a person. Never routine daily life (sleep, meals, chores, a run, the weather). If a summary says when something happens, set "when" to the day it is worth asking (YYYY-MM-DD, on or after the event); otherwise leave it out. Never ask how something went unless you know it has happened by "when": an event with no date gets a question about it coming up ("Is the all-hands still on for next month?"), or nothing.
- thinkingOf: up to ${MAX_NOTES} warm, specific things you'd bring up because THEY told you about them ("your sister's move to Denver"). Take these only from the "Said" lines: Topics can include things you talked about yourself (your own stories and reading), which are not theirs. Never your own guesses about how they feel.

Rules:
- Every item cites the id of the summary it comes from in "basis". Nothing that isn't in a summary.
- Never attribute your own stories to them.
- Talk to them as "you". The summaries may call them by name; never refer to them in the third person.
- A loss, setback or disappointment is never a thinkingOf note; it is a gentle follow-up or nothing.
- No diagnoses, no psychological labels, nothing about why they really feel something.
- Skip anything they asked you not to bring up, and anything about a crisis.
- Plain words, the way you'd say it. Fewer items is better than weak ones; return empty lists if nothing is worth it.

Return JSON only: {"followUps":[{"text":"...","when":"YYYY-MM-DD","basis":"id"}],"thinkingOf":[{"text":"...","basis":"id"}]}

CALLS:
${calls}`;
}

/** "Ask how..." / "Check if..." is a note to self, not something you'd say to a friend. */
const NOTE_TO_SELF = /^(?:ask|check|see if|find out|inquire|follow up|remind)\b/i;
/** Routine daily life a friend wouldn't make a point of asking about. */
const ROUTINE = /\b(?:sleep|slept|bed early|go to bed|get to bed|laundry|the weather)\b/i;
/** "How did X go?": only once X has happened, which takes a date. */
const HOW_DID_IT_GO = /\bhow (?:did|was)\b.*\b(?:go|went)\b|^how was\b/i;

/** The follow-up a friend would actually say, or false for a note-to-self, trivia or a premature "how did it go". */
export function friendWorthy(f: { text: string; when?: string }): boolean {
  if (NOTE_TO_SELF.test(f.text) || ROUTINE.test(f.text)) return false;
  return !HOW_DID_IT_GO.test(f.text) || f.when !== undefined;
}

function text(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_TEXT) : undefined;
}

/** A real day from today to MAX_DAYS_AHEAD out, or undefined. */
export function validWhen(x: unknown, today: string): string | undefined {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return undefined;
  const d = new Date(`${x}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x) return undefined;
  const ahead = (d.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY_MS;
  return ahead >= 0 && ahead <= MAX_DAYS_AHEAD ? x : undefined;
}

/** The pass's items, keeping only those that cite a summary it was given. */
export function parsePondering(
  reply: string | null | undefined,
  knownIds: ReadonlySet<string>,
  today: string,
  calls?: ReadonlyMap<string, PonderSummary>
): Pondering {
  const empty: Pondering = { followUps: [], thinkingOf: [] };
  const json = reply?.match(/\{[\s\S]*\}/);
  if (!json) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(json[0]);
  } catch {
    return empty;
  }
  const r = raw as { followUps?: unknown; thinkingOf?: unknown };
  const items = (x: unknown): Array<Record<string, unknown>> =>
    Array.isArray(x)
      ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      : [];
  const grounded = (i: Record<string, unknown>): string | undefined =>
    typeof i.basis === 'string' && knownIds.has(i.basis) ? i.basis : undefined;
  // With the calls given, every item must come from what the caller said in
  // the call it cites, and be about them, not Ferni.
  const said = (t: string, basis: string): boolean => {
    if (!calls) return true;
    const c = calls.get(basis);
    return c !== undefined && !FIRST_PERSON.test(t) && drawnFrom(t, c.keyPoints);
  };
  const followUps: PonderFollowUp[] = [];
  for (const i of items(r.followUps)) {
    const t = text(i.text);
    const basis = grounded(i);
    if (!t || !basis || !said(t, basis)) continue;
    const when = validWhen(i.when, today);
    const item = when ? { text: t, when, basis } : { text: t, basis };
    if (friendWorthy(item)) followUps.push(item);
  }
  const thinkingOf: PonderNote[] = [];
  for (const i of items(r.thinkingOf)) {
    const t = text(i.text);
    const basis = grounded(i);
    if (t && basis && said(t, basis)) thinkingOf.push({ text: t, basis });
  }
  const kept = followUps.slice(0, MAX_FOLLOW_UPS);
  // A friend asks about a thing or mentions it, not both: a note drawn from the
  // same call as a follow-up is the same thought said twice.
  const asked = new Set(kept.map((f) => f.basis));
  return {
    followUps: kept,
    thinkingOf: thinkingOf.filter((n) => !asked.has(n.basis)).slice(0, MAX_NOTES),
  };
}

export type PonderLlm = (prompt: string) => Promise<string | null>;

/**
 * The pondering for these summaries; empty when there isn't enough to go on.
 * Only calls from the last MAX_CALL_AGE_DAYS, and only the caller's own
 * lines from them, reach the model, minus any topic in `avoid` (asked to
 * forget, or to stay away from). Every item must share a word with what the
 * caller said in the call it cites, and never make Ferni its subject.
 */
export async function ponder(
  summaries: readonly PonderSummary[],
  today: string,
  llm: PonderLlm,
  avoid: readonly string[] = []
): Promise<Pondering> {
  const usable = summaries
    .filter((s) => isRecent(s.date, today))
    .map((s) => callerOnly(s, avoid))
    .filter(isSubstantive);
  if (usable.length < MIN_SUBSTANTIVE) return { followUps: [], thinkingOf: [] };
  const reply = await llm(buildPonderingPrompt(usable, today));
  const calls = new Map(usable.map((s) => [s.id, s]));
  return parsePondering(reply, new Set(calls.keys()), today, calls);
}
