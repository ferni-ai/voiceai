/**
 * When is a date's next reminder due? Pure functions, no I/O.
 *
 * A reminder is identified by `{dateId}_{occurrenceYear}_{offset}` so each
 * offset fires at most once per occurrence, however often the job runs.
 *
 * If a date is added late (say 4 days before a birthday with a 7-day
 * reminder), the closest reminder still due fires once, now, and the earlier
 * ones are skipped rather than sent in a burst.
 *
 * @module services/important-dates/reminder-schedule
 */

import {
  addDays,
  daysBetween,
  isWithinQuietHours,
  localParts,
  localToday,
  nextOccurrence,
  parseClock,
  parseStoredDate,
  zonedTimeToUtc,
  type CivilDate,
} from './date-math.js';
import type { ImportantDateRecord, ReminderSettings } from './types.js';

export interface ScheduleContext {
  timeZone: string;
  now: Date;
  settings: ReminderSettings;
}

export interface PlannedReminder {
  key: string;
  offset: number;
  occursOn: CivilDate;
  /** Local day the reminder belongs to. */
  remindOn: CivilDate;
  at: Date;
}

/** How many handled keys a date remembers (several years of reminders). */
export const SENT_KEYS_KEPT = 24;

export function reminderKey(dateId: string, occurrenceYear: number, offset: number): string {
  return `${dateId}_${occurrenceYear}_${offset}`;
}

/** Local send instant for a day, moved out of quiet hours. */
export function sendInstantFor(day: CivilDate, ctx: ScheduleContext): Date {
  const send = parseClock(ctx.settings.sendTime) ?? 9 * 60;
  const qs = parseClock(ctx.settings.quietHours.start);
  const qe = parseClock(ctx.settings.quietHours.end);
  if (qs !== null && qe !== null && isWithinQuietHours(send, qs, qe)) {
    // Quiet until `qe`: later today if quiet hours end after the send time,
    // otherwise (send time is in the evening part) tomorrow morning.
    const sameDay = qe > send;
    return zonedTimeToUtc(sameDay ? day : addDays(day, 1), qe, ctx.timeZone);
  }
  return zonedTimeToUtc(day, send, ctx.timeZone);
}

function sortedOffsets(record: ImportantDateRecord): number[] {
  return [...new Set(record.reminders.offsets)]
    .filter((o) => Number.isInteger(o) && o >= 0)
    .sort((a, b) => a - b);
}

/**
 * The next reminder to send for a date, or null when none is left (reminders
 * off, a one-off date that has passed, or nothing configured).
 */
export function planNextReminder(
  record: ImportantDateRecord,
  ctx: ScheduleContext
): PlannedReminder | null {
  if (!record.reminders.enabled) return null;
  const parts = parseStoredDate(record.date);
  if (!parts) return null;
  const offsets = sortedOffsets(record);
  if (offsets.length === 0) return null;
  const handled = new Set(record.sentReminderKeys);
  const today = localToday(ctx.now, ctx.timeZone);

  let from = today;
  for (let guard = 0; guard < 3; guard++) {
    const occ = nextOccurrence(parts, record.recurring, from);
    if (!occ) return null;
    const daysUntil = daysBetween(today, occ);

    // Closest offset whose day has arrived: due now unless already handled.
    const due = offsets.find((o) => o >= daysUntil);
    if (due !== undefined && !handled.has(reminderKey(record.id, occ.year, due))) {
      const todaySend = sendInstantFor(today, ctx);
      return {
        key: reminderKey(record.id, occ.year, due),
        offset: due,
        occursOn: occ,
        remindOn: today,
        at: todaySend,
      };
    }
    // Otherwise the earliest future offset for this occurrence.
    const future = offsets.filter((o) => o < daysUntil);
    if (future.length > 0) {
      const offset = future[future.length - 1];
      const remindOn = addDays(occ, -offset);
      return {
        key: reminderKey(record.id, occ.year, offset),
        offset,
        occursOn: occ,
        remindOn,
        at: sendInstantFor(remindOn, ctx),
      };
    }
    if (!record.recurring) return null;
    from = addDays(occ, 1);
  }
  return null;
}

/** Scheduling fields to store on a date after (re)planning. */
export function scheduleFields(
  record: ImportantDateRecord,
  ctx: ScheduleContext
): Pick<ImportantDateRecord, 'nextReminderAt' | 'nextReminderKey'> {
  const plan = planNextReminder(record, ctx);
  return {
    nextReminderAt: plan ? plan.at.toISOString() : null,
    nextReminderKey: plan ? plan.key : null,
  };
}

/** Append a handled key, keeping the list bounded. */
export function withHandledKey(keys: readonly string[], key: string): string[] {
  const next = keys.filter((k) => k !== key);
  next.push(key);
  return next.slice(-SENT_KEYS_KEPT);
}

/** Whether `now` is inside the user's quiet hours. */
export function isQuietNow(ctx: ScheduleContext): boolean {
  const qs = parseClock(ctx.settings.quietHours.start);
  const qe = parseClock(ctx.settings.quietHours.end);
  if (qs === null || qe === null) return false;
  const p = localParts(ctx.now, ctx.timeZone);
  return isWithinQuietHours(p.hour * 60 + p.minute, qs, qe);
}

/** The instant quiet hours end, from `now`. */
export function quietHoursEnd(ctx: ScheduleContext): Date {
  const qe = parseClock(ctx.settings.quietHours.end) ?? 8 * 60;
  const today = localToday(ctx.now, ctx.timeZone);
  const candidate = zonedTimeToUtc(today, qe, ctx.timeZone);
  return candidate.getTime() > ctx.now.getTime()
    ? candidate
    : zonedTimeToUtc(addDays(today, 1), qe, ctx.timeZone);
}
