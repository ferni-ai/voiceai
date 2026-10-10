/**
 * Roadmap voting, suggesting and ritual streak rewards spend and pay through the seed
 * ledger, on the Firestore emulator. The streak reward reads the server's own ritual
 * streaks: the count the browser posts is ignored (it could be any number).
 */
import admin from 'firebase-admin';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const streaks = vi.hoisted(() => ({ list: [] as Array<{ currentStreak: number }> }));
vi.mock('../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getAllStreaks: async () => streaks.list }),
}));

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
  streaks.list = [];
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

  it('a suggestion costs 5, and is refused below that with nothing written', async () => {
    const ok = await mod.suggestWithSeeds(db, uid, {
      title: 'Hello',
      description: 'x'.repeat(20),
      category: 'connect',
    });
    expect(ok).toMatchObject({ success: true, newBalance: 20 });

    const poor = `p-${uid}`;
    await db.collection('user_seeds').doc(poor).set({ balance: 4 });
    const refused = await mod.suggestWithSeeds(db, poor, {
      title: 'Hello',
      description: 'x'.repeat(20),
      category: 'connect',
    });
    expect(refused).toMatchObject({ success: false });
    expect((await db.collection('user_seeds').doc(poor).get()).data()?.balance).toBe(4);
  });

  it('ritual streak rewards pay from the server streak, once per milestone', async () => {
    expect(await mod.claimRitualStreakRewards(db, uid, 6)).toEqual({ awarded: false });
    expect(await mod.claimRitualStreakRewards(db, uid, 7)).toMatchObject({
      awarded: true,
      milestone: 7,
      seeds: 5,
    });
    expect(await mod.claimRitualStreakRewards(db, uid, 9)).toEqual({ awarded: false });
    expect(await mod.claimRitualStreakRewards(db, uid, 31)).toMatchObject({
      awarded: true,
      milestone: 30,
      seeds: 15,
    });
    expect(await balance()).toBe(25 + 5 + 15);
  });

  it("milestones claimed before the ledger aren't paid again", async () => {
    await db
      .collection('user_streak_rewards')
      .doc(uid)
      .set({ claimedMilestones: [7] });
    expect(await mod.claimRitualStreakRewards(db, uid, 30)).toMatchObject({
      milestone: 30,
      seeds: 15,
    });
  });

  it('the streak-reward route ignores the count the browser posts', async () => {
    const { handleRoadmapRoutes } = await import('../roadmap-routes.js');
    const { createServer } = await import('node:http');
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      void handleRoadmapRoutes(req, res, url.pathname, url);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as { port: number };
    const post = async () =>
      (await fetch(`http://127.0.0.1:${port}/api/roadmap/streak-reward`, {
        method: 'POST',
        headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
        body: JSON.stringify({ currentStreak: 100 }),
      }).then((r) => r.json())) as Record<string, unknown>;

    try {
      streaks.list = [{ currentStreak: 0 }];
      expect(await post()).toMatchObject({ awarded: false });
      streaks.list = [{ currentStreak: 3 }, { currentStreak: 8 }];
      expect(await post()).toMatchObject({ awarded: true, milestone: 7, seedsAwarded: 5 });
    } finally {
      server.close();
    }
  });
});
