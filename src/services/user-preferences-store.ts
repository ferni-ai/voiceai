/**
 * User Preferences Store
 *
 * Persists user preferences extracted from natural conversation.
 * "Better than Human" - We remember what you like without being told.
 *
 * @module services/user-preferences-store
 */

import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb, toSafeDate } from '../utils/firestore-utils.js';
import type { ExtractedPreference } from '../intelligence/tracking/preferences.js';

const log = createLogger({ module: 'UserPreferencesStore' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoredPreference extends ExtractedPreference {
  /** When this preference was first detected */
  firstDetectedAt: Date;
  /** When this preference was last confirmed */
  lastConfirmedAt: Date;
  /** Number of times this preference was mentioned */
  mentionCount: number;
  /** Is this preference currently active? */
  isActive: boolean;
}

export interface UserPreferencesProfile {
  userId: string;
  preferences: Map<string, StoredPreference>;
  lastUpdated: Date;
}

// In-memory cache for fast access
const preferencesCache = new Map<string, UserPreferencesProfile>();

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Store extracted preferences for a user
 *
 * @param userId - User ID
 * @param preferences - Extracted preferences from conversation
 */
export async function storeUserPreferences(
  userId: string,
  preferences: ExtractedPreference[]
): Promise<void> {
  if (!userId || preferences.length === 0) return;

  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available for preference storage');
    return;
  }

  try {
    const now = new Date();
    const docRef = db.collection('user_preferences').doc(userId);
    const doc = await docRef.get();

    // Get existing preferences
    const existingData = doc.exists ? (doc.data() as Record<string, unknown>) : {};
    const existingPreferences: Record<string, StoredPreference> =
      (existingData.preferences as Record<string, StoredPreference>) || {};

    // Merge new preferences with existing
    for (const pref of preferences) {
      const key = `${pref.category}:${pref.value.toLowerCase()}`;
      const existing = existingPreferences[key];

      if (existing) {
        // Update existing preference
        existingPreferences[key] = {
          ...existing,
          confidence: Math.max(existing.confidence, pref.confidence),
          lastConfirmedAt: now,
          mentionCount: (existing.mentionCount || 1) + 1,
          context: pref.context || existing.context,
        };
      } else {
        // Add new preference
        existingPreferences[key] = {
          ...pref,
          firstDetectedAt: now,
          lastConfirmedAt: now,
          mentionCount: 1,
          isActive: true,
        };
      }
    }

    // Save to Firestore
    await docRef.set(
      {
        preferences: existingPreferences,
        lastUpdated: now,
      },
      { merge: true }
    );

    // Update cache
    preferencesCache.set(userId, {
      userId,
      preferences: new Map(Object.entries(existingPreferences)),
      lastUpdated: now,
    });

    log.debug(
      {
        userId,
        newCount: preferences.length,
        totalCount: Object.keys(existingPreferences).length,
      },
      'User preferences stored'
    );
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to store user preferences');
  }
}

/**
 * Get user preferences for context building
 *
 * @param userId - User ID
 * @returns User preferences profile or null
 */
export async function getUserPreferences(userId: string): Promise<UserPreferencesProfile | null> {
  // Check cache first
  const cached = preferencesCache.get(userId);
  if (cached) {
    return cached;
  }

  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db.collection('user_preferences').doc(userId).get();
    if (!doc.exists) return null;

    const data = doc.data() as Record<string, unknown>;
    const preferences = (data.preferences as Record<string, StoredPreference>) || {};

    const profile: UserPreferencesProfile = {
      userId,
      preferences: new Map(Object.entries(preferences)),
      lastUpdated: toSafeDate(data.lastUpdated),
    };

    // Cache for future requests
    preferencesCache.set(userId, profile);

    return profile;
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to get user preferences');
    return null;
  }
}

/**
 * Get preferences by category for context injection
 *
 * @param userId - User ID
 * @param category - Preference category to filter by
 */
export async function getPreferencesByCategory(
  userId: string,
  category: string
): Promise<StoredPreference[]> {
  const profile = await getUserPreferences(userId);
  if (!profile) return [];

  const filtered: StoredPreference[] = [];
  for (const pref of profile.preferences.values()) {
    if (pref.category === category && pref.isActive) {
      filtered.push(pref);
    }
  }

  return filtered;
}

/**
 * Format preferences for LLM context injection
 *
 * @param preferences - Preferences to format
 */
export function formatPreferencesForPrompt(preferences: StoredPreference[]): string {
  if (preferences.length === 0) return '';

  const lines = ['[USER PREFERENCES - Remember without being told]'];

  // Group by category
  const byCategory = new Map<string, StoredPreference[]>();
  for (const pref of preferences) {
    const existing = byCategory.get(pref.category) || [];
    existing.push(pref);
    byCategory.set(pref.category, existing);
  }

  for (const [category, prefs] of byCategory) {
    const values = prefs
      .filter((p) => p.confidence >= 0.6)
      .map((p) => (p.isNegative ? `NOT ${p.value}` : p.value))
      .slice(0, 5); // Limit per category

    if (values.length > 0) {
      lines.push(`- ${category.replace(/_/g, ' ')}: ${values.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Clear preferences cache for a user
 */
export function clearPreferencesCache(userId?: string): void {
  if (userId) {
    preferencesCache.delete(userId);
  } else {
    preferencesCache.clear();
  }
}
