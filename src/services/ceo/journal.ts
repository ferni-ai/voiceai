/**
 * Journal Service - Quick Journaling
 *
 * Simple journaling for quick thoughts and reflections.
 * Stored in Firestore under users/{userId}/journal/{entryId}
 *
 * @module services/ceo/journal
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

const log = createLogger({ module: 'ceo-journal' });

// ============================================================================
// TYPES
// ============================================================================

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface JournalEntry {
  id: string;
  userId: string;
  content: string;
  sentiment?: Sentiment;
  tags?: string[];
  createdAt: Date;
}

interface FirestoreJournalEntry {
  id: string;
  userId: string;
  content: string;
  sentiment?: Sentiment;
  tags?: string[];
  createdAt: Timestamp;
}

export type JournalPeriod = 'today' | 'week' | 'month';

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const JOURNAL_COLLECTION = 'journal';

function getJournalPath(userId: string): string {
  return `users/${userId}/${JOURNAL_COLLECTION}`;
}

// ============================================================================
// SENTIMENT DETECTION
// ============================================================================

const POSITIVE_WORDS = [
  'happy',
  'great',
  'amazing',
  'wonderful',
  'excited',
  'grateful',
  'thankful',
  'blessed',
  'joy',
  'love',
  'awesome',
  'fantastic',
  'excellent',
  'good',
  'best',
  'accomplished',
  'proud',
  'win',
  'success',
  'celebrate',
];

const NEGATIVE_WORDS = [
  'sad',
  'frustrated',
  'angry',
  'upset',
  'disappointed',
  'stressed',
  'anxious',
  'worried',
  'tired',
  'exhausted',
  'overwhelmed',
  'difficult',
  'hard',
  'bad',
  'worst',
  'failed',
  'struggle',
  'problem',
  'issue',
  'stuck',
];

function detectSentiment(content: string): Sentiment {
  const lowerContent = content.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lowerContent.includes(word)) positiveCount++;
  }

  for (const word of NEGATIVE_WORDS) {
    if (lowerContent.includes(word)) negativeCount++;
  }

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new journal entry.
 * Sentiment is auto-detected from content if not provided.
 */
export async function addEntry(
  userId: string,
  content: string,
  sentiment?: Sentiment,
  tags?: string[]
): Promise<JournalEntry> {
  const db = getFirestoreDb();

  const entry: JournalEntry = {
    id: generateId('jrnl'),
    userId,
    content,
    sentiment: sentiment ?? detectSentiment(content),
    tags,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-journal', 'addEntry');
    log.warn({ userId }, 'Firestore unavailable, journal entry not persisted');
    return entry;
  }

  try {
    const firestoreEntry: FirestoreJournalEntry = {
      ...entry,
      createdAt: Timestamp.fromDate(entry.createdAt),
    };

    const docRef = db.collection(getJournalPath(userId)).doc(entry.id);
    await docRef.set(cleanForFirestore(firestoreEntry));

    log.info({ userId, entryId: entry.id, sentiment: entry.sentiment }, 'Journal entry added');
    return entry;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add journal entry');
    return entry;
  }
}

/**
 * Get journal entries for a specific time period.
 */
export async function getEntries(userId: string, period: JournalPeriod): Promise<JournalEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-journal', 'getEntries');
    return [];
  }

  try {
    const journalRef = db.collection(getJournalPath(userId));
    const cutoff = getPeriodCutoff(period);

    const query = journalRef
      .where('createdAt', '>=', Timestamp.fromDate(cutoff))
      .orderBy('createdAt', 'desc')
      .limit(100);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreJournalEntry));
  } catch (error) {
    log.error({ error: String(error), userId, period }, 'Failed to get journal entries');
    return [];
  }
}

/**
 * Search journal entries by content.
 */
export async function search(userId: string, query: string): Promise<JournalEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-journal', 'search');
    return [];
  }

  try {
    // Firestore doesn't support full-text search, so we fetch recent entries
    // and filter client-side. For production, consider Algolia or similar.
    const journalRef = db.collection(getJournalPath(userId));
    const snapshot = await journalRef.orderBy('createdAt', 'desc').limit(500).get();

    const lowerQuery = query.toLowerCase();

    return snapshot.docs
      .map((doc) => firestoreToEntry(doc.data() as FirestoreJournalEntry))
      .filter((entry) => entry.content.toLowerCase().includes(lowerQuery));
  } catch (error) {
    log.error({ error: String(error), userId, query }, 'Failed to search journal entries');
    return [];
  }
}

/**
 * Get entries by sentiment.
 */
export async function getEntriesBySentiment(
  userId: string,
  sentiment: Sentiment,
  limit = 20
): Promise<JournalEntry[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-journal', 'getEntriesBySentiment');
    return [];
  }

  try {
    const journalRef = db.collection(getJournalPath(userId));
    const query = journalRef
      .where('sentiment', '==', sentiment)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEntry(doc.data() as FirestoreJournalEntry));
  } catch (error) {
    log.error({ error: String(error), userId, sentiment }, 'Failed to get entries by sentiment');
    return [];
  }
}

/**
 * Get the most recent entry.
 */
export async function getLatestEntry(userId: string): Promise<JournalEntry | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-journal', 'getLatestEntry');
    return null;
  }

  try {
    const journalRef = db.collection(getJournalPath(userId));
    const query = journalRef.orderBy('createdAt', 'desc').limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    return firestoreToEntry(snapshot.docs[0].data() as FirestoreJournalEntry);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get latest journal entry');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getPeriodCutoff(period: JournalPeriod): Date {
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

function firestoreToEntry(data: FirestoreJournalEntry): JournalEntry {
  return {
    id: data.id,
    userId: data.userId,
    content: data.content,
    sentiment: data.sentiment,
    tags: data.tags,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const journalService = {
  addEntry,
  getEntries,
  search,
  getEntriesBySentiment,
  getLatestEntry,
};
