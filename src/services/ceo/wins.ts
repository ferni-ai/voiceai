/**
 * Wins Service - Achievement Logging
 *
 * Track personal wins and achievements for motivation and reflection.
 * Stored in Firestore under users/{userId}/wins/{winId}
 *
 * @module services/ceo/wins
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ceo-wins' });

// ============================================================================
// TYPES
// ============================================================================

export interface Win {
  id: string;
  userId: string;
  description: string;
  category?: string;
  linkedGoalId?: string;
  createdAt: Date;
}

interface FirestoreWin {
  id: string;
  userId: string;
  description: string;
  category?: string;
  linkedGoalId?: string;
  createdAt: Timestamp;
}

export type WinPeriod = 'today' | 'week' | 'month' | 'all';

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const WINS_COLLECTION = 'wins';

function getWinsPath(userId: string): string {
  return `users/${userId}/${WINS_COLLECTION}`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new win/achievement.
 */
export async function addWin(
  userId: string,
  description: string,
  category?: string,
  linkedGoalId?: string
): Promise<Win> {
  const db = getFirestoreDb();

  const win: Win = {
    id: generateId('win'),
    userId,
    description,
    category,
    linkedGoalId,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-wins', 'addWin');
    log.warn({ userId }, 'Firestore unavailable, win not persisted');
    return win;
  }

  try {
    const firestoreWin: FirestoreWin = {
      ...win,
      createdAt: Timestamp.fromDate(win.createdAt),
    };

    const docRef = db.collection(getWinsPath(userId)).doc(win.id);
    await docRef.set(cleanForFirestore(firestoreWin));

    log.info({ userId, winId: win.id }, 'Win added');
    return win;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add win');
    return win;
  }
}

/**
 * Get wins for a specific time period.
 */
export async function getWins(userId: string, period: WinPeriod): Promise<Win[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-wins', 'getWins');
    return [];
  }

  try {
    const winsRef = db.collection(getWinsPath(userId));
    let query = winsRef.orderBy('createdAt', 'desc');

    // Add time filter based on period
    if (period !== 'all') {
      const cutoff = getPeriodCutoff(period);
      query = winsRef
        .where('createdAt', '>=', Timestamp.fromDate(cutoff))
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map((doc) => firestoreToWin(doc.data() as FirestoreWin));
  } catch (error) {
    log.error({ error: String(error), userId, period }, 'Failed to get wins');
    return [];
  }
}

/**
 * Get a random win for motivation/mood boost.
 */
export async function getRandomWin(userId: string): Promise<Win | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-wins', 'getRandomWin');
    return null;
  }

  try {
    // Get all wins and pick one randomly
    // For better performance with large datasets, consider using a random field approach
    const winsRef = db.collection(getWinsPath(userId));
    const snapshot = await winsRef.limit(100).get();

    if (snapshot.empty) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * snapshot.docs.length);
    const randomDoc = snapshot.docs[randomIndex];

    return firestoreToWin(randomDoc.data() as FirestoreWin);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get random win');
    return null;
  }
}

/**
 * Get wins by category.
 */
export async function getWinsByCategory(userId: string, category: string): Promise<Win[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-wins', 'getWinsByCategory');
    return [];
  }

  try {
    const winsRef = db.collection(getWinsPath(userId));
    const query = winsRef.where('category', '==', category).orderBy('createdAt', 'desc').limit(50);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToWin(doc.data() as FirestoreWin));
  } catch (error) {
    log.error({ error: String(error), userId, category }, 'Failed to get wins by category');
    return [];
  }
}

/**
 * Get total win count.
 */
export async function getWinCount(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-wins', 'getWinCount');
    return 0;
  }

  try {
    const winsRef = db.collection(getWinsPath(userId));
    const snapshot = await winsRef.count().get();
    return snapshot.data().count;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get win count');
    return 0;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getPeriodCutoff(period: WinPeriod): Date {
  const now = new Date();

  switch (period) {
    case 'today': {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    }
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      return weekAgo;
    }
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      monthAgo.setHours(0, 0, 0, 0);
      return monthAgo;
    }
    default:
      return new Date(0);
  }
}

function firestoreToWin(data: FirestoreWin): Win {
  return {
    id: data.id,
    userId: data.userId,
    description: data.description,
    category: data.category,
    linkedGoalId: data.linkedGoalId,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const winsService = {
  addWin,
  getWins,
  getRandomWin,
  getWinsByCategory,
  getWinCount,
};
