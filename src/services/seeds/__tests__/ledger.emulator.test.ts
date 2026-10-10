/**
 * The seed ledger against the real Firestore emulator: transactions, idempotency and
 * concurrent writes behave as they will in production, not as a fake decides.
 *
 * Runs when FIRESTORE_EMULATOR_HOST is set (CI: data-layer-e2e.yml; locally:
 * `firebase emulators:start --only firestore`).
 */
import admin from 'firebase-admin';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applySeeds,
  commitSeeds,
  getSeedBalance,
  InsufficientSeedsError,
  prepareSeeds,
  STARTER_SEEDS,
} from '../ledger.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let db: admin.firestore.Firestore;
let uid: string;

beforeAll(() => {
  if (!emulator) return;
  const app =
    admin.apps.find((a) => a?.name === 'seed-ledger-test') ??
    admin.initializeApp({ projectId: 'demo-seed-ledger' }, 'seed-ledger-test');
  db = app.firestore();
});

beforeEach(() => {
  uid = `u-${Math.random().toString(36).slice(2)}`;
});

const entries = async () =>
  (await db.collection('user_seeds').doc(uid).collection('entries').get()).docs
    .map((d) => d.id)
    .sort();

describe.skipIf(!emulator)('seed ledger (Firestore emulator)', () => {
  it('a new account starts with 25 seeds, recorded as an entry', async () => {
    const result = await applySeeds(db, uid, {
      delta: 5,
      reason: 'daily',
      key: 'daily:2026-10-10',
    });

    expect(result).toEqual({ applied: true, balance: STARTER_SEEDS + 5 });
    const account = (await db.collection('user_seeds').doc(uid).get()).data();
    expect(account).toMatchObject({ balance: 30, lifetimeEarned: 30, earnedFrom: { daily: 5 } });
    expect(await entries()).toEqual(['daily:2026-10-10', 'starter']);
  });

  it('the same key applies once: a retry or replayed webhook changes nothing', async () => {
    await applySeeds(db, uid, { delta: 75, reason: 'contribution', key: 'stripe:pi_1' });
    const again = await applySeeds(db, uid, {
      delta: 75,
      reason: 'contribution',
      key: 'stripe:pi_1',
    });

    expect(again).toEqual({ applied: false, balance: 100 });
    expect(await getSeedBalance(db, uid)).toBe(100);
  });

  it('a spend that would go below zero is refused and writes nothing', async () => {
    await expect(
      applySeeds(db, uid, { delta: -26, reason: 'purchase', key: 'purchase:crown' })
    ).rejects.toBeInstanceOf(InsufficientSeedsError);
    expect(await getSeedBalance(db, uid)).toBe(STARTER_SEEDS);
    expect(await entries()).toEqual([]);

    const ok = await applySeeds(db, uid, { delta: -25, reason: 'purchase', key: 'purchase:hat' });
    expect(ok).toEqual({ applied: true, balance: 0 });
    const account = (await db.collection('user_seeds').doc(uid).get()).data();
    expect(account).toMatchObject({ lifetimeSpent: 25, spentOn: { purchase: 25 } });
  });

  it('concurrent earns with different keys all land; with one key, only once', async () => {
    await applySeeds(db, uid, { delta: 1, reason: 'test', key: 'warm' }); // account exists
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        applySeeds(db, uid, { delta: 10, reason: 'test', key: `k${i}` })
      )
    );
    await Promise.all(
      Array.from({ length: 8 }, () =>
        applySeeds(db, uid, { delta: 100, reason: 'test', key: 'same' })
      )
    );
    expect(await getSeedBalance(db, uid)).toBe(STARTER_SEEDS + 1 + 80 + 100);
  });

  it('works inside a caller transaction alongside its own writes (roadmap vote)', async () => {
    const voteRef = db.collection('test_votes').doc(uid);
    await db.runTransaction(async (tx) => {
      const state = await prepareSeeds(tx, db, uid, 'vote:feature-x');
      commitSeeds(tx, state, { delta: -3, reason: 'vote', key: 'vote:feature-x' });
      tx.set(voteRef, { seeds: 3 });
    });
    expect(await getSeedBalance(db, uid)).toBe(STARTER_SEEDS - 3);
    expect((await voteRef.get()).data()).toEqual({ seeds: 3 });
  });

  it('several changes share one transaction with a running balance (daily + streak bonus)', async () => {
    const results = await db.runTransaction(async (tx) => {
      const state = await prepareSeeds(tx, db, uid, ['daily:2026-10-12', 'streak:7:2026-10-06']);
      return [
        commitSeeds(tx, state, { delta: 5, reason: 'daily', key: 'daily:2026-10-12' }),
        commitSeeds(tx, state, { delta: 25, reason: 'streaks', key: 'streak:7:2026-10-06' }),
      ];
    });
    expect(results.map((r) => r.balance)).toEqual([30, 55]);
    expect((await db.collection('user_seeds').doc(uid).get()).data()).toMatchObject({
      balance: 55,
      lifetimeEarned: 55,
      earnedFrom: { daily: 5, streaks: 25 },
    });
    expect(await entries()).toEqual(['daily:2026-10-12', 'starter', 'streak:7:2026-10-06']);
  });

  it('an account written before the ledger keeps its balance and gains entries', async () => {
    await db.collection('user_seeds').doc(uid).set({ balance: 140, referralCode: 'abc-fern' });
    const result = await applySeeds(db, uid, {
      delta: 5,
      reason: 'daily',
      key: 'daily:2026-10-11',
    });

    expect(result.balance).toBe(145);
    expect((await db.collection('user_seeds').doc(uid).get()).data()).toMatchObject({
      referralCode: 'abc-fern',
    });
    expect(await entries()).toEqual(['daily:2026-10-11']); // no starter for an existing account
  });
});
