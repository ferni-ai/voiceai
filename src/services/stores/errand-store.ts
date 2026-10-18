/**
 * Firestore store for errands: bogle_users/{uid}/errands/{id}, with an
 * append-only log at .../events and the effect outbox at .../effects/{idemKey}.
 *
 * Implements the errands context's ErrandStore port (services/errands/ports.ts).
 * - save() writes only if the stored copy still has the updatedAt the caller
 *   read (same contract as FollowUpStore.save), and appends the step's events
 *   and queues its effects as pending in the same transaction: a lost update
 *   writes nothing, and an effect is on record before anything runs it.
 * - Reads drop documents that don't look like an errand (logged).
 *
 * @module services/stores/errand-store
 */

import { randomUUID } from 'crypto';
import type {
  CollectionReference,
  DocumentReference,
  Firestore,
  Transaction,
} from '@google-cloud/firestore';
import { errandsEnabled } from '../../config/errands-flag.js';
import type { Env } from '../../config/env-flag.js';
import {
  CLOSED_STATES,
  type Approval,
  type Candidate,
  type Errand,
  type ErrandEvent,
  type ErrandState,
  type ErrandStore,
  type Outcome,
  type OutboxEffect,
} from '../errands/index.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'errand-store' });

const KINDS = new Set(['appointment', 'reservation', 'inquiry', 'purchase-research', 'custom']);
const STATES = ['planning', 'awaiting_owner', 'acting', 'waiting', 'verifying', 'scheduled'];
const OPEN: ErrandState[] = STATES as ErrandState[];
const ALL_STATES = new Set([...STATES, ...CLOSED_STATES]);
const VERBS = new Set(['call', 'book', 'text', 'schedule', 'next']);
const CANDIDATE = new Set([
  ...['new', 'calling', 'retry', 'texted', 'offered', 'booked'],
  ...['needs_owner', 'declined', 'exhausted', 'cancelled'],
]);
const OUTCOMES = new Set([
  'booked',
  'offered',
  'declined',
  'no_answer',
  'voicemail',
  'needs_owner',
]);
const LINES = new Set(['landline', 'mobile', 'voip', 'unknown']);

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);
const opt = (o: Record<string, unknown>, k: string): Record<string, string> =>
  typeof o[k] === 'string' ? { [k]: o[k] as string } : {};

function approvalOf(x: unknown): Approval | null {
  if (!isRecord(x) || !VERBS.has(String(x.verb)) || !Array.isArray(x.placeIds)) return null;
  if (!x.placeIds.every((p) => typeof p === 'string')) return null;
  return { verb: x.verb as Approval['verb'], placeIds: x.placeIds as string[] };
}

function candidateOf(x: unknown): Candidate[] {
  if (!isRecord(x) || !CANDIDATE.has(String(x.status)) || typeof x.attempts !== 'number') return [];
  const [placeId, name, phone, why] = [x.placeId, x.name, x.phone, x.why].map(str);
  if (!placeId || name === undefined || phone === undefined || why === undefined) return [];
  const hours = isRecord(x.hours) && str(x.hours.open) && str(x.hours.close) ? x.hours : null;
  const approval = approvalOf(x.approval);
  return [
    {
      placeId,
      name,
      phone,
      why,
      status: x.status as Candidate['status'],
      attempts: x.attempts,
      ...(LINES.has(String(x.lineType)) ? { lineType: x.lineType as Candidate['lineType'] } : {}),
      ...(hours ? { hours: { open: String(hours.open), close: String(hours.close) } } : {}),
      ...(typeof x.lineChecked === 'boolean' ? { lineChecked: x.lineChecked } : {}),
      ...(approval ? { approval } : {}),
    },
  ];
}

function outcomeOf(x: unknown): Outcome | undefined {
  if (!isRecord(x) || !OUTCOMES.has(String(x.status)) || !str(x.placeId)) return undefined;
  return {
    status: x.status as Outcome['status'],
    placeId: String(x.placeId),
    ...['when', 'confirmation', 'contactName', 'evidence', 'reason'].reduce(
      (o, k) => ({ ...o, ...opt(x, k) }),
      {}
    ),
    ...(typeof x.readBack === 'boolean' ? { readBack: x.readBack } : {}),
  };
}

function constraintsOf(c: Record<string, unknown>): Errand['constraints'] {
  const window = isRecord(c.window) ? { ...opt(c.window, 'from'), ...opt(c.window, 'to') } : null;
  return {
    prefs: Array.isArray(c.prefs) ? c.prefs.filter((p): p is string => typeof p === 'string') : [],
    ...(window ? { window } : {}),
    ...(typeof c.partySize === 'number' ? { partySize: c.partySize } : {}),
    ...opt(c, 'insurance'),
    ...(c.urgency === 'any-slot' || c.urgency === 'normal' ? { urgency: c.urgency } : {}),
  };
}

/** A stored document as an errand, or null if it isn't one. */
export function toErrand(id: string, data: unknown): Errand | null {
  if (!isRecord(data)) return null;
  const s = ['userId', 'goal', 'zone', 'step', 'createdAt', 'updatedAt', 'env'].map((k) =>
    str(data[k])
  );
  const c = isRecord(data.constraints) ? data.constraints : null;
  if (s.some((x) => x === undefined) || !c || !KINDS.has(String(data.kind))) return null;
  if (!ALL_STATES.has(String(data.state)) || typeof data.stepVersion !== 'number') return null;
  const [userId, goal, zone, step, createdAt, updatedAt, env] = s as string[];
  const outcome = outcomeOf(data.outcome);
  return {
    id,
    userId,
    kind: data.kind as Errand['kind'],
    goal,
    zone,
    constraints: constraintsOf(c),
    state: data.state as ErrandState,
    step,
    stepVersion: data.stepVersion,
    nextWakeAt: str(data.nextWakeAt) ?? null,
    candidates: Array.isArray(data.candidates) ? data.candidates.flatMap(candidateOf) : [],
    pending: approvalOf(data.pending),
    approvals: Array.isArray(data.approvals)
      ? data.approvals.flatMap((a) => approvalOf(a) ?? [])
      : [],
    ...(outcome ? { outcome } : {}),
    ...opt(data, 'failedReason'),
    createdAt,
    updatedAt,
    ...opt(data, 'closedAt'),
    env,
  };
}

function parsed(docs: ReadonlyArray<{ id: string; data: () => unknown }>): Errand[] {
  return docs.flatMap((d) => {
    const e = toErrand(d.id, d.data());
    if (!e) log.warn({ docId: d.id }, 'Skipped an errand document that does not match the schema');
    return e ? [e] : [];
  });
}

export const newId = (): string => randomUUID().replace(/-/g, '').slice(0, 20);

const errandsOf = (db: Firestore, userId: string): CollectionReference =>
  db.collection('bogle_users').doc(userId).collection('errands');

/** errands/{errandId}/effects/{idemKey}: one effect in the outbox. */
export const effectDoc = (
  db: Firestore,
  k: { userId: string; errandId: string; idemKey: string }
): DocumentReference =>
  errandsOf(db, k.userId).doc(k.errandId).collection('effects').doc(k.idemKey);

/** A new outbox entry: pending, never tried, claimable from `at`. */
const queuedEffect = (e: Errand, f: OutboxEffect['effect'], at: string): OutboxEffect => ({
  ...{ idemKey: f.idemKey, userId: e.userId, errandId: e.id, kind: f.kind, effect: f },
  ...{ status: 'pending', attempts: 0, notBefore: at, updatedAt: at },
  ...{ leaseUntil: null, leaseId: null, providerRef: null },
});

export function createErrandStore(db: Firestore, makeId: () => string = newId): ErrandStore {
  const errands = (userId: string): CollectionReference => errandsOf(db, userId);

  function append(tx: Transaction, e: Errand, events: readonly ErrandEvent[]): void {
    const trail = errands(e.userId).doc(e.id).collection('events');
    const batch = makeId().slice(0, 6);
    events.forEach((ev, i) =>
      tx.set(trail.doc(`${e.updatedAt}-${String(i).padStart(3, '0')}-${batch}`), { ...ev })
    );
  }

  return {
    async create(n, now, stepVersion) {
      const at = now.toISOString();
      const e: Errand = {
        ...n,
        ...{ id: makeId(), state: 'planning', step: 'find', stepVersion, nextWakeAt: null },
        ...{ candidates: [], pending: null, approvals: [], createdAt: at, updatedAt: at },
      };
      await db.runTransaction(async (tx) => {
        tx.set(errands(e.userId).doc(e.id), e);
        append(tx, e, [{ type: 'decision', at, note: 'created' }]);
        return Promise.resolve();
      });
      return e;
    },

    async get(userId, id) {
      const snap = await errands(userId).doc(id).get();
      return snap.exists ? toErrand(id, snap.data()) : null;
    },

    async open(userId) {
      return parsed((await errands(userId).where('state', 'in', OPEN).get()).docs);
    },

    async due(now, limit) {
      const snap = await db
        .collectionGroup('errands')
        .where('state', 'in', OPEN)
        .where('nextWakeAt', '<=', now.toISOString())
        .orderBy('nextWakeAt')
        .limit(limit)
        .get();
      return parsed(snap.docs);
    },

    async save(next, expectedUpdatedAt, events = [], effects = []) {
      const ref = errands(next.userId).doc(next.id);
      const keys = effects.map(({ idemKey }) =>
        effectDoc(db, { userId: next.userId, errandId: next.id, idemKey })
      );
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? toErrand(next.id, snap.data()) : null;
        if (!current || current.updatedAt !== expectedUpdatedAt) return false;
        const queued = await Promise.all(keys.map(async (k) => tx.get(k)));
        tx.set(ref, next);
        append(tx, next, events);
        // The same idemKey is the same effect, already queued or run: never reset it.
        effects.forEach((f, i) => {
          if (!queued[i].exists) tx.set(keys[i], queuedEffect(next, f, next.updatedAt));
        });
        return true;
      });
    },

    async events(userId, id) {
      const snap = await errands(userId).doc(id).collection('events').get();
      return [...snap.docs]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => d.data() as ErrandEvent);
    },
  };
}

/**
 * The store on the app's Firestore, or null while ERRANDS is off or where
 * there is no Firestore (local dev without credentials).
 */
export function firestoreErrandStore(env: Env = process.env): ErrandStore | null {
  if (!errandsEnabled(env)) return null;
  const db = getFirestoreDb();
  return db ? createErrandStore(db) : null;
}
