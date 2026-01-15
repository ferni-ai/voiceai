/**
 * Calendar Notification Preferences
 *
 * Stores and retrieves user preferences for calendar notifications.
 * Persisted to Firestore for durability across sessions.
 *
 * @module services/calendar/notification-preferences
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'NotificationPreferences' });

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationPreferences {
  preMeetingReminder: boolean;
  meetingBriefing: boolean;
  postMeetingFollowup: boolean;
  weeklyDigest: boolean;
  [key: string]: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  preMeetingReminder: true,
  meetingBriefing: true,
  postMeetingFollowup: false,
  weeklyDigest: true,
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const preferencesCache: Map<string, NotificationPreferences> = new Map();

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getFirestore() {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    return new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
  } catch {
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get notification preferences for a user
 */
export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  // Check cache first
  const cached = preferencesCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const db = await getFirestore();
    if (!db) {
      return { ...DEFAULT_PREFERENCES };
    }

    const docRef = db.collection('users').doc(cleanForFirestore(userId)).collection('settings').doc('calendar_notifications');
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as NotificationPreferences;
      const prefs = { ...DEFAULT_PREFERENCES, ...data };
      preferencesCache.set(userId, prefs);
      return prefs;
    }
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to load notification preferences');
  }

  // Return defaults if not found
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Set a specific notification preference
 */
export async function setNotificationPreference(
  userId: string,
  setting: string,
  enabled: boolean
): Promise<void> {
  // Update cache
  const current = preferencesCache.get(userId) || { ...DEFAULT_PREFERENCES };
  current[setting] = enabled;
  preferencesCache.set(userId, current);

  try {
    const db = await getFirestore();
    if (!db) {
      log.warn({ userId }, 'Firestore not available, preference cached only');
      return;
    }

    const docRef = db.collection('users').doc(cleanForFirestore(userId)).collection('settings').doc('calendar_notifications');
    await docRef.set(
      {
        [setting]: enabled,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    log.info({ userId, setting, enabled }, 'Notification preference saved');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to save notification preference');
    throw error;
  }
}

/**
 * Check if a specific notification type is enabled for a user
 */
export async function isNotificationEnabled(
  userId: string,
  notificationType: keyof NotificationPreferences
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs[notificationType] ?? DEFAULT_PREFERENCES[notificationType] ?? true;
}

/**
 * Set all notification preferences at once
 */
export async function setNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<void> {
  // Update cache - filter out undefined values
  const current = preferencesCache.get(userId) || { ...DEFAULT_PREFERENCES };
  const filteredPrefs: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) {
      filteredPrefs[key] = value;
    }
  }
  const updated: NotificationPreferences = { ...current, ...filteredPrefs };
  preferencesCache.set(userId, updated);

  try {
    const db = await getFirestore();
    if (!db) {
      return;
    }

    const docRef = db.collection('users').doc(cleanForFirestore(userId)).collection('settings').doc('calendar_notifications');
    await docRef.set(
      {
        ...preferences,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    log.info({ userId }, 'All notification preferences saved');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to save notification preferences');
    throw error;
  }
}

export default {
  getNotificationPreferences,
  setNotificationPreference,
  isNotificationEnabled,
  setNotificationPreferences,
};
