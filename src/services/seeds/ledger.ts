/**
 * The seed ledger: the one writer of `user_seeds/{uid}`.
 *
 * Every earn and spend is an entry keyed by what caused it (`daily:2026-10-10`,
 * `stripe:pi_123`, `purchase:hat-1`). The entry and the balance change are written in
 * one transaction, and an existing entry makes the change a no-op, so a retried request,
 * a replayed webhook or two tabs racing can never pay or charge twice. A spend never
 * takes the balance below zero.
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md
 *
 * @module services/seeds/ledger
 */
import admin from 'firebase-admin';

/** Seeds every account starts with (one starter entry per account). */
export const STARTER_SEEDS = 25;

export const SEEDS_COLLECTION = 'user_seeds';
export const ENTRIES_SUBCOLLECTION = 'entries';

export interface SeedChange {
  /** Positive to earn, negative to spend. */
  delta: number;
  /** Bucket for `earnedFrom` / `spentOn` totals, e.g. 'daily', 'streaks', 'purchase'. */
  reason: string;
  /** Idempotency key: the same key never applies twice. Firestore doc-id safe. */
  key: string;
  meta?: Record<string, unknown>;
}

export interface SeedResult {
  /** False when this key had already been applied (nothing changed). */
  applied: boolean;
  balance: number;
}

export class InsufficientSeedsError extends Error {
  constructor(
    readonly balance: number,
    readonly needed: number
  ) {
    super(`Insufficient seeds: have ${balance}, need ${needed}`);
    this.name = 'InsufficientSeedsError';
  }
}

/** What prepareSeeds read inside a transaction; pass it to commitSeeds in the same one. */
export interface LedgerState {
  accountRef: admin.firestore.DocumentReference;
  entryRef: admin.firestore.DocumentReference;
  starterRef: admin.firestore.DocumentReference;
  account: Record<string, unknown> | null;
  /** The balance recorded by the existing entry for this key, if it was applied. */
  alreadyApplied: { balanceAfter: number } | null;
}

/** Firestore document ids can't contain '/'; keys are built from ids and dates. */
function entryId(key: string): string {
  if (!key || key.length > 500) throw new Error('Seed key must be 1-500 characters');
  return key.replace(/\//g, '_');
}

/**
 * Phase 1, reads: call inside a transaction before any of its writes (Firestore runs all
 * reads first).
 */
export async function prepareSeeds(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  uid: string,
  key: string
): Promise<LedgerState> {
  const accountRef = db.collection(SEEDS_COLLECTION).doc(uid);
  const entries = accountRef.collection(ENTRIES_SUBCOLLECTION);
  const entryRef = entries.doc(entryId(key));
  const [accountDoc, entryDoc] = await Promise.all([tx.get(accountRef), tx.get(entryRef)]);
  const entry = entryDoc.exists ? entryDoc.data() : undefined;
  return {
    accountRef,
    entryRef,
    starterRef: entries.doc('starter'),
    account: accountDoc.exists ? (accountDoc.data() ?? {}) : null,
    alreadyApplied: entry ? { balanceAfter: Number(entry.balanceAfter ?? 0) } : null,
  };
}

/** The balance an account has now, starter seeds included for a new one. */
export function balanceOf(state: LedgerState): number {
  return Number(state.account?.balance ?? STARTER_SEEDS);
}

/**
 * Phase 2, writes: apply the change read by prepareSeeds. Throws InsufficientSeedsError
 * (writing nothing) when a spend would go below zero.
 */
export function commitSeeds(
  tx: admin.firestore.Transaction,
  state: LedgerState,
  change: Omit<SeedChange, 'key'>
): SeedResult {
  if (state.alreadyApplied) return { applied: false, balance: balanceOf(state) };
  if (!Number.isInteger(change.delta)) throw new Error('Seed delta must be a whole number');

  const before = balanceOf(state);
  const after = before + change.delta;
  if (after < 0) throw new InsufficientSeedsError(before, -change.delta);

  const now = admin.firestore.Timestamp.now();
  // Nested maps, not dotted keys: set(merge) takes 'a.b' as a literal field name
  const inc = admin.firestore.FieldValue.increment;
  const totals =
    change.delta >= 0
      ? { lifetimeEarned: inc(change.delta), earnedFrom: { [change.reason]: inc(change.delta) } }
      : { lifetimeSpent: inc(-change.delta), spentOn: { [change.reason]: inc(-change.delta) } };

  if (!state.account) {
    // A new account: its starter seeds are an entry like any other
    tx.set(state.starterRef, { delta: STARTER_SEEDS, reason: 'starter', balanceAfter: STARTER_SEEDS, at: now });
    tx.set(state.accountRef, { balance: STARTER_SEEDS, lifetimeEarned: STARTER_SEEDS, createdAt: now });
  }
  tx.set(state.accountRef, { balance: after, updatedAt: now, ...totals }, { merge: true });
  tx.set(state.entryRef, {
    delta: change.delta,
    reason: change.reason,
    balanceAfter: after,
    at: now,
    ...(change.meta ? { meta: change.meta } : {}),
  });
  return { applied: true, balance: after };
}

/** Earn or spend in a transaction of its own. */
export async function applySeeds(
  db: admin.firestore.Firestore,
  uid: string,
  change: SeedChange
): Promise<SeedResult> {
  return db.runTransaction(async (tx) => {
    const state = await prepareSeeds(tx, db, uid, change.key);
    return commitSeeds(tx, state, change);
  });
}

/** The balance, without creating an account. */
export async function getSeedBalance(db: admin.firestore.Firestore, uid: string): Promise<number> {
  const doc = await db.collection(SEEDS_COLLECTION).doc(uid).get();
  return Number(doc.data()?.balance ?? STARTER_SEEDS);
}
