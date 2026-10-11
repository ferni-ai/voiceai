/**
 * When the caller's previous call ended.
 *
 * No single collection has every call: on prod (2026-10-10) voice_sessions
 * had a 10-04 call that summaries lacked, and summaries had a 06-08 call that
 * voice_sessions lacked. So both are read, in parallel, newest of each, and
 * the later one wins. Neither readable means "unknown", not "first call".
 *
 * @module intelligence/world-model/temporal/last-call
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';

/** A Firestore Timestamp, Date, ISO string or epoch ms, as a Date; else null. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const maybe = value as { toDate?: () => Date };
  const date =
    typeof maybe.toDate === 'function'
      ? maybe.toDate()
      : value instanceof Date
        ? value
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** The later of the two, or whichever exists; null when neither does. */
export function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

async function newest(
  db: Firestore,
  userId: string,
  collection: string,
  field: string
): Promise<Date | null> {
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection(collection)
    .orderBy(field, 'desc')
    .limit(1)
    .get();
  return snap.empty ? null : toDate(snap.docs[0].data()[field]);
}

/** voice_sessions.endedAt (ISO string) vs summaries.timestamp (Timestamp). */
export async function lastCallEndedAt(
  userId: string,
  getDb: () => Firestore | null = getFirestoreDb
): Promise<Date | null> {
  const db = getDb();
  if (!db) return null;
  const [sessions, summaries] = await Promise.allSettled([
    newest(db, userId, 'voice_sessions', 'endedAt'),
    newest(db, userId, 'summaries', 'timestamp'),
  ]);
  const value = (r: PromiseSettledResult<Date | null>) =>
    r.status === 'fulfilled' ? r.value : null;
  return latest(value(sessions), value(summaries));
}
