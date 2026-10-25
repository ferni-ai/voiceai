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

/**
 * How long after the job takes a held call (placing) or places it a call-now
 * still counts as the same call. The job dials within seconds of claiming, and a
 * call rings and is answered or reaches voicemail within about a minute, so 5
 * minutes covers "it's ringing now or just rang" with room for a slow dial, but
 * a call-now a while after the held call rang is a new call and goes.
 */
export const JUST_RANG_MS = 5 * 60 * 1000;

const lastTen = (phone: unknown): string =>
  String(phone ?? '')
    .replace(/\D/g, '')
    .slice(-10);

/**
 * Whether this requester's held call to this number is being placed or was
 * placed in the last JUST_RANG_MS: a call-now then dials nothing (the job
 * took the call before the call-now read it). A failed read throws, so
 * nothing dials on a doubt.
 */
export async function heldCallJustRang(userId: string, phone: string, now: Date): Promise<boolean> {
  const want = lastTen(phone);
  if (want.length < 7) return false;
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available to check the held call');
  const calls = db.collection('bogle_users').doc(userId).collection(COLLECTION);
  const [placing, placed] = await Promise.all(
    (['placing', 'placed'] as const).map((status) => calls.where('status', '==', status).get())
  );
  const recent = (at: unknown) => now.getTime() - new Date(String(at)).getTime() <= JUST_RANG_MS;
  const sameNumber = (data: Record<string, unknown>) =>
    data.kind === 'on_behalf' &&
    lastTen((data.request as { resolvedContact?: { phone?: string } })?.resolvedContact?.phone) ===
      want;
  return (
    placing.docs.some((d) => sameNumber(d.data()) && recent(d.data().claimedAt)) ||
    placed.docs.some((d) => sameNumber(d.data()) && recent(d.data().placedAt))
  );
}

/** What to say when the job claimed the held call first: no second call was dialed. */
export function alreadyRingingReply(contactName: string): string {
  return (
    `Nothing new was dialed: the call to ${contactName} that was set for later is already ` +
    `being placed, so it's ringing now or just rang. No second call was set up; tell the ` +
    `caller it's on its way.`
  );
}
