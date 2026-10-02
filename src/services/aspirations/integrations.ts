/**
 * Aspirations → important dates (Agent G's store and planner).
 *
 * - Goal deadlines: an active, confirmed goal with a target date gets a
 *   `deadline` important date (reminders, quiet hours, channels and the
 *   user's proactive boundaries all handled there). Renaming, achieving,
 *   letting go or deleting the goal removes it.
 * - Habit nudges: a habit with a reminder time gets `habit.nextNudgeAt` from
 *   the habit-reminder rule beside G's planner (recurring daily/weekday
 *   reminders aren't something the date planner models).
 *
 * Registered on the store's write/delete hooks; loaded lazily by store.ts.
 *
 * @module services/aspirations/integrations
 */

import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { importantDateIdFor, importantDateKey } from '../important-dates/identity.js';
import {
  deleteImportantDate,
  scheduleContextFor,
  upsertImportantDate,
} from '../important-dates/store.js';
import { planHabitNudge } from '../important-dates/habit-reminder-rule.js';
import { isDueOn } from './habit-math.js';
import { aspirationRef, onAspirationDeleted, onAspirationWritten } from './store.js';
import { isConfirmed, type AspirationRecord } from './types.js';

const log = createLogger({ module: 'aspirations:integrations' });

export function wantsDeadline(r: AspirationRecord): boolean {
  return r.level === 'goal' && !!r.targetDate && r.status === 'active' && isConfirmed(r);
}

export function deadlineKey(r: AspirationRecord): string {
  return importantDateKey({ kind: 'deadline', title: r.title });
}

async function setField(userId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const ref = aspirationRef(db, userId, id);
  const snap = await ref.get();
  if (snap.exists) await ref.update(patch);
}

export async function syncGoalDeadline(userId: string, r: AspirationRecord): Promise<void> {
  if (r.level !== 'goal') return;
  const desiredId = wantsDeadline(r) ? importantDateIdFor(deadlineKey(r)) : null;
  if (r.deadlineDateId && r.deadlineDateId !== desiredId) {
    const removed = await deleteImportantDate(userId, r.deadlineDateId, 'user_deleted');
    if (!removed.success && removed.error.code !== 'not_found') {
      log.warn(
        { userId, id: r.id, error: removed.error.message },
        'Could not remove goal deadline'
      );
    }
  }
  if (!desiredId || !r.targetDate) {
    if (r.deadlineDateId) await setField(userId, r.id, { deadlineDateId: null });
    return;
  }
  const out = await upsertImportantDate(userId, {
    key: deadlineKey(r),
    title: r.title,
    date: r.targetDate,
    recurring: false,
    kind: 'deadline',
    subtype: 'goal',
    source: r.source === 'explicit' || r.userEdited ? 'user' : 'detected',
    sourceConversationIds: r.sourceConversationIds,
    confidence: Math.max(0, Math.min(1, r.confidence)),
    ...(r.personaId ? { personaId: r.personaId } : {}),
  });
  if (!out.success) {
    log.warn({ userId, id: r.id, error: out.error.message }, 'Could not schedule goal deadline');
    return;
  }
  if (out.data.status !== 'skipped_tombstoned' && r.deadlineDateId !== out.data.id) {
    await setField(userId, r.id, { deadlineDateId: out.data.id });
  }
}

export async function planNudge(userId: string, r: AspirationRecord): Promise<void> {
  const habit = r.habit;
  if (r.level !== 'habit' || !habit) return;
  const ctx = await scheduleContextFor(userId);
  const plan = planHabitNudge(
    {
      habitId: r.id,
      reminderTime: habit.schedule.reminderTime,
      active: r.status === 'active',
      isDue: (day) => isDueOn(habit, day),
    },
    ctx
  );
  const next = plan ? plan.at.toISOString() : null;
  if ((habit.nextNudgeAt ?? null) === next) return;
  const db = getFirestoreDb();
  if (!db) return;
  const ref = aspirationRef(db, userId, r.id);
  const snap = await ref.get();
  const stored = snap.data()?.habit;
  if (!snap.exists || !stored || typeof stored !== 'object') return;
  await ref.update({ habit: { ...(stored as Record<string, unknown>), nextNudgeAt: next } });
}

onAspirationWritten(async (userId, r) => {
  await syncGoalDeadline(userId, r);
  await planNudge(userId, r);
});

onAspirationDeleted(async (userId, r) => {
  if (!r.deadlineDateId) return;
  const removed = await deleteImportantDate(userId, r.deadlineDateId, 'user_deleted');
  if (!removed.success && removed.error.code !== 'not_found') {
    log.warn({ userId, id: r.id, error: removed.error.message }, 'Could not remove goal deadline');
  }
});
