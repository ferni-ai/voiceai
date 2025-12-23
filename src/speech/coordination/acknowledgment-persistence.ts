/**
 * Acknowledgment Preferences Persistence
 *
 * Saves and loads user acknowledgment preferences to Firestore.
 * Enables preferences to survive across sessions for improved personalization.
 *
 * @module speech/coordination/acknowledgment-persistence
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'acknowledgment-persistence' });

// ============================================================================
// TYPES
// ============================================================================

/** Stored preferences format */
export interface StoredAcknowledgmentPreferences {
  userId: string;
  preferredCategories: string[];
  preferredPhrases: string[];
  dislikedPhrases: string[];
  lengthPreference: 'short' | 'medium' | 'long';
  sampleCount: number;
  updatedAt: number;
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

/**
 * Save acknowledgment preferences to Firestore.
 */
export async function saveAcknowledgmentPreferences(
  userId: string,
  preferences: Omit<StoredAcknowledgmentPreferences, 'userId' | 'updatedAt'>
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.debug({ userId }, 'Firestore not available - skipping preferences save');
      return;
    }

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc('acknowledgments');

    const data: StoredAcknowledgmentPreferences = {
      userId,
      ...preferences,
      updatedAt: Date.now(),
    };

    await docRef.set(data);
    log.debug({ userId, sampleCount: preferences.sampleCount }, 'Acknowledgment preferences saved');
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to save acknowledgment preferences');
  }
}

/**
 * Load acknowledgment preferences from Firestore.
 */
export async function loadAcknowledgmentPreferences(
  userId: string
): Promise<StoredAcknowledgmentPreferences | null> {
  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.debug({ userId }, 'Firestore not available - no preferences loaded');
      return null;
    }

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc('acknowledgments');
    const doc = await docRef.get();

    if (!doc.exists) {
      log.debug({ userId }, 'No stored acknowledgment preferences found');
      return null;
    }

    const data = doc.data() as StoredAcknowledgmentPreferences;
    log.debug({ userId, sampleCount: data.sampleCount }, 'Acknowledgment preferences loaded');
    return data;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to load acknowledgment preferences');
    return null;
  }
}

/**
 * Delete acknowledgment preferences from Firestore.
 */
export async function deleteAcknowledgmentPreferences(userId: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return;
    }

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc('acknowledgments');
    await docRef.delete();
    log.debug({ userId }, 'Acknowledgment preferences deleted');
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to delete acknowledgment preferences');
  }
}

// ============================================================================
// IN-MEMORY CACHE WITH PERSISTENCE
// ============================================================================

const preferencesCache = new Map<string, StoredAcknowledgmentPreferences>();
const pendingSaves = new Map<string, NodeJS.Timeout>();

/**
 * Get preferences with cache-first strategy.
 */
export async function getAcknowledgmentPreferences(
  userId: string
): Promise<StoredAcknowledgmentPreferences | null> {
  // Check cache first
  const cached = preferencesCache.get(userId);
  if (cached) {
    return cached;
  }

  // Load from Firestore
  const loaded = await loadAcknowledgmentPreferences(userId);
  if (loaded) {
    preferencesCache.set(userId, loaded);
  }
  return loaded;
}

/**
 * Update preferences with debounced persistence.
 * Updates cache immediately, saves to Firestore after delay.
 */
export function updateAcknowledgmentPreferences(
  userId: string,
  updates: Partial<Omit<StoredAcknowledgmentPreferences, 'userId' | 'updatedAt'>>
): void {
  // Get current or create new
  const current = preferencesCache.get(userId) || {
    userId,
    preferredCategories: [],
    preferredPhrases: [],
    dislikedPhrases: [],
    lengthPreference: 'medium' as const,
    sampleCount: 0,
    updatedAt: Date.now(),
  };

  // Merge updates
  const updated: StoredAcknowledgmentPreferences = {
    ...current,
    ...updates,
    userId,
    updatedAt: Date.now(),
  };

  // Update cache immediately
  preferencesCache.set(userId, updated);

  // Debounce Firestore save (5 seconds)
  const existingTimer = pendingSaves.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    void saveAcknowledgmentPreferences(userId, {
      preferredCategories: updated.preferredCategories,
      preferredPhrases: updated.preferredPhrases,
      dislikedPhrases: updated.dislikedPhrases,
      lengthPreference: updated.lengthPreference,
      sampleCount: updated.sampleCount,
    });
    pendingSaves.delete(userId);
  }, 5000);

  pendingSaves.set(userId, timer);
}

/**
 * Flush all pending saves (call on session cleanup).
 */
export async function flushPendingSaves(): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const [userId, timer] of pendingSaves.entries()) {
    clearTimeout(timer);
    const prefs = preferencesCache.get(userId);
    if (prefs) {
      promises.push(
        saveAcknowledgmentPreferences(userId, {
          preferredCategories: prefs.preferredCategories,
          preferredPhrases: prefs.preferredPhrases,
          dislikedPhrases: prefs.dislikedPhrases,
          lengthPreference: prefs.lengthPreference,
          sampleCount: prefs.sampleCount,
        })
      );
    }
  }

  pendingSaves.clear();
  await Promise.all(promises);
  log.debug({ count: promises.length }, 'Flushed pending acknowledgment preference saves');
}

/**
 * Clear cache for a user (call on session end).
 */
export function clearUserPreferencesCache(userId: string): void {
  preferencesCache.delete(userId);
  const timer = pendingSaves.get(userId);
  if (timer) {
    clearTimeout(timer);
    pendingSaves.delete(userId);
  }
}
