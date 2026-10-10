/**
 * Roadmap seed spending through the seed ledger.
 *
 * Voting and unvoting used to write `user_seeds` directly with their own starter balance
 * (10, against 25 elsewhere). Now every change is a ledger entry.
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

export const UNVOTE_REFUND_PERCENT = 0.5;

type Failure = { success: false; error: string; balance?: number };
const inc = admin.firestore.FieldValue.increment;
const now = () => admin.firestore.FieldValue.serverTimestamp();

/** A client request id makes a retried vote free; otherwise each call is its own vote. */
function requestKey(requestId: unknown): string {
  return typeof requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(requestId)
    ? requestId
    : randomUUID();
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
