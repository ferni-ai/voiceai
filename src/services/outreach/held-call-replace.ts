/**
 * The owner's call-now taking over a held call (CALL_NOW_OWNER_OVERRIDE), without two rings.
 *
 * The deferred-calls job claims a due held call pending → placing in a
 * transaction (scheduling/due-items.ts) and then dials it. A call-now marks
 * the same held call superseded the same way, in a transaction, only while it
 * is still pending, and BEFORE its own call dials. Whichever claims first
 * dials; the other doesn't (#2849 review: marking it after the dial, with a
 * plain write, let both ring).
 *
 * Only the one held call: this requester's (bogle_users/{uid}/deferred_calls)
 * to this number. Other numbers for the same person, and other requesters'
 * calls, are never touched.
 *
 * @module services/outreach/held-call-replace
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HeldCallReplace' });

const COLLECTION = 'deferred_calls';

async function heldCallRef(userId: string, id: string) {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available to replace the held call');
  return { db, ref: db.collection('bogle_users').doc(userId).collection(COLLECTION).doc(id) };
}

/**
 * Take this held call for a call-now: pending → superseded, in one transaction.
 * False when it is no longer pending (the job claimed it: it's ringing or rang).
 * A failed transaction throws, so nothing dials on a doubt.
 */
export async function claimHeldCall(userId: string, id: string): Promise<boolean> {
  const { db, ref } = await heldCallRef(userId, id);
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== 'pending') return false;
    tx.update(ref, { status: 'superseded', supersededAt: new Date().toISOString() });
    return true;
  });
}

/** Record which call replaced it, once that call is placed or held anew. */
export async function markReplacedBy(userId: string, id: string, by: string): Promise<void> {
  try {
    const { ref } = await heldCallRef(userId, id);
    await ref.update({ supersededBy: by });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not note what replaced the held call');
  }
}

/** The call-now failed before anything rang: the held call is pending again, so it still rings. */
export async function releaseHeldCall(userId: string, id: string): Promise<void> {
  try {
    const { db, ref } = await heldCallRef(userId, id);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (fresh.data()?.status === 'superseded') tx.update(ref, { status: 'pending' });
    });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not put the held call back');
  }
}

/** What to say when the job claimed the held call first: no second call was dialed. */
export function alreadyRingingReply(contactName: string): string {
  return (
    `Nothing new was dialed: the call to ${contactName} that was set for later is already ` +
    `being placed, so it's ringing now or just rang. No second call was set up; tell the ` +
    `caller it's on its way.`
  );
}
