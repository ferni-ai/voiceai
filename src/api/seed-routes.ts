/**
 * Seed Routes - Network Effect Seeds System
 *
 * API endpoints for the Seeds economy:
 * - GET /api/seeds - Get user's seed balance and stats
 * - POST /api/seeds/claim-daily - Claim daily bonus
 * - POST /api/seeds/gift - Gift seeds to another user
 * - GET /api/seeds/garden - Get garden/referral stats
 * - POST /api/seeds/referral - Process a referral signup
 * - GET /api/seeds/history - Get seed transaction history
 */

import * as admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';

const log = createLogger({ module: 'SeedAPI' });

// =============================================================================
// CONSTANTS - Aligned with Frontend
// =============================================================================

/** Starter seeds for new users */
const STARTER_SEEDS = 25;

/** Daily conversation bonus */
const DAILY_BONUS = 5;

/** Referral rewards */
const REFERRAL_SIGNUP_REWARD = 25;
const REFERRAL_NEW_USER_BONUS = 25;
const REFERRAL_STREAK_7_REWARD = 15;
const REFERRAL_STREAK_30_REWARD = 25;
const REFERRAL_SUBSCRIBER_REWARD = 100;

/** Gift multipliers - "Love multiplies" */
const GIFT_MULTIPLIERS: Record<number, number> = {
  10: 1.2,   // 10 → 12 (+20%)
  25: 1.28,  // 25 → 32 (+28%)
  50: 1.4,   // 50 → 70 (+40%)
};

/** Garden passive income rates (seeds per active referral per week) */
const GARDEN_RATES: Record<string, number> = {
  'seedling': 2,       // 1-2 referrals
  'gardener': 3,       // 3-5 referrals
  'grove-keeper': 5,   // 6-10 referrals
  'forest-guardian': 7 // 11+ referrals
};

/** Streak rewards */
const STREAK_REWARDS: Record<number, number> = {
  7: 25,    // 7-day streak
  14: 50,   // 14-day streak
  30: 100,  // 30-day streak
  60: 200,  // 60-day streak
  100: 500, // 100-day streak
};

/** Conversation milestones */
const CONVERSATION_MILESTONES: Record<number, number> = {
  1: 10,    // First conversation
  10: 25,   // 10 conversations
  50: 50,   // 50 conversations
  100: 100, // 100 conversations
};

// =============================================================================
// TYPES
// =============================================================================

interface UserSeeds {
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimePlanted: number;
  currentStreak: number;
  lastDailyClaimDate: string | null;
  lastConversationDate: string | null;
  referralCode: string;
  referredBy: string | null;
  referrals: string[];
  gardenTitle: 'seedling' | 'gardener' | 'grove-keeper' | 'forest-guardian';
  earnedFrom: {
    daily: number;
    streaks: number;
    conversations: number;
    referrals: number;
    gifts: number;
    milestones: number;
  };
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface SeedGift {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  bonusAmount: number;
  message?: string;
  revealedAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

interface SeedTransaction {
  id: string;
  userId: string;
  type: 'earn' | 'spend' | 'gift_sent' | 'gift_received';
  amount: number;
  source: string;
  description: string;
  createdAt: admin.firestore.Timestamp;
}

// =============================================================================
// FIRESTORE
// =============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;
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
      } else {
        admin.initializeApp();
      }
    }
    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for seed routes');
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/** Generate memorable referral code */
const REFERRAL_WORDS = [
  'sunrise', 'garden', 'bloom', 'river', 'forest', 'meadow', 'breeze', 'willow',
  'cedar', 'sage', 'ember', 'dawn', 'dusk', 'haven', 'grove', 'fern', 'moss',
];

function generateReferralCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let prefix = '';
  for (let i = 0; i < 6; i++) {
    prefix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const word = REFERRAL_WORDS[Math.floor(Math.random() * REFERRAL_WORDS.length)];
  return `${prefix}-${word}`;
}

/** Calculate garden title based on referral count */
function getGardenTitle(referralCount: number): UserSeeds['gardenTitle'] {
  if (referralCount >= 11) return 'forest-guardian';
  if (referralCount >= 6) return 'grove-keeper';
  if (referralCount >= 3) return 'gardener';
  return 'seedling';
}

/** Get or create user seeds document */
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
      balance: data.balance ?? STARTER_SEEDS,
      lifetimeEarned: data.lifetimeEarned ?? STARTER_SEEDS,
      lifetimePlanted: data.lifetimePlanted ?? 0,
      currentStreak: data.currentStreak ?? 0,
      lastDailyClaimDate: data.lastDailyClaimDate ?? null,
      lastConversationDate: data.lastConversationDate ?? null,
      referralCode: data.referralCode ?? generateReferralCode(),
      referredBy: data.referredBy ?? null,
      referrals: data.referrals ?? [],
      gardenTitle: data.gardenTitle ?? 'seedling',
      earnedFrom: data.earnedFrom ?? {
        daily: 0,
        streaks: 0,
        conversations: 0,
        referrals: 0,
        gifts: 0,
        milestones: 0,
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  // Create new user
  const now = admin.firestore.Timestamp.now();
  const newUser: Omit<UserSeeds, 'userId'> = {
    balance: STARTER_SEEDS,
    lifetimeEarned: STARTER_SEEDS,
    lifetimePlanted: 0,
    currentStreak: 0,
    lastDailyClaimDate: null,
    lastConversationDate: null,
    referralCode: generateReferralCode(),
    referredBy: null,
    referrals: [],
    gardenTitle: 'seedling',
    earnedFrom: {
      daily: 0,
      streaks: 0,
      conversations: 0,
      referrals: 0,
      gifts: 0,
      milestones: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  await userSeedsRef.set(removeUndefined(newUser));
  log.info({ userId, balance: STARTER_SEEDS }, 'Created new user seeds account');

  return { userId, ...newUser };
}

/** Record a seed transaction */
async function recordTransaction(
  db: admin.firestore.Firestore,
  userId: string,
  type: SeedTransaction['type'],
  amount: number,
  source: string,
  description: string
): Promise<void> {
  const transactionsRef = db.collection('seed_transactions');
  await transactionsRef.add({
    userId,
    type,
    amount,
    source,
    description,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/seeds - Get user's seed balance and stats
 */
async function getSeeds(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const userSeeds = await getOrCreateUserSeeds(db, userId);
    
    // Calculate garden stats
    const activeReferrals = userSeeds.referrals.length;
    const weeklyRate = GARDEN_RATES[userSeeds.gardenTitle] || 2;
    const weeklyPassiveSeeds = activeReferrals * weeklyRate;

    sendJSON(res, {
      balance: userSeeds.balance,
      lifetimeEarned: userSeeds.lifetimeEarned,
      currentStreak: userSeeds.currentStreak,
      dailyBonusAvailable: userSeeds.lastDailyClaimDate !== new Date().toISOString().split('T')[0],
      referralCode: userSeeds.referralCode,
      referralUrl: `https://ferni.ai/grow/${userSeeds.referralCode}`,
      garden: {
        title: userSeeds.gardenTitle,
        totalReferrals: userSeeds.referrals.length,
        activeReferrals,
        weeklyPassiveSeeds,
      },
      earnedFrom: userSeeds.earnedFrom,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get seeds');
    sendError(res, 500, 'Failed to get seeds');
  }
}

/**
 * POST /api/seeds/claim-daily - Claim daily bonus
 */
async function claimDaily(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const userSeedsRef = db.collection('user_seeds').doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userSeedsRef);
      const data = doc.exists ? doc.data()! : null;

      if (data?.lastDailyClaimDate === today) {
        return { claimed: false, reason: 'Already claimed today' };
      }

      const newBalance = (data?.balance ?? STARTER_SEEDS) + DAILY_BONUS;
      const updates: Record<string, unknown> = {
        balance: newBalance,
        lastDailyClaimDate: today,
        lifetimeEarned: admin.firestore.FieldValue.increment(DAILY_BONUS),
        'earnedFrom.daily': admin.firestore.FieldValue.increment(DAILY_BONUS),
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (!doc.exists) {
        transaction.set(userSeedsRef, {
          ...updates,
          referralCode: generateReferralCode(),
          referredBy: null,
          referrals: [],
          gardenTitle: 'seedling',
          currentStreak: 1,
          lastConversationDate: today,
          createdAt: admin.firestore.Timestamp.now(),
        });
      } else {
        // Update streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (data.lastConversationDate === yesterdayStr) {
          updates.currentStreak = (data.currentStreak || 0) + 1;
        } else if (data.lastConversationDate !== today) {
          updates.currentStreak = 1;
        }
        updates.lastConversationDate = today;

        transaction.update(userSeedsRef, updates);
      }

      return { claimed: true, amount: DAILY_BONUS, newBalance };
    });

    if (result.claimed) {
      await recordTransaction(db, userId, 'earn', DAILY_BONUS, 'daily', 'Daily bonus claimed');
    }

    sendJSON(res, result);
  } catch (error) {
    log.error({ error, userId }, 'Failed to claim daily bonus');
    sendError(res, 500, 'Failed to claim daily bonus');
  }
}

/**
 * POST /api/seeds/gift - Gift seeds to another user
 */
async function giftSeeds(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const body = await parseBody(req) as { toUserId: string; amount: number; message?: string };
    const { toUserId, amount, message } = body;

    if (!toUserId || !amount) {
      sendError(res, 400, 'Missing toUserId or amount');
      return;
    }

    if (toUserId === userId) {
      sendError(res, 400, "Can't gift to yourself");
      return;
    }

    if (amount < 10 || amount > 50) {
      sendError(res, 400, 'Gift amount must be between 10 and 50 seeds');
      return;
    }

    // Calculate bonus based on amount
    let multiplier = 1.2;
    if (amount >= 50) multiplier = 1.4;
    else if (amount >= 25) multiplier = 1.28;
    const bonusAmount = Math.round(amount * multiplier) - amount;
    const totalReceived = amount + bonusAmount;

    const senderRef = db.collection('user_seeds').doc(userId);
    const receiverRef = db.collection('user_seeds').doc(toUserId);
    const giftsRef = db.collection('seed_gifts');

    const result = await db.runTransaction(async (transaction) => {
      const senderDoc = await transaction.get(senderRef);
      const receiverDoc = await transaction.get(receiverRef);

      if (!senderDoc.exists) {
        return { success: false, error: 'Sender not found' };
      }

      const senderBalance = senderDoc.data()!.balance || 0;
      if (senderBalance < amount) {
        return { success: false, error: 'Insufficient seeds' };
      }

      // Deduct from sender
      transaction.update(senderRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
        lifetimePlanted: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Add to receiver (with bonus)
      if (!receiverDoc.exists) {
        transaction.set(receiverRef, {
          balance: STARTER_SEEDS + totalReceived,
          lifetimeEarned: STARTER_SEEDS + totalReceived,
          lifetimePlanted: 0,
          currentStreak: 0,
          referralCode: generateReferralCode(),
          referredBy: null,
          referrals: [],
          gardenTitle: 'seedling',
          earnedFrom: { daily: 0, streaks: 0, conversations: 0, referrals: 0, gifts: totalReceived, milestones: 0 },
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.update(receiverRef, {
          balance: admin.firestore.FieldValue.increment(totalReceived),
          lifetimeEarned: admin.firestore.FieldValue.increment(totalReceived),
          'earnedFrom.gifts': admin.firestore.FieldValue.increment(totalReceived),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      // Create gift record
      const giftRef = giftsRef.doc();
      transaction.set(giftRef, {
        fromUserId: userId,
        toUserId,
        amount,
        bonusAmount,
        message: message || null,
        createdAt: admin.firestore.Timestamp.now(),
      });

      return {
        success: true,
        giftId: giftRef.id,
        amountSent: amount,
        bonusAmount,
        totalReceived,
        newBalance: senderBalance - amount,
      };
    });

    if (result.success) {
      // Record transactions
      await Promise.all([
        recordTransaction(db, userId, 'gift_sent', amount, 'gift', `Gift to ${toUserId}`),
        recordTransaction(db, toUserId, 'gift_received', totalReceived, 'gift', `Gift from ${userId}`),
      ]);
    }

    sendJSON(res, result);
  } catch (error) {
    log.error({ error, userId }, 'Failed to gift seeds');
    sendError(res, 500, 'Failed to gift seeds');
  }
}

/**
 * GET /api/seeds/garden - Get garden (referral network) stats
 */
async function getGarden(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const userSeeds = await getOrCreateUserSeeds(db, userId);
    
    // Get details for each referral
    const referralDetails = await Promise.all(
      userSeeds.referrals.slice(0, 20).map(async (refUserId) => {
        const refDoc = await db.collection('user_seeds').doc(refUserId).get();
        if (!refDoc.exists) return null;
        const data = refDoc.data()!;
        return {
          id: refUserId,
          streak: data.currentStreak || 0,
          isActive: data.lastConversationDate === new Date().toISOString().split('T')[0] ||
                    data.lastConversationDate === (() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      return d.toISOString().split('T')[0];
                    })(),
          joinedAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      })
    );

    const activeReferrals = referralDetails.filter(r => r?.isActive).length;
    const weeklyRate = GARDEN_RATES[userSeeds.gardenTitle] || 2;

    sendJSON(res, {
      title: userSeeds.gardenTitle,
      totalReferrals: userSeeds.referrals.length,
      activeReferrals,
      weeklyPassiveSeeds: activeReferrals * weeklyRate,
      totalEarnedFromReferrals: userSeeds.earnedFrom.referrals,
      referralCode: userSeeds.referralCode,
      referralUrl: `https://ferni.ai/grow/${userSeeds.referralCode}`,
      referrals: referralDetails.filter(Boolean),
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get garden stats');
    sendError(res, 500, 'Failed to get garden stats');
  }
}

/**
 * POST /api/seeds/referral - Process a referral signup
 */
async function processReferral(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const body = await parseBody(req) as { referralCode: string };
    const { referralCode } = body;

    if (!referralCode) {
      sendError(res, 400, 'Missing referral code');
      return;
    }

    // Find referrer by code
    const referrersQuery = await db.collection('user_seeds')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (referrersQuery.empty) {
      sendError(res, 404, 'Invalid referral code');
      return;
    }

    const referrerDoc = referrersQuery.docs[0];
    const referrerId = referrerDoc.id;

    if (referrerId === userId) {
      sendError(res, 400, "Can't refer yourself");
      return;
    }

    const userSeedsRef = db.collection('user_seeds').doc(userId);
    const referrerRef = db.collection('user_seeds').doc(referrerId);

    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userSeedsRef);
      
      if (userDoc.exists && userDoc.data()?.referredBy) {
        return { success: false, error: 'Already referred by someone' };
      }

      // Award new user bonus
      if (!userDoc.exists) {
        transaction.set(userSeedsRef, {
          balance: STARTER_SEEDS + REFERRAL_NEW_USER_BONUS,
          lifetimeEarned: STARTER_SEEDS + REFERRAL_NEW_USER_BONUS,
          lifetimePlanted: 0,
          currentStreak: 0,
          referralCode: generateReferralCode(),
          referredBy: referrerId,
          referrals: [],
          gardenTitle: 'seedling',
          earnedFrom: { daily: 0, streaks: 0, conversations: 0, referrals: REFERRAL_NEW_USER_BONUS, gifts: 0, milestones: 0 },
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.update(userSeedsRef, {
          balance: admin.firestore.FieldValue.increment(REFERRAL_NEW_USER_BONUS),
          lifetimeEarned: admin.firestore.FieldValue.increment(REFERRAL_NEW_USER_BONUS),
          referredBy: referrerId,
          'earnedFrom.referrals': admin.firestore.FieldValue.increment(REFERRAL_NEW_USER_BONUS),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      // Award referrer bonus and add to their garden
      const referrerData = referrerDoc.data()!;
      const newReferrals = [...(referrerData.referrals || []), userId];
      const newGardenTitle = getGardenTitle(newReferrals.length);

      transaction.update(referrerRef, {
        balance: admin.firestore.FieldValue.increment(REFERRAL_SIGNUP_REWARD),
        lifetimeEarned: admin.firestore.FieldValue.increment(REFERRAL_SIGNUP_REWARD),
        referrals: admin.firestore.FieldValue.arrayUnion(userId),
        gardenTitle: newGardenTitle,
        'earnedFrom.referrals': admin.firestore.FieldValue.increment(REFERRAL_SIGNUP_REWARD),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return {
        success: true,
        newUserBonus: REFERRAL_NEW_USER_BONUS,
        referrerBonus: REFERRAL_SIGNUP_REWARD,
        referrerId,
      };
    });

    if (result.success) {
      // Record transactions
      await Promise.all([
        recordTransaction(db, userId, 'earn', REFERRAL_NEW_USER_BONUS, 'referral', 'Referral signup bonus'),
        recordTransaction(db, referrerId, 'earn', REFERRAL_SIGNUP_REWARD, 'referral', `Referred ${userId}`),
      ]);
    }

    sendJSON(res, result);
  } catch (error) {
    log.error({ error, userId }, 'Failed to process referral');
    sendError(res, 500, 'Failed to process referral');
  }
}

/**
 * GET /api/seeds/history - Get seed transaction history
 */
async function getHistory(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.UNAUTHORIZED);
    return;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return;
  }

  try {
    const transactionsQuery = await db.collection('seed_transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const transactions = transactionsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    sendJSON(res, { transactions });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get transaction history');
    sendError(res, 500, 'Failed to get history');
  }
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

export function registerSeedRoutes(
  router: Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>
): void {
  // Apply auth and rate limiting to all seed routes
  router.set('GET /api/seeds', rateLimit(100)(requireAuth(getSeeds)));
  router.set('POST /api/seeds/claim-daily', rateLimit(10)(requireAuth(claimDaily)));
  router.set('POST /api/seeds/gift', rateLimit(20)(requireAuth(giftSeeds)));
  router.set('GET /api/seeds/garden', rateLimit(100)(requireAuth(getGarden)));
  router.set('POST /api/seeds/referral', rateLimit(10)(requireAuth(processReferral)));
  router.set('GET /api/seeds/history', rateLimit(50)(requireAuth(getHistory)));

  log.info('Seed routes registered');
}

export default registerSeedRoutes;

