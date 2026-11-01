/**
 * Erasing one store's records for one key, and checking that none are left: the path
 * account deletion (erase-user-record.ts) takes for every store, and the one the orphan
 * clean-up (scripts/data/erase-orphans.ts) takes for a deleted person's leftovers.
 *
 * Imports nothing at run time: erase-user-record.ts pulls in Firebase Auth, BigQuery and
 * more, which kept a CLI importing it from exiting.
 *
 * @module services/platform/erase-store
 */

import type { OwnedStore } from './user-stores.js';

const PAGE = 300;
/** A query that keeps returning documents after they were deleted must not loop forever */
const MAX_PAGES = 1_000;
/** A Firebase uid: exactly 28 letters or digits */
const UID_SHAPE = /^[A-Za-z0-9]{28}$/;

type Db = FirebaseFirestore.Firestore;

/**
 * `{mapKey}.{uid}` as a field path. A '.' in the uid would address a deeper key, and
 * Firestore refuses some characters, so such a uid fails the erasure (it is retried).
 */
function entryPath(mapKey: string, userId: string): string {
  if (/[.~*[\]`]/.test(userId)) throw new Error("A uid that can't name a map entry");
  return `${mapKey}.${userId}`;
}

/** The documents holding the person's entry (single-field index on the map subfield) */
const holdingEntry = (db: Db, collection: string, path: string, limit: number) =>
  db.collection(collection).where(path, '!=', null).limit(limit);

export async function holdsUser(db: Db, store: OwnedStore, userId: string): Promise<boolean> {
  const collection = db.collection(store.collection);
  if ('mapKey' in store) {
    const path = entryPath(store.mapKey, userId);
    return !(await holdingEntry(db, store.collection, path, 1).get()).empty;
  }
  if ('doc' in store) {
    const ref = collection.doc(userId);
    const [snap, subs] = await Promise.all([ref.get(), ref.listCollections()]);
    return snap.exists || subs.length > 0;
  }
  return !(await collection.where(store.field, '==', userId).limit(1).get()).empty;
}

/**
 * Delete one store's documents for the user, and everything under them (Firestore doesn't
 * cascade). recursiveDelete also clears the subcollections under a document that no longer
 * exists itself.
 */
export async function eraseStore(db: Db, store: OwnedStore, userId: string): Promise<void> {
  const collection = db.collection(store.collection);
  if ('mapKey' in store) return eraseEntries(db, store, userId);
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
 * Only the person's entry goes; the rest of each document (another member's entry, the
 * contact's own STOP) stays. In a transaction, so a write racing it isn't lost.
 */
async function eraseEntries(
  db: Db,
  store: { collection: string; mapKey: string },
  userId: string
): Promise<void> {
  const query = holdingEntry(db, store.collection, entryPath(store.mapKey, userId), PAGE);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await query.get();
    if (snap.empty) return;
    await Promise.all(
      snap.docs.map(async (doc) =>
        db.runTransaction(async (tx) => {
          const map: unknown = (await tx.get(doc.ref)).get(store.mapKey);
          if (!map || typeof map !== 'object' || !Object.hasOwn(map, userId)) return;
          const { [userId]: _dropped, ...kept } = map as Record<string, unknown>;
          tx.update(doc.ref, { [store.mapKey]: kept });
        })
      )
    );
  }
}

/**
 * A deleted person's leftover in one store, erased the way account deletion erases it.
 * Only a uid-shaped key: a phone or device key never names a Firebase account.
 */
export async function eraseOrphanedKey(db: Db, store: OwnedStore, key: string): Promise<void> {
  if (!UID_SHAPE.test(key)) throw new Error('Refusing to erase a key that is not a Firebase uid');
  await eraseStore(db, store, key);
}
