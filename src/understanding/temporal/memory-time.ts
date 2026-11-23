/**
 * Where the times a remembered line names stand now, and how long ago it was
 * said, for prompts that show earlier calls to the reply model (#2530).
 *
 * Dev, memory flags on (1cf4bd64b): the system prompt said "Last time you
 * talked about: ... soccer tournament on 2026-10-24" with nothing to say that
 * Saturday was still ahead, and the first reply was "I hope you survived
 * being the snack mom". Another call heard "not what you said earlier this
 * morning" about a call two minutes before, at night, from "You talked
 * earlier today.". With MEMORY_TIME_LABELS on, the readers mark each dated
 * clause and say minutes when it was under an hour ago.
 *
 * The rules, each from a case that read wrong:
 * - Tense is read per clause: "had a rough interview on Monday and the final
 *   round is on Friday" is Monday gone and Friday ahead.
 * - The most specific time wins: in "a tournament on Saturday, so I'm the
 *   snack mom this week" the week holds the Saturday, so only Saturday counts.
 * - A whole-day event is "today" on its day, and "may be over by now" from
 *   6 pm caller-local, not "under way" until midnight.
 * - A recurring time ("every Saturday") is no one event and gets no mark.
 * - With no known zone, a gap under a day is said in hours, never as a
 *   calendar day ("yesterday") that UTC may have put wrong.
 *
 * eventState (the hello's rule) is used as it is; nothing here changes it.
 *
 * @module understanding/temporal/memory-time
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { calendarDaysSince, daysAgoInWords } from '../../utils/calendar-days.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import * as C from './civil.js';
import { eventState } from './event-state.js';
import {
  CLAUSE_BREAK,
  resolveTimes,
  warmTemporalParser,
  type ResolvedTime,
} from './resolve-time.js';
import { sentenceTense } from './tense.js';

/** MEMORY_TIME_LABELS. */
export function memoryTimeLabelsOn(env: Env = process.env): boolean {
  return flagOn('MEMORY_TIME_LABELS', env);
}

// compromise ("next week", "in two weeks") takes ~0.5-1 s to load: start it at boot.
if (memoryTimeLabelsOn()) void warmTemporalParser();

type TimeState = 'upcoming' | 'today' | 'today-late' | 'ongoing' | 'past';

/** The mark a dated clause gets, in square brackets after it. */
const MARKS: Record<TimeState, string> = {
  upcoming: 'coming up, not happened yet',
  today: 'today',
  'today-late': 'today, may be over by now',
  ongoing: 'under way now',
  past: 'already happened',
};

/** From this caller-local hour a whole-day event on its day may be over. */
const EVENING_HOUR = 18;

const DAYS = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
const RECURRING = new RegExp(
  `\\b(?:every|each)\\s+(?:other\\s+)?(?:day|night|morning|evening|week|weekend|month|year|${DAYS})\\b|\\b(?:${DAYS}|weekend)s\\b|\\b(?:daily|weekly|monthly)\\b`,
  'i'
);

/** Where one resolved time stands at `now`, with the whole-day rule above. */
function stateOf(t: ResolvedTime, now: number, timeZone?: string): TimeState {
  const state = eventState(t, now, timeZone);
  if (state !== 'ongoing' || t.precision !== 'day') return state;
  const local = C.toNaive(now, C.zoneOrUtc(timeZone));
  return local - C.midnight(local) >= EVENING_HOUR * C.HOUR_MS ? 'today-late' : 'today';
}

/** One clause's time, if it names exactly one event: read in its own tense. */
function clauseTime(clause: string, saidAt: number, timeZone?: string): ResolvedTime | undefined {
  if (RECURRING.test(clause)) return undefined;
  return resolveTimes(clause, saidAt, timeZone, { tense: sentenceTense(clause) })[0];
}

/** A text with its dated clauses marked, and the states of those marks in order. */
interface TimeLabels {
  text: string;
  states: TimeState[];
}

/**
 * Marks each clause of `text` that names a time with where that time stands
 * at `now`, read from `saidAt` on the caller's calendar. A time that holds a
 * shorter one from another clause is left unmarked. No dated clause: the text
 * unchanged and no states.
 */
export function labelTimes(
  text: string,
  saidAt: number,
  now: number,
  timeZone?: string
): TimeLabels {
  void warmTemporalParser(); // rules only until compromise loads, once per process
  const parts = text.split(new RegExp(`(${CLAUSE_BREAK.source})`));
  const times = parts.map((p, i) => (i % 2 === 0 ? clauseTime(p, saidAt, timeZone) : undefined));
  const span = (t: ResolvedTime): number => t.endExclusive - t.start;
  const holdsShorter = (t: ResolvedTime): boolean =>
    times.some(
      (o) => o && span(o) < span(t) && o.start >= t.start && o.endExclusive <= t.endExclusive
    );
  const states: TimeState[] = [];
  const marked = parts.map((part, i) => {
    const t = times[i];
    if (!t || holdsShorter(t)) return part;
    const state = stateOf(t, now, timeZone);
    states.push(state);
    const end = part.trimEnd().length;
    return `${part.slice(0, end)} [${MARKS[state]}]${part.slice(end)}`;
  });
  return states.length ? { text: marked.join(''), states } : { text, states };
}

/** True when any mark says the event has not happened or may still be going. */
export function anyStillAhead(states: TimeState[]): boolean {
  return states.some((s) => s === 'upcoming' || s === 'today' || s === 'ongoing');
}

/**
 * How long ago something was said, as a friend would put it: minutes under an
 * hour, hours under a day when the caller's zone is unknown, otherwise calendar
 * days where they are (daysAgoInWords).
 */
export function whenSaid(savedAt: number, now: number, timeZone?: string): string {
  const ago = Math.max(0, now - savedAt);
  const minutes = Math.round(ago / C.MINUTE_MS);
  if (minutes < 2) return 'a minute ago';
  if (minutes < 15) return 'a few minutes ago';
  if (ago < C.HOUR_MS - 3 * C.MINUTE_MS) return `about ${Math.round(minutes / 5) * 5} minutes ago`;
  if (!isValidTimeZone(timeZone) && ago < C.DAY_MS) {
    const hours = Math.round(ago / C.HOUR_MS);
    return hours <= 1 ? 'about an hour ago' : `about ${hours} hours ago`;
  }
  if (ago < C.HOUR_MS) return 'about an hour ago';
  return daysAgoInWords(calendarDaysSince(savedAt, now, timeZone));
}
