/**
 * The hello never asks how something went before it has happened, and a
 * return call the same day lets them lead.
 *
 * Dev sweep (2026-10-21, B4): on 3 of 3 return calls a minute after the
 * caller said "I've got a job interview at Stripe on Monday", the hello was
 * "Hey Sam, how did the Stripe interview go?", and Ferni then corrected
 * himself. 9 of 10 return calls opened on the last call's topic, although
 * RECENT_CALL_RESTRAINT says not to: that rule reached only the main prompt
 * (welcome-back.ts lastTalkedAwareness), never the hello, which was handed
 * the last call's summary as a fact and an example of "how did the interview
 * go?". This keeps both out in code:
 * - a topic, check-in or pondered ask that names a day still ahead is not
 *   opened on (the summarizer writes absolute dates, call-moment.ts);
 * - a commitment whose target date has not come is not asked about;
 * - with RECENT_CALL_RESTRAINT on, a same-day return opens on nothing from
 *   before: a plain hello, and they lead.
 *
 * @module agents/multi-agent/greeting-not-yet
 */

import { flagOn } from '../../config/env-flag.js';
import { eventState } from '../../understanding/temporal/event-state.js';
import { resolveTimes, warmTemporalParser } from '../../understanding/temporal/resolve-time.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import type { CallerHistory } from './greeting-direction.js';
import { recentCallRestraintEnabled } from './welcome-back.js';

// compromise takes ~0.5-1 s to load: start it at boot, not in a call's hello.
if (flagOn('TEMPORAL_RESOLVER')) void warmTemporalParser();

/** Added to the hello's direction on a same-day return (RECENT_CALL_RESTRAINT). */
export const SAME_DAY_DIRECTION =
  ' You already talked earlier today: just a plain hello and how they are doing, and let them lead. Do not open with anything from earlier, and never guess how something went.';

/** YYYY-MM-DD of an instant where the caller is (UTC when the zone is unknown). */
export function localYmd(at: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

const DAY = 86_400_000;

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ISO_DATE = /\b(week of )?(\d{4}-\d{2}-\d{2})\b/gi;
const NAMED_DAY =
  /\b(last |past |this past )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|tonight|later today|next week|this weekend|next weekend|next month)\b/gi;
/** Said with a weekday that is today, these make it today's, not next week's. */
const SAME_DAY_WORDS = /\b(today|this morning|this afternoon|tonight|later)\b/i;
const SPAN = /\bfor (\d+|two|three|four|five|six|seven|ten|fourteen) days\b/i;
const NUMBERS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  ten: 10,
  fourteen: 14,
};

const weekdayOf = (ymd: string): number => new Date(`${ymd}T12:00:00Z`).getUTCDay();
/** The Sunday that ends the Monday-to-Sunday week holding this day. */
const weekEnd = (ymd: string): string => addDays(ymd, (7 - weekdayOf(ymd)) % 7);

/**
 * The last day of what a named day refers to, read from the day it was said.
 * A bare weekday said on that weekday ("interview on Monday", on a Monday)
 * means next week's, unless the line says today; "this Monday" on a Monday is
 * ambiguous and is read the same way, the safe side. "Next week" and "the
 * weekend" run to their last day, so a trip is not over halfway through.
 */
function dayNamed(word: string, saidOn: string, text: string): string {
  if (word === 'tomorrow') return addDays(saidOn, 1);
  if (word === 'tonight' || word === 'later today') return saidOn;
  if (word === 'next week') return weekEnd(addDays(saidOn, 7));
  if (word === 'this weekend') return weekEnd(saidOn);
  if (word === 'next weekend') return weekEnd(addDays(saidOn, 7));
  if (word === 'next month') return addDays(saidOn, 28);
  const ahead = (WEEKDAYS.indexOf(word) - weekdayOf(saidOn) + 7) % 7;
  return addDays(saidOn, ahead === 0 && !SAME_DAY_WORDS.test(text) ? 7 : ahead);
}

/** Extra days a stated span ("for three days") adds after the day it starts. */
function spanDays(text: string): number {
  const n = SPAN.exec(text)?.[1]?.toLowerCase();
  if (!n) return 0;
  return Math.max(0, (NUMBERS[n] ?? Number(n)) - 1);
}

/**
 * True when the text names a day from today on, or a span that has not ended.
 * Absolute dates decide when there are any ("the week of" one runs six more
 * days); otherwise, read from the day it was said, "tomorrow", "tonight",
 * "next week", "this weekend" or a weekday ("interview on Monday") that has
 * not come round yet. "Last Monday" is behind them.
 */
export function namesDayAhead(text: string, today: string, saidOn?: string): boolean {
  const extra = spanDays(text);
  const dates = [...text.matchAll(ISO_DATE)];
  if (dates.length > 0) return dates.some((m) => addDays(m[2], m[1] ? 6 : extra) >= today);
  if (!saidOn) return false;
  return [...text.matchAll(NAMED_DAY)].some(
    (m) => !m[1] && addDays(dayNamed(m[2].toLowerCase(), saidOn, text), extra) >= today
  );
}

/** TEMPORAL_RESOLVER: any time the text names, read from when it was said, is not over yet. */
function resolvedAhead(text: string, saidAt: number, now: number, timeZone?: string): boolean {
  return resolveTimes(text, saidAt, timeZone).some((t) => eventState(t, now, timeZone) !== 'past');
}

/** A commitment not yet due: its target date, or the day it names, is still ahead. */
export function commitmentAhead(
  c: { statement: string; createdAt: number; targetDate?: number },
  now: number,
  timeZone?: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  const today = localYmd(now, timeZone);
  // Day-granular: a date stored as midnight UTC is that calendar day; due today is not past yet.
  const target = c.targetDate;
  if (target !== undefined) {
    const due = target % DAY === 0 ? localYmd(target) : localYmd(target, timeZone);
    if (target > now || due >= today) return true;
  }
  const saidOn = Number.isFinite(c.createdAt) ? localYmd(c.createdAt, timeZone) : undefined;
  if (saidOn && flagOn('TEMPORAL_RESOLVER', env)) {
    return resolvedAhead(c.statement, c.createdAt, now, timeZone);
  }
  return namesDayAhead(c.statement, today, saidOn);
}

export interface OpeningRestraint {
  /** A return the same day, with RECENT_CALL_RESTRAINT on: open on nothing from before. */
  sameDay: boolean;
  /** The history the hello's facts may use: no last topic on a same-day return or one still ahead. */
  history: CallerHistory | undefined;
  /** Whether the hello may open on this thread (a pondered ask, say). */
  allows: (thread: string | undefined) => boolean;
}

/** What the hello may open on, for this caller's history, now and where they are. */
export function openingRestraint(
  history: CallerHistory | undefined,
  timeZone?: string,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env
): OpeningRestraint {
  const today = localYmd(now, timeZone);
  const sameDay = history?.daysSince === 0 && recentCallRestraintEnabled(env);
  const allows = (thread: string | undefined): boolean =>
    thread === undefined || (!sameDay && !namesDayAhead(thread, today));
  const topic = history?.lastTopic;
  if (!history || topic === undefined) return { sameDay, history, allows };
  const saidOn = history.daysSince === undefined ? undefined : addDays(today, -history.daysSince);
  const ahead =
    saidOn && flagOn('TEMPORAL_RESOLVER', env)
      ? resolvedAhead(topic, now - (history.daysSince ?? 0) * DAY, now, timeZone)
      : namesDayAhead(topic, today, saidOn);
  const keep = !sameDay && !ahead;
  if (keep) return { sameDay, history, allows };
  const { lastTopic: _dropped, ...rest } = history;
  return { sameDay, history: rest, allows };
}
