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

import { isValidTimeZone } from '../../utils/time-zone.js';
import type { CallerHistory } from './greeting-direction.js';
import { recentCallRestraintEnabled } from './welcome-back.js';

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

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;
const NAMED_DAY =
  /\b(last |past |this past )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|tonight|later today|next week|next month)\b/gi;

/** The day a named day falls on, read from the day it was said. */
function dayNamed(word: string, saidOn: string): string {
  if (word === 'tomorrow') return addDays(saidOn, 1);
  if (word === 'tonight' || word === 'later today') return saidOn;
  if (word === 'next week') return addDays(saidOn, 7);
  if (word === 'next month') return addDays(saidOn, 28);
  const from = new Date(`${saidOn}T12:00:00Z`).getUTCDay();
  return addDays(saidOn, (WEEKDAYS.indexOf(word) - from + 7) % 7);
}

/**
 * True when the text names a day from today on. Absolute dates decide when
 * there are any; otherwise, read from the day it was said, "tomorrow",
 * "tonight", "next week" or a weekday ("interview on Monday") that has not
 * come round yet. "Last Monday" is behind them.
 */
export function namesDayAhead(text: string, today: string, saidOn?: string): boolean {
  const dates = [...text.matchAll(ISO_DATE)].map((m) => m[1]);
  if (dates.length > 0) return dates.some((ymd) => ymd >= today);
  if (!saidOn) return false;
  return [...text.matchAll(NAMED_DAY)].some(
    (m) => !m[1] && dayNamed(m[2].toLowerCase(), saidOn) >= today
  );
}

/** A commitment not yet due: its target date, or the day it names, is still ahead. */
export function commitmentAhead(
  c: { statement: string; createdAt: number; targetDate?: number },
  now: number,
  timeZone?: string
): boolean {
  if (c.targetDate !== undefined && c.targetDate > now) return true;
  const saidOn = Number.isFinite(c.createdAt) ? localYmd(c.createdAt, timeZone) : undefined;
  return namesDayAhead(c.statement, localYmd(now, timeZone), saidOn);
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
  const keep = !sameDay && !namesDayAhead(topic, today, saidOn);
  if (keep) return { sameDay, history, allows };
  const { lastTopic: _dropped, ...rest } = history;
  return { sameDay, history: rest, allows };
}
