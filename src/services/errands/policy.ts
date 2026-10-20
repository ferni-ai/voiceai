/**
 * When errand rules may act: retry and deadline knobs, business hours with
 * weekday rules, the per-number daily call cap, and the booking window.
 * Errands design section 4 (2 calls per number per day) wins over section 3
 * (2 retries): a third call in a rolling day waits for the next one.
 *
 * Pure: the caller passes times.
 *
 * @module services/errands/policy
 */

import { wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import type { BusinessHours, Constraints, Errand } from './errand.js';

export interface ErrandPolicy {
  /** Retries per place after the first call. */
  readonly maxRetries: number;
  readonly retryAfterMs: number;
  /** Allow parallel calls; still only for urgency 'any-slot'. */
  readonly parallel?: boolean;
  readonly maxParallel: number;
  /** How long a text to a place waits for a reply before the next place. */
  readonly textReplyWaitMs: number;
  /** The same for an any-slot errand, where tonight is the point. */
  readonly anySlotTextWaitMs: number;
  /** A call with no outcome by then is given up on (never re-dialled blind). */
  readonly callDeadlineMs: number;
  /** A line-type lookup with no answer by then counts as "can't tell". */
  readonly lookupDeadlineMs: number;
  /** Calls to one number in any rolling 24 hours. */
  readonly maxDialsPerDay: number;
}

/** What the owner already told Ferni (insurance, mornings). Read by later slices. */
export interface ErrandPrefs {
  readonly timeOfDay?: 'morning' | 'afternoon';
  readonly insurance?: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_POLICY: ErrandPolicy = {
  maxRetries: 2,
  retryAfterMs: 2 * HOUR_MS,
  maxParallel: 3,
  textReplyWaitMs: DAY_MS,
  anySlotTextWaitMs: 2 * HOUR_MS,
  callDeadlineMs: 30 * MINUTE_MS,
  lookupDeadlineMs: 30 * MINUTE_MS,
  maxDialsPerDay: 2,
};
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
export const DEFAULT_HOURS: BusinessHours = { open: '09:00', close: '17:00', days: WEEKDAYS };

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

interface Hours {
  readonly open: number;
  readonly close: number;
  readonly days: readonly number[];
}

/** The place's hours when well formed (weekdays unless it names days), else 09:00-17:00 Mon-Fri. */
function hoursOf(h: BusinessHours | undefined): Hours {
  const open = minutesOf(h?.open ?? '');
  const close = minutesOf(h?.close ?? '');
  const days = h?.days?.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) ?? [];
  if (open === null || close === null || open >= close) {
    return { open: 9 * 60, close: 17 * 60, days: WEEKDAYS };
  }
  return { open, close, days: days.length ? days : WEEKDAYS };
}

/** `from` if the place is open then, else its next opening time (within a week). */
export function withinHours(from: Date, hours: BusinessHours | undefined, zone: string): Date {
  const h = hoursOf(hours);
  const w = wallTimeIn(from, zone);
  const now = w.hour * 60 + w.minute;
  for (let ahead = 0; ahead < 8; ahead++) {
    const day = new Date(Date.UTC(w.year, w.month - 1, w.day + ahead));
    if (!h.days.includes(day.getUTCDay())) continue;
    if (ahead === 0 && now >= h.close) continue;
    if (ahead === 0 && now >= h.open) return from;
    const wall = {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    };
    return zonedWallTimeToUtc(
      { ...wall, hour: Math.floor(h.open / 60), minute: h.open % 60 },
      zone
    );
  }
  return from; // no open day at all: unreachable with a non-empty day list
}

/**
 * The first time at or after `from` the place is open AND this number has had
 * fewer than `cap` calls in the 24 hours before it.
 */
export function nextDialAt(
  from: Date,
  dials: readonly string[],
  cap: number,
  hours: BusinessHours | undefined,
  zone: string
): Date {
  let at = withinHours(from, hours, zone);
  for (let i = 0; i < 5; i++) {
    const recent = dials
      .map(Date.parse)
      .filter((t) => t > at.getTime() - DAY_MS && t <= at.getTime());
    if (recent.length < cap) return at;
    const frees = recent.sort((a, b) => a - b)[recent.length - cap] + DAY_MS + 1;
    at = withinHours(new Date(frees), hours, zone);
  }
  return at;
}

/** A real time inside the errand's window, when it has one (NaN compares false). */
export function inWindow(when: string | undefined, window: Constraints['window']): boolean {
  const t = when ? Date.parse(when) : NaN;
  const from = window?.from ? Date.parse(window.from) : -Infinity;
  const to = window?.to ? Date.parse(window.to) : Infinity;
  return t >= from && t <= to;
}

/** Parallel calls need the policy AND an any-slot errand ("find me any table tonight"). */
export const parallelAllowed = (e: Errand, policy: ErrandPolicy): boolean =>
  policy.parallel === true && e.constraints.urgency === 'any-slot';

/** How long a text waits for a reply: 2 hours for any-slot, a day otherwise. */
export const textWaitMs = (e: Errand, policy: ErrandPolicy): number =>
  e.constraints.urgency === 'any-slot' ? policy.anySlotTextWaitMs : policy.textReplyWaitMs;
