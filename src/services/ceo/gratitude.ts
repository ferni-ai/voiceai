/**
 * Gratitude Service - Gratitude Logging
 *
 * Track things you're grateful for to boost mood and perspective.
 * Stored in Firestore under users/{userId}/gratitude/{entryId}
 *
 * @module services/ceo/gratitude
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

const log = createLogger({ module: 'ceo-gratitude' });

// ============================================================================
// TYPES
// ============================================================================

export interface GratitudeEntry {
  id: string;
  userId: string;
  content: string;
  category?: string;
  createdAt: Date;
}

interface FirestoreGratitudeEntry {
  id: string;
  userId: string;
  content: string;
  category?: string;
  createdAt: Timestamp;
}

// Common gratitude categories
export const GRATITUDE_CATEGORIES = [
  'people',
  'health',
  'work',
  'nature',
  'experiences',
  'personal growth',
  'home',
  'simple pleasures',
] as const;

export type GratitudeCategory = (typeof GRATITUDE_CATEGORIES)[number];

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const GRATITUDE_COLLECTION = 'gratitude';

function getGratitudePath(userId: string): string {
  return `users/${userId}/${GRATITUDE_COLLECTION}`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new gratitude entry.
 */
export async function addGratitude(
  userId: string,
  content: string,
  category?: string
): Promise<GratitudeEntry> {
  const db = getFirestoreDb();

  const entry: GratitudeEntry = {
    id: generateId('grat'),
    userId,
    content,
    category,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-gratitude', 'addGratitude');
    log.warn({ userId }, 'Firestore unavailable, gratitude entry not persisted');
    return entry;
  }

  try {
    const firestoreEntry: FirestoreGratitudeEntry = {
      ...entry,
      createdAt: Timestamp.fromDate(entry.createdAt),
    };

    const docRef = db.collection(getGratitudePath(userId)).doc(entry.id);
    await docRef.set(cleanForFirestore(firestoreEntry));

    log.info({ userId, entryId: entry.id }, 'Gratitude entry added');
    return entry;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add gratitude entry');
    return entry;
  }
}

/**
 * Get gratitude entries with optional limit.
 */
export async function getEntries(userId: string, limit = 20): Promise<GratitudeEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getEntries');
    return [];
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));
    const query = gratitudeRef.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreGratitudeEntry));
  } catch (error) {
    log.error({ error: String(error), userId, limit }, 'Failed to get gratitude entries');
    return [];
  }
}

/**
 * Get a random gratitude entry for mood boost.
 */
export async function getRandom(userId: string): Promise<GratitudeEntry | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getRandom');
    return null;
  }

  try {
    // Get entries and pick one randomly
    const gratitudeRef = db.collection(getGratitudePath(userId));
    const snapshot = await gratitudeRef.limit(100).get();

    if (snapshot.empty) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * snapshot.docs.length);
    const randomDoc = snapshot.docs[randomIndex];

    return firestoreToEntry(randomDoc.data() as FirestoreGratitudeEntry);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get random gratitude entry');
    return null;
  }
}

/**
 * Get today's gratitude entries.
 */
export async function getToday(userId: string): Promise<GratitudeEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getToday');
    return [];
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = gratitudeRef
      .where('createdAt', '>=', Timestamp.fromDate(today))
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreGratitudeEntry));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get today gratitude entries');
    return [];
  }
}

/**
 * Get this week's gratitude entries.
 */
export async function getThisWeek(userId: string): Promise<GratitudeEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getThisWeek');
    return [];
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const query = gratitudeRef
      .where('createdAt', '>=', Timestamp.fromDate(weekAgo))
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreGratitudeEntry));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get week gratitude entries');
    return [];
  }
}

/**
 * Get entries by category.
 */
export async function getByCategory(
  userId: string,
  category: string,
  limit = 20
): Promise<GratitudeEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getByCategory');
    return [];
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));
    const query = gratitudeRef
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreGratitudeEntry));
  } catch (error) {
    log.error({ error: String(error), userId, category }, 'Failed to get gratitude by category');
    return [];
  }
}

/**
 * Get total gratitude count.
 */
export async function getCount(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getCount');
    return 0;
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));
    const snapshot = await gratitudeRef.count().get();
    return snapshot.data().count;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get gratitude count');
    return 0;
  }
}

/**
 * Get gratitude streak (consecutive days with entries).
 */
export async function getStreak(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-gratitude', 'getStreak');
    return 0;
  }

  try {
    const gratitudeRef = db.collection(getGratitudePath(userId));
    const query = gratitudeRef.orderBy('createdAt', 'desc').limit(100);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return 0;
    }

    // Group entries by date
    const dateSet = new Set<string>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as FirestoreGratitudeEntry;
      const date = toSafeDate(data.createdAt);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      dateSet.add(dateKey);
    }

    // Count consecutive days starting from today
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 100; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

      if (dateSet.has(dateKey)) {
        streak++;
      } else if (i > 0) {
        // Allow for today not having an entry yet (only break if we had entries before)
        break;
      }
    }

    return streak;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to calculate gratitude streak');
    return 0;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToEntry(data: FirestoreGratitudeEntry): GratitudeEntry {
  return {
    id: data.id,
    userId: data.userId,
    content: data.content,
    category: data.category,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const gratitudeService = {
  addGratitude,
  getEntries,
  getRandom,
  getToday,
  getThisWeek,
  getByCategory,
  getCount,
  getStreak,
};
