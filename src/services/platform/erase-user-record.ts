/**
 * Erase everything Firestore keeps for a user: both records (bogle_users/{userId},
 * where the voice agent keeps what it knows, and users/{userId}, where the app keeps
 * the calendar, journal, routines and practices), every subcollection under them, and
 * every store kept elsewhere for the person (user-stores.ts, the list the export reads).
 *
 * Account deletion used to skip this: its "profile" step deleted from the UI
 * server's in-memory store, so the whole record survived a "delete my account"
 * that reported success. Verified in the Firestore emulator on 2026-10-06: 0 of
 * 91 seeded documents removed. On 2026-10-12 users/{uid}, user_seeds and
 * contact_relationships still survived, because only bogle_users was erased.
 *
 * @module services/platform/erase-user-record
 */

import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin } from '../identity/firebase-auth.js';
import { createLogger } from '../../utils/safe-logger.js';
import { ERASED_STORES, storeLabel, type OwnedStore } from './user-stores.js';

const log = createLogger({ module: 'erase-user-record' });

export const USER_RECORDS_COLLECTION = 'bogle_users';

const PAGE = 300;
/** A query that keeps returning documents after they were deleted must not loop forever */
const MAX_PAGES = 1_000;

type Db = FirebaseFirestore.Firestore;

/**
 * A user id names exactly one document. A '/' would make doc() address a
 * different path (a subcollection, or another user's document), so refuse it.
 */
export function assertErasableUserId(userId: string): void {
  if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
    throw new Error(`Refusing to erase an invalid user id: ${JSON.stringify(userId)}`);
  }
}

/** The stores that still hold something for the user (labels from storeLabel); empty means erased */
export async function findUserRecordRemnants(
  db: Db,
  userId: string,
  stores: readonly OwnedStore[] = ERASED_STORES
): Promise<string[]> {
  // A store that can't be read can't be shown to be empty
  const left = await Promise.all(
    stores.map((store) => holdsUser(db, store, userId).catch(() => true))
  );
  return stores.filter((_, i) => left[i]).map(storeLabel);
}

async function holdsUser(db: Db, store: OwnedStore, userId: string): Promise<boolean> {
  const collection = db.collection(store.collection);
  if ('doc' in store) {
    const ref = collection.doc(userId);
    const [snap, subs] = await Promise.all([ref.get(), ref.listCollections()]);
    return snap.exists || subs.length > 0;
  }
  return !(await collection.where(store.field, '==', userId).limit(1).get()).empty;
}

/** Delete one store's documents for the user, and everything under them (Firestore doesn't cascade) */
async function eraseStore(db: Db, store: OwnedStore, userId: string): Promise<void> {
  const collection = db.collection(store.collection);
  if ('doc' in store) {
    await db.recursiveDelete(collection.doc(userId));
    return;
  }
  const query = collection.where(store.field, '==', userId).limit(PAGE);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await query.get();
    if (snap.empty) return;
    await Promise.all(snap.docs.map((doc) => db.recursiveDelete(doc.ref)));
  }
}

/**
 * Delete every store kept for the user, then check that nothing is left.
 * Throws when Firestore is unreachable or anything survives, so callers never
 * report an erasure that did not happen.
 */
export async function eraseUserRecord(
  userId: string,
  firestore?: Db,
  stores: readonly OwnedStore[] = ERASED_STORES
): Promise<void> {
  assertErasableUserId(userId);
  const db = firestore ?? defaultDb();
  const results = await Promise.allSettled(stores.map((store) => eraseStore(db, store, userId)));
  const errors = stores.filter((store, i) => {
    const result = results[i];
    if (result?.status !== 'rejected') return false;
    log.warn(
      { error: String(result.reason), userId, store: storeLabel(store) },
      'Store not erased'
    );
    return true;
  });
  const left = await findUserRecordRemnants(db, userId, stores);
  if (errors.length > 0 || left.length > 0) {
    const stuck = [...new Set([...errors.map(storeLabel), ...left])].join(',');
    throw new Error(`User record not fully erased: ${stuck}`);
  }
}

function defaultDb(): Db {
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getFirestore();
}
