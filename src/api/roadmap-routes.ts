/**
 * Roadmap API Routes (Seed Economy)
 *
 * Handles the "What's Growing" feature voting and suggestion system.
 * Users earn and spend "seeds" to vote on features and submit suggestions.
 *
 * Routes:
 * - GET /api/roadmap/stats - Get feature vote counts (public)
 * - GET /api/roadmap/seeds - Get user's seed balance
 * - POST /api/roadmap/vote - Plant seeds on a feature
 * - DELETE /api/roadmap/vote/:featureId - Unvote (50% seed refund)
 * - GET /api/roadmap/votes - Get user's votes
 * - POST /api/roadmap/suggest - Submit a new feature suggestion
 * - GET /api/roadmap/suggestions - Browse community suggestions
 *
 * @see apps/BETTER-THAN-HUMAN-PLAN.md for full architecture
 */

import * as admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { optionalAuthAsync, rateLimit } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';

const log = createLogger({ module: 'RoadmapAPI' });

// =============================================================================
// TYPES
// =============================================================================

export interface RoadmapVote {
  id: string;
  userId: string;
  featureId: string;
  seedsPlanted: number;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapSuggestion {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: 'connect' | 'personalize' | 'platform';
  seedsPlanted: number;
  communitySeeds: number;
  status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'merged';
  mergedIntoFeatureId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSeeds {
  userId: string;
  balance: number;
  lifetimePlanted: number;
  lifetimeEarned: number;
  featuresUnlocked: string[];
  earnedFrom: {
    conversations: number;
    streaks: number;
    referrals: number;
    feedback: number;
    suggestionsAccepted: number;
    featuresBloomed: number;
  };
}

export interface FeatureStats {
  featureId: string;
  totalSeeds: number;
  uniqueVoters: number;
  topReasons: string[];
}

// Request/Response types
interface VoteRequest {
  featureId: string;
  seeds: number;
  reason?: string;
}

interface SuggestionRequest {
  title: string;
  description: string;
  category: 'connect' | 'personalize' | 'platform';
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default seeds for new users */
const DEFAULT_SEED_BALANCE = 10;

/** Cost to submit a suggestion */
const SUGGESTION_COST = 5;

/** Refund percentage when unvoting */
const UNVOTE_REFUND_PERCENT = 0.5;

/** Max seeds per vote */
const MAX_SEEDS_PER_VOTE = 10;

/** Min seeds per vote */
const MIN_SEEDS_PER_VOTE = 1;

/** Streak rewards */
const STREAK_REWARDS = {
  7: 5, // 7-day streak: 5 seeds
  30: 15, // 30-day streak: 15 seeds
} as const;

// =============================================================================
// FIRESTORE
// =============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    // Check if admin.apps exists and has length (handles undefined case)
    const { apps } = admin;
    if (!apps || apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for roadmap routes');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for roadmap routes');
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get or create user seeds document
 */
async function getOrCreateUserSeeds(
  db: admin.firestore.Firestore,
  userId: string
): Promise<UserSeeds> {
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
  source: keyof UserSeeds['earnedFrom']
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  try {
    const userSeedsRef = db.collection('user_seeds').doc(userId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userSeedsRef);

      if (!doc.exists) {
        // Create with bonus
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
 * Check and award streak bonuses
 * Call this after a conversation completes to check if user reached a streak milestone
 */
export async function checkStreakReward(
  userId: string,
  currentStreak: number
): Promise<{ awarded: boolean; milestone?: number; seeds?: number }> {
  const db = getFirestore();
  if (!db) return { awarded: false };

  try {
    // Check if user already received this streak milestone reward
    const userSeedsRef = db.collection('user_seeds').doc(userId);
    const streakRewardsRef = db.collection('user_streak_rewards').doc(userId);

    return await db.runTransaction(async (transaction) => {
      const streakRewardsDoc = await transaction.get(streakRewardsRef);
      const claimedMilestones: number[] = streakRewardsDoc.exists
        ? streakRewardsDoc.data()?.claimedMilestones || []
        : [];

      // Check each milestone from highest to lowest
      const milestones = Object.keys(STREAK_REWARDS)
        .map(Number)
        .sort((a, b) => b - a);

      for (const milestone of milestones) {
        // Check if user reached this milestone and hasn't claimed it yet
        if (currentStreak >= milestone && !claimedMilestones.includes(milestone)) {
          const reward = STREAK_REWARDS[milestone as keyof typeof STREAK_REWARDS];

          // Award the seeds
          const userSeedsDoc = await transaction.get(userSeedsRef);

          if (!userSeedsDoc.exists) {
            // Create user seeds doc with bonus
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
          if (!streakRewardsDoc.exists) {
            transaction.set(streakRewardsRef, {
              claimedMilestones: [milestone],
              lastClaimed: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.update(streakRewardsRef, {
              claimedMilestones: admin.firestore.FieldValue.arrayUnion(milestone),
              lastClaimed: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          log.info({ userId, milestone, reward }, 'Streak reward awarded');
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

/**
 * Get streak rewards that are still available to earn
 */
export function getAvailableStreakRewards(): Array<{ milestone: number; seeds: number }> {
  return Object.entries(STREAK_REWARDS).map(([milestone, seeds]) => ({
    milestone: Number(milestone),
    seeds,
  }));
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/roadmap/stats
 * Get aggregated vote counts per feature (public)
 */
async function handleGetStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const db = getFirestore();

    // Fallback when database unavailable
    if (!db) {
      log.warn('Firestore unavailable - returning roadmap fallback');
      sendJSON(res, { features: [], lastUpdated: new Date().toISOString() });
      return;
    }

    // Get all feature stats
    const statsSnapshot = await db.collection('roadmap_feature_stats').get();

    const features: FeatureStats[] = [];
    statsSnapshot.forEach((doc) => {
      const data = doc.data();
      features.push({
        featureId: doc.id,
        totalSeeds: data.totalSeeds || 0,
        uniqueVoters: data.uniqueVoters || 0,
        topReasons: data.topReasons || [],
      });
    });

    sendJSON(res, {
      features,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get roadmap stats');
    sendJSON(res, { features: [], lastUpdated: new Date().toISOString() });
  }
}

/**
 * GET /api/roadmap/seeds
 * Get user's seed balance
 */
async function handleGetSeeds(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const userSeeds = await getOrCreateUserSeeds(db, userId);
    sendJSON(res, userSeeds);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user seeds');
    sendError(res, 'Failed to get seed balance');
  }
}

/**
 * POST /api/roadmap/vote
 * Plant seeds on a feature
 */
async function handleVote(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<VoteRequest>(req);
    const { featureId, seeds, reason } = body;

    if (!featureId) {
      sendError(res, 'Feature ID required', 400);
      return;
    }

    if (!seeds || seeds < MIN_SEEDS_PER_VOTE || seeds > MAX_SEEDS_PER_VOTE) {
      sendError(res, `Seeds must be between ${MIN_SEEDS_PER_VOTE} and ${MAX_SEEDS_PER_VOTE}`, 400);
      return;
    }

    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    // Transaction to check balance and create vote
    const result = await db.runTransaction(async (transaction) => {
      // Get user seeds
      const userSeedsRef = db.collection('user_seeds').doc(userId);
      const userSeedsDoc = await transaction.get(userSeedsRef);

      let currentBalance = DEFAULT_SEED_BALANCE;
      if (userSeedsDoc.exists) {
        currentBalance = userSeedsDoc.data()?.balance || 0;
      }

      if (currentBalance < seeds) {
        return { success: false, error: 'Insufficient seeds', balance: currentBalance };
      }

      // Check if user already voted on this feature
      const existingVoteQuery = await db
        .collection('roadmap_votes')
        .where('userId', '==', userId)
        .where('featureId', '==', featureId)
        .limit(1)
        .get();

      if (!existingVoteQuery.empty) {
        // Update existing vote
        const existingVoteDoc = existingVoteQuery.docs[0];
        const existingSeeds = existingVoteDoc.data().seedsPlanted || 0;
        const additionalSeeds = seeds;

        if (currentBalance < additionalSeeds) {
          return { success: false, error: 'Insufficient seeds', balance: currentBalance };
        }

        transaction.update(existingVoteDoc.ref, {
          seedsPlanted: admin.firestore.FieldValue.increment(additionalSeeds),
          reason: reason || existingVoteDoc.data().reason,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update user balance
        if (userSeedsDoc.exists) {
          transaction.update(userSeedsRef, {
            balance: admin.firestore.FieldValue.increment(-additionalSeeds),
            lifetimePlanted: admin.firestore.FieldValue.increment(additionalSeeds),
          });
        } else {
          transaction.set(userSeedsRef, {
            balance: DEFAULT_SEED_BALANCE - additionalSeeds,
            lifetimePlanted: additionalSeeds,
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Update feature stats
        const featureStatsRef = db.collection('roadmap_feature_stats').doc(featureId);
        transaction.set(
          featureStatsRef,
          {
            totalSeeds: admin.firestore.FieldValue.increment(additionalSeeds),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return {
          success: true,
          voteId: existingVoteDoc.id,
          totalSeedsPlanted: existingSeeds + additionalSeeds,
          newBalance: currentBalance - additionalSeeds,
        };
      }

      // Create new vote
      const voteRef = db.collection('roadmap_votes').doc();
      transaction.set(voteRef, {
        userId,
        featureId,
        seedsPlanted: seeds,
        reason: reason || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update user balance
      if (userSeedsDoc.exists) {
        transaction.update(userSeedsRef, {
          balance: admin.firestore.FieldValue.increment(-seeds),
          lifetimePlanted: admin.firestore.FieldValue.increment(seeds),
        });
      } else {
        transaction.set(userSeedsRef, {
          balance: DEFAULT_SEED_BALANCE - seeds,
          lifetimePlanted: seeds,
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Update feature stats
      const featureStatsRef = db.collection('roadmap_feature_stats').doc(featureId);
      transaction.set(
        featureStatsRef,
        {
          totalSeeds: admin.firestore.FieldValue.increment(seeds),
          uniqueVoters: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        success: true,
        voteId: voteRef.id,
        totalSeedsPlanted: seeds,
        newBalance: currentBalance - seeds,
      };
    });

    if (!result.success) {
      sendError(res, result.error || 'Vote failed', 400);
      return;
    }

    log.info({ userId, featureId, seeds }, 'Vote recorded');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record vote');
    sendError(res, 'Failed to record vote');
  }
}

/**
 * DELETE /api/roadmap/vote/:featureId
 * Remove vote and get 50% seeds back
 */
async function handleUnvote(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  featureId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const result = await db.runTransaction(async (transaction) => {
      // Find user's vote for this feature
      const voteQuery = await db
        .collection('roadmap_votes')
        .where('userId', '==', userId)
        .where('featureId', '==', featureId)
        .limit(1)
        .get();

      if (voteQuery.empty) {
        return { success: false, error: 'Vote not found' };
      }

      const voteDoc = voteQuery.docs[0];
      const seedsPlanted = voteDoc.data().seedsPlanted || 0;
      const refund = Math.floor(seedsPlanted * UNVOTE_REFUND_PERCENT);

      // Delete vote
      transaction.delete(voteDoc.ref);

      // Refund seeds
      const userSeedsRef = db.collection('user_seeds').doc(userId);
      transaction.update(userSeedsRef, {
        balance: admin.firestore.FieldValue.increment(refund),
      });

      // Update feature stats
      const featureStatsRef = db.collection('roadmap_feature_stats').doc(featureId);
      transaction.update(featureStatsRef, {
        totalSeeds: admin.firestore.FieldValue.increment(-seedsPlanted),
        uniqueVoters: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        seedsRefunded: refund,
        seedsLost: seedsPlanted - refund,
      };
    });

    if (!result.success) {
      sendError(res, result.error || 'Unvote failed', 400);
      return;
    }

    log.info({ userId, featureId, refund: result.seedsRefunded }, 'Vote removed');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId, featureId }, 'Failed to remove vote');
    sendError(res, 'Failed to remove vote');
  }
}

/**
 * GET /api/roadmap/votes
 * Get user's votes
 */
async function handleGetUserVotes(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const votesSnapshot = await db
      .collection('roadmap_votes')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const votes: Array<{
      featureId: string;
      seedsPlanted: number;
      reason?: string;
      createdAt: string;
    }> = [];

    votesSnapshot.forEach((doc) => {
      const data = doc.data();
      votes.push({
        featureId: data.featureId,
        seedsPlanted: data.seedsPlanted,
        reason: data.reason,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    sendJSON(res, { votes });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user votes');
    sendError(res, 'Failed to get votes');
  }
}

/**
 * POST /api/roadmap/suggest
 * Submit a new feature suggestion (costs seeds)
 */
async function handleSuggest(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<SuggestionRequest>(req);
    const { title, description, category } = body;

    if (!title || title.length < 5) {
      sendError(res, 'Title must be at least 5 characters', 400);
      return;
    }

    if (!description || description.length < 20) {
      sendError(res, 'Description must be at least 20 characters', 400);
      return;
    }

    if (!['connect', 'personalize', 'platform'].includes(category)) {
      sendError(res, 'Invalid category', 400);
      return;
    }

    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const result = await db.runTransaction(async (transaction) => {
      // Check user balance
      const userSeedsRef = db.collection('user_seeds').doc(userId);
      const userSeedsDoc = await transaction.get(userSeedsRef);

      let currentBalance = DEFAULT_SEED_BALANCE;
      if (userSeedsDoc.exists) {
        currentBalance = userSeedsDoc.data()?.balance || 0;
      }

      if (currentBalance < SUGGESTION_COST) {
        return {
          success: false,
          error: `Submitting a suggestion costs ${SUGGESTION_COST} seeds. You have ${currentBalance}.`,
        };
      }

      // Create suggestion
      const suggestionRef = db.collection('roadmap_suggestions').doc();
      transaction.set(suggestionRef, {
        userId,
        title,
        description,
        category,
        seedsPlanted: SUGGESTION_COST,
        communitySeeds: 0,
        status: 'submitted',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Deduct seeds
      if (userSeedsDoc.exists) {
        transaction.update(userSeedsRef, {
          balance: admin.firestore.FieldValue.increment(-SUGGESTION_COST),
          lifetimePlanted: admin.firestore.FieldValue.increment(SUGGESTION_COST),
        });
      } else {
        transaction.set(userSeedsRef, {
          balance: DEFAULT_SEED_BALANCE - SUGGESTION_COST,
          lifetimePlanted: SUGGESTION_COST,
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        suggestionId: suggestionRef.id,
        newBalance: currentBalance - SUGGESTION_COST,
      };
    });

    if (!result.success) {
      sendError(res, result.error || 'Suggestion failed', 400);
      return;
    }

    log.info({ userId, title, category }, 'Suggestion submitted');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to submit suggestion');
    sendError(res, 'Failed to submit suggestion');
  }
}

/**
 * GET /api/roadmap/suggestions
 * Browse community suggestions
 */
async function handleGetSuggestions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendJSON(res, { suggestions: [] });
      return;
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const status = url.searchParams.get('status') || 'submitted';
    const category = url.searchParams.get('category');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    let query: admin.firestore.Query = db.collection('roadmap_suggestions');

    if (status !== 'all') {
      query = query.where('status', '==', status);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('communitySeeds', 'desc').limit(limit);

    const snapshot = await query.get();

    const suggestions: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      seedsPlanted: number;
      communitySeeds: number;
      status: string;
      createdAt: string;
    }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      suggestions.push({
        id: doc.id,
        title: data.title,
        description: data.description,
        category: data.category,
        seedsPlanted: data.seedsPlanted,
        communitySeeds: data.communitySeeds,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    sendJSON(res, { suggestions });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get suggestions');
    sendJSON(res, { suggestions: [] });
  }
}

/**
 * POST /api/roadmap/streak-reward
 * Check and claim streak reward based on current streak
 */
async function handleStreakReward(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<{ currentStreak: number }>(req);
    const { currentStreak } = body;

    if (typeof currentStreak !== 'number' || currentStreak < 0) {
      sendError(res, 'Valid streak count required', 400);
      return;
    }

    const result = await checkStreakReward(userId, currentStreak);

    if (result.awarded) {
      // Fetch updated balance
      const db = getFirestore();
      if (db) {
        const userSeeds = await getOrCreateUserSeeds(db, userId);
        sendJSON(res, {
          success: true,
          awarded: true,
          milestone: result.milestone,
          seedsAwarded: result.seeds,
          newBalance: userSeeds.balance,
          message: `🎉 Congratulations! ${result.milestone}-day streak earned you ${result.seeds} seeds!`,
        });
        return;
      }
    }

    sendJSON(res, {
      success: true,
      awarded: false,
      message: 'No streak milestone reached',
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check streak reward');
    sendError(res, 'Failed to check streak reward');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main route handler for roadmap routes
 */
export async function handleRoadmapRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/roadmap routes
  if (!pathname.startsWith('/api/roadmap')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  const method = req.method || 'GET';

  // GET /api/roadmap/stats - Public endpoint
  if (pathname === '/api/roadmap/stats' && method === 'GET') {
    await handleGetStats(req, res);
    return true;
  }

  // GET /api/roadmap/suggestions - Public endpoint
  if (pathname === '/api/roadmap/suggestions' && method === 'GET') {
    await handleGetSuggestions(req, res);
    return true;
  }

  // Auth required for remaining endpoints
  const auth = await optionalAuthAsync(req);
  const userId = auth?.userId || getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }

  // GET /api/roadmap/seeds - Get user's seed balance
  if (pathname === '/api/roadmap/seeds' && method === 'GET') {
    await handleGetSeeds(req, res, userId);
    return true;
  }

  // POST /api/roadmap/vote - Plant seeds on a feature
  if (pathname === '/api/roadmap/vote' && method === 'POST') {
    await handleVote(req, res, userId);
    return true;
  }

  // DELETE /api/roadmap/vote/:featureId - Unvote
  if (pathname.startsWith('/api/roadmap/vote/') && method === 'DELETE') {
    const featureId = pathname.split('/').pop();
    if (!featureId) {
      sendError(res, 'Feature ID required', 400);
      return true;
    }
    await handleUnvote(req, res, userId, featureId);
    return true;
  }

  // GET /api/roadmap/votes - Get user's votes
  if (pathname === '/api/roadmap/votes' && method === 'GET') {
    await handleGetUserVotes(req, res, userId);
    return true;
  }

  // POST /api/roadmap/suggest - Submit a suggestion
  if (pathname === '/api/roadmap/suggest' && method === 'POST') {
    await handleSuggest(req, res, userId);
    return true;
  }

  // POST /api/roadmap/streak-reward - Check and claim streak reward
  if (pathname === '/api/roadmap/streak-reward' && method === 'POST') {
    await handleStreakReward(req, res, userId);
    return true;
  }

  // GET /api/roadmap/streak-rewards - Get available streak milestones
  if (pathname === '/api/roadmap/streak-rewards' && method === 'GET') {
    sendJSON(res, { rewards: getAvailableStreakRewards() });
    return true;
  }

  // No matching route
  return false;
}

// =============================================================================
// SEED EARNING (Called from session cleanup)
// =============================================================================

/**
 * Award seeds to a user for completing a conversation.
 * Called from the voice agent cleanup handler.
 *
 * @param userId - User to award seeds to
 * @param seedsToAward - Number of seeds to award (default: 1)
 * @param source - Source of seed earning (for analytics)
 */
export async function awardSeedsForConversation(
  userId: string,
  seedsToAward = 1,
  source: 'conversation' | 'streak' | 'referral' = 'conversation'
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User ID required' };
  }

  try {
    const db = getFirestore();
    if (!db) {
      log.warn({ userId }, 'Firestore not initialized, skipping seed award');
      return { success: false, error: 'Database not available' };
    }
    const userSeedsRef = db.collection('user_seeds').doc(userId);

    let newBalance = 0;

    await db.runTransaction(async (transaction) => {
      const userSeedsDoc = await transaction.get(userSeedsRef);
      const userSeeds = userSeedsDoc.exists
        ? (userSeedsDoc.data() as UserSeeds)
        : {
            userId,
            balance: 10, // New users start with 10 seeds
            lifetimePlanted: 0,
            lifetimeEarned: 10,
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

      // Update balance and tracking
      userSeeds.balance += seedsToAward;
      userSeeds.lifetimeEarned += seedsToAward;

      // Track source of earning
      if (source === 'conversation') {
        userSeeds.earnedFrom.conversations += seedsToAward;
      } else if (source === 'streak') {
        userSeeds.earnedFrom.streaks += seedsToAward;
      } else if (source === 'referral') {
        userSeeds.earnedFrom.referrals += seedsToAward;
      }

      newBalance = userSeeds.balance;

      transaction.set(userSeedsRef, userSeeds, { merge: true });
    });

    log.info({ userId, seedsToAward, source, newBalance }, 'Seeds awarded');

    return { success: true, newBalance };
  } catch (error) {
    log.error({ error, userId }, 'Failed to award seeds');
    return { success: false, error: 'Database error' };
  }
}

export default handleRoadmapRoutes;
