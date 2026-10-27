/**
 * Writes engagement_profiles/{uid}, but never brings back an erased person's profile.
 *
 * getProfile creates a default profile for a uid it can't find, and saveProfile writes
 * whatever the process cached, so anything that ran for a uid after account deletion
 * recreated the doc: a menu route on the ID token the app still held (tokens are not
 * checked for revocation), a live call's cached profile, a background ritual or nudge.
 * The prod orphan audit (#2902) found 13 such docs. The same shape as team insights (#2833).
 *
 * The write reads the user record (bogle_users/{uid}) and the profile in its own
 * transaction, and is dropped when the record is marked `erasing` (an erasure is running,
 * utils/erasing-mark.ts), or when both are gone (what an erasure leaves). Account erasure
 * marks the record before it deletes anything, so a write that read the record first
 * conflicts with the mark and its retry finds it. A profile that exists is still updated
 * when the record is missing: that is no recreation, and keys without a record keep
 * working.
 *
 * @module services/engagement/engagement-profile-write
 */

import { isErasedOrErasing } from '../../utils/erasing-mark.js';

const USER_RECORDS = 'bogle_users';

interface Snapshot {
  exists: boolean;
  data: () => unknown;
}

/** The part of a Firestore transaction this write uses */
export interface ProfileTransaction<Ref> {
  get: (ref: Ref) => Promise<Snapshot>;
  set: (ref: Ref, data: unknown, options: { merge: boolean }) => unknown;
}

/** The part of a Firestore client this write uses */
export interface ProfileWriteDb<Ref> {
  collection: (path: string) => { doc: (id: string) => Ref };
  runTransaction: <T>(fn: (tx: ProfileTransaction<Ref>) => Promise<T>) => Promise<T>;
}

/** Merges the profile into {collection}/{userId}; false when it was dropped for an erased person */
export async function writeProfileUnlessErased<Ref>(
  db: ProfileWriteDb<Ref>,
  collection: string,
  userId: string,
  profile: unknown
): Promise<boolean> {
  const record = db.collection(USER_RECORDS).doc(userId);
  const ref = db.collection(collection).doc(userId);
  return db.runTransaction(async (tx) => {
    const [user, existing] = await Promise.all([tx.get(record), tx.get(ref)]);
    const erasing = user.exists && isErasedOrErasing(user);
    if (erasing || (!user.exists && !existing.exists)) return false;
    tx.set(ref, profile, { merge: true });
    return true;
  });
}
