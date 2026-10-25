/**
 * When to bring a follow-up up: text it now, save it for the next call, wait,
 * or let it go.
 *
 * A friend texts "it's noon, call your mom" at noon, not at nine at night when
 * they finally remember. They bring up your interview on the next call rather
 * than texting at 2am. And they stop asking about something from three weeks
 * ago. The rules, in order:
 *
 * - Closed: nothing to do.
 * - Stale: an undated thread after 14 days, or a dated one-off 2 days past
 *   due, expires.
 * - Undated: wait for the next call.
 * - Not due yet: wait.
 * - Already texted since it fell due: don't text twice; the next call.
 * - Too late to text (more than 3 hours past due): "call your mom at noon"
 *   at 9pm reads as a glitch; the next call.
 * - A time the caller set (reminder, dose, date): text now, quiet hours or not.
 * - A time Ferni picked (commitment, promise, thread): text now outside quiet
 *   hours (21:00–08:00 in their zone), otherwise wait.
 *
 * Pure: the caller passes `now`.
 *
 * @module services/follow-through/right-moment
 */

import { wallTimeIn } from '../../utils/time-zone.js';
import { isClosed, type FollowUp, type FollowUpKind } from './follow-up.js';

export type Moment = 'text-now' | 'next-call' | 'wait' | 'expire';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const UNDATED_EXPIRY_DAYS = 14;
export const DATED_EXPIRY_DAYS = 2;
export const LATE_TEXT_HOURS = 3;
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

/** Kinds whose time the caller chose; quiet hours don't apply to them. */
const CALLER_TIMED: ReadonlySet<FollowUpKind> = new Set(['reminder', 'dose', 'date']);
export const isCallerTimed = (f: Pick<FollowUp, 'kind'>): boolean => CALLER_TIMED.has(f.kind);

export function isQuietHour(now: Date, zone: string): boolean {
  const { hour } = wallTimeIn(now, zone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** True when it was texted at or after the moment it fell due. */
function textedSinceDue(f: FollowUp, dueMs: number): boolean {
  return f.surfaced.some((s) => s.via === 'text' && Date.parse(s.at) >= dueMs);
}

export function rightMoment(f: FollowUp, now: Date): Moment {
  if (isClosed(f)) return 'wait';
  const nowMs = now.getTime();
  if (f.dueAt === null) {
    return nowMs - Date.parse(f.createdAt) > UNDATED_EXPIRY_DAYS * DAY_MS ? 'expire' : 'next-call';
  }
  const dueMs = Date.parse(f.dueAt);
  if (!f.repeat && nowMs - dueMs > DATED_EXPIRY_DAYS * DAY_MS) return 'expire';
  if (dueMs > nowMs) return 'wait';
  if (textedSinceDue(f, dueMs)) return 'next-call';
  if (nowMs - dueMs > LATE_TEXT_HOURS * HOUR_MS) return 'next-call';
  if (CALLER_TIMED.has(f.kind)) return 'text-now';
  return isQuietHour(now, f.zone) ? 'wait' : 'text-now';
}
