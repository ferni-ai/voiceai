/**
 * CRISIS_DIAL_HOLD (off by default, #4187): a deferred call confirmed on a call never dials once
 * that call notes crisis risk.
 *
 * The consent gate holds new outbound actions for the rest of a call once a crisis is read, but a
 * call confirmed before the crisis line and deferred to the recipient's hours still dialed later.
 * The deferred dial runs on the API server, where the call's crisis state (crisis-call-risk.ts, in
 * the agent's memory) can't be read, so the hold is made where it can be: in the agent.
 *
 * - A deferral remembers its originating call (request.originalSessionId). When that call notes
 *   risk, its pending deferrals are cancelled with the status a user cancel gives ('cancelled'),
 *   off the reply path, retried once. Nothing names the crisis or the line.
 * - A deferral of a call that already noted risk is refused, and so is one whose call noted it
 *   while the deferral was being written (settleDeferral cancels the written doc, retried once,
 *   and deletes it when both cancels fail). Either way the deferral is refused.
 * - A call is watched until its last deferral can no longer dial (its time plus the dial job's
 *   late window); when CALL_ROOM calls are still watched, a new deferral is refused rather than
 *   one left unwatched.
 * - The dial job never dials a deferral with no originating call (it stays pending), nor one whose
 *   call noted risk in this process (it is cancelled): heldAtDial.
 *
 * Proactive calls ring the owner, not someone else, and carry no call id: never held here. The
 * background executor's half is executors/crisis-dial-check.ts. Logs counts and enums only.
 *
 * @module services/outreach/crisis-dial-hold
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn } from '../../config/env-flag.js';
import { crisisRiskNoted, onCrisisRiskNoted } from '../safety/index.js';
import { safeSet } from '../../utils/safe-firestore.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisDialHold' });

type Env = Record<string, string | undefined>;

const holdOn = (env: Env): boolean => flagOn('CRISIS_DIAL_HOLD', env);

const COLLECTION = 'deferred_calls';
/** Calls whose deferrals this agent watches, at most this many: past it, a deferral is refused. */
const CALL_ROOM = 1024;

/** Originating call → the requester whose deferrals it made, and when the last can no longer dial. */
const deferredOn = new Map<string, { userId: string; until: number }>();

/**
 * Watch `origin`'s deferrals until `until` (ms), the latest any of them can dial. Calls past
 * theirs are let go (at most CALL_ROOM to look at); false when CALL_ROOM are still watched.
 */
function remember(origin: string, userId: string, until: number): boolean {
  const now = Date.now();
  const kept = deferredOn.get(origin)?.until ?? 0;
  deferredOn.delete(origin);
  for (const [call, watch] of deferredOn) if (watch.until < now) deferredOn.delete(call);
  if (deferredOn.size >= CALL_ROOM) return false;
  deferredOn.set(origin, { userId, until: Math.max(kept, until) });
  return true;
}

/** The parts of a deferral, written or stored, this module reads. */
interface HeldCall {
  kind?: unknown;
  request?: unknown;
}

/** The call an on-behalf deferral was confirmed on; none for a proactive call or a legacy one. */
function originOf({ kind, request }: HeldCall): string | undefined {
  if (kind !== 'on_behalf' || typeof request !== 'object' || request === null) return undefined;
  const id = 'originalSessionId' in request ? request.originalSessionId : undefined;
  return typeof id === 'string' && id ? id : undefined;
}

/** Thrown when a call that noted risk would be deferred: nothing is written, nothing rings. */
class DialHeld extends Error {
  constructor() {
    super('Call not placed');
    this.name = 'DialHeld';
  }
}

/**
 * Before a deferral is written: refused when its call already noted risk, else its call is
 * remembered until `until` (ms: the deferral's time plus the dial job's late window), so a later
 * risk cancels it.
 */
export function watchDeferral(
  userId: string,
  call: HeldCall,
  until: number,
  env: Env = process.env
): void {
  const origin = originOf(call);
  if (!holdOn(env) || !origin) return;
  if (crisisRiskNoted(origin)) {
    log.info({ outcome: 'crisis_hold_at_dial', at: 'defer' }, 'CRISIS_DIAL_HOLD');
    throw new DialHeld();
  }
  if (!remember(origin, userId, until)) {
    log.warn({ outcome: 'crisis_hold_room_full', watched: deferredOn.size }, 'CRISIS_DIAL_HOLD');
    throw new DialHeld();
  }
}

/** One pending deferral, cancelled only while still pending: a call already taken is not. */
async function cancelIfPending(
  db: Firestore,
  ref: DocumentReference,
  at: string
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== 'pending') return false;
    tx.update(ref, { status: 'cancelled', cancelledAt: at });
    return true;
  });
}

/** Cancel the written doc, retried once; when both fail, delete it. False: it may still be there. */
async function undoWritten(db: Firestore, ref: DocumentReference, at: string): Promise<boolean> {
  for (const attempt of [1, 2]) {
    try {
      // eslint-disable-next-line no-await-in-loop -- a retry: the second try waits on the first
      await cancelIfPending(db, ref, at);
      return true;
    } catch {
      log.warn({ outcome: 'cancel_failed', attempt, at: 'written' }, 'CRISIS_DIAL_HOLD');
    }
  }
  try {
    await ref.delete();
    log.warn({ outcome: 'deleted', deferral: ref.id, at: 'written' }, 'CRISIS_DIAL_HOLD');
    return true;
  } catch {
    log.error({ outcome: 'delete_failed', deferral: ref.id, at: 'written' }, 'CRISIS_DIAL_HOLD');
    return false;
  }
}

/**
 * After a deferral is written: risk its call noted while the write was landing found no doc to
 * cancel then. The written doc is cancelled (or deleted), and the deferral is always refused,
 * whether or not that worked.
 */
export async function settleDeferral(
  db: Firestore,
  userId: string,
  id: string,
  call: HeldCall,
  env: Env = process.env
): Promise<void> {
  const origin = originOf(call);
  if (!holdOn(env) || !origin || !crisisRiskNoted(origin)) return;
  const ref = db.collection('bogle_users').doc(userId).collection(COLLECTION).doc(id);
  const undone = await undoWritten(db, ref, new Date().toISOString());
  log.info({ outcome: 'crisis_hold_at_dial', at: 'written', undone }, 'CRISIS_DIAL_HOLD');
  throw new DialHeld();
}

async function cancelOnce(userId: string, origin: string, now: Date): Promise<number> {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection(COLLECTION)
    .where('status', '==', 'pending')
    .get();
  const mine = snap.docs.filter((doc) => originOf(doc.data()) === origin);
  const done = await Promise.all(
    mine.map(async (doc) => cancelIfPending(db, doc.ref, now.toISOString()))
  );
  return done.filter(Boolean).length;
}

/** Cancel the pending deferrals `origin` made, retried once. Never throws. */
async function cancelDeferralsOf(userId: string, origin: string, attempt = 1): Promise<void> {
  try {
    const cancelled = await cancelOnce(userId, origin, new Date());
    log.info({ outcome: 'crisis_hold_at_dial', at: 'deferred', cancelled }, 'CRISIS_DIAL_HOLD');
  } catch {
    log.warn({ outcome: 'cancel_failed', attempt }, 'CRISIS_DIAL_HOLD');
    if (attempt < 2) await cancelDeferralsOf(userId, origin, attempt + 1);
  }
}

// Risk noted on a call that deferred a call here: its deferrals are cancelled, never awaited.
onCrisisRiskNoted((sessionId) => {
  const userId = deferredOn.get(sessionId)?.userId;
  if (!userId) return; // remembered only with the flag on (watchDeferral)
  deferredOn.delete(sessionId);
  void cancelDeferralsOf(userId, sessionId);
});

/**
 * The dial job, right before it dials a claimed deferral:
 * - with no originating call, it is not dialed. It goes back to pending, never deleted; past the
 *   job's late window it is marked missed, like every late call.
 * - when its call noted risk (read in this process), it is cancelled, as a user cancel is. This
 *   holds it even when the cancel at risk time failed or the call was no longer watched.
 * Held either way, even when that write fails: the doc stays claimed, never dialed.
 */
export async function heldAtDial(
  db: Firestore,
  item: { id: string; userId: string; data: Record<string, unknown> },
  env: Env = process.env
): Promise<boolean> {
  if (!holdOn(env) || item.data.kind !== 'on_behalf') return false;
  const origin = originOf(item.data);
  if (origin && !crisisRiskNoted(origin)) return false;
  const doc = db.collection('bogle_users').doc(item.userId).collection(COLLECTION).doc(item.id);
  const kept = origin
    ? { ...item.data, status: 'cancelled', cancelledAt: new Date().toISOString() }
    : { ...item.data, status: 'pending' };
  const outcome = origin ? 'crisis_hold_at_dial' : 'no_origin_call';
  try {
    await safeSet(doc, kept);
    log.info({ outcome, at: 'dial' }, 'CRISIS_DIAL_HOLD');
  } catch {
    log.error({ outcome, at: 'dial', write: 'failed', deferral: item.id }, 'CRISIS_DIAL_HOLD');
  }
  return true;
}
