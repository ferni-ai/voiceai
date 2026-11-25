/**
 * Firestore closers for the SourceCloser port (follow-through/close-source.ts):
 * the item a follow-up was made from closes in its own store.
 *
 * - tasks (productivityData.tasks on the user doc): one task, in a transaction.
 *   Only that task's status changes; the rest of the list is the one just read,
 *   so a change to another task made a moment earlier is kept (the transaction
 *   reruns), and nothing writes a cached copy of the whole list. Done is
 *   'completed', release 'cancelled'. A recurring task is left to the task
 *   tool, which makes its next instance.
 * - reminders (bogle_users/{uid}/reminders): done is 'completed', release
 *   'cancelled', and only a reminder still 'pending' moves. One already sent,
 *   cancelled or completed stays as it is.
 * - commitments: done is 'completed', release 'dismissed', through the
 *   commitment store's own transactional close.
 *
 * Each closer says whether it closed the item. `closed` hears every close
 * that landed, so the process that ran it can update its own copies (the voice
 * worker's task and reminder caches) and a later save there doesn't undo it.
 *
 * @module services/stores/source-closer
 */
import type { Firestore } from '@google-cloud/firestore';
import {
  sourceCloserOf,
  type CloseHow,
  type SourceCloser,
} from '../follow-through/close-source.js';
import { closeCommitmentOrThrow } from '../superhuman/commitment-store.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'source-closer' });

export interface ClosedItem {
  readonly userId: string;
  readonly store: 'tasks' | 'reminders' | 'commitments';
  readonly ref: string;
  readonly status: 'completed' | 'cancelled' | 'dismissed';
  readonly at: Date;
}

export interface SourceCloserDeps {
  /** Hears each close that landed, in the process that ran it. */
  closed?: (item: ClosedItem) => void;
  /** Injected for tests; defaults to the commitment store's close. */
  closeCommitment?: typeof closeCommitmentOrThrow;
}

const OPEN_TASK: ReadonlySet<unknown> = new Set(['pending', 'in_progress']);

async function closeTask(db: Firestore, userId: string, ref: string, how: CloseHow, now: Date) {
  const doc = db.collection('bogle_users').doc(userId);
  const status = how === 'done' ? 'completed' : 'cancelled';
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(doc)).data();
    const pd = data?.productivityData as { tasks?: unknown } | undefined;
    const tasks: unknown[] = Array.isArray(pd?.tasks) ? pd.tasks : [];
    const i = tasks.findIndex(
      (t) => !!t && typeof t === 'object' && String((t as { id?: unknown }).id) === ref
    );
    const task = tasks[i] as Record<string, unknown> | undefined;
    if (!task || !OPEN_TASK.has(task.status) || task.isRecurring === true) return false;
    const at = now.toISOString();
    const next = [...tasks];
    next[i] = { ...task, status, updatedAt: at, ...(how === 'done' ? { completedAt: at } : {}) };
    tx.update(doc, { 'productivityData.tasks': next });
    return true;
  });
}

async function closeReminder(db: Firestore, userId: string, ref: string, how: CloseHow) {
  const doc = db.collection('bogle_users').doc(userId).collection('reminders').doc(ref);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(doc);
    if (!snap.exists || snap.data()?.status !== 'pending') return false;
    tx.update(doc, { status: how === 'done' ? 'completed' : 'cancelled' });
    return true;
  });
}

/** The Firestore SourceCloser, or null where there is no Firestore. */
export function firestoreSourceCloser(
  deps: SourceCloserDeps = {},
  db: Firestore | null = getFirestoreDb()
): SourceCloser | null {
  if (!db) return null;
  const closeCommitment = deps.closeCommitment ?? closeCommitmentOrThrow;
  const heard = (item: ClosedItem): true => {
    deps.closed?.(item);
    log.info({ store: item.store, status: item.status }, 'SOURCE_CLOSED');
    return true;
  };
  return sourceCloserOf({
    tasks: async (userId, ref, how, now) =>
      (await closeTask(db, userId, ref, how, now)) &&
      heard({
        userId,
        store: 'tasks',
        ref,
        status: how === 'done' ? 'completed' : 'cancelled',
        at: now,
      }),
    reminders: async (userId, ref, how, now) =>
      (await closeReminder(db, userId, ref, how)) &&
      heard({
        userId,
        store: 'reminders',
        ref,
        status: how === 'done' ? 'completed' : 'cancelled',
        at: now,
      }),
    commitments: async (userId, ref, how, now) => {
      const status = how === 'done' ? 'completed' : 'dismissed';
      const outcome = await closeCommitment(userId, ref, status, now.getTime(), 'call');
      return outcome === 'closed' && heard({ userId, store: 'commitments', ref, status, at: now });
    },
  });
}
