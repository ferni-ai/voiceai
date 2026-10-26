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
 *     not dated after that call, and either the same event in other words (b1:
 *     the same kind and words as (c), any day) or nothing but how it went (b2:
 *     "pretty well" or "it was rough": an outcome word and no content words left). "She also fell in the kitchen",
 *     told while answering about her surgery, is its own event and is asked;
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

/**
 * How it went, good or bad ("went well", "it was rough"). OUTCOME says how it
 * went; HOW only frames it ("went", "pretty"), so "going out" or "went out"
 * is not an answer on its own (#2881 verifier: a stopword-only value read as
 * one, and "it was rough" was asked about again).
 */
const OUTCOME =
  'well good great fine ok okay alright smooth smoothly amazing fantastic perfect wonderful lovely ' +
  'rough bad badly awful terrible horrible hard tough better worse so-so';
const HOW =
  'went go going pretty really very so all quite not too it is was she he they her his doing';

/** Both kinds of outcome word, as event words see them (stemmed). Built on first use, not at import. */
let outcome: Set<string> | undefined;
const outcomeWords = (): Set<string> => (outcome ??= new Set(forgetTokens(`${OUTCOME} ${HOW}`)));
const SAYS_HOW = new Set(OUTCOME.split(' '));

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
  const out = outcomeWords();
  return forgetTokens(f.value).filter((w) => !out.has(w) && !whose.has(w));
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
 * The same kind (when both are known; with only one kind, the words decide) and content-word
 * Jaccard at least SIMILAR_WORDS. Empty word sets match nothing.
 */
function sameWords(f: Fact, asked: AskedEvent): boolean {
  if (f.kind && asked.fact.kind && f.kind !== asked.fact.kind) return false;
  const a = new Set(eventWords(f));
  const b = new Set(asked.words);
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared / (a.size + b.size - shared) >= SIMILAR_WORDS;
}

/** Nothing but how it went ("pretty well", "it was rough"): no event of its own, and a word that says how. */
const pureOutcome = (f: Fact): boolean =>
  eventWords(f).length === 0 &&
  (f.value.toLowerCase().match(/[\p{L}-]+/gu) ?? []).some((w) => SAYS_HOW.has(w));

/**
 * Told in the call that raised `g` (b): its session when the raise recorded one (raisedIn),
 * else the caller's day it was told on is the raise day (older raises kept only the day).
 * Dated after that call, it is something new they mentioned, not how it went. Only the same
 * event in other words (b1) or a bare outcome (b2) is the answer; anything with content of
 * its own ("she fell in the kitchen") is a new event, asked about in its turn.
 */
function answeredInCall(f: Fact, day: string, asked: AskedEvent, timeZone: string): boolean {
  const g = asked.fact;
  const raisedOn = g.raisedOn as string;
  if (day > (asked.day > raisedOn ? asked.day : raisedOn)) return false;
  if (!sameWords(f, asked) && !pureOutcome(f)) return false;
  if (g.raisedIn) return f.source?.sessionId === g.raisedIn;
  const told = Date.parse(f.observedAt);
  return Boolean(told) && callMomentFor(new Date(told), timeZone).date === raisedOn;
}

/** (c): the same event in other words within SAME_EVENT_DAYS, told in any call. */
const similar = (f: Fact, day: string, asked: AskedEvent): boolean =>
  Math.abs(daysBetween(asked.day, day)) <= SAME_EVENT_DAYS && sameWords(f, asked);

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
