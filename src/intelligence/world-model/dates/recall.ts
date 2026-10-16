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
 * One per call. A date is raised once (raisedOn on the fact), then not again
 * for 20 days, so a birthday comes back next year and the interview never
 * does. Dates marked to confirm are left out: Ferni never asks about a day he
 * may have wrong. Only the caller's own dates (by "ferni" is a promise of his).
 *
 * @module intelligence/world-model/dates/recall
 */
import { flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createFirestoreWorldFactStore,
  markFactRaised,
  type WorldFactStore,
} from '../temporal/store.js';
import type { DateFact } from './store.js';
import { daysBetween, nextOccurrence } from './timex.js';

const log = createLogger({ module: 'dates-recall' });

/** True when FRIEND_FOLLOWUPS=on. Off by default; needs DATES_THAT_MATTER to have stored dates. */
export function friendFollowUpsOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('FRIEND_FOLLOWUPS', env);
}

/** A stored date, with the day it was last raised on a call. */
export type RaisableDate = DateFact & { raisedOn?: string };

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
/** Raised once; a yearly date may come back next year. */
const QUIET_DAYS = 20;

/** "their sister Kate's", "their mom's", "their": named by the relation the caller gave. */
function whose(f: RaisableDate): string {
  if (f.subjectKind === 'self' || /^self$/i.test(f.subject)) return 'their';
  const rel = f.relation?.trim();
  const name = f.subject.trim();
  // "Kate" is a name; "mom" is a relation said as the name.
  if (!rel || rel.toLowerCase() === name.toLowerCase())
    return /^[A-Z]/.test(name) ? `${name}'s` : `their ${name}'s`;
  return `their ${rel} ${name}'s`;
}

function dueOne(f: RaisableDate, today: string): DueDate | null {
  if (f.attribute !== 'event' || f.validTo !== null || f.by === 'ferni') return null;
  if (f.needsConfirmation) return null;
  if (f.raisedOn && daysBetween(f.raisedOn, today) < QUIET_DAYS) return null;
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
  return { id: f.id, moment, what: `${whose(f)} ${f.value.trim()}`, days };
}

const RANK: Record<DateMoment, number> = { today: 0, passed: 1, soon: 2 };

/** The one date to raise today, or null (pure). Today first, then the most recent passed one. */
export function dueDate(facts: readonly RaisableDate[], today: string): DueDate | null {
  const due = facts.flatMap((f) => dueOne(f, today) ?? []);
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
  /** Saves the day a date was raised; the default writes raisedOn on the fact. */
  mark?: (userId: string, factId: string, day: string) => Promise<void>;
  now?: () => Date;
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
  const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  let due: DueDate | null = null;
  let given = false;
  const ready = (deps.store ?? createFirestoreWorldFactStore())
    .listOpen(deps.userId)
    .then((facts) => {
      due = dueDate(facts as RaisableDate[], today);
      if (due) log.info({ moment: due.moment, days: due.days }, 'Date to raise');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Dates not loaded'));
  return {
    ready,
    note: () => (due && !given ? formatDueDate(due) : null),
    raised() {
      if (!due || given) return;
      given = true;
      (deps.mark ?? markFactRaised)(deps.userId, due.id, today).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Date not marked raised')
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
  return friendFollowUpsOn() ? createDatesRecall({ userId }) : NO_DATES;
}
