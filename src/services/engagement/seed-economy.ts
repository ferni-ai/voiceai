/**
 * Seed Economy Service
 *
 * Manages the seed economy for the Ferni roadmap feature voting system.
 * Users earn seeds through conversations, streaks, and referrals.
 * Seeds can be "planted" on feature requests to vote for them.
 *
 * @module services/seed-economy
 */

import admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { awardDailyConversation } from '../seeds/earn.js';

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
 * Credit a finished conversation: the day's first one earns the daily seeds, and a streak
 * milestone pays on the day it's reached (services/seeds/earn.ts). Called from the voice
 * agent's cleanup handler on every session end; later sessions that day change nothing.
 *
 * @param timeZone - the caller's IANA zone, so "today" is their day (UTC when unknown)
 */
export async function awardSeedsForConversation(userId: string, timeZone?: string): Promise<SeedAwardResult> {
  if (!userId) return { success: false, error: 'User ID required' };
  const db = getFirestore();
  if (!db) {
    log.warn({ userId }, 'Firestore not initialized, skipping seed award');
    return { success: false, error: 'Database not available' };
  }
  try {
    const result = await awardDailyConversation(db, userId, new Date(), timeZone);
    log.info({ userId, ...result }, 'Conversation seeds');
    return { success: true, newBalance: result.daily.balance };
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
