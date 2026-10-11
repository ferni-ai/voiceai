/**
 * Seeds Routes - Network Effect Seeds Economy
 *
 * API endpoints for the Seeds system:
 * - GET /api/seeds - Get user's seed balance and stats
 * - POST /api/seeds/claim-daily - Claim daily bonus
 * - POST /api/seeds/gift - Gift seeds to another user
 * - POST /api/seeds/purchase - Buy a cosmetic (seeds-purchase.ts)
 * - GET /api/seeds/garden - Get garden/referral stats
 * - POST /api/seeds/referral - Process a referral signup
 * - GET /api/seeds/history - Get seed transaction history
 */

import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { getUserId, parseBody, sendJSON, sendError } from './helpers.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { awardDailyConversation, DAILY_SEEDS } from '../services/seeds/earn.js';
import {
  commitSeeds,
  ENTRIES_SUBCOLLECTION,
  InsufficientSeedsError,
  prepareSeeds,
  STARTER_SEEDS,
} from '../services/seeds/ledger.js';
import { ownedCosmetics } from '../services/seeds/cosmetics-catalog.js';
import { purchaseCosmetic } from './seeds-purchase.js';

const log = createLogger({ module: 'SeedsRoutes' });

// =============================================================================
// CONSTANTS - Aligned with Frontend
// =============================================================================

const REFERRAL_SIGNUP_REWARD = 25;
const REFERRAL_NEW_USER_BONUS = 25;

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
  ownedCosmetics: string[];
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
    // Other seed paths create this doc without a code; persist one, or the link we hand out is never registered.
    const referralCode: string =
      data.referralCode ??
      (await db.runTransaction(async (tx) => {
        const existing = (await tx.get(userSeedsRef)).data()?.referralCode as string | undefined;
        if (existing) return existing;
        const code = generateReferralCode();
        tx.set(userSeedsRef, { referralCode: code }, { merge: true });
        return code;
      }));
    return {
      userId,
      balance: data.balance ?? STARTER_SEEDS,
      lifetimeEarned: data.lifetimeEarned ?? STARTER_SEEDS,
      lifetimePlanted: data.lifetimePlanted ?? 0,
      currentStreak: data.currentStreak ?? 0,
      lastDailyClaimDate: data.lastDailyClaimDate ?? null,
      lastConversationDate: data.lastConversationDate ?? null,
      referralCode,
      referredBy: data.referredBy ?? null,
      referrals: data.referrals ?? [],
      ownedCosmetics: ownedCosmetics(data.ownedCosmetics),
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
  const newUser: Omit<UserSeeds, 'userId' | 'ownedCosmetics'> = {
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

  // Like a ledger-created account, its starter seeds are an entry (create: never twice)
  const batch = db.batch();
  batch.create(userSeedsRef, removeUndefined({ ...newUser, createdAt: now, updatedAt: now }));
  batch.create(userSeedsRef.collection(ENTRIES_SUBCOLLECTION).doc('starter'), {
    delta: STARTER_SEEDS,
    reason: 'starter',
    balanceAfter: STARTER_SEEDS,
    at: now,
  });
  await batch.commit();
  log.info({ userId, balance: STARTER_SEEDS }, 'Created new user seeds account');

  return { userId, ...newUser, ownedCosmetics: ownedCosmetics([]) };
}

// parseBody, sendJSON, sendError imported from './helpers.js'

/** Wrapper for sendError with (status, message) signature used in this file */
function sendErrorStatus(res: ServerResponse, status: number, message: string): void {
  sendError(res, message, status);
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

  // Only the verified caller (or an admin's named user): the old fallback to the x-user-id /
  // x-device-id headers let an unauthenticated request act as anyone
  const userId = getUserId(req, new URL(req.url || '/', 'http://local'));
  if (!userId) {
    sendErrorStatus(res, 401, 'Unauthorized');
    return true;
  }

  const db = getFirestore();
  if (!db) {
    sendErrorStatus(res, 503, 'Database unavailable');
    return true;
  }

  try {
    // GET /api/seeds - Get user's seed balance and stats
    if (pathname === '/api/seeds' && req.method === 'GET') {
      const userSeeds = await getOrCreateUserSeeds(db, userId);
      const today = new Date().toISOString().split('T')[0];

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
        },
        earnedFrom: userSeeds.earnedFrom,
        ownedCosmetics: userSeeds.ownedCosmetics,
      });
      return true;
    }

    // POST /api/seeds/purchase - Buy a cosmetic at the server's price; owned once, charged once
    if (pathname === '/api/seeds/purchase' && req.method === 'POST') {
      const { itemId } = ((await parseBody(req)) ?? {}) as { itemId?: unknown };
      const result = await purchaseCosmetic(db, userId, itemId);
      if (result.status !== 200) sendErrorStatus(res, result.status, result.error);
      else sendJSON(res, result.body);
      return true;
    }

    // POST /api/seeds/claim-daily - Claim daily bonus: the same once-a-day credit as the
    // day's first conversation (one entry per date), on the caller's date when ?tz= is given
    if (pathname === '/api/seeds/claim-daily' && req.method === 'POST') {
      const tz = new URL(req.url || '/', 'http://local').searchParams.get('tz') ?? undefined;
      const result = await awardDailyConversation(db, userId, new Date(), tz);
      sendJSON(
        res,
        result.daily.applied
          ? {
              claimed: true,
              amount: DAILY_SEEDS + (result.milestone?.seeds ?? 0),
              newBalance: result.daily.balance,
            }
          : { claimed: false, reason: 'Already claimed today' }
      );
      return true;
    }

    // POST /api/seeds/gift - Gift seeds to another user. Both sides are ledger entries in
    // one transaction (giftId makes a retry free); the recipient must already have an account.
    if (pathname === '/api/seeds/gift' && req.method === 'POST') {
      const body = (await parseBody(req)) as { toUserId: string; amount: number; giftId?: string };
      const { toUserId, amount } = body;

      if (!toUserId || !amount) {
        sendErrorStatus(res, 400, 'Missing toUserId or amount');
        return true;
      }
      if (toUserId === userId) {
        sendErrorStatus(res, 400, "Can't gift to yourself");
        return true;
      }
      if (!Number.isInteger(amount) || amount < 10 || amount > 50) {
        sendErrorStatus(res, 400, 'Gift amount must be between 10 and 50 seeds');
        return true;
      }

      const multiplier = amount >= 50 ? 1.4 : amount >= 25 ? 1.28 : 1.2;
      const totalReceived = Math.round(amount * multiplier);
      const giftId = /^[A-Za-z0-9_-]{8,64}$/.test(body.giftId ?? '') ? body.giftId! : randomUUID();
      // The recipient's key names the sender, so another sender's giftId can't collide with it
      const [outKey, inKey] = [`gift:${giftId}:out`, `gift:${userId}:${giftId}:in`];

      const result = await db
        .runTransaction(async (tx) => {
          const sender = await prepareSeeds(tx, db, userId, outKey);
          const receiver = await prepareSeeds(tx, db, toUserId, inKey);
          if (!receiver.account) return { success: false, error: 'Recipient not found' };
          const sent = commitSeeds(tx, sender, {
            delta: -amount,
            reason: 'gift',
            key: outKey,
            meta: { to: toUserId },
          });
          // A reused giftId debits nothing, so it must credit nothing (or it would mint seeds)
          if (!sent.applied) return { success: false, error: 'Gift already sent' };
          commitSeeds(tx, receiver, {
            delta: totalReceived,
            reason: 'gifts',
            key: inKey,
            meta: { from: userId },
          });
          tx.set(
            sender.accountRef,
            { lifetimePlanted: admin.firestore.FieldValue.increment(amount) },
            { merge: true }
          );
          return {
            success: true,
            amountSent: amount,
            bonusAmount: totalReceived - amount,
            totalReceived,
            newBalance: sent.balance,
          };
        })
        .catch((error: unknown) => {
          if (error instanceof InsufficientSeedsError)
            return { success: false, error: 'Insufficient seeds' };
          throw error;
        });

      sendJSON(res, result);
      return true;
    }

    // GET /api/seeds/garden - Get garden stats
    if (pathname === '/api/seeds/garden' && req.method === 'GET') {
      const userSeeds = await getOrCreateUserSeeds(db, userId);

      sendJSON(res, {
        title: userSeeds.gardenTitle,
        totalReferrals: userSeeds.referrals.length,
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
        sendErrorStatus(res, 400, 'Missing referral code');
        return true;
      }

      const referrersQuery = await db
        .collection('user_seeds')
        .where('referralCode', '==', referralCode)
        .limit(1)
        .get();

      if (referrersQuery.empty) {
        sendErrorStatus(res, 404, 'Invalid referral code');
        return true;
      }

      const referrerId = referrersQuery.docs[0]!.id;
      if (referrerId === userId) {
        sendErrorStatus(res, 400, "Can't refer yourself");
        return true;
      }

      // Both bonuses are ledger entries with one key, so a retried signup pays once
      const key = `referral:${referrerId}:${userId}`;
      const result = await db.runTransaction(async (tx) => {
        const newUser = await prepareSeeds(tx, db, userId, key);
        const referrer = await prepareSeeds(tx, db, referrerId, key);
        if (newUser.account?.referredBy)
          return { success: false, error: 'Already referred by someone' };

        const referrals = [
          ...((referrer.account?.referrals as string[] | undefined) ?? []),
          userId,
        ];
        commitSeeds(tx, newUser, { delta: REFERRAL_NEW_USER_BONUS, reason: 'referrals', key });
        commitSeeds(tx, referrer, { delta: REFERRAL_SIGNUP_REWARD, reason: 'referrals', key });
        tx.set(newUser.accountRef, { referredBy: referrerId }, { merge: true });
        tx.set(
          referrer.accountRef,
          {
            referrals: admin.firestore.FieldValue.arrayUnion(userId),
            gardenTitle: getGardenTitle(new Set(referrals).size),
          },
          { merge: true }
        );
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
    sendErrorStatus(res, 500, 'Internal server error');
    return true;
  }
}

export default handleSeedsRoutes;
