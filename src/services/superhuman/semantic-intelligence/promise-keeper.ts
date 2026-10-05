/**
 * Promise outcomes: kept when Ferni delivers, missed when the due time passes.
 *
 * A promise with a due time is stored 'open' (ferni_commitments). It ends one
 * of three ways, exactly once:
 * - kept: the reminder went out (reminder-delivery-job), or Ferni asked about
 *   it in conversation (follow-through.ts);
 * - missed: its due time passed without that, found by sweepOverduePromises,
 *   which the every-minute deliver-reminders job runs. A missed promise stays
 *   missed, and Ferni owns it once in her next conversation;
 * - released: the user let Ferni off (cancelled or deleted the reminder);
 * - unknown: made before outcomes were tracked, so nobody can say (see
 *   legacy-promises.ts). Not counted by Trust, never owned as a miss.
 *
 * Trust's "I follow through" factor counts only kept and missed.
 *
 * @module services/superhuman/semantic-intelligence/promise-keeper
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../firestore-utils.js';
import { MISSED_AFTER_MS } from '../../scheduling/reminder-delivery-job.js';
import { settleLegacyPromises, type LegacyPassResult } from './legacy-promises.js';
import {
  clearCommitmentCache,
  createCommitment,
  formatCommitmentsForContext,
  getAllCommitments,
  getAvoidanceTopics,
  getPendingCommitments,
  type FerniCommitment,
} from './ferni-commitments.js';

const log = createLogger({ module: 'promise-keeper' });

type Outcome = 'kept' | 'missed' | 'released' | 'unknown';
type Db = NonNullable<ReturnType<typeof getFirestoreDb>>;
type Ref = FirebaseFirestore.DocumentReference;

/** Misses from this long ago are owned; older ones are left in the past. */
const OWN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** One voice call: misses offered at its start stay in context for the call. */
const SESSION_MS = 2 * 60 * 60 * 1000;

function promisesOf(db: Db, userId: string): FirebaseFirestore.CollectionReference {
  return db.collection('bogle_users').doc(userId).collection('ferni_commitments');
}

function settlement(outcome: Outcome, how: string, now: Date): Record<string, unknown> {
  const at = now.toISOString();
  if (outcome === 'kept') return { outcome, fulfilled: true, fulfilledAt: at, fulfilledHow: how };
  if (outcome === 'missed') return { outcome, violated: true, violatedAt: at, missedReason: how };
  if (outcome === 'unknown') return { outcome, unknownAt: at, unknownReason: how };
  return { outcome, releasedAt: at, releasedHow: how };
}

/** Settle one promise if it is still open. False when something settled it first. */
async function settle(
  db: Db,
  ref: Ref,
  outcome: Outcome,
  how: string,
  now: Date
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.outcome !== 'open') return false;
    tx.update(ref, settlement(outcome, how, now));
    return true;
  });
}

/**
 * Ferni just promised to remind the user: record it, due when the reminder is
 * (plus the delivery job's grace). Never throws: the reminder itself is already set.
 */
export async function recordReminderPromise(
  userId: string,
  reminder: { id: string; message: string; scheduledFor: Date }
): Promise<FerniCommitment | null> {
  if (!userId || userId === 'anonymous' || userId === 'unknown') return null;
  try {
    return await createCommitment(userId, {
      type: 'remind',
      commitment: `I'll remind you: ${reminder.message}`,
      context: reminder.message,
      dueBy: new Date(reminder.scheduledFor.getTime() + MISSED_AFTER_MS),
      reminderId: reminder.id,
    });
  } catch (error) {
    log.error(
      { error: String(error), reminderId: reminder.id },
      'Could not record a reminder promise'
    );
    return null;
  }
}

/**
 * Settle the promise behind a reminder, if Ferni made one (reminders set from
 * the web or by a family member carry none). True when this call settled it.
 */
export async function settleReminderPromise(
  userId: string,
  reminderId: string,
  outcome: Outcome,
  how: string,
  now: Date = new Date()
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const snap = await promisesOf(db, userId).where('reminderId', '==', reminderId).limit(1).get();
  const doc = snap.docs.at(0);
  if (doc === undefined) return false;
  const settled = await settle(db, doc.ref, outcome, how, now);
  if (settled) clearCommitmentCache(userId);
  return settled;
}

/** What became of an overdue promise: a reminder promise follows its reminder. */
async function verdictFor(
  db: Db,
  owner: string,
  data: Record<string, unknown>
): Promise<[Outcome, string]> {
  // Adopted from before outcomes were tracked: part of its window went unwatched.
  if (data.legacy === true) return ['unknown', 'made before promise outcomes were tracked'];
  if (data.type !== 'remind' || typeof data.reminderId !== 'string') {
    return ['missed', 'due time passed without a follow-up'];
  }
  const reminder = await db
    .collection('bogle_users')
    .doc(owner)
    .collection('reminders')
    .doc(data.reminderId)
    .get();
  const status: unknown = reminder.exists ? reminder.data()?.status : undefined;
  if (status === 'delivered') return ['kept', 'reminder delivered'];
  if (status === 'cancelled') return ['released', 'reminder cancelled'];
  if (status === undefined) return ['released', 'reminder deleted'];
  return ['missed', `reminder ${String(status)}`];
}

export interface PromiseSweepResult {
  overdue: number;
  kept: number;
  missed: number;
  released: number;
  unknown: number;
  /** This run's page of the one-time legacy pass (absent once it has finished). */
  legacy?: LegacyPassResult;
  legacyError?: string;
}

/**
 * The broken-promise check: every open promise whose due time has passed is
 * settled now. Run by the deliver-reminders job after it sends what's due.
 */
export async function sweepOverduePromises(
  opts: { now?: Date; limit?: number } = {}
): Promise<PromiseSweepResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const now = opts.now ?? new Date();
  // dueBy is stored as an ISO string (cleanForFirestore), so string order is time order.
  // Needs the collection-group index (outcome, dueBy) in firestore.indexes.json.
  const snap = await db
    .collectionGroup('ferni_commitments')
    .where('outcome', '==', 'open')
    .where('dueBy', '<=', now.toISOString())
    .orderBy('dueBy')
    .limit(opts.limit ?? 100)
    .get();
  const result: PromiseSweepResult = {
    overdue: snap.size,
    kept: 0,
    missed: 0,
    released: 0,
    unknown: 0,
  };
  for (const doc of snap.docs) {
    // Owner from the path, never the doc's userId field (data, not identity).
    const owner = doc.ref.parent.parent?.id;
    if (!owner) continue;
    const [outcome, how] = await verdictFor(db, owner, doc.data());
    if (!(await settle(db, doc.ref, outcome, how, now))) continue;
    result[outcome]++;
    clearCommitmentCache(owner);
  }
  // Promises from before outcomes existed: one page a run until the pass is done.
  try {
    const legacy = await settleLegacyPromises(db, now);
    if (legacy) result.legacy = legacy;
  } catch (error) {
    result.legacyError = String(error);
    log.error({ error: String(error) }, 'Legacy promise pass failed; the next run retries');
  }
  if (result.overdue > 0) log.info(result, 'Overdue promises settled');
  return result;
}

const offeredMisses = new Map<string, { at: number; misses: FerniCommitment[] }>();

/**
 * Recent misses Ferni hasn't owned yet. Each is offered in one conversation
 * only (marked ownOfferedAt), so she says sorry once, not every call.
 */
export async function getMissesToOwn(
  userId: string,
  now: Date = new Date()
): Promise<FerniCommitment[]> {
  const cached = offeredMisses.get(userId);
  if (cached && now.getTime() - cached.at < SESSION_MS) return cached.misses;
  const misses = (await getAllCommitments(userId))
    .filter(
      (c) =>
        c.outcome === 'missed' &&
        !c.ownOfferedAt &&
        c.violatedAt !== undefined &&
        now.getTime() - new Date(c.violatedAt).getTime() < OWN_WINDOW_MS
    )
    .slice(0, 2);
  offeredMisses.set(userId, { at: now.getTime(), misses });
  const db = getFirestoreDb();
  if (db && misses.length > 0) {
    try {
      await Promise.all(
        misses.map(async (m) =>
          promisesOf(db, userId).doc(m.id).update({ ownOfferedAt: now.toISOString() })
        )
      );
    } catch (error) {
      // Still own it this call; a later call may offer it again.
      log.warn({ error: String(error), userId }, 'Could not mark missed promises as offered');
    }
  }
  return misses;
}

/** A context hint to own a missed promise, warmly and once. Empty when there are none. */
export function formatMissesForContext(misses: readonly FerniCommitment[]): string {
  if (misses.length === 0) return '';
  return [
    "PROMISES YOU DIDN'T KEEP - own it once, early, warmly and briefly (no excuses, no groveling):",
    ...misses.map((m) => `- You said "${m.commitment}" (about: ${m.context.slice(0, 80)})`),
    "For example: \"I said I'd check in Tuesday and I didn't. I'm sorry.\" Then let them lead.",
  ].join('\n');
}

/** Ferni's promises for the prompt: what's pending, what to avoid, and misses to own. */
export async function buildPromiseContext(userId: string): Promise<string> {
  const [pending, avoidance, misses] = await Promise.all([
    getPendingCommitments(userId),
    getAvoidanceTopics(userId),
    getMissesToOwn(userId),
  ]);
  return [formatCommitmentsForContext(pending, avoidance), formatMissesForContext(misses)]
    .filter(Boolean)
    .join('\n');
}

/** Test seam: forget which misses were offered in this process. */
export function resetOfferedMisses(): void {
  offeredMisses.clear();
}
