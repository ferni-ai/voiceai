/**
 * Seeds Routes - Network Effect Seeds Economy
 *
 * API endpoints for the Seeds system:
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

const log = createLogger({ module: 'SeedsRoutes' });

// =============================================================================
// CONSTANTS - Aligned with Frontend
// =============================================================================

const STARTER_SEEDS = 25;
const DAILY_BONUS = 5;
const REFERRAL_SIGNUP_REWARD = 25;
const REFERRAL_NEW_USER_BONUS = 25;

/** Gift multipliers - "Love multiplies" */
const GIFT_MULTIPLIERS: Record<number, number> = {
  10: 1.2, // 10 → 12 (+20%)
  25: 1.28, // 25 → 32 (+28%)
  50: 1.4, // 50 → 70 (+40%)
};

/** Garden passive income rates */
const GARDEN_RATES: Record<string, number> = {
  seedling: 2,
  gardener: 3,
  'grove-keeper': 5,
  'forest-guardian': 7,
};

/** Streak rewards */
const STREAK_REWARDS: Record<number, number> = {
  7: 25,
  14: 50,
  30: 100,
  60: 200,
  100: 500,
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
    log.warn({ error }, 'Firebase not available for seeds routes');
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

const REFERRAL_WORDS = [
  'sunrise',
  'garden',
  'bloom',
  'river',
  'forest',
  'meadow',
  'breeze',
  'willow',
  'cedar',
  'sage',
  'ember',
  'dawn',
  'dusk',
  'haven',
  'grove',
  'fern',
  'moss',
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

function getGardenTitle(referralCount: number): UserSeeds['gardenTitle'] {
  if (referralCount >= 11) return 'forest-guardian';
  if (referralCount >= 6) return 'grove-keeper';
  if (referralCount >= 3) return 'gardener';
  return 'seedling';
}

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
  };

  await userSeedsRef.set(removeUndefined({ ...newUser, createdAt: now, updatedAt: now }));
  log.info({ userId, balance: STARTER_SEEDS }, 'Created new user seeds account');

  return { userId, ...newUser };
}

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getUserId(req: IncomingMessage): string | null {
  return (req.headers['x-user-id'] as string) || (req.headers['x-device-id'] as string) || null;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Handle all seeds routes
 */
export async function handleSeedsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/seeds')) {
    return false;
  }

  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Unauthorized');
    return true;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 503, 'Database unavailable');
    return true;
  }

  try {
    // GET /api/seeds - Get user's seed balance and stats
    if (pathname === '/api/seeds' && req.method === 'GET') {
      const userSeeds = await getOrCreateUserSeeds(db, userId);
      const today = new Date().toISOString().split('T')[0];
      const activeReferrals = userSeeds.referrals.length;
      const weeklyRate = GARDEN_RATES[userSeeds.gardenTitle] || 2;

      sendJSON(res, {
        balance: userSeeds.balance,
        lifetimeEarned: userSeeds.lifetimeEarned,
        currentStreak: userSeeds.currentStreak,
        dailyBonusAvailable: userSeeds.lastDailyClaimDate !== today,
        referralCode: userSeeds.referralCode,
        referralUrl: `https://ferni.ai/grow/${userSeeds.referralCode}`,
        garden: {
          title: userSeeds.gardenTitle,
          totalReferrals: userSeeds.referrals.length,
          activeReferrals,
          weeklyPassiveSeeds: activeReferrals * weeklyRate,
        },
        earnedFrom: userSeeds.earnedFrom,
      });
      return true;
    }

    // POST /api/seeds/claim-daily - Claim daily bonus
    if (pathname === '/api/seeds/claim-daily' && req.method === 'POST') {
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
        } else if (data) {
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

      sendJSON(res, result);
      return true;
    }

    // POST /api/seeds/gift - Gift seeds to another user
    if (pathname === '/api/seeds/gift' && req.method === 'POST') {
      const body = (await parseBody(req)) as { toUserId: string; amount: number; message?: string };
      const { toUserId, amount, message } = body;

      if (!toUserId || !amount) {
        sendError(res, 400, 'Missing toUserId or amount');
        return true;
      }

      if (toUserId === userId) {
        sendError(res, 400, "Can't gift to yourself");
        return true;
      }

      if (amount < 10 || amount > 50) {
        sendError(res, 400, 'Gift amount must be between 10 and 50 seeds');
        return true;
      }

      let multiplier = 1.2;
      if (amount >= 50) multiplier = 1.4;
      else if (amount >= 25) multiplier = 1.28;
      const bonusAmount = Math.round(amount * multiplier) - amount;
      const totalReceived = amount + bonusAmount;

      const senderRef = db.collection('user_seeds').doc(userId);
      const receiverRef = db.collection('user_seeds').doc(toUserId);

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

        transaction.update(senderRef, {
          balance: admin.firestore.FieldValue.increment(-amount),
          lifetimePlanted: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.Timestamp.now(),
        });

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
            earnedFrom: {
              daily: 0,
              streaks: 0,
              conversations: 0,
              referrals: 0,
              gifts: totalReceived,
              milestones: 0,
            },
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

        return {
          success: true,
          amountSent: amount,
          bonusAmount,
          totalReceived,
          newBalance: senderBalance - amount,
        };
      });

      sendJSON(res, result);
      return true;
    }

    // GET /api/seeds/garden - Get garden stats
    if (pathname === '/api/seeds/garden' && req.method === 'GET') {
      const userSeeds = await getOrCreateUserSeeds(db, userId);
      const activeReferrals = userSeeds.referrals.length;
      const weeklyRate = GARDEN_RATES[userSeeds.gardenTitle] || 2;

      sendJSON(res, {
        title: userSeeds.gardenTitle,
        totalReferrals: userSeeds.referrals.length,
        activeReferrals,
        weeklyPassiveSeeds: activeReferrals * weeklyRate,
        totalEarnedFromReferrals: userSeeds.earnedFrom.referrals,
        referralCode: userSeeds.referralCode,
        referralUrl: `https://ferni.ai/grow/${userSeeds.referralCode}`,
      });
      return true;
    }

    // POST /api/seeds/referral - Process a referral signup
    if (pathname === '/api/seeds/referral' && req.method === 'POST') {
      const body = (await parseBody(req)) as { referralCode: string };
      const { referralCode } = body;

      if (!referralCode) {
        sendError(res, 400, 'Missing referral code');
        return true;
      }

      const referrersQuery = await db
        .collection('user_seeds')
        .where('referralCode', '==', referralCode)
        .limit(1)
        .get();

      if (referrersQuery.empty) {
        sendError(res, 404, 'Invalid referral code');
        return true;
      }

      const referrerDoc = referrersQuery.docs[0];
      const referrerId = referrerDoc.id;

      if (referrerId === userId) {
        sendError(res, 400, "Can't refer yourself");
        return true;
      }

      const userSeedsRef = db.collection('user_seeds').doc(userId);
      const referrerRef = db.collection('user_seeds').doc(referrerId);

      const result = await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userSeedsRef);

        if (userDoc.exists && userDoc.data()?.referredBy) {
          return { success: false, error: 'Already referred by someone' };
        }

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
            earnedFrom: {
              daily: 0,
              streaks: 0,
              conversations: 0,
              referrals: REFERRAL_NEW_USER_BONUS,
              gifts: 0,
              milestones: 0,
            },
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
        };
      });

      sendJSON(res, result);
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error, pathname, userId }, 'Seeds route error');
    sendError(res, 500, 'Internal server error');
    return true;
  }
}

export default handleSeedsRoutes;
