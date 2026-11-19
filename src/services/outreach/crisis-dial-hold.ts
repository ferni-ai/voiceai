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
 * - A deferral of a call that already noted risk is refused.
 * - The dial job never dials a deferral with no originating call; it stays pending.
 *
 * Proactive calls ring the owner, not someone else, and carry no call id: never held here. The
 * background executor's half is executors/crisis-dial-check.ts. Logs counts and enums only.
 *
 * @module services/outreach/crisis-dial-hold
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn } from '../../config/env-flag.js';
import { crisisRiskNoted, onCrisisRiskNoted } from '../safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisDialHold' });

type Env = Record<string, string | undefined>;

const holdOn = (env: Env): boolean => flagOn('CRISIS_DIAL_HOLD', env);

const COLLECTION = 'deferred_calls';
/** Calls whose deferrals this agent wrote, at most this many (the oldest leaves first). */
const CALL_ROOM = 1024;

/** Originating call → the requester whose deferrals it made. */
const deferredOn = new Map<string, string>();

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
 * remembered so a later risk cancels it.
 */
export function watchDeferral(userId: string, call: HeldCall, env: Env = process.env): void {
  const origin = originOf(call);
  if (!holdOn(env) || !origin) return;
  if (crisisRiskNoted(origin)) {
    log.info({ outcome: 'crisis_hold_at_dial', at: 'defer' }, 'CRISIS_DIAL_HOLD');
    throw new DialHeld();
  }
  deferredOn.delete(origin);
  deferredOn.set(origin, userId);
  if (deferredOn.size > CALL_ROOM) deferredOn.delete(deferredOn.keys().next().value as string);
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
  const userId = deferredOn.get(sessionId);
  if (!userId) return; // remembered only with the flag on (watchDeferral)
  deferredOn.delete(sessionId);
  void cancelDeferralsOf(userId, sessionId);
});

/**
 * The dial job: a claimed deferral with no originating call is not dialed. It goes back to
 * pending, never deleted; past the job's late window it is marked missed, as any call is.
 */
export async function keptForNoOrigin(
  db: Firestore,
  item: { id: string; userId: string; data: Record<string, unknown> },
  env: Env = process.env
): Promise<boolean> {
  if (!holdOn(env) || item.data.kind !== 'on_behalf' || originOf(item.data)) return false;
  const doc = db.collection('bogle_users').doc(item.userId).collection(COLLECTION).doc(item.id);
  await doc.set({ ...item.data, status: 'pending' });
  log.info({ outcome: 'no_origin_call' }, 'CRISIS_DIAL_HOLD');
  return true;
}
