/**
 * Seed Economy Service
 *
 * Manages the seed economy for the Ferni roadmap feature voting system.
 * Users earn seeds through conversations, streaks, and referrals.
 * Seeds can be "planted" on feature requests to vote for them.
 *
 * @module services/seed-economy
 */

import * as admin from 'firebase-admin';
import { getLogger } from '../utils/safe-logger.js';

/**
 * Get Firestore instance, returns null if not initialized.
 */
function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

const log = getLogger().child({ module: 'seed-economy' });

// ============================================================================
// TYPES
// ============================================================================

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

export interface SeedAwardResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

// ============================================================================
// SEED AWARD FUNCTIONS
// ============================================================================

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
): Promise<SeedAwardResult> {
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

/**
 * Get a user's current seed balance.
 */
export async function getUserSeedBalance(userId: string): Promise<UserSeeds | null> {
  if (!userId) return null;

  try {
    const db = getFirestore();
    if (!db) return null;

    const doc = await db.collection('user_seeds').doc(userId).get();
    return doc.exists ? (doc.data() as UserSeeds) : null;
  } catch (error) {
    log.error({ error, userId }, 'Failed to get seed balance');
    return null;
  }
}
