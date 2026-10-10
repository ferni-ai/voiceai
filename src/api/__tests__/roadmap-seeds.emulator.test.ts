/**
 * Roadmap voting spends and unvoting refunds through the seed ledger, on the Firestore
 * emulator.
 */
import admin from 'firebase-admin';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-seed-ledger';
let db: admin.firestore.Firestore;
let uid: string;
let mod: typeof import('../roadmap-seeds.js');

beforeAll(async () => {
  if (!emulator) return;
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = admin.firestore();
  mod = await import('../roadmap-seeds.js');
});

beforeEach(() => {
  uid = `u-${Math.random().toString(36).slice(2)}`;
});

const balance = async () => (await db.collection('user_seeds').doc(uid).get()).data()?.balance;
const feature = () => `feature-${Math.random().toString(36).slice(2)}`;

describe.skipIf(!emulator)('roadmap seeds (Firestore emulator)', () => {
  it('a vote spends its seeds and adds to the vote; a retried request spends once', async () => {
    const featureId = feature();
    const first = await mod.voteWithSeeds(db, uid, {
      featureId,
      seeds: 3,
      requestId: 'req-00000001',
    });
    const retry = await mod.voteWithSeeds(db, uid, {
      featureId,
      seeds: 3,
      requestId: 'req-00000001',
    });
    const more = await mod.voteWithSeeds(db, uid, { featureId, seeds: 2 });

    expect(first).toMatchObject({ success: true, totalSeedsPlanted: 3, newBalance: 22 });
    expect(retry).toMatchObject({ success: true, totalSeedsPlanted: 3, newBalance: 22 });
    expect(more).toMatchObject({ success: true, totalSeedsPlanted: 5, newBalance: 20 });
    const stats = (await db.collection('roadmap_feature_stats').doc(featureId).get()).data();
    expect(stats).toMatchObject({ totalSeeds: 5, uniqueVoters: 1 });
  });

  it("a vote you can't afford changes nothing", async () => {
    await db.collection('user_seeds').doc(uid).set({ balance: 2 });
    const featureId = feature();
    expect(await mod.voteWithSeeds(db, uid, { featureId, seeds: 3 })).toEqual({
      success: false,
      error: 'Insufficient seeds',
      balance: 2,
    });
    expect((await db.collection('feature_votes').doc(`${uid}_${featureId}`).get()).exists).toBe(
      false
    );
  });

  it('unvoting refunds half once, and a later vote is a new vote', async () => {
    const featureId = feature();
    await mod.voteWithSeeds(db, uid, { featureId, seeds: 10 }); // 25 -> 15
    expect(await mod.unvoteWithRefund(db, uid, featureId)).toEqual({
      success: true,
      seedsRefunded: 5,
      seedsLost: 5,
    });
    expect(await mod.unvoteWithRefund(db, uid, featureId)).toEqual({
      success: false,
      error: 'Vote not found',
    });
    expect(await balance()).toBe(20);
  });
});
