/**
 * Reading List Store
 *
 * Firestore persistence for user reading lists.
 * Allows users to save books for later, track reading progress,
 * and organize their reading goals.
 */

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onReadingListChange } from '../data-layer/hooks/index.js';
import { onStoreChange } from '../data-layer/store-hooks.js';
import type { StoreType, EntityType } from '../data-layer/types.js';

const log = createLogger({ module: 'ReadingListStore' });

let db: Firestore | null = null;
let initialized = false;

// ============================================================================
// TYPES
// ============================================================================

export type ReadingStatus = 'want_to_read' | 'reading' | 'completed' | 'abandoned';

export interface ReadingListEntry {
  id: string;
  userId: string;
  bookId: string;

  // Book details (denormalized for quick access)
  title: string;
  authors: string[];
  imageUrl?: string;
  pageCount?: number;

  // Reading state
  status: ReadingStatus;
  currentPage?: number;
  startDate?: string;
  finishDate?: string;
  rating?: number; // 1-5

  // User notes
  notes?: string;
  highlights?: string[];

  // Organization
  listName: string; // "default", "2024 goals", custom names
  priority?: 'high' | 'medium' | 'low';

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ReadingList {
  entries: ReadingListEntry[];
  stats: {
    total: number;
    wantToRead: number;
    reading: number;
    completed: number;
  };
}

export interface ReadingListResult {
  success: boolean;
  entry?: ReadingListEntry;
  error?: string;
}

export interface ReadingListQueryResult {
  success: boolean;
  list?: ReadingList;
  error?: string;
}

// ============================================================================
// DATABASE
// ============================================================================

function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    log.debug('ReadingListStore Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for reading lists');
    initialized = true;
    return null;
  }
}

function getCollection(userId: string) {
  const firestore = getFirestoreDb();
  if (!firestore) return null;
  return firestore.collection('bogle_users').doc(userId).collection('reading_list');
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Add a book to the user's reading list.
 */
export async function addToReadingList(
  userId: string,
  book: {
    bookId: string;
    title: string;
    authors: string[];
    imageUrl?: string;
    pageCount?: number;
  },
  options: {
    listName?: string;
    priority?: 'high' | 'medium' | 'low';
    notes?: string;
  } = {}
): Promise<ReadingListResult> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  const { listName = 'default', priority, notes } = options;

  try {
    // Check if book already exists
    const existing = await collection.where('bookId', '==', book.bookId).limit(1).get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      return {
        success: true,
        entry: { id: doc.id, ...doc.data() } as ReadingListEntry,
      };
    }

    // Create new entry
    const now = new Date().toISOString();
    const entry: Omit<ReadingListEntry, 'id'> = {
      userId,
      bookId: book.bookId,
      title: book.title,
      authors: book.authors,
      imageUrl: book.imageUrl,
      pageCount: book.pageCount,
      status: 'want_to_read',
      listName,
      priority,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await collection.add(cleanForFirestore(entry));
    log.info({ userId, bookId: book.bookId, title: book.title }, 'Book added to reading list');

    // Index to semantic memory
    void onReadingListChange(userId, docRef.id, {
      title: book.title,
      authors: book.authors,
      status: 'want_to_read',
      notes,
      listName,
      priority,
    }, 'create');

    return {
      success: true,
      entry: { id: docRef.id, ...entry } as ReadingListEntry,
    };
  } catch (error) {
    log.error(
      { error: String(error), userId, bookId: book.bookId },
      'Failed to add to reading list'
    );
    return { success: false, error: 'Failed to add book' };
  }
}

/**
 * Update reading status or progress.
 */
export async function updateReadingStatus(
  userId: string,
  entryId: string,
  update: {
    status?: ReadingStatus;
    currentPage?: number;
    rating?: number;
    notes?: string;
  }
): Promise<ReadingListResult> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const docRef = collection.doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: 'Entry not found' };
    }

    const data = doc.data() as Omit<ReadingListEntry, 'id'>;
    const now = new Date().toISOString();

    const updates: Partial<ReadingListEntry> = {
      ...update,
      updatedAt: now,
    };

    // Set start date when starting to read
    if (update.status === 'reading' && !data.startDate) {
      updates.startDate = now;
    }

    // Set finish date when completing
    if (update.status === 'completed' && !data.finishDate) {
      updates.finishDate = now;
    }

    await docRef.update(updates);
    log.info({ userId, entryId, status: update.status }, 'Reading status updated');

    const updated = await docRef.get();
    const updatedData = updated.data() as ReadingListEntry;

    // Index update to semantic memory
    void onReadingListChange(userId, entryId, {
      title: updatedData.title,
      authors: updatedData.authors,
      status: updatedData.status,
      currentPage: updatedData.currentPage,
      rating: updatedData.rating,
      notes: updatedData.notes,
      listName: updatedData.listName,
      priority: updatedData.priority,
    }, 'update');

    return {
      success: true,
      entry: { ...updatedData, id: docRef.id } as ReadingListEntry,
    };
  } catch (error) {
    log.error({ error: String(error), userId, entryId }, 'Failed to update reading status');
    return { success: false, error: 'Failed to update' };
  }
}

/**
 * Mark a book as read.
 */
export async function markBookAsRead(
  userId: string,
  entryId: string,
  rating?: number
): Promise<ReadingListResult> {
  return updateReadingStatus(userId, entryId, {
    status: 'completed',
    rating,
  });
}

/**
 * Remove a book from the reading list.
 */
export async function removeFromReadingList(
  userId: string,
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  try {
    await collection.doc(entryId).delete();
    log.info({ userId, entryId }, 'Book removed from reading list');

    // Remove from semantic index
    onStoreChange({
      storeType: 'media' as StoreType,
      changeType: 'delete',
      userId,
      entityType: 'reading_list' as EntityType,
      entityId: entryId,
      content: '',
    });

    return { success: true };
  } catch (error) {
    log.error({ error: String(error), userId, entryId }, 'Failed to remove from reading list');
    return { success: false, error: 'Failed to remove' };
  }
}

/**
 * Get user's reading list.
 */
export async function getReadingList(
  userId: string,
  options: {
    status?: ReadingStatus;
    listName?: string;
    limit?: number;
  } = {}
): Promise<ReadingListQueryResult> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  const { status, listName, limit = 50 } = options;

  try {
    let query = collection.orderBy('updatedAt', 'desc').limit(limit);

    if (status) {
      query = collection.where('status', '==', status).orderBy('updatedAt', 'desc').limit(limit);
    }

    if (listName) {
      query = collection
        .where('listName', '==', listName)
        .orderBy('updatedAt', 'desc')
        .limit(limit);
    }

    const snapshot = await query.get();
    const entries: ReadingListEntry[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ReadingListEntry[];

    // Calculate stats
    const stats = {
      total: entries.length,
      wantToRead: entries.filter((e) => e.status === 'want_to_read').length,
      reading: entries.filter((e) => e.status === 'reading').length,
      completed: entries.filter((e) => e.status === 'completed').length,
    };

    log.info({ userId, count: entries.length }, 'Reading list retrieved');
    return {
      success: true,
      list: { entries, stats },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get reading list');
    return { success: false, error: 'Failed to retrieve reading list' };
  }
}

/**
 * Get a specific entry by book ID.
 */
export async function getReadingListEntry(
  userId: string,
  bookId: string
): Promise<ReadingListResult> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const snapshot = await collection.where('bookId', '==', bookId).limit(1).get();

    if (snapshot.empty) {
      return { success: false, error: 'Book not in reading list' };
    }

    const doc = snapshot.docs[0];
    return {
      success: true,
      entry: { id: doc.id, ...doc.data() } as ReadingListEntry,
    };
  } catch (error) {
    log.error({ error: String(error), userId, bookId }, 'Failed to get reading list entry');
    return { success: false, error: 'Failed to retrieve entry' };
  }
}

/**
 * Get reading progress statistics.
 */
export async function getReadingStats(userId: string): Promise<{
  success: boolean;
  stats?: {
    totalBooks: number;
    booksCompleted: number;
    booksReading: number;
    booksWantToRead: number;
    pagesRead: number;
    averageRating: number;
    readingStreak: number;
  };
  error?: string;
}> {
  const collection = getCollection(userId);
  if (!collection) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const snapshot = await collection.get();
    const entries = snapshot.docs.map((doc) => doc.data()) as ReadingListEntry[];

    const completed = entries.filter((e) => e.status === 'completed');
    const reading = entries.filter((e) => e.status === 'reading');
    const wantToRead = entries.filter((e) => e.status === 'want_to_read');

    // Calculate pages read (for completed and currently reading)
    const pagesRead =
      completed.reduce((sum, e) => sum + (e.pageCount || 0), 0) +
      reading.reduce((sum, e) => sum + (e.currentPage || 0), 0);

    // Calculate average rating
    const ratings = completed.filter((e) => e.rating).map((e) => e.rating!);
    const averageRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      success: true,
      stats: {
        totalBooks: entries.length,
        booksCompleted: completed.length,
        booksReading: reading.length,
        booksWantToRead: wantToRead.length,
        pagesRead,
        averageRating: Math.round(averageRating * 10) / 10,
        readingStreak: calculateReadingStreak(completed),
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get reading stats');
    return { success: false, error: 'Failed to calculate stats' };
  }
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Calculate reading streak based on finish dates.
 * A streak is consecutive weeks where at least one book was completed.
 * Returns 0 if no books completed or streak is broken.
 */
function calculateReadingStreak(completed: ReadingListEntry[]): number {
  // Get books with valid finish dates
  const withDates = completed
    .filter((e) => e.finishDate)
    .map((e) => new Date(e.finishDate!))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime()); // Most recent first

  if (withDates.length === 0) return 0;

  // Group finish dates by week (Sunday-Saturday)
  const getWeekStart = (date: Date): number => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Go back to Sunday
    return d.getTime();
  };

  const weeksWithCompletions = new Set<number>();
  for (const date of withDates) {
    weeksWithCompletions.add(getWeekStart(date));
  }

  // Get unique weeks sorted most recent first
  const weeks = Array.from(weeksWithCompletions).sort((a, b) => b - a);
  if (weeks.length === 0) return 0;

  // Check if the most recent completion is from the current or previous week
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  if (weeks[0] < currentWeekStart - oneWeekMs) {
    // Most recent completion is more than one week old - streak broken
    return 0;
  }

  // Count consecutive weeks
  let streak = 1;
  for (let i = 1; i < weeks.length; i++) {
    const expectedPreviousWeek = weeks[i - 1] - oneWeekMs;
    if (weeks[i] === expectedPreviousWeek) {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}

/**
 * Check if reading list store is available.
 */
export function isReadingListStoreAvailable(): boolean {
  return getFirestoreDb() !== null;
}
