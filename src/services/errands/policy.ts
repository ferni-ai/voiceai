/**
 * The knobs errand rules read: retries, parallel calls, how long a text waits,
 * and business hours for when a retry may ring. Pure: the caller passes times.
 *
 * @module services/errands/policy
 */

import { wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import type { BusinessHours, Errand } from './errand.js';

export interface ErrandPolicy {
  /** Retries per place after the first call. */
  readonly maxRetries: number;
  readonly retryAfterMs: number;
  /** Allow parallel calls; still only for urgency 'any-slot'. */
  readonly parallel?: boolean;
  readonly maxParallel: number;
  /** How long a text to a place waits for a reply before the next place. */
  readonly textReplyWaitMs: number;
}

/** What the owner already told Ferni (insurance, mornings). Read by later slices. */
export interface ErrandPrefs {
  readonly timeOfDay?: 'morning' | 'afternoon';
  readonly insurance?: string;
}

const HOUR_MS = 3_600_000;
export const DEFAULT_POLICY: ErrandPolicy = {
  maxRetries: 2,
  retryAfterMs: 2 * HOUR_MS,
  maxParallel: 3,
  textReplyWaitMs: 24 * HOUR_MS,
};
export const DEFAULT_HOURS: BusinessHours = { open: '09:00', close: '17:00' };

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** `from`, or the next opening time after it when the place is closed then. No weekday rules yet. */
export function withinHours(from: Date, hours: BusinessHours | undefined, zone: string): Date {
  let open = minutesOf(hours?.open ?? '');
  let close = minutesOf(hours?.close ?? '');
  if (open === null || close === null || open >= close) {
    open = minutesOf(DEFAULT_HOURS.open) as number;
    close = minutesOf(DEFAULT_HOURS.close) as number;
  }
  const w = wallTimeIn(from, zone);
  const now = w.hour * 60 + w.minute;
  if (now >= open && now < close) return from;
  const day = new Date(Date.UTC(w.year, w.month - 1, w.day + (now < open ? 0 : 1)));
  return zonedWallTimeToUtc(
    {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: Math.floor(open / 60),
      minute: open % 60,
    },
    zone
  );
}

/** Parallel calls need the policy AND an any-slot errand ("find me any table tonight"). */
export const parallelAllowed = (e: Errand, policy: ErrandPolicy): boolean =>
  policy.parallel === true && e.constraints.urgency === 'any-slot';
