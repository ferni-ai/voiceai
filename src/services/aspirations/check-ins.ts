/**
 * Habit check-ins ("I did my run today", "I missed yesterday") on the user's
 * local calendar day. One check-in per day: a later one for the same day
 * replaces it. Streaks are recomputed on every change.
 *
 * @module services/aspirations/check-ins
 */

import { failure, success } from '../../types/result.js';
import { addDays, compareCivil, formatCivil, localToday } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { mergeCheckIn, parseCivil, withStreaks } from './habit-math.js';
import { clean } from './record.js';
import { getAspiration, saveAspiration, type StoreResult } from './store.js';
import { AspirationError, MAX_NOTE, type AspirationRecord, type CheckInInput } from './types.js';

/** How far back a check-in may be back-dated. */
export const MAX_BACKDATE_DAYS = 60;

export function validateCheckIn(input: unknown): CheckInInput | string {
  if (!input || typeof input !== 'object') return 'body must be an object';
  const b = input as Record<string, unknown>;
  if (b.status !== 'done' && b.status !== 'missed') return "status must be 'done' or 'missed'";
  if (b.date !== undefined && (typeof b.date !== 'string' || !parseCivil(b.date))) {
    return 'date must be YYYY-MM-DD';
  }
  if (b.note !== undefined && typeof b.note !== 'string') return 'note must be a string';
  return {
    status: b.status,
    ...(typeof b.date === 'string' ? { date: b.date } : {}),
    ...(typeof b.note === 'string' ? { note: b.note } : {}),
  };
}

/** Apply a check-in to a habit record (pure; `timeZone` decides "today"). */
export function applyCheckIn(
  record: AspirationRecord,
  input: CheckInInput,
  timeZone: string,
  now: Date = new Date()
): AspirationRecord | string {
  if (record.level !== 'habit' || !record.habit) return 'only habits take check-ins';
  const today = localToday(now, timeZone);
  const day = input.date ? parseCivil(input.date) : today;
  if (!day) return 'date must be YYYY-MM-DD';
  if (compareCivil(day, today) > 0) return "can't check in for a future day";
  if (compareCivil(day, addDays(today, -MAX_BACKDATE_DAYS)) < 0) return 'that day is too far back';
  const note = clean(input.note, MAX_NOTE);
  const checkIns = mergeCheckIn(record.habit.checkIns, {
    date: formatCivil(day),
    status: input.status,
    ...(note ? { note } : {}),
    recordedAt: now.toISOString(),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  const habit = withStreaks({ ...record.habit, checkIns }, today);
  const iso = now.toISOString();
  return {
    ...record,
    habit,
    // Doing the habit is a sign it's alive again.
    status: record.status === 'dormant' && input.status === 'done' ? 'active' : record.status,
    updatedAt: iso,
    lastMentionedAt: iso,
  };
}

export async function recordCheckIn(
  userId: string,
  id: string,
  input: CheckInInput,
  now: Date = new Date()
): StoreResult<AspirationRecord> {
  const got = await getAspiration(userId, id);
  if (!got.success) return got;
  const next = applyCheckIn(got.data, input, await resolveTimeZone(userId), now);
  if (typeof next === 'string') return failure(new AspirationError('invalid_input', next));
  const saved = await saveAspiration(userId, next);
  return saved.success ? success(saved.data) : saved;
}
