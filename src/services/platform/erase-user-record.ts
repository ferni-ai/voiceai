/**
 * Erase a user's Firestore record: bogle_users/{userId} and every subcollection
 * under it (memories, facts, relationships, emotional arcs, trust profiles,
 * voice sessions…), which is where the voice agent keeps what it knows.
 *
 * Account deletion used to skip this: its "profile" step deleted from the UI
 * server's in-memory store, so the whole record survived a "delete my
 * account" that reported success. Verified in the Firestore emulator on
 * 2026-10-06: 0 of 91 seeded documents removed.
 *
 * @module services/platform/erase-user-record
 */

import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin } from '../identity/firebase-auth.js';

export const USER_RECORDS_COLLECTION = 'bogle_users';

/** What is left under the record after an erase; empty means fully erased. */
export interface UserRecordRemnants {
  docExists: boolean;
  subcollections: string[];
}

/**
 * A user id names exactly one document. A '/' would make doc() address a
 * different path (a subcollection, or another user's document), so refuse it.
 */
export function assertErasableUserId(userId: string): void {
  if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
    throw new Error(`Refusing to erase an invalid user id: ${JSON.stringify(userId)}`);
  }
}

export async function findUserRecordRemnants(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<UserRecordRemnants> {
  const ref = db.collection(USER_RECORDS_COLLECTION).doc(userId);
  const [snap, subs] = await Promise.all([ref.get(), ref.listCollections()]);
  return { docExists: snap.exists, subcollections: subs.map((c) => c.id) };
}

/**
 * Delete the record and everything under it, then check that nothing is left.
 * Throws when Firestore is unreachable or anything survives, so callers never
 * report an erasure that did not happen.
 */
export async function eraseUserRecord(
  userId: string,
  firestore?: FirebaseFirestore.Firestore
): Promise<void> {
  assertErasableUserId(userId);
  const db = firestore ?? defaultDb();
  await db.recursiveDelete(db.collection(USER_RECORDS_COLLECTION).doc(userId));
  const left = await findUserRecordRemnants(db, userId);
  if (left.docExists || left.subcollections.length > 0) {
    const subs = left.subcollections.join(',');
    throw new Error(`User record not fully erased: doc=${left.docExists}, subcollections=${subs}`);
  }
}

function defaultDb(): FirebaseFirestore.Firestore {
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getFirestore();
}
