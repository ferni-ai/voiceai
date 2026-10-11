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

/** A call with something in it, not the keyword fallback's "User asked:" lines. */
export function isSubstantive(s: Pick<PonderSummary, 'topics' | 'keyPoints'>): boolean {
  const real = s.keyPoints.filter((k) => !/^user asked:/i.test(k.trim()));
  return s.topics.length > 0 && real.length >= 2;
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
- followUps: up to ${MAX_FOLLOW_UPS} things worth asking about next time. Be specific ("ask how the interview at Stripe went"), not generic ("ask about work"). If a summary says when something happens, set "when" to the day it is worth asking (YYYY-MM-DD, on or after the event); otherwise leave it out.
- thinkingOf: up to ${MAX_NOTES} warm, specific things you'd bring up because THEY told you about them ("your sister's move to Denver"). Take these only from the "Said" lines: Topics can include things you talked about yourself (your own stories and reading), which are not theirs. Never your own guesses about how they feel.

Rules:
- Every item cites the id of the summary it comes from in "basis". Nothing that isn't in a summary.
- Never attribute your own stories to them.
- No diagnoses, no psychological labels, nothing about why they really feel something.
- Skip anything they asked you not to bring up, and anything about a crisis.
- Plain words, the way you'd say it. Fewer items is better than weak ones; return empty lists if nothing is worth it.

Return JSON only: {"followUps":[{"text":"...","when":"YYYY-MM-DD","basis":"id"}],"thinkingOf":[{"text":"...","basis":"id"}]}

CALLS:
${calls}`;
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
  today: string
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

  const followUps: PonderFollowUp[] = [];
  for (const i of items(r.followUps)) {
    const t = text(i.text);
    const basis = grounded(i);
    if (!t || !basis) continue;
    const when = validWhen(i.when, today);
    followUps.push(when ? { text: t, when, basis } : { text: t, basis });
  }
  const thinkingOf: PonderNote[] = [];
  for (const i of items(r.thinkingOf)) {
    const t = text(i.text);
    const basis = grounded(i);
    if (t && basis) thinkingOf.push({ text: t, basis });
  }
  return {
    followUps: followUps.slice(0, MAX_FOLLOW_UPS),
    thinkingOf: thinkingOf.slice(0, MAX_NOTES),
  };
}

export type PonderLlm = (prompt: string) => Promise<string | null>;

/** The pondering for these summaries; empty when there isn't enough to go on. */
export async function ponder(
  summaries: readonly PonderSummary[],
  today: string,
  llm: PonderLlm
): Promise<Pondering> {
  const usable = summaries.filter(isSubstantive);
  if (usable.length < MIN_SUBSTANTIVE) return { followUps: [], thinkingOf: [] };
  const reply = await llm(buildPonderingPrompt(usable, today));
  return parsePondering(reply, new Set(usable.map((s) => s.id)), today);
}
