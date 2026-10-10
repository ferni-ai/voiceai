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

/**
 * What prepareSeeds read inside a transaction. Pass it to commitSeeds in the same one;
 * it keeps a running balance, so several changes for one account can share a transaction.
 */
export interface LedgerState {
  accountRef: admin.firestore.DocumentReference;
  /** The account as read, or null when it doesn't exist yet. */
  account: Record<string, unknown> | null;
  /** Balance after the changes committed so far in this transaction. */
  balance: number;
  /** Prepared entries by key: whether each was already applied. */
  entries: Map<string, { ref: admin.firestore.DocumentReference; applied: boolean }>;
  created: boolean;
}

/** Firestore document ids can't contain '/'; keys are built from ids and dates. */
function entryId(key: string): string {
  if (!key || key.length > 500) throw new Error('Seed key must be 1-500 characters');
  return key.replace(/\//g, '_');
}

/**
 * Phase 1, reads: call inside a transaction before any of its writes (Firestore runs all
 * reads first). Prepare every key the transaction may apply.
 */
export async function prepareSeeds(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  uid: string,
  keys: string | readonly string[]
): Promise<LedgerState> {
  const accountRef = db.collection(SEEDS_COLLECTION).doc(uid);
  const accountDoc = await tx.get(accountRef);
  const account = accountDoc.exists ? (accountDoc.data() ?? {}) : null;
  const state: LedgerState = {
    accountRef,
    account,
    balance: Number(account?.balance ?? STARTER_SEEDS),
    entries: new Map(),
    created: false,
  };
  await prepareMoreSeeds(tx, state, typeof keys === 'string' ? [keys] : keys);
  return state;
}

/** More reads for keys that depend on the account (e.g. a streak milestone). Before any write. */
export async function prepareMoreSeeds(
  tx: admin.firestore.Transaction,
  state: LedgerState,
  keys: readonly string[]
): Promise<void> {
  const refs = keys.map(
    (key) => [key, state.accountRef.collection(ENTRIES_SUBCOLLECTION).doc(entryId(key))] as const
  );
  const docs = await Promise.all(refs.map(([, ref]) => tx.get(ref)));
  refs.forEach(([key, ref], i) => state.entries.set(key, { ref, applied: !!docs[i]?.exists }));
}

/** The balance an account has now (after this transaction's commits so far). */
export function balanceOf(state: LedgerState): number {
  return state.balance;
}

/**
 * Phase 2, writes: apply one prepared change. Throws InsufficientSeedsError (writing
 * nothing) when a spend would go below zero.
 */
export function commitSeeds(
  tx: admin.firestore.Transaction,
  state: LedgerState,
  change: SeedChange
): SeedResult {
  const entry = state.entries.get(change.key);
  if (!entry) throw new Error(`Seed key not prepared: ${change.key}`);
  if (entry.applied) return { applied: false, balance: state.balance };
  if (!Number.isInteger(change.delta)) throw new Error('Seed delta must be a whole number');

  const before = state.balance;
  const after = before + change.delta;
  if (after < 0) throw new InsufficientSeedsError(before, -change.delta);

  const now = admin.firestore.Timestamp.now();
  // Nested maps, not dotted keys: set(merge) takes 'a.b' as a literal field name
  const inc = admin.firestore.FieldValue.increment;
  const totals =
    change.delta >= 0
      ? { lifetimeEarned: inc(change.delta), earnedFrom: { [change.reason]: inc(change.delta) } }
      : { lifetimeSpent: inc(-change.delta), spentOn: { [change.reason]: inc(-change.delta) } };

  if (!state.account && !state.created) {
    // A new account: its starter seeds are an entry like any other
    const starterRef = state.accountRef.collection(ENTRIES_SUBCOLLECTION).doc('starter');
    tx.set(starterRef, {
      delta: STARTER_SEEDS,
      reason: 'starter',
      balanceAfter: STARTER_SEEDS,
      at: now,
    });
    tx.set(state.accountRef, {
      balance: STARTER_SEEDS,
      lifetimeEarned: STARTER_SEEDS,
      createdAt: now,
    });
    state.created = true;
  }
  tx.set(state.accountRef, { balance: after, updatedAt: now, ...totals }, { merge: true });
  tx.set(entry.ref, {
    delta: change.delta,
    reason: change.reason,
    balanceAfter: after,
    at: now,
    ...(change.meta ? { meta: change.meta } : {}),
  });
  entry.applied = true;
  state.balance = after;
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
