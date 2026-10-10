/**
 * What's Ahead intentions: saving one as done, or not done again.
 *
 * Three kinds of intention share one checkbox:
 * - a task (`bogle_users/{uid}/tasks/{id}`) has a `completed` flag;
 * - a practice (`practice_{id}` → `users/{uid}/practices/{id}`) is done for the day and
 *   adds to its streak;
 * - a starter intention (`default_1`..`default_3`), shown when there is nothing else, has no
 *   document of its own, so the ones done each day are kept in `intentionDays/{day}`.
 */
import { FieldValue, type Firestore } from '@google-cloud/firestore';

const STARTER_ID = /^default_[1-3]$/;
const PRACTICE_PREFIX = 'practice_';

/** The UTC day, the same day key the practice view uses for events */
export function dayKey(now = new Date()): string {
  return now.toISOString().split('T')[0];
}

/** A practice counts as done only on the day it was done, so it comes back tomorrow */
export function isDoneToday(practice: { lastCompletedAt?: unknown }, now = new Date()): boolean {
  return typeof practice.lastCompletedAt === 'string' && practice.lastCompletedAt.startsWith(dayKey(now));
}

function starterDay(db: Firestore, userId: string, now: Date) {
  return db.collection('bogle_users').doc(userId).collection('intentionDays').doc(dayKey(now));
}

/** Check off the starter intentions already done today */
export async function markStartersDoneToday(
  db: Firestore,
  userId: string,
  intentions: Array<{ id: string; completed: boolean }>,
  now = new Date()
): Promise<void> {
  const snap = await starterDay(db, userId, now).get();
  const done: unknown = snap.exists ? snap.data()?.completed : undefined;
  if (!Array.isArray(done)) return;
  for (const intention of intentions) {
    if (done.includes(intention.id)) intention.completed = true;
  }
}

/** Thrown for an intention id that isn't one of ours, or a document that's gone */
export class IntentionNotFoundError extends Error {
  constructor(intentionId: string) {
    super(`No intention ${intentionId}`);
    this.name = 'IntentionNotFoundError';
  }
}

export async function setIntentionCompleted(
  db: Firestore,
  userId: string,
  intentionId: string,
  completed: boolean,
  now = new Date()
): Promise<void> {
  if (intentionId.startsWith('default_')) {
    if (!STARTER_ID.test(intentionId)) throw new IntentionNotFoundError(intentionId);
    await starterDay(db, userId, now).set(
      {
        completed: completed ? FieldValue.arrayUnion(intentionId) : FieldValue.arrayRemove(intentionId),
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );
    return;
  }

  if (intentionId.startsWith(PRACTICE_PREFIX)) {
    const ref = db
      .collection('users')
      .doc(userId)
      .collection('practices')
      .doc(intentionId.slice(PRACTICE_PREFIX.length));
    // In a transaction, so doing it twice counts once, and undoing puts back the last session
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new IntentionNotFoundError(intentionId);
      const practice = snap.data() ?? {};
      if (completed === isDoneToday(practice, now)) return;
      tx.update(
        ref,
        completed
          ? {
              completedToday: true,
              previousCompletedAt: practice.lastCompletedAt ?? null,
              lastCompletedAt: now.toISOString(),
              streak: FieldValue.increment(1),
            }
          : {
              completedToday: false,
              lastCompletedAt: practice.previousCompletedAt ?? FieldValue.delete(),
              previousCompletedAt: FieldValue.delete(),
              streak: FieldValue.increment(-1),
            }
      );
    });
    return;
  }

  const task = db.collection('bogle_users').doc(userId).collection('tasks').doc(intentionId);
  if (!(await task.get()).exists) throw new IntentionNotFoundError(intentionId);
  await task.update(
    completed
      ? { completed: true, completedAt: now.toISOString() }
      : { completed: false, completedAt: FieldValue.delete() }
  );
}
