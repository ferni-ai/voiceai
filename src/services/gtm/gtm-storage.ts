/**
 * GTM Firestore Storage Layer
 *
 * Persistent storage for GTM content and calendar entries.
 * Replaces in-memory Maps with Firestore collections.
 *
 * Collections:
 *   - gtm_content: Generated content pieces
 *   - gtm_calendar: Calendar entries
 *
 * @module services/gtm/gtm-storage
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { GeneratedContent, ContentCalendarEntry, ContentStatus, CalendarEntryStatus } from './types.js';

const log = createLogger({ module: 'gtm-storage' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

// Lazy-load Firestore to avoid import issues
let firestoreDb: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreDb) return firestoreDb;

  try {
    const { getFirestore: getFs } = await import('firebase-admin/firestore');
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');

    // Initialize Firebase Admin if not already done
    if (getApps().length === 0) {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
      if (projectId) {
        initializeApp({ projectId });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        initializeApp({
          credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        });
      } else {
        log.warn('No Firebase credentials found, using in-memory fallback');
        return null;
      }
    }

    firestoreDb = getFs();
    log.info('Firestore initialized for GTM storage');
    return firestoreDb;
  } catch (e) {
    log.warn('Firestore not available, using in-memory fallback', { error: String(e) });
    return null;
  }
}

// ============================================================================
// IN-MEMORY FALLBACK (for local development)
// ============================================================================

const memoryContentStore = new Map<string, GeneratedContent>();
const memoryCalendarStore = new Map<string, ContentCalendarEntry>();

// ============================================================================
// CONTENT STORAGE
// ============================================================================

const CONTENT_COLLECTION = 'gtm_content';

/**
 * Store generated content
 */
export async function storeContent(content: GeneratedContent): Promise<void> {
  const db = await getFirestore();

  if (db) {
    try {
      await db.collection(CONTENT_COLLECTION).doc(content.id).set({
        ...content,
        createdAt: content.createdAt.toISOString(),
        publishedAt: content.publishedAt?.toISOString() || null,
        brief: {
          ...content.brief,
        },
        platforms: content.platforms.map((p) => ({
          ...p,
        })),
        _updatedAt: new Date().toISOString(),
      });
      log.debug('Content stored in Firestore', { id: content.id });
    } catch (e) {
      log.error('Failed to store content in Firestore', { error: String(e) });
      // Fallback to memory
      memoryContentStore.set(content.id, content);
    }
  } else {
    memoryContentStore.set(content.id, content);
  }
}

/**
 * Get content by ID
 */
export async function getContent(id: string): Promise<GeneratedContent | undefined> {
  const db = await getFirestore();

  if (db) {
    try {
      const doc = await db.collection(CONTENT_COLLECTION).doc(id).get();
      if (doc.exists) {
        const data = doc.data()!;
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
        } as GeneratedContent;
      }
    } catch (e) {
      log.error('Failed to get content from Firestore', { error: String(e) });
    }
  }

  return memoryContentStore.get(id);
}

/**
 * Get all content
 */
export async function getAllContent(): Promise<GeneratedContent[]> {
  const db = await getFirestore();

  if (db) {
    try {
      const snapshot = await db
        .collection(CONTENT_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
        } as GeneratedContent;
      });
    } catch (e) {
      log.error('Failed to get all content from Firestore', { error: String(e) });
    }
  }

  return Array.from(memoryContentStore.values());
}

/**
 * Update content status
 */
export async function updateContentStatus(
  id: string,
  status: ContentStatus,
  publishedAt?: Date
): Promise<void> {
  const db = await getFirestore();

  if (db) {
    try {
      const updateData: Record<string, unknown> = {
        status,
        _updatedAt: new Date().toISOString(),
      };
      if (publishedAt) {
        updateData.publishedAt = publishedAt.toISOString();
      }
      await db.collection(CONTENT_COLLECTION).doc(id).update(updateData);
      log.debug('Content status updated in Firestore', { id, status });
    } catch (e) {
      log.error('Failed to update content status in Firestore', { error: String(e) });
    }
  }

  // Also update memory store
  const content = memoryContentStore.get(id);
  if (content) {
    content.status = status;
    if (publishedAt) content.publishedAt = publishedAt;
    memoryContentStore.set(id, content);
  }
}

/**
 * Get content by status
 */
export async function getContentByStatus(status: ContentStatus): Promise<GeneratedContent[]> {
  const db = await getFirestore();

  if (db) {
    try {
      const snapshot = await db
        .collection(CONTENT_COLLECTION)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
        } as GeneratedContent;
      });
    } catch (e) {
      log.error('Failed to get content by status from Firestore', { error: String(e) });
    }
  }

  return Array.from(memoryContentStore.values()).filter((c) => c.status === status);
}

// ============================================================================
// CALENDAR STORAGE
// ============================================================================

const CALENDAR_COLLECTION = 'gtm_calendar';

/**
 * Store calendar entry
 */
export async function storeCalendarEntry(entry: ContentCalendarEntry): Promise<void> {
  const db = await getFirestore();

  if (db) {
    try {
      await db.collection(CALENDAR_COLLECTION).doc(entry.id).set({
        ...entry,
        date: entry.date.toISOString(),
        _updatedAt: new Date().toISOString(),
      });
      log.debug('Calendar entry stored in Firestore', { id: entry.id });
    } catch (e) {
      log.error('Failed to store calendar entry in Firestore', { error: String(e) });
      memoryCalendarStore.set(entry.id, entry);
    }
  } else {
    memoryCalendarStore.set(entry.id, entry);
  }
}

/**
 * Get calendar entry by ID
 */
export async function getCalendarEntry(id: string): Promise<ContentCalendarEntry | undefined> {
  const db = await getFirestore();

  if (db) {
    try {
      const doc = await db.collection(CALENDAR_COLLECTION).doc(id).get();
      if (doc.exists) {
        const data = doc.data()!;
        return {
          ...data,
          date: new Date(data.date),
        } as ContentCalendarEntry;
      }
    } catch (e) {
      log.error('Failed to get calendar entry from Firestore', { error: String(e) });
    }
  }

  return memoryCalendarStore.get(id);
}

/**
 * Get calendar entries for date range
 */
export async function getCalendarEntriesForRange(
  startDate: Date,
  endDate: Date
): Promise<ContentCalendarEntry[]> {
  const db = await getFirestore();

  if (db) {
    try {
      const snapshot = await db
        .collection(CALENDAR_COLLECTION)
        .where('date', '>=', startDate.toISOString())
        .where('date', '<=', endDate.toISOString())
        .orderBy('date', 'asc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          date: new Date(data.date),
        } as ContentCalendarEntry;
      });
    } catch (e) {
      log.error('Failed to get calendar entries from Firestore', { error: String(e) });
    }
  }

  const entries = Array.from(memoryCalendarStore.values());
  return entries.filter((e) => e.date >= startDate && e.date <= endDate);
}

/**
 * Update calendar entry status
 */
export async function updateCalendarEntryStatus(
  id: string,
  status: CalendarEntryStatus,
  contentId?: string
): Promise<void> {
  const db = await getFirestore();

  if (db) {
    try {
      const updateData: Record<string, unknown> = {
        status,
        _updatedAt: new Date().toISOString(),
      };
      if (contentId) {
        updateData.contentId = contentId;
      }
      await db.collection(CALENDAR_COLLECTION).doc(id).update(updateData);
      log.debug('Calendar entry status updated in Firestore', { id, status });
    } catch (e) {
      log.error('Failed to update calendar entry status in Firestore', { error: String(e) });
    }
  }

  // Also update memory store
  const entry = memoryCalendarStore.get(id);
  if (entry) {
    entry.status = status;
    if (contentId) entry.contentId = contentId;
    memoryCalendarStore.set(id, entry);
  }
}

/**
 * Get all calendar entries
 */
export async function getAllCalendarEntries(): Promise<ContentCalendarEntry[]> {
  const db = await getFirestore();

  if (db) {
    try {
      const snapshot = await db
        .collection(CALENDAR_COLLECTION)
        .orderBy('date', 'desc')
        .limit(200)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          date: new Date(data.date),
        } as ContentCalendarEntry;
      });
    } catch (e) {
      log.error('Failed to get all calendar entries from Firestore', { error: String(e) });
    }
  }

  return Array.from(memoryCalendarStore.values());
}

/**
 * Get calendar entries by status
 */
export async function getCalendarEntriesByStatus(
  status: CalendarEntryStatus
): Promise<ContentCalendarEntry[]> {
  const db = await getFirestore();

  if (db) {
    try {
      const snapshot = await db
        .collection(CALENDAR_COLLECTION)
        .where('status', '==', status)
        .orderBy('date', 'asc')
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          date: new Date(data.date),
        } as ContentCalendarEntry;
      });
    } catch (e) {
      log.error('Failed to get calendar entries by status from Firestore', { error: String(e) });
    }
  }

  return Array.from(memoryCalendarStore.values()).filter((e) => e.status === status);
}

// ============================================================================
// STATS AND AGGREGATIONS
// ============================================================================

/**
 * Get content statistics
 */
export async function getContentStats(): Promise<{
  total: number;
  byStatus: Record<ContentStatus, number>;
  byPillar: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const allContent = await getAllContent();

  const stats = {
    total: allContent.length,
    byStatus: {} as Record<ContentStatus, number>,
    byPillar: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  };

  for (const content of allContent) {
    // By status
    stats.byStatus[content.status] = (stats.byStatus[content.status] || 0) + 1;

    // By pillar
    const pillar = content.brief.pillar;
    stats.byPillar[pillar] = (stats.byPillar[pillar] || 0) + 1;

    // By category
    const category = content.brief.category;
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  }

  return stats;
}

/**
 * Get calendar statistics
 */
export async function getCalendarStats(): Promise<{
  total: number;
  byStatus: Record<CalendarEntryStatus, number>;
  byPillar: Record<string, number>;
}> {
  const allEntries = await getAllCalendarEntries();

  const stats = {
    total: allEntries.length,
    byStatus: {} as Record<CalendarEntryStatus, number>,
    byPillar: {} as Record<string, number>,
  };

  for (const entry of allEntries) {
    // By status
    stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;

    // By pillar
    stats.byPillar[entry.pillar] = (stats.byPillar[entry.pillar] || 0) + 1;
  }

  return stats;
}
