/**
 * Is this date an event Ferni already asked about, stored again under a nearby
 * day? (dates/recall.ts; memory audit 2026-10-25, after #2856.) The caller's
 * answer to "how did dinner with Sam go?" is often a new fact with another day:
 * re-dated to the call day, "the other day" read another way, the day in
 * another zone. Asked state keyed on the day missed those, and the answer was
 * asked about again. A different event of the same person in the same week
 * (her follow-up appointment after the surgery, his interview the day after
 * his birthday) must still be asked, so a prior ask quiets a one-time date
 * only when it is the SAME event:
 *
 * (a) chain: one supersedes the other (resolve.ts / dates/store.ts link them);
 * (b) answer in the call: told in the call where Ferni asked about that person,
 *     and not dated after that call (a plan made then is a new event);
 * (c) same subject, same kind and similar words, within SAME_EVENT_DAYS.
 *
 * Yearly dates are never matched here (recall.ts), and an ask only quiets the
 * moment it already covered: "soon" or "today" still leaves "how did it go?".
 *
 * @module intelligence/world-model/dates/same-event
 */
import { forgetTokens } from '../../../memory/index.js';
import { callMomentFor } from '../extraction/extraction-prompt.js';
import { normaliseText, type TemporalFact } from '../temporal/types.js';
import type { DateFact } from './store.js';
import { daysBetween, nextOccurrence } from './timex.js';

/** An answer is re-dated to the call day, the next day or "the other day": rarely further. */
export const SAME_EVENT_DAYS = 3;
/**
 * Content-word Jaccard at or above this is the same event. Event values are 1-4 words
 * ("job interview", "interview went great"), so half the words shared is one word of two:
 * "job interview" / "interview" match, "wedding" / "honeymoon" and "surgery" /
 * "follow-up appointment" don't.
 */
export const SIMILAR_WORDS = 0.5;

/** How it went says nothing about what it was: "went well", "pretty good". */
const OUTCOME = new Set(forgetTokens('went well good great fine ok okay pretty really'));

type Fact = TemporalFact & Pick<DateFact, 'kind' | 'recurrence' | 'monthDay'>;

/** A date asked about within the quiet window. */
export interface AskedEvent {
  fact: Fact;
  /** The day it fell on: a yearly one's occurrence after the ask, else its eventDate. */
  day: string;
  words: string[];
}

/** The subject key, case and spacing aside ("person:Sam " is "person:sam"). */
export const personKey = (f: Pick<TemporalFact, 'subjectKey'>): string =>
  normaliseText(f.subjectKey);

/** What it was, in content words: no stopwords, no outcome words, not whose it was. */
function eventWords(f: Fact): string[] {
  const whose = new Set(forgetTokens(`${f.subject} ${f.relation ?? ''}`));
  return forgetTokens(f.value).filter((w) => !OUTCOME.has(w) && !whose.has(w));
}

export function askedEvent(f: Fact): AskedEvent | null {
  if (!f.raisedOn) return null;
  const day =
    f.recurrence === 'yearly' && f.monthDay ? nextOccurrence(f.monthDay, f.raisedOn) : f.eventDate;
  return day ? { fact: f, day, words: eventWords(f) } : null;
}

const chained = (f: Fact, g: Fact): boolean =>
  (f.supersedes ?? []).includes(g.id) || g.supersededBy === f.id;

/**
 * Told in the call that raised `g`: its session when the raise recorded one (raisedIn),
 * else the caller's day it was told on is the raise day (older raises kept only the day).
 * Dated after that call, it is something new they mentioned, not how it went.
 */
function answeredInCall(f: Fact, day: string, asked: AskedEvent, timeZone: string): boolean {
  const g = asked.fact;
  const raisedOn = g.raisedOn as string;
  if (day > (asked.day > raisedOn ? asked.day : raisedOn)) return false;
  if (g.raisedIn) return f.source?.sessionId === g.raisedIn;
  const told = Date.parse(f.observedAt);
  return Boolean(told) && callMomentFor(new Date(told), timeZone).date === raisedOn;
}

function similar(f: Fact, day: string, asked: AskedEvent): boolean {
  if (Math.abs(daysBetween(asked.day, day)) > SAME_EVENT_DAYS) return false;
  if (f.kind && asked.fact.kind && f.kind !== asked.fact.kind) return false;
  const a = new Set(eventWords(f));
  const b = new Set(asked.words);
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared / (a.size + b.size - shared) >= SIMILAR_WORDS;
}

/**
 * True when `f`, due as `moment` on `day`, is an event already asked about at that moment
 * (or already asked how it went), under another fact of the same person.
 */
export function sameEventAsked(
  f: Fact,
  day: string,
  moment: string,
  asked: readonly AskedEvent[],
  timeZone: string
): boolean {
  return asked.some(
    (a) =>
      a.fact.id !== f.id &&
      personKey(a.fact) === personKey(f) &&
      (a.fact.raisedAs === undefined ||
        a.fact.raisedAs === 'passed' ||
        a.fact.raisedAs === moment) &&
      (chained(f, a.fact) || answeredInCall(f, day, a, timeZone) || similar(f, day, a))
  );
}
