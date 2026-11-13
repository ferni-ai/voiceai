/**
 * The readers and writers that close a todo where it lives, for close-to-source
 * (services/follow-through/close-to-source.ts). peek and close judge an item
 * the same way (the *State helpers). Each write is a compare-and-set in a
 * Firestore transaction: it closes the item only while it is still open, so a
 * close from the app a moment earlier is never undone, and a store failure
 * throws so the caller counts it.
 *
 * Statuses are the stores' own, none invented:
 * - reminders: done or let go → 'cancelled' (a reminder has no done state; the
 *   promise sweep reads 'cancelled' as released). The calendar copy goes too.
 * - tasks (productivityData.tasks on the user doc): done → 'completed', let go
 *   → 'cancelled'. A repeating task is left open: its next instance is made by
 *   the task tool's completeTask, which only an in-call tool can run.
 * - commitments: done → 'completed', let go → 'dismissed' (closeCommitmentOrThrow).
 *
 * A safety item (a 988 follow-up, a crisis check-in: isSafetyItem on each of
 * kind, type and category) is never closed from conversation:
 * a stale one costs a line, a closed one can cost far more. Commitments have
 * no safety types (CommitmentType).
 *
 * @module services/stores/source-closers
 */

import type { DocumentReference, DocumentSnapshot, Firestore } from '@google-cloud/firestore';
import type { CloseWrite, SourceClosers, SourceState } from '../follow-through/close-to-source.js';
import { removeCalendarSyncedItem } from '../calendar/calendar-bridge.js';
import { closeCommitmentOrThrow } from '../superhuman/commitment-store.js';
import { isSafetyItem } from '../safety/index.js';
import { getProductivityStore, type TaskData } from './productivity-store.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'source-closers' });

const OPEN_TASK = new Set(['pending', 'in_progress']);

/** Wherever a store keeps an item's type; a safety value in ANY of them makes it a safety item. */
const SAFETY_FIELDS = ['kind', 'type', 'category'] as const;
function isSafetyRecord(get: (field: string) => unknown): boolean {
  return SAFETY_FIELDS.some((f) => {
    const v = get(f);
    return typeof v === 'string' && isSafetyItem(v);
  });
}

function reminderState(snap: DocumentSnapshot): SourceState {
  if (!snap.exists) return 'missing';
  if (isSafetyRecord((f) => snap.get(f))) return 'safety';
  return snap.get('status') === 'pending' ? 'open' : 'already';
}

function tasksOf(snap: DocumentSnapshot): TaskData[] {
  const tasks = snap.get('productivityData.tasks') ?? [];
  return Array.isArray(tasks) ? (tasks as TaskData[]) : [];
}

/** A repeating task is never open to this: its next instance needs the in-call completeTask. */
function taskState(task: TaskData | undefined): SourceState {
  if (!task) return 'missing';
  if (isSafetyRecord((f) => Reflect.get(task, f))) return 'safety';
  return OPEN_TASK.has(task.status) && !task.isRecurring ? 'open' : 'already';
}

/** The cached task is this user's: setTask stamps the owner; no owner means unknown, so no. */
function ownedBy(cached: TaskData | undefined, userId: string): boolean {
  return (cached as { userId?: string } | undefined)?.userId === userId;
}

function createSourceClosers(db: Firestore): SourceClosers {
  const user = (userId: string): DocumentReference => db.collection('bogle_users').doc(userId);

  async function closeReminder(userId: string, id: string): Promise<CloseWrite> {
    const ref = user(userId).collection('reminders').doc(id);
    const outcome = await db.runTransaction(async (tx): Promise<CloseWrite> => {
      const state = reminderState(await tx.get(ref));
      if (state !== 'open') return state;
      tx.update(ref, { status: 'cancelled' });
      return 'closed';
    });
    if (outcome === 'closed')
      await removeCalendarSyncedItem(userId, id).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Closed reminder left on the calendar')
      );
    return outcome;
  }

  async function closeTask(userId: string, id: string, status: string): Promise<CloseWrite> {
    const ref = user(userId);
    const at = new Date().toISOString();
    let closed = null as TaskData | null; // set inside the transaction
    const outcome = await db.runTransaction(async (tx): Promise<CloseWrite> => {
      const tasks = tasksOf(await tx.get(ref));
      const task = tasks.find((t) => t?.id === id);
      const state = taskState(task);
      if (state !== 'open') return state;
      closed = { ...(task as TaskData), status, updatedAt: at, ...(status === 'completed' ? { completedAt: at } : {}) }; // prettier-ignore
      tx.update(ref, { 'productivityData.tasks': tasks.map((t) => (t.id === id ? closed : t)) });
      return 'closed';
    });
    // This process's copy, when it holds this user's, so its next save doesn't write the task
    // back open. The cache is keyed by task id alone: never overwrite another user's task.
    const store = getProductivityStore();
    if (closed && ownedBy(store.getTask(id), userId)) store.setTask(userId, closed);
    return outcome;
  }

  return {
    async peek(userId, { store, ref }) {
      if (store === 'reminders') return reminderState(await user(userId).collection('reminders').doc(ref).get()); // prettier-ignore
      if (store === 'tasks') return taskState(tasksOf(await user(userId).get()).find((t) => t?.id === ref)); // prettier-ignore
      if (store === 'commitments') {
        // Commitments have no safety types (CommitmentType); open means still active.
        const snap = await user(userId).collection('commitments').doc(ref).get();
        return !snap.exists ? 'missing' : snap.get('status') === 'active' ? 'open' : 'already';
      }
      return 'missing';
    },
    async close(userId, { store, ref }, how) {
      if (store === 'reminders') return closeReminder(userId, ref);
      if (store === 'tasks') return closeTask(userId, ref, how === 'done' ? 'completed' : 'cancelled'); // prettier-ignore
      if (store === 'commitments') {
        const outcome = await closeCommitmentOrThrow(userId, ref, how === 'done' ? 'completed' : 'dismissed', Date.now(), 'conversation'); // prettier-ignore
        return outcome === 'closed' ? 'closed' : outcome === 'already' ? 'already' : 'missing';
      }
      return 'missing';
    },
  };
}

export function firestoreSourceClosers(): SourceClosers | null {
  const db = getFirestoreDb();
  return db ? createSourceClosers(db) : null;
}
