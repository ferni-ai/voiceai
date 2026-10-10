/**
 * Roadmap seed spending and ritual streak rewards, through the seed ledger.
 *
 * Voting, suggesting and unvoting used to write `user_seeds` directly with their own
 * starter balance (10, against 25 elsewhere); the ritual streak reward paid for whatever
 * streak count the browser posted. Now every change is a ledger entry, and the streak
 * reward reads the server's own ritual streaks.
 *
 * @module api/roadmap-seeds
 */
import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import {
  commitSeeds,
  InsufficientSeedsError,
  prepareSeeds,
  STARTER_SEEDS,
} from '../services/seeds/ledger.js';

export const SUGGESTION_COST = 5;
export const UNVOTE_REFUND_PERCENT = 0.5;
/** Ritual streak milestones and their seeds (once per person, as before). */
export const RITUAL_STREAK_REWARDS: Readonly<Record<number, number>> = { 7: 5, 30: 15 };

type Failure = { success: false; error: string; balance?: number };
const inc = admin.firestore.FieldValue.increment;
const now = () => admin.firestore.FieldValue.serverTimestamp();

/** A client request id makes a retried vote free; otherwise each call is its own vote. */
function requestKey(requestId: unknown): string {
  return typeof requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(requestId)
    ? requestId
    : randomUUID();
}

/** Balance and totals for GET /api/roadmap/seeds, without creating an account. */
export async function readSeedSummary(db: admin.firestore.Firestore, userId: string) {
  const data = (await db.collection('user_seeds').doc(userId).get()).data() ?? {};
  return {
    userId,
    balance: Number(data.balance ?? STARTER_SEEDS),
    lifetimePlanted: Number(data.lifetimePlanted ?? 0),
    lifetimeEarned: Number(data.lifetimeEarned ?? STARTER_SEEDS),
    featuresUnlocked: (data.featuresUnlocked as string[] | undefined) ?? [],
    earnedFrom: (data.earnedFrom as Record<string, number> | undefined) ?? {},
  };
}

/** Plant seeds on a feature (adds to an existing vote). */
export async function voteWithSeeds(
  db: admin.firestore.Firestore,
  userId: string,
  vote: { featureId: string; seeds: number; reason?: string; requestId?: unknown }
): Promise<
  { success: true; voteId: string; totalSeedsPlanted: number; newBalance: number } | Failure
> {
  const voteId = `${userId}_${vote.featureId}`;
  const key = `vote:${voteId}:${requestKey(vote.requestId)}`;
  const voteRef = db.collection('feature_votes').doc(voteId);
  const statsRef = db.collection('roadmap_feature_stats').doc(vote.featureId);

  try {
    return await db.runTransaction(async (tx) => {
      const seeds = await prepareSeeds(tx, db, userId, key);
      const existing = await tx.get(voteRef);
      const before = Number(existing.data()?.seedsPlanted ?? 0);
      const spent = commitSeeds(tx, seeds, {
        delta: -vote.seeds,
        reason: 'vote',
        key,
        meta: { featureId: vote.featureId },
      });
      if (!spent.applied) {
        return { success: true, voteId, totalSeedsPlanted: before, newBalance: spent.balance };
      }
      tx.set(seeds.accountRef, { lifetimePlanted: inc(vote.seeds) }, { merge: true });
      tx.set(
        voteRef,
        existing.exists
          ? {
              seedsPlanted: inc(vote.seeds),
              reason: vote.reason || existing.data()?.reason || null,
              updatedAt: now(),
            }
          : {
              userId,
              featureId: vote.featureId,
              seedsPlanted: vote.seeds,
              reason: vote.reason || null,
              createdAt: now(),
              updatedAt: now(),
            },
        { merge: true }
      );
      tx.set(
        statsRef,
        {
          totalSeeds: inc(vote.seeds),
          ...(existing.exists ? {} : { uniqueVoters: inc(1) }),
          updatedAt: now(),
        },
        { merge: true }
      );
      return {
        success: true,
        voteId,
        totalSeedsPlanted: before + vote.seeds,
        newBalance: spent.balance,
      };
    });
  } catch (error) {
    if (error instanceof InsufficientSeedsError) {
      return { success: false, error: 'Insufficient seeds', balance: error.balance };
    }
    throw error;
  }
}

/** Remove a vote and refund half its seeds. */
export async function unvoteWithRefund(
  db: admin.firestore.Firestore,
  userId: string,
  featureId: string
): Promise<{ success: true; seedsRefunded: number; seedsLost: number } | Failure> {
  const voteId = `${userId}_${featureId}`;
  const voteRef = db.collection('feature_votes').doc(voteId);

  return db.runTransaction(async (tx) => {
    const voteDoc = await tx.get(voteRef);
    if (!voteDoc.exists) return { success: false, error: 'Vote not found' };
    const planted = Number(voteDoc.data()?.seedsPlanted ?? 0);
    const refund = Math.floor(planted * UNVOTE_REFUND_PERCENT);
    // One refund per vote: the vote's creation time tells this vote from a later one
    const created = voteDoc.createTime?.toMillis() ?? 0;
    const key = `unvote:${voteId}:${created}`;
    const seeds = await prepareSeeds(tx, db, userId, key);

    tx.delete(voteRef);
    if (refund > 0) commitSeeds(tx, seeds, { delta: refund, reason: 'voteRefund', key });
    tx.set(
      db.collection('roadmap_feature_stats').doc(featureId),
      { totalSeeds: inc(-planted), uniqueVoters: inc(-1), updatedAt: now() },
      { merge: true }
    );
    return { success: true, seedsRefunded: refund, seedsLost: planted - refund };
  });
}

/** Submit a suggestion, which costs SUGGESTION_COST seeds. */
export async function suggestWithSeeds(
  db: admin.firestore.Firestore,
  userId: string,
  suggestion: { title: string; description: string; category: string }
): Promise<{ success: true; suggestionId: string; newBalance: number } | Failure> {
  const suggestionRef = db.collection('roadmap_suggestions').doc();
  const key = `suggest:${suggestionRef.id}`;
  try {
    return await db.runTransaction(async (tx) => {
      const seeds = await prepareSeeds(tx, db, userId, key);
      const spent = commitSeeds(tx, seeds, { delta: -SUGGESTION_COST, reason: 'suggestion', key });
      tx.set(seeds.accountRef, { lifetimePlanted: inc(SUGGESTION_COST) }, { merge: true });
      tx.set(suggestionRef, {
        userId,
        ...suggestion,
        seedsPlanted: SUGGESTION_COST,
        communitySeeds: 0,
        status: 'submitted',
        createdAt: now(),
        updatedAt: now(),
      });
      return { success: true, suggestionId: suggestionRef.id, newBalance: spent.balance };
    });
  } catch (error) {
    if (error instanceof InsufficientSeedsError) {
      return {
        success: false,
        error: `Submitting a suggestion costs ${SUGGESTION_COST} seeds. You have ${error.balance}.`,
      };
    }
    throw error;
  }
}

/**
 * Pay ritual streak milestones the person has reached on the SERVER's own ritual streaks
 * (the browser used to post a count and get paid for it). Each milestone pays once per
 * person; ones claimed before the ledger (user_streak_rewards) aren't paid again.
 */
export async function claimRitualStreakRewards(
  db: admin.firestore.Firestore,
  userId: string,
  longestCurrentStreak: number
): Promise<{ awarded: boolean; milestone?: number; seeds?: number; newBalance?: number }> {
  const reached = Object.keys(RITUAL_STREAK_REWARDS)
    .map(Number)
    .filter((m) => longestCurrentStreak >= m);
  if (reached.length === 0) return { awarded: false };

  return db.runTransaction(async (tx) => {
    const keys = reached.map((m) => `ritual-streak:${m}`);
    const seeds = await prepareSeeds(tx, db, userId, keys);
    const legacy = await tx.get(db.collection('user_streak_rewards').doc(userId));
    const claimedBefore = new Set<number>(legacy.data()?.claimedMilestones ?? []);

    let paid = 0;
    let top: number | undefined;
    for (const m of reached) {
      if (claimedBefore.has(m)) continue;
      const amount = RITUAL_STREAK_REWARDS[m] as number;
      const r = commitSeeds(tx, seeds, {
        delta: amount,
        reason: 'streaks',
        key: `ritual-streak:${m}`,
      });
      if (r.applied) {
        paid += amount;
        top = m;
      }
    }
    return paid > 0
      ? { awarded: true, milestone: top, seeds: paid, newBalance: seeds.balance }
      : { awarded: false };
  });
}
