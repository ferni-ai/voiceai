/**
 * What a call knows of the caller's world right now (WORLD_FACTS_IN_CALL=on).
 *
 * After each call the temporal store learns that the new job started Monday
 * and the old one is over (ingest.ts), but nothing read it back: Ferni went on
 * asking about the old job. This picks the few open facts that matter on a
 * turn and renders them dated and labelled ("(you said on Oct 9) ..."):
 * - an event dated within the next UPCOMING_DAYS, or past by at most
 *   PAST_EVENT_DAYS (no outcome on file: ask, don't assume);
 * - the current value of everything else, latest change first; never a
 *   fact that names an old state a newer fact replaced (the Acme manager after
 *   the move to Beta), never an event with no date.
 * A value a fact replaced is shown only as "no longer" and only when the
 * caller's words just named it. Nothing here is invented: every line is one
 * stored fact the caller told Ferni. Forgotten topics (forget.ts) and what
 * they asked not to be brought up ("avoid:" threads) never show. Pure: the
 * clock, timezone and words are inputs.
 *
 * @module intelligence/world-model/temporal/in-call
 */

import { forgetTokens, isForgotten, worldFactText } from '../../../memory/index.js';
import { AVOID_THREAD, avoidedTopics, type TemporalFact } from './types.js';

/** True when WORLD_FACTS_IN_CALL=on. Off by default. */
export function isWorldFactsInCallOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.WORLD_FACTS_IN_CALL?.trim().toLowerCase() === 'on';
}

export const UPCOMING_DAYS = 10;
export const PAST_EVENT_DAYS = 7;
/** Below this the extractor was guessing; a guess is never stated. */
export const MIN_CONFIDENCE = 0.6;
export const MAX_LINES = 6;
/** Tokens for the whole block, rule included (chars/4, the repo's estimate). */
export const BUDGET_TOKENS = 250;

export const WORLD_FACTS_RULE =
  "Their life as of when they last told you. What's current is current: never ask about what's over as if it still were. Bring one up only if it fits; once a date has passed, ask how it went instead of assuming. Never bring up health, money or relationships unless they do.";

export interface InCallOptions {
  now: number;
  /** The caller's IANA timezone; UTC when unknown. */
  timeZone?: string;
  /** Topics they asked Ferni to forget (forget.ts forgottenTopics). */
  forgotten?: readonly string[];
  /** The caller's words this turn. */
  words?: string;
  userName?: string;
}

const DAY_MS = 86_400_000;
/** Words that name a slot, not a value: "work" alone doesn't name the old job. */
const GENERIC = new Set(
  'work job live lived home house place school started start moved move new old'.split(' ')
);

function zone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC'; // not an IANA zone
  }
}

/** YYYY-MM-DD of `t` in `tz`. */
function dayOf(t: number, tz: string): string {
  return new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
}

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** "Oct 9", with the year when it isn't this year's. */
function shortDate(iso: string, now: number, tz: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const year = (x: number) =>
    new Date(x).toLocaleString('en-US', { year: 'numeric', timeZone: tz });
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year(t) === year(now) ? {} : { year: 'numeric' }),
    timeZone: tz,
  });
}

/** A YYYY-MM-DD day as "Thu Oct 15" (it is already the caller's calendar day). */
function dayName(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    at.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  return `${part({ weekday: 'short' })} ${part({ month: 'short', day: 'numeric' })}`;
}

/** The caller just named the value this fact replaced ("how's Acme?" after "started at Beta"). */
function namesReplaced(f: TemporalFact, words: string | undefined): boolean {
  if (!f.replaced || !words) return false;
  const current = new Set(forgetTokens(f.value));
  const said = new Set(forgetTokens(words));
  return forgetTokens(f.replaced).some((w) => !current.has(w) && !GENERIC.has(w) && said.has(w));
}

/**
 * The names in values an open fact replaced ("Acme" in "working at Acme",
 * "Austin"): a fact still open that names one is about the old state (the Acme
 * manager after the move to Beta). Store-side supersession only closes the
 * slot itself.
 */
function oldNames(facts: readonly TemporalFact[]): Set<string> {
  const names = new Set<string>();
  for (const f of facts) {
    if (!f.replaced) continue;
    const now = new Set(forgetTokens(f.value));
    const proper = f.replaced.match(/\b[A-Z][\w'-]*/g) ?? [];
    for (const w of forgetTokens(proper.join(' '))) if (!now.has(w)) names.add(w);
  }
  return names;
}

/** Names an old state, other than as the value its own replacement replaced. */
function aboutOldState(f: TemporalFact, old: Set<string>): boolean {
  const own = [f.subject, f.relation, f.value, f.replaced ? '' : f.source?.quote].join(' ');
  return forgetTokens(own).some((w) => old.has(w));
}

interface Pick {
  fact: TemporalFact;
  /** Lower goes first. */
  rank: number;
  when: string;
  over: boolean;
}

function pick(f: TemporalFact, today: string, words: string | undefined): Pick | null {
  const over = namesReplaced(f, words);
  // An event with no date: when it is (or was) is unknown, and a guess reads as fact.
  if (f.attribute === 'event' && !f.eventDate) return null;
  if (f.eventDate) {
    const ahead = daysBetween(today, f.eventDate);
    if (ahead > UPCOMING_DAYS || ahead < -PAST_EVENT_DAYS) return null;
    const relative = ahead === 0 ? 'today, ' : ahead === 1 ? 'tomorrow, ' : '';
    const when =
      ahead >= 0
        ? `, ${relative}${dayName(f.eventDate)}`
        : `, was ${dayName(f.eventDate)} (no word yet on how it went)`;
    // Upcoming soonest first, then the most recent past ones.
    return { fact: f, rank: ahead >= 0 ? 1 + ahead : 100 - ahead, when, over };
  }
  const since = f.since ? `, since ${dayName(f.since)}` : '';
  const changed = Date.parse(f.validFrom) || 0;
  // Latest change first: a smaller rank for a later validFrom.
  return { fact: f, rank: 1_000 + (1e13 - changed) / 1e13, when: since, over };
}

function subjectOf(f: TemporalFact, userName: string | undefined): string {
  if (f.subjectKey === 'self') return userName || 'they';
  return f.relation ? `${f.subject} (their ${f.relation})` : f.subject;
}

/**
 * The block's lines, most relevant first, rule not included: each one stored
 * fact, labelled with when they said it. [] when nothing is timely.
 */
export function worldFactLines(facts: readonly TemporalFact[], opts: InCallOptions): string[] {
  const tz = zone(opts.timeZone);
  const today = dayOf(opts.now, tz);
  const hidden = [...(opts.forgotten ?? []), ...avoidedTopics(facts)];
  const old = oldNames(facts.filter((f) => f.validTo === null));
  const picks = facts
    .filter(
      (f) =>
        f.validTo === null &&
        (f.by ?? 'caller') === 'caller' &&
        f.confidence >= MIN_CONFIDENCE &&
        !AVOID_THREAD.test(f.value) &&
        !isForgotten(worldFactText(f), hidden) &&
        !aboutOldState(f, old)
    )
    .map((f) => pick(f, today, opts.words))
    .filter((p): p is Pick => p !== null)
    // What the caller just brought up by its old name goes first.
    .sort((a, b) => Number(b.over) - Number(a.over) || a.rank - b.rank);

  // Room kept for the packet's heading and a bullet per line, so it never drops one.
  let left = BUDGET_TOKENS * 4 - WORLD_FACTS_RULE.length - 1 - 24 - 2 * MAX_LINES;
  const lines: string[] = [];
  for (const { fact: f, when, over } of picks) {
    if (lines.length >= MAX_LINES) break;
    const said = shortDate(f.observedAt, opts.now, tz);
    const label = said ? `(you said on ${said})` : '(you said)';
    const noLonger = over ? `; no longer: ${f.replaced}` : '';
    const line =
      `${label} ${subjectOf(f, opts.userName)} ${f.attribute}: ${f.value}${when}${noLonger}`
        .replace(/\s+/g, ' ')
        .trim();
    if (line.length + 1 > left) continue; // dropped whole, never cut
    left -= line.length + 1;
    lines.push(line);
  }
  return lines;
}

/** The legacy turn note (CONTEXT_PACKET off): one line, or '' when nothing is timely. */
export function worldFactsNote(facts: readonly TemporalFact[], opts: InCallOptions): string {
  const lines = worldFactLines(facts, opts);
  return lines.length ? `[Their life right now. ${WORLD_FACTS_RULE}] ${lines.join(' | ')}` : '';
}
