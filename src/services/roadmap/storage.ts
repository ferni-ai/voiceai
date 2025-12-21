/**
 * Roadmap Storage Service
 *
 * Handles Firestore persistence for the seeds economy and feature voting.
 * Extracts direct Firestore access from roadmap-routes.ts.
 */

import * as admin from 'firebase-admin';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  type UserSeeds,
  type SeedSource,
  type FeatureVote,
  type FeatureSuggestion,
  DEFAULT_SEED_BALANCE,
  STREAK_REWARDS,
} from './types.js';

const log = getLogger().child({ module: 'roadmap-storage' });

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

export function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    const { apps } = admin;
    if (!apps || apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for roadmap storage');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for roadmap storage');
    return null;
  }
}

// ============================================================================
// USER SEEDS OPERATIONS
// ============================================================================

/**
 * Get or create user seeds document
 */
export async function getOrCreateUserSeeds(userId: string): Promise<UserSeeds | null> {
  const db = getFirestore();
  if (!db) return null;

  const userSeedsRef = db.collection('user_seeds').doc(userId);
  const doc = await userSeedsRef.get();

  if (doc.exists) {
    const data = doc.data()!;
    return {
      userId,
      balance: data.balance || 0,
      lifetimePlanted: data.lifetimePlanted || 0,
      lifetimeEarned: data.lifetimeEarned || DEFAULT_SEED_BALANCE,
      featuresUnlocked: data.featuresUnlocked || [],
      earnedFrom: data.earnedFrom || {
        conversations: 0,
        streaks: 0,
        referrals: 0,
        feedback: 0,
        suggestionsAccepted: 0,
        featuresBloomed: 0,
      },
    };
  }

  // Create new user with default balance
  const newUserSeeds: Omit<UserSeeds, 'userId'> = {
    balance: DEFAULT_SEED_BALANCE,
    lifetimePlanted: 0,
    lifetimeEarned: DEFAULT_SEED_BALANCE,
    featuresUnlocked: [],
    earnedFrom: {
      conversations: 0,
      streaks: 0,
      referrals: 0,
      feedback: 0,
      suggestionsAccepted: 0,
      featuresBloomed: 0,
    },
  };

  await userSeedsRef.set(
    removeUndefined({
      ...newUserSeeds,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  );

  log.info({ userId, balance: DEFAULT_SEED_BALANCE }, 'Created new user seeds account');

  return { userId, ...newUserSeeds };
}

/**
 * Award seeds to a user
 */
export async function awardSeeds(
  userId: string,
  amount: number,
  source: SeedSource
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  try {
    const userSeedsRef = db.collection('user_seeds').doc(userId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userSeedsRef);

      if (!doc.exists) {
        transaction.set(userSeedsRef, {
          balance: DEFAULT_SEED_BALANCE + amount,
          lifetimePlanted: 0,
          lifetimeEarned: DEFAULT_SEED_BALANCE + amount,
          featuresUnlocked: [],
          earnedFrom: {
            conversations: source === 'conversations' ? amount : 0,
            streaks: source === 'streaks' ? amount : 0,
            referrals: source === 'referrals' ? amount : 0,
            feedback: source === 'feedback' ? amount : 0,
            suggestionsAccepted: source === 'suggestionsAccepted' ? amount : 0,
            featuresBloomed: source === 'featuresBloomed' ? amount : 0,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(userSeedsRef, {
          balance: admin.firestore.FieldValue.increment(amount),
          lifetimeEarned: admin.firestore.FieldValue.increment(amount),
          [`earnedFrom.${source}`]: admin.firestore.FieldValue.increment(amount),
        });
      }
    });

    log.info({ userId, amount, source }, 'Seeds awarded');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, amount, source }, 'Failed to award seeds');
    return false;
  }
}

/**
 * Spend seeds from user balance
 */
export async function spendSeeds(
  userId: string,
  amount: number,
  featureId: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const db = getFirestore();
  if (!db) return { success: false, error: 'Database not available' };

  try {
    return await db.runTransaction(async (transaction) => {
      const userSeedsRef = db.collection('user_seeds').doc(userId);
      const doc = await transaction.get(userSeedsRef);

      if (!doc.exists) {
        return { success: false, error: 'User seeds account not found' };
      }

      const currentBalance = doc.data()?.balance || 0;
      if (currentBalance < amount) {
        return {
          success: false,
          error: `Insufficient seeds. Have ${currentBalance}, need ${amount}`,
        };
      }

      const newBalance = currentBalance - amount;
      transaction.update(userSeedsRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
        lifetimePlanted: admin.firestore.FieldValue.increment(amount),
      });

      return { success: true, newBalance };
    });
  } catch (error) {
    log.error({ error: String(error), userId, amount, featureId }, 'Failed to spend seeds');
    return { success: false, error: 'Transaction failed' };
  }
}

// ============================================================================
// STREAK REWARDS
// ============================================================================

/**
 * Check and award streak bonuses
 */
export async function checkStreakReward(
  userId: string,
  currentStreak: number
): Promise<{ awarded: boolean; milestone?: number; seeds?: number }> {
  const db = getFirestore();
  if (!db) return { awarded: false };

  try {
    const userSeedsRef = db.collection('user_seeds').doc(userId);
    const streakRewardsRef = db.collection('user_streak_rewards').doc(userId);

    return await db.runTransaction(async (transaction) => {
      const streakRewardsDoc = await transaction.get(streakRewardsRef);
      const claimedMilestones: number[] = streakRewardsDoc.exists
        ? streakRewardsDoc.data()?.claimedMilestones || []
        : [];

      const milestones = Object.keys(STREAK_REWARDS)
        .map(Number)
        .sort((a, b) => b - a);

      for (const milestone of milestones) {
        if (currentStreak >= milestone && !claimedMilestones.includes(milestone)) {
          const reward = STREAK_REWARDS[milestone as keyof typeof STREAK_REWARDS];

          const userSeedsDoc = await transaction.get(userSeedsRef);

          if (!userSeedsDoc.exists) {
            transaction.set(userSeedsRef, {
              balance: DEFAULT_SEED_BALANCE + reward,
              lifetimePlanted: 0,
              lifetimeEarned: DEFAULT_SEED_BALANCE + reward,
              featuresUnlocked: [],
              earnedFrom: {
                conversations: 0,
                streaks: reward,
                referrals: 0,
                feedback: 0,
                suggestionsAccepted: 0,
                featuresBloomed: 0,
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.update(userSeedsRef, {
              balance: admin.firestore.FieldValue.increment(reward),
              lifetimeEarned: admin.firestore.FieldValue.increment(reward),
              'earnedFrom.streaks': admin.firestore.FieldValue.increment(reward),
            });
          }

          // Mark milestone as claimed
          if (streakRewardsDoc.exists) {
            transaction.update(streakRewardsRef, {
              claimedMilestones: admin.firestore.FieldValue.arrayUnion(milestone),
              lastClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(streakRewardsRef, {
              claimedMilestones: [milestone],
              lastClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          log.info({ userId, milestone, reward }, 'Streak reward claimed');
          return { awarded: true, milestone, seeds: reward };
        }
      }

      return { awarded: false };
    });
  } catch (error) {
    log.error({ error: String(error), userId, currentStreak }, 'Failed to check streak reward');
    return { awarded: false };
  }
}

// ============================================================================
// FEATURE VOTES
// ============================================================================

/**
 * Record a vote on a feature
 */
export async function recordVote(
  userId: string,
  featureId: string,
  seeds: number
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  try {
    const voteRef = db.collection('feature_votes').doc(`${userId}_${featureId}`);
    const featureRef = db.collection('features').doc(featureId);

    await db.runTransaction(async (transaction) => {
      const voteDoc = await transaction.get(voteRef);
      const additionalSeeds = voteDoc.exists ? seeds : seeds;
      const previousSeeds = voteDoc.exists ? voteDoc.data()?.seedsPlanted || 0 : 0;

      // Update or create vote
      if (voteDoc.exists) {
        transaction.update(voteRef, {
          seedsPlanted: admin.firestore.FieldValue.increment(seeds),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(voteRef, {
          userId,
          featureId,
          seedsPlanted: seeds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Update feature totals
      transaction.update(featureRef, {
        seedsPlanted: admin.firestore.FieldValue.increment(seeds),
        voterCount: voteDoc.exists
          ? admin.firestore.FieldValue.increment(0)
          : admin.firestore.FieldValue.increment(1),
      });
    });

    return true;
  } catch (error) {
    log.error({ error: String(error), userId, featureId, seeds }, 'Failed to record vote');
    return false;
  }
}

/**
 * Get user's vote on a feature
 */
export async function getUserVote(userId: string, featureId: string): Promise<FeatureVote | null> {
  const db = getFirestore();
  if (!db) return null;

  const voteRef = db.collection('feature_votes').doc(`${userId}_${featureId}`);
  const doc = await voteRef.get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    userId: data.userId,
    featureId: data.featureId,
    seedsPlanted: data.seedsPlanted,
    createdAt: data.createdAt?.toDate() || new Date(),
  };
}

// ============================================================================
// FEATURE SUGGESTIONS
// ============================================================================

/**
 * Create a feature suggestion
 */
export async function createSuggestion(
  userId: string,
  title: string,
  description: string
): Promise<FeatureSuggestion | null> {
  const db = getFirestore();
  if (!db) return null;

  try {
    const suggestionRef = db.collection('feature_suggestions').doc();
    const suggestion: Omit<FeatureSuggestion, 'id'> = {
      userId,
      title,
      description,
      status: 'pending',
      seedsReceived: 0,
      votedByUsers: [],
      createdAt: new Date(),
    };

    await suggestionRef.set({
      ...suggestion,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    log.info({ userId, suggestionId: suggestionRef.id, title }, 'Feature suggestion created');

    return { id: suggestionRef.id, ...suggestion };
  } catch (error) {
    log.error({ error: String(error), userId, title }, 'Failed to create suggestion');
    return null;
  }
}

/**
 * Get suggestions with pagination
 */
export async function getSuggestions(options: {
  status?: FeatureSuggestion['status'];
  limit?: number;
  offset?: number;
}): Promise<FeatureSuggestion[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    let query: admin.firestore.Query = db.collection('feature_suggestions');

    if (options.status) {
      query = query.where('status', '==', options.status);
    }

    query = query.orderBy('createdAt', 'desc');

    if (options.offset) {
      query = query.offset(options.offset);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        title: data.title,
        description: data.description,
        status: data.status,
        seedsReceived: data.seedsReceived || 0,
        votedByUsers: data.votedByUsers || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        reviewedAt: data.reviewedAt?.toDate(),
        reviewerNotes: data.reviewerNotes,
      };
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get suggestions');
    return [];
  }
}
