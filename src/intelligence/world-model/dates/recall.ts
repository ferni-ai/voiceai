/**
 * Dates that matter, read back at call start (FRIEND_FOLLOWUPS).
 *
 * DATES_THAT_MATTER stores the dates a caller mentions ("Kate's interview is
 * Thursday", "mom's birthday is the 14th"), but nothing read them in a call,
 * so Ferni never asked how the interview went. This picks the one date that
 * matters most right now and words it for the first recall note:
 *
 * - a one-time date that passed in the last 10 days: ask how it went;
 * - a date that is today: wish them well;
 * - a one-time date tomorrow, or a yearly one within the week: ask about it.
 *
 * One per call. Each moment is raised once (raisedOn and raisedAs on the
 * fact) and not again for 20 days: asking about the interview the day before
 * still leaves "how did it go?" for after, a birthday comes back next year,
 * and the interview never does. Asked is per subject, day and moment, not per
 * fact: the caller's answer is often stored as another fact for the same day,
 * and asking it again 16 minutes later was the 2026-10-25 memory audit's loop.
 * The answer is not always stored under the same day either (re-dated to the
 * call day, "the other day" read another way, the day in another zone, or a
 * second event minted from it), so a person asked about is also left alone for
 * QUIET_DAYS, whatever the date: one dated follow-up per person per window.
 * The same day's other moment is still allowed ("soon", then "how did it go?").
 * Dates marked to confirm are left out: Ferni never asks about a day he
 * may have wrong. Only the caller's own dates (by "ferni" is a promise of his).
 * The guards the in-call reader has apply here too: no guesses (confidence
 * below MIN_CONFIDENCE), nothing they asked to forget or not to bring up
 * ("avoid:" threads, by topic and by person), and no "today" wish for a day
 * they told Ferni about while it was already under way.
 *
 * @module intelligence/world-model/dates/recall
 */
import { flagOn } from '../../../config/env-flag.js';
import { forgottenTopicsOrNull, isForgotten, worldFactText } from '../../../memory/index.js';
import { userTimeZone } from '../../../utils/caller-time-zone.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { callMomentFor } from '../extraction/extraction-prompt.js';
import {
  createFirestoreWorldFactStore,
  markFactRaised,
  type WorldFactStore,
} from '../temporal/store.js';
import { MIN_CONFIDENCE } from '../temporal/in-call.js';
import { AVOID_THREAD, avoidedTopics, normaliseText } from '../temporal/types.js';
import type { DateFact } from './store.js';
import { daysBetween, nextOccurrence } from './timex.js';

const log = createLogger({ module: 'dates-recall' });

/** True when FRIEND_FOLLOWUPS=on. Off by default; needs DATES_THAT_MATTER to have stored dates. */
export function friendFollowUpsOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('FRIEND_FOLLOWUPS', env);
}

/** A stored date, with the day it was last raised on a call. */
export type RaisableDate = DateFact & { raisedOn?: string; raisedAs?: DateMoment };

export type DateMoment = 'passed' | 'today' | 'soon';

export interface DueDate {
  id: string;
  moment: DateMoment;
  /** Whose and what: "their sister Kate's job interview". */
  what: string;
  /** Days from today: negative for passed, 0 today, positive ahead. */
  days: number;
}

const PASSED_DAYS = 10;
const ONCE_AHEAD_DAYS = 1;
const YEARLY_AHEAD_DAYS = 7;
/** Raised once; a yearly date may come back next year. Also the per-person quiet window. */
export const QUIET_DAYS = 20;

/** Stored words as one short line: no newlines or long text reach the note. */
const oneLine = (s: string | undefined, max = 60): string =>
  (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** "their sister Kate's", "their mom's", "their": named by the relation the caller gave. */
function whose(f: RaisableDate): string {
  if (f.subjectKind === 'self' || /^self$/i.test(f.subject)) return 'their';
  const rel = oneLine(f.relation, 30);
  const name = oneLine(f.subject, 40);
  // "Kate" is a name; "mom" is a relation said as the name.
  if (!rel || rel.toLowerCase() === name.toLowerCase())
    return /^[A-Z]/.test(name) ? `${name}'s` : `their ${name}'s`;
  return `their ${rel} ${name}'s`;
}

/** What keeps a date from being raised, beyond its own fields (dueDate). */
export interface DueOptions {
  /** Topics they asked Ferni to forget (forget.ts). */
  forgotten?: readonly string[];
  /** The caller's IANA zone: the day a fact was told on is theirs (UTC without). */
  timeZone?: string;
  /** Told the id of each fact left out because its person was asked about lately. */
  onQuiet?: (factId: string) => void;
}

interface Screen {
  /** subjectKey|day|moment of each ask within QUIET_DAYS ("*" for an ask stored without its moment). */
  asked: Set<string>;
  hidden: string[];
  /** People they asked not to bring up something about. */
  avoided: Set<string>;
  /** Per person, the days asked about within QUIET_DAYS, from open and closed facts alike. */
  quiet: Map<string, Set<string>>;
  onQuiet?: (factId: string) => void;
  timeZone: string;
}

/** The subject key, case and spacing aside ("person:Sam " is "person:sam"). */
const personKey = (f: RaisableDate): string => normaliseText(f.subjectKey);
const dayOf = (f: RaisableDate): string => f.eventDate ?? f.monthDay ?? '';
const dayKey = (f: RaisableDate): string => `${personKey(f)}|${dayOf(f)}`;

function screenOf(facts: readonly RaisableDate[], today: string, opts: DueOptions): Screen {
  const asked = new Set<string>();
  const quiet = new Map<string, Set<string>>();
  for (const f of facts) {
    if (!f.raisedOn || daysBetween(f.raisedOn, today) >= QUIET_DAYS) continue;
    asked.add(`${dayKey(f)}|${f.raisedAs ?? '*'}`);
    quiet.set(personKey(f), (quiet.get(personKey(f)) ?? new Set<string>()).add(dayOf(f)));
  }
  const avoided = new Set(
    facts
      .filter(
        (f) => f.subjectKey !== 'self' && f.attribute === 'thread' && AVOID_THREAD.test(f.value)
      )
      .map((f) => f.subjectKey)
  );
  const hidden = [...(opts.forgotten ?? []), ...avoidedTopics(facts)];
  return { asked, hidden, avoided, quiet, onQuiet: opts.onQuiet, timeZone: opts.timeZone ?? 'UTC' };
}

/** The caller's own open event, sure enough to ask about, and nothing they'd rather not hear about. */
function askable(f: RaisableDate, screen: Screen): boolean {
  if (f.attribute !== 'event' || f.validTo !== null || f.by === 'ferni') return false;
  if (f.needsConfirmation || f.confidence < MIN_CONFIDENCE) return false;
  return !screen.avoided.has(f.subjectKey) && !isForgotten(worldFactText(f), screen.hidden);
}

function dueOne(f: RaisableDate, today: string, screen: Screen): DueDate | null {
  if (!askable(f, screen)) return null;
  let days: number;
  if (f.recurrence === 'yearly' && f.monthDay) {
    days = daysBetween(today, nextOccurrence(f.monthDay, today));
    if (days > YEARLY_AHEAD_DAYS) return null;
  } else if (f.eventDate) {
    days = daysBetween(today, f.eventDate);
    if (days < -PASSED_DAYS || days > ONCE_AHEAD_DAYS) return null;
  } else {
    return null;
  }
  const moment: DateMoment = days < 0 ? 'passed' : days === 0 ? 'today' : 'soon';
  const key = dayKey(f);
  if (screen.asked.has(`${key}|${moment}`) || screen.asked.has(`${key}|*`)) return null;
  // Told on the day itself, it was already happening: nothing to wish them well for.
  const told = Date.parse(f.observedAt);
  if (moment === 'today' && told && callMomentFor(new Date(told), screen.timeZone).date === today)
    return null;
  // Their person was asked about lately under another day: most likely this is the answer.
  const asked = screen.quiet.get(personKey(f));
  if (asked && [...asked].some((day) => day !== dayOf(f))) {
    screen.onQuiet?.(f.id);
    return null;
  }
  return { id: f.id, moment, what: `${whose(f)} ${oneLine(f.value)}`, days };
}

/** The day n days before a YYYY-MM-DD. */
function dayBefore(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

const RANK: Record<DateMoment, number> = { today: 0, passed: 1, soon: 2 };

/** The one date to raise today, or null (pure). Today first, then the most recent passed one. */
export function dueDate(
  facts: readonly RaisableDate[],
  today: string,
  opts: DueOptions = {}
): DueDate | null {
  const screen = screenOf(facts, today, opts);
  const due = facts.flatMap((f) => dueOne(f, today, screen) ?? []);
  due.sort((a, b) => RANK[a.moment] - RANK[b.moment] || Math.abs(a.days) - Math.abs(b.days));
  return due[0] ?? null;
}

const ago = (n: number): string => (n === 1 ? 'yesterday' : `${n} days ago`);
const ahead = (n: number): string => (n === 1 ? 'tomorrow' : `in ${n} days`);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The line for the first recall note. */
export function formatDueDate(d: DueDate): string {
  const ask =
    'After saying hello, unless they have already brought it up, ask about it once, briefly and warmly, the way a friend who remembers would.';
  if (d.moment === 'passed')
    return `A date they told you about: ${cap(d.what)} was ${ago(-d.days)}. ${ask} Ask how it went; never guess how it went.`;
  if (d.moment === 'today')
    return `A date they told you about: ${cap(d.what)} is today. ${ask} Wish them well for it.`;
  return `A date they told you about: ${cap(d.what)} is ${ahead(d.days)}. ${ask} Ask how they feel about it.`;
}

export interface DatesRecallDeps {
  userId: string;
  store?: WorldFactStore;
  /** Saves the day and moment a date was raised; the default writes them on the fact. */
  mark?: (userId: string, factId: string, day: string, moment: DateMoment) => Promise<void>;
  now?: () => Date;
  /** The caller's IANA zone: dates are stored by their day, so today is theirs too (UTC without). */
  timezone?: string;
  /** Topics they asked Ferni to forget; the default reads forget.ts's record. */
  forgotten?: (userId: string) => Promise<string[] | null>;
}

export interface DatesRecall {
  ready: Promise<void>;
  /** The line for the first note, or null. No side effects. */
  note: () => string | null;
  /** The note was given: don't raise this date again soon. */
  raised: () => void;
}

/** Loads the caller's dates at call start. Never rejects. */
export function createDatesRecall(deps: DatesRecallDeps): DatesRecall {
  const today = callMomentFor(deps.now?.() ?? new Date(), deps.timezone ?? 'UTC').date;
  let due: DueDate | null = null;
  let given = false;
  const store = deps.store ?? createFirestoreWorldFactStore();
  const topics = deps.forgotten ?? forgottenTopicsOrNull;
  // Who was asked about lately, from closed facts too: the asked one is often closed by its answer.
  const since = dayBefore(today, QUIET_DAYS - 1);
  const raisedLately = store.listRaisedSince?.(deps.userId, since) ?? Promise.resolve([]);
  const ready = Promise.all([store.listOpen(deps.userId), raisedLately, topics(deps.userId)])
    .then(([open, raised, forgotten]) => {
      const timeZone = deps.timezone ?? 'UTC';
      // What they asked to forget can't be read: raise nothing rather than risk it.
      if (forgotten === null)
        return log.warn({ open: open.length }, 'Dates not raised: forgotten topics unreadable');
      const ids = new Set(open.map((f) => f.id));
      const facts = [...open, ...raised.filter((f) => !ids.has(f.id))] as RaisableDate[];
      const quieted: string[] = [];
      due = dueDate(facts, today, { forgotten, timeZone, onQuiet: (id) => quieted.push(id) });
      const events = open.filter((f) => f.attribute === 'event').length;
      // Ids and counts only, never the caller's words.
      const counts = { open: open.length, raised: raised.length, events, id: due?.id ?? null };
      if (due) log.info({ ...counts, moment: due.moment, days: due.days }, 'Date to raise');
      else if (quieted.length > 0)
        log.info(
          { ...counts, id: quieted[0], quieted: quieted.length, reason: 'person_quiet' },
          'No date to raise'
        );
      else log.info(counts, 'No date to raise');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Dates not loaded'));
  return {
    ready,
    note: () => (due && !given ? formatDueDate(due) : null),
    raised() {
      if (!due || given) return;
      given = true;
      log.info({ id: due.id, moment: due.moment }, 'Date raised');
      (deps.mark ?? markFactRaised)(deps.userId, due.id, today, due.moment).catch(
        (error: unknown) => log.warn({ error: String(error) }, 'Date not marked raised')
      );
    },
  };
}

const NO_DATES: DatesRecall = {
  ready: Promise.resolve(),
  note: () => null,
  raised: () => undefined,
};

/** The call's dates recall with FRIEND_FOLLOWUPS=on; one that has nothing when off. */
export function datesRecallFor(userId: string): DatesRecall {
  if (!friendFollowUpsOn()) return NO_DATES;
  return createDatesRecall({ userId, timezone: userTimeZone({ userId }) });
}
