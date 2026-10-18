/**
 * The errand effect outbox's leases: errands/{id}/effects/{idemKey}.
 *
 * ErrandStore.save puts each effect here as pending, in the same transaction
 * as the step that made it. A runner then:
 * - claims one under a lease (one transaction per claim, so two runners never
 *   both win);
 * - records the provider's id (call or message SID) the moment it has one,
 *   which also renews the lease for a long call;
 * - completes it, or fails it, and failEffect re-queues it after its backoff
 *   when the error is retryable and attempts remain.
 *
 * A runner that dies frees the effect when its lease runs out. A call or text
 * (or anything with a providerRef) may already have reached a person, so it
 * comes back as needs_provider_check and is never re-run blind.
 *
 * @module services/stores/errand-outbox
 */

import type { Firestore, Query } from '@google-cloud/firestore';
import type { Env } from '../../config/env-flag.js';
import { errandsEnabled } from '../../config/errands-flag.js';
import {
  RETRY_POLICY,
  isRetryable,
  retryDelayMs,
  type Claim,
  type EffectKind,
  type EffectLease,
  type EffectOutbox,
  type EffectStatus,
  type OutboxEffect,
} from '../errands/index.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { effectDoc, newId } from './errand-store.js';

const STATUS = new Set(['pending', 'running', 'done', 'failed']);
/**
 * Kinds a runner may repeat after a crash without asking the provider: a
 * lookup is a read, and calendar and reminder writes are keyed by idemKey.
 */
const SAFE_TO_REPEAT: ReadonlySet<EffectKind> = new Set([
  'lookup_line_type',
  'calendar',
  'reminder',
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
    ...(str(d.error) ? { error: String(d.error) } : {}),
  };
}

const after = (now: Date, ms: number): string => new Date(now.getTime() + ms).toISOString();

/** Claims `seen` if it is still runnable when read again inside the transaction. */
async function tryClaim(
  db: Firestore,
  makeId: () => string,
  seen: OutboxEffect,
  now: Date,
  leaseMs: number
): Promise<Claim | null> {
  const ref = effectDoc(db, seen);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? toOutbox(snap.data()) : null;
    const at = now.toISOString();
    if (!cur) return null;
    const expired = cur.status === 'running' && cur.leaseUntil !== null && cur.leaseUntil <= at;
    if (!expired && !(cur.status === 'pending' && cur.notBefore <= at)) return null;
    const leaseId = makeId();
    const lease = { userId: cur.userId, errandId: cur.errandId, idemKey: cur.idemKey, leaseId };
    const held = { ...cur, leaseId, leaseUntil: after(now, leaseMs), updatedAt: at };
    if (expired && (cur.providerRef !== null || !SAFE_TO_REPEAT.has(cur.kind))) {
      tx.set(ref, held);
      return { type: 'needs_provider_check', lease, effect: held };
    }
    const running: OutboxEffect = { ...held, status: 'running', attempts: cur.attempts + 1 };
    tx.set(ref, running);
    return { type: 'claimed', lease, effect: running, recovered: expired };
  });
}

export function createEffectOutbox(db: Firestore, makeId: () => string = newId): EffectOutbox {
  /** Runs `change` on the effect only while `lease` still holds it. */
  async function withLease(
    lease: EffectLease,
    change: (cur: OutboxEffect) => OutboxEffect
  ): Promise<boolean> {
    const ref = effectDoc(db, lease);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? toOutbox(snap.data()) : null;
      if (!cur || cur.status !== 'running' || cur.leaseId !== lease.leaseId) return false;
      tx.set(ref, change(cur));
      return true;
    });
  }

  return {
    async claimEffect(now, leaseMs) {
      const at = now.toISOString();
      const query = (status: EffectStatus, field: string): Query =>
        db.collectionGroup('effects').where('status', '==', status).where(field, '<=', at);
      const [expired, pending] = await Promise.all([
        query('running', 'leaseUntil').orderBy('leaseUntil').limit(SCAN).get(),
        query('pending', 'notBefore').orderBy('notBefore').limit(SCAN).get(),
      ]);
      // One at a time on purpose: each try is its own transaction, and the first win ends it.
      for (const d of [...expired.docs, ...pending.docs]) {
        const seen = toOutbox(d.data());
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

    async failEffect(lease, error, now) {
      return withLease(lease, (cur) => {
        const policy = cur.effect.retry ?? RETRY_POLICY[cur.kind];
        const wait = retryDelayMs(policy, cur.attempts + 1);
        // Something the provider took is never retried blind.
        const again = wait !== null && isRetryable(policy, error) && cur.providerRef === null;
        const base = {
          ...cur,
          error,
          leaseUntil: null,
          leaseId: null,
          updatedAt: now.toISOString(),
        };
        return again
          ? { ...base, status: 'pending', notBefore: after(now, wait) }
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
