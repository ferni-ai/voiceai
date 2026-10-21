/**
 * The errand effect outbox's leases: errands/{id}/effects/{idemKey}.
 *
 * ErrandStore.save puts each effect here as pending, in the same transaction
 * as the step that made it. A runner then:
 * - claims one under a lease. Each claim is one transaction that also reads
 *   the errand back: an effect whose errand has closed, or whose approval the
 *   errand no longer holds, is failed instead of run (cancel after queue means
 *   no dial);
 * - records the provider's id (call or message SID) the moment it has one,
 *   which also renews the lease for a long call;
 * - completes it, or fails it.
 *
 * A runner that dies frees the effect when its lease runs out. Anything but a
 * lookup may already have reached a person, so it comes back as
 * needs_provider_check, and from then on it never goes back to pending.
 *
 * @module services/stores/errand-outbox
 */

import type { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore';
import type { Env } from '../../config/env-flag.js';
import { errandsEnabled } from '../../config/errands-flag.js';
import {
  RETRY_POLICY,
  isClosed,
  isRetryable,
  retryDelayMs,
  sameApproval,
  type Claim,
  type EffectKind,
  type EffectLease,
  type EffectOutbox,
  type EffectStatus,
  type Errand,
  type OutboxEffect,
} from '../errands/index.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { effectDoc, errandDoc, newId, toErrand } from './errand-store.js';

const log = createLogger({ module: 'errand-outbox' });
const STATUS = new Set(['pending', 'running', 'done', 'failed']);
/**
 * Kinds a runner may run again after a crash without asking anyone: a lookup
 * is a read. Calendar and reminder writes join only once E4 proves them
 * idempotent; everything else may already have reached a person.
 */
export const SAFE_TO_REPEAT: ReadonlySet<EffectKind> = new Set(['lookup_line_type']);
/** Kinds that must not start once their errand has closed. Hang-ups, releases and notices still go. */
const STOPS_WHEN_CLOSED: ReadonlySet<EffectKind> = new Set([
  'call',
  'text',
  'calendar',
  'reminder',
  'lookup_line_type',
]);
const SCAN = 10;

const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

/** A stored outbox entry, or null if it isn't one. */
export function toOutbox(data: unknown): OutboxEffect | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const effect = d.effect as { kind?: unknown } | undefined;
  const s = ['idemKey', 'userId', 'errandId', 'notBefore', 'updatedAt'].map((k) => str(d[k]));
  const kind = String(d.kind) as EffectKind;
  if (s.some((x) => x === undefined) || !STATUS.has(String(d.status))) return null;
  if (!(kind in RETRY_POLICY) || effect?.kind !== kind || typeof d.attempts !== 'number')
    return null;
  const [idemKey, userId, errandId, notBefore, updatedAt] = s as string[];
  return {
    ...{ idemKey, userId, errandId, kind, notBefore, updatedAt, attempts: d.attempts },
    effect: effect as OutboxEffect['effect'],
    status: d.status as EffectStatus,
    leaseUntil: str(d.leaseUntil) ?? null,
    leaseId: str(d.leaseId) ?? null,
    providerRef: str(d.providerRef) ?? null,
    ...(d.providerCheck === true ? { providerCheck: true } : {}),
    ...(str(d.error) ? { error: String(d.error) } : {}),
  };
}

/** Why the effect must not run against this errand any more, or null. */
function stale(errand: Errand | null, f: OutboxEffect): string | null {
  if (!errand) return 'errand missing';
  if (STOPS_WHEN_CLOSED.has(f.kind) && isClosed(errand)) return `errand ${errand.state}`;
  const yes = 'approval' in f.effect ? f.effect.approval : null;
  if (yes && !errand.approvals.some((a) => sameApproval(a, yes))) return 'approval withdrawn';
  return null;
}

const after = (now: Date, ms: number): string => new Date(now.getTime() + ms).toISOString();

/** The effect and its errand, read inside `tx` (reads before any write). */
async function readBoth(
  db: Firestore,
  tx: Transaction,
  k: { userId: string; errandId: string; idemKey: string }
): Promise<{ ref: DocumentReference; cur: OutboxEffect | null; errand: Errand | null }> {
  const ref = effectDoc(db, k);
  const [snap, esnap] = [await tx.get(ref), await tx.get(errandDoc(db, k.userId, k.errandId))];
  const cur = snap.exists ? toOutbox(snap.data()) : null;
  const errand = esnap.exists ? toErrand(k.errandId, esnap.data()) : null;
  return { ref, cur, errand };
}

/** Claims `seen` if it is still runnable when read again, with its errand, inside the transaction. */
async function tryClaim(
  db: Firestore,
  makeId: () => string,
  seen: OutboxEffect,
  now: Date,
  leaseMs: number
): Promise<Claim | null> {
  return db.runTransaction(async (tx) => {
    const { ref, cur, errand } = await readBoth(db, tx, seen);
    const at = now.toISOString();
    if (!cur) return null;
    const expired = cur.status === 'running' && cur.leaseUntil !== null && cur.leaseUntil <= at;
    if (!expired && !(cur.status === 'pending' && cur.notBefore <= at)) return null;
    const check = expired && (cur.providerRef !== null || !SAFE_TO_REPEAT.has(cur.kind));
    const why = check ? null : stale(errand, cur);
    if (why) {
      tx.set(ref, {
        ...cur,
        status: 'failed',
        error: why,
        leaseUntil: null,
        leaseId: null,
        updatedAt: at,
      });
      return null;
    }
    const leaseId = makeId();
    const lease = { userId: cur.userId, errandId: cur.errandId, idemKey: cur.idemKey, leaseId };
    const held = { ...cur, leaseId, leaseUntil: after(now, leaseMs), updatedAt: at };
    if (check) {
      const checking = { ...held, providerCheck: true };
      tx.set(ref, checking);
      return { type: 'needs_provider_check', lease, effect: checking };
    }
    const running: OutboxEffect = { ...held, status: 'running', attempts: cur.attempts + 1 };
    tx.set(ref, running);
    return { type: 'claimed', lease, effect: running, recovered: expired };
  });
}

/** An entry that won't parse can never be claimed: fail it so it stops filling the scan. */
async function quarantine(
  db: Firestore,
  ref: DocumentReference,
  data: unknown,
  at: string
): Promise<void> {
  log.warn({ docId: ref.id }, 'Quarantined an outbox entry that does not match the schema');
  const raw = typeof data === 'object' && data !== null ? data : {};
  await db.runTransaction(async (tx) => {
    tx.set(ref, { ...raw, status: 'failed', error: 'quarantined: unreadable', updatedAt: at });
    return Promise.resolve();
  });
}

export function createEffectOutbox(db: Firestore, makeId: () => string = newId): EffectOutbox {
  /** Runs `change` on the effect only while `lease` still holds it. */
  async function withLease(
    lease: EffectLease,
    change: (cur: OutboxEffect, errand: Errand | null) => OutboxEffect
  ): Promise<boolean> {
    return db.runTransaction(async (tx) => {
      const { ref, cur, errand } = await readBoth(db, tx, lease);
      if (!cur || cur.status !== 'running' || cur.leaseId !== lease.leaseId) return false;
      tx.set(ref, change(cur, errand));
      return true;
    });
  }

  return {
    async claimEffect(now, leaseMs) {
      const at = now.toISOString();
      // Written out in full so the index-coverage check can match each to its index.
      const [expired, pending] = await Promise.all([
        db
          .collectionGroup('effects')
          .where('status', '==', 'running')
          .where('leaseUntil', '<=', at)
          .orderBy('leaseUntil')
          .limit(SCAN)
          .get(),
        db
          .collectionGroup('effects')
          .where('status', '==', 'pending')
          .where('notBefore', '<=', at)
          .orderBy('notBefore')
          .limit(SCAN)
          .get(),
      ]);
      // One at a time on purpose: each try is its own transaction, and the first win ends it.
      for (const d of [...expired.docs, ...pending.docs]) {
        const seen = toOutbox(d.data());
        // eslint-disable-next-line no-await-in-loop
        if (!seen) await quarantine(db, d.ref, d.data(), at);
        // eslint-disable-next-line no-await-in-loop
        const claim = seen ? await tryClaim(db, makeId, seen, now, leaseMs) : null;
        if (claim) return claim;
      }
      return { type: 'none' };
    },

    async recordProviderRef(lease, providerRef, now, leaseMs) {
      const updatedAt = now.toISOString();
      const leaseUntil = after(now, leaseMs);
      return withLease(lease, (cur) => ({ ...cur, providerRef, leaseUntil, updatedAt }));
    },

    async completeEffect(lease, providerRef, now) {
      return withLease(lease, (cur) => ({
        ...cur,
        status: 'done',
        providerRef: providerRef ?? cur.providerRef,
        leaseUntil: null,
        leaseId: null,
        updatedAt: now.toISOString(),
      }));
    },

    async failEffect(lease, error, now, { neverSent = false } = {}) {
      return withLease(lease, (cur, errand) => {
        const policy = cur.effect.retry ?? RETRY_POLICY[cur.kind];
        const wait = retryDelayMs(policy, cur.attempts + 1);
        // Once something may have reached a person it is never queued again,
        // unless the runner proves the request never left (neverSent).
        const repeatable = SAFE_TO_REPEAT.has(cur.kind) || neverSent;
        const reached = cur.providerRef !== null || cur.providerCheck === true;
        const why = stale(errand, cur);
        const again = wait !== null && isRetryable(policy, error) && repeatable && !reached && !why;
        const base = {
          ...cur,
          error: why ? `${error} (${why})` : error,
          leaseUntil: null,
          leaseId: null,
          updatedAt: now.toISOString(),
        };
        return again
          ? { ...base, status: 'pending', notBefore: after(now, wait ?? 0) }
          : { ...base, status: 'failed' };
      });
    },
  };
}

/** The outbox on the app's Firestore, or null while ERRANDS is off or there is none. */
export function firestoreEffectOutbox(env: Env = process.env): EffectOutbox | null {
  if (!errandsEnabled(env)) return null;
  const db = getFirestoreDb();
  return db ? createEffectOutbox(db) : null;
}
