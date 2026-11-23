/**
 * Merges learned data into a person's own user record, bogle_users/{userId} (#4293).
 *
 * learnTemporalPattern read the record, then merged into it in a separate write. For a caller
 * with no record (a try-first visitor's `device:demo_…` id, told nothing is kept) that write
 * created one holding only `temporalPatterns`; for an account erased between the read and the
 * write it brought the record back.
 *
 * With LEARNING_OWNER_GATE on, the read and the write are one transaction, and nothing is
 * written when the record is missing, erased or being erased (isErasedOrErasing). Off, it is
 * the old read-then-merge.
 *
 * @module intelligence/context-builders/intelligence/merge-into-user-record
 */

import { flagOn } from '../../../config/env-flag.js';
import { isErasedOrErasing } from '../../../utils/erasing-mark.js';

type Stored = Record<string, unknown> | undefined;

/** Merges `update(stored)` into the record; false when it was not written (flag on only). */
export async function mergeIntoUserRecord(
  db: FirebaseFirestore.Firestore,
  userId: string,
  update: (stored: Stored) => Record<string, unknown>
): Promise<boolean> {
  const ref = db.collection('bogle_users').doc(userId);
  if (!flagOn('LEARNING_OWNER_GATE')) {
    const doc = await ref.get();
    await ref.set(update(doc.data() as Stored), { merge: true });
    return true;
  }
  return db.runTransaction(async (tx) => {
    const record = await tx.get(ref);
    if (isErasedOrErasing(record)) return false;
    tx.set(ref, update(record.data() as Stored), { merge: true });
    return true;
  });
}
