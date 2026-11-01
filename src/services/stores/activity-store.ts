/**
 * Firestore store for the activity ledger: bogle_users/{uid}/activity/{id}, with
 * an append-only log at .../events/{seq} (recall-ledger plan, sections 1 and 2).
 *
 * recordActivity is the only writer. It creates a record, or updates one only if
 * the stored revision is still the one the caller read (compare-and-set), and
 * appends exactly one event in the same transaction, so the record and its log
 * can't disagree. It runs in the caller's own transaction when given one, so a
 * producer's write and its ledger record commit or roll back together. A retry
 * with the same idempotency key changes nothing. Logs carry ids and counts only.
 * Everything is a no-op while ACTIVITY_LEDGER is off.
 *
 * @module services/stores/activity-store
 */

import { createHash, randomUUID } from 'crypto';
import type { DocumentReference, Firestore, Query, Transaction } from '@google-cloud/firestore';
import { activityLedgerEnabled } from '../../config/activity-ledger-flag.js';
import type { Env } from '../../config/env-flag.js';
import type {
  Activity,
  ActivityChange,
  ActivityEvent,
  ActivityKind,
  ActivityState,
} from '../activity/activity.js';
import { applyChange, type Refusal } from '../activity/activity-change.js';
import { subjectKey, toActivity } from '../activity/activity-parse.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'activity-store' });

/** The app's Firestore (runs its own transaction), or the caller's transaction on it. */
export type LedgerTarget = Firestore | { readonly db: Firestore; readonly tx: Transaction };

export type RecordResult =
  | { readonly ok: true; readonly activity: Activity; readonly duplicate: boolean }
  | {
      readonly ok: false;
      readonly reason: Refusal | 'disabled' | 'not_member' | 'stale' | 'unreadable';
    };

const UID = /^[\w:.@+-]{1,200}$/;
/**
 * True for a member's own ledger. Never an on-behalf call's third party, an
 * anonymous caller or a placeholder: their ledger would be read by nobody, or by
 * the wrong person. Throws on an id that would address another path.
 */
const memberLedger = (uid: string): boolean => {
  if (!UID.test(uid)) throw new Error('activity ledger: refusing an invalid user id');
  return isMemberIdentity(uid);
};

const ACTIVITY_ID = /^[\w-]{1,200}$/;

/** Throws on an id that would address another path (a nested event doc, say). */
export const activityDoc = (db: Firestore, uid: string, id: string): DocumentReference => {
  if (!ACTIVITY_ID.test(id)) throw new Error('activity ledger: refusing an invalid activity id');
  return db.collection('bogle_users').doc(uid).collection('activity').doc(id);
};

/** One id per idempotency key, so a retried create finds the record it made. */
const idFor = (change: ActivityChange): string =>
  change.op === 'update'
    ? change.id
    : (change.id ??
      (change.key
        ? createHash('sha256').update(change.key).digest('hex').slice(0, 20)
        : randomUUID().replace(/-/g, '').slice(0, 20)));

const seqId = (seq: number): string => String(seq).padStart(6, '0');

async function write(
  db: Firestore,
  tx: Transaction,
  uid: string,
  change: ActivityChange,
  expectedRevision: number | undefined
): Promise<RecordResult> {
  const id = idFor(change);
  const ref = activityDoc(db, uid, id);
  const snap = await tx.get(ref);
  const at = (change.at ?? new Date()).toISOString();
  const current = snap.exists ? toActivity(id, snap.data()) : null;
  if (snap.exists && !current) {
    // Not a shape this build wrote: keep it as it is, flagged for a person to look at
    tx.set(ref, { ...snap.data(), quarantined: { at, source: change.source } });
    log.warn({ uid, activityId: id }, 'Quarantined an activity record');
    return { ok: false, reason: 'unreadable' };
  }
  if (change.key && current?.appliedKeys.includes(change.key)) {
    return { ok: true, activity: current, duplicate: true };
  }
  if (expectedRevision !== undefined && (current?.revision ?? 0) !== expectedRevision) {
    return { ok: false, reason: 'stale' };
  }
  const applied = applyChange(current, change, id, at);
  if (typeof applied === 'string') return { ok: false, reason: applied };
  const { id: _id, ...stored } = applied.next;
  tx.set(ref, stored);
  tx.set(ref.collection('events').doc(seqId(applied.event.seq)), applied.event);
  return { ok: true, activity: applied.next, duplicate: false };
}

/**
 * The only way to write the ledger. In a caller's transaction, call it after the
 * caller's reads and before its writes (Firestore reads come before writes).
 * `expectedRevision` is the revision the caller read (0 for "must not exist yet").
 */
export async function recordActivity(
  target: LedgerTarget,
  uid: string,
  change: ActivityChange,
  expectedRevision?: number,
  env: Env = process.env
): Promise<RecordResult> {
  if (!activityLedgerEnabled(env)) return { ok: false, reason: 'disabled' };
  if (!memberLedger(uid)) return { ok: false, reason: 'not_member' };
  const result =
    'tx' in target
      ? await write(target.db, target.tx, uid, change, expectedRevision)
      : await target.runTransaction(async (tx) => write(target, tx, uid, change, expectedRevision));
  if (!result.ok) {
    log.info({ uid, op: change.op, source: change.source, reason: result.reason }, 'Refused');
  }
  return result;
}

export async function getActivity(
  db: Firestore,
  uid: string,
  id: string,
  env: Env = process.env
): Promise<Activity | null> {
  if (!activityLedgerEnabled(env) || !memberLedger(uid)) return null;
  const snap = await activityDoc(db, uid, id).get();
  const a = snap.exists ? toActivity(id, snap.data()) : null;
  if (snap.exists && !a) log.warn({ uid, activityId: id }, 'Skipped an unreadable activity record');
  return a;
}

export interface ActivityQuery {
  readonly subject?: { readonly contactId?: string; readonly name?: string };
  readonly since?: Date;
  readonly states?: readonly ActivityState[];
  readonly kinds?: readonly ActivityKind[];
  readonly limit: number;
}

/** Newest first by updatedAt. Kinds filter in memory over a bounded overfetch. */
export async function listActivity(
  db: Firestore,
  uid: string,
  q: ActivityQuery,
  env: Env = process.env
): Promise<Activity[]> {
  if (!activityLedgerEnabled(env) || !memberLedger(uid)) return [];
  const limit = Math.max(1, Math.min(q.limit, 200));
  let query = db.collection('bogle_users').doc(uid).collection('activity') as Query;
  const key = q.subject ? subjectKey(q.subject) : undefined;
  if (key) query = query.where('subjectKeys', 'array-contains', key);
  if (q.states && q.states.length > 0) query = query.where('state', 'in', [...q.states]);
  if (q.since) query = query.where('updatedAt', '>=', q.since.toISOString());
  const kinds = q.kinds && q.kinds.length > 0 ? q.kinds : null;
  const fetch = kinds ? Math.min(limit * 4, 500) : limit;
  const snap = await query.orderBy('updatedAt', 'desc').limit(fetch).get();
  const rows = snap.docs.flatMap((d) => {
    const a = toActivity(d.id, d.data());
    if (!a) log.warn({ uid, activityId: d.id }, 'Skipped an unreadable activity record');
    return a ? [a] : [];
  });
  return rows.filter((a) => !kinds || kinds.includes(a.kind)).slice(0, limit);
}

/** The event log of one record, oldest first. */
export async function activityEvents(
  db: Firestore,
  uid: string,
  id: string,
  env: Env = process.env
): Promise<ActivityEvent[]> {
  if (!activityLedgerEnabled(env) || !memberLedger(uid)) return [];
  const snap = await activityDoc(db, uid, id).collection('events').orderBy('seq').get();
  return snap.docs.map((d) => d.data() as ActivityEvent);
}
