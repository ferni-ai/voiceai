/**
 * User Preferences Storage
 *
 * Firestore persistence for user information preferences.
 * Enables "Better Than Human" personalization across sessions.
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  UserInfoPreferences,
  PreferenceUpdate,
  PreferenceOperationResult,
  TeamPreference,
  LocationPreference,
} from './types.js';
import { DEFAULT_PREFERENCES } from './types.js';

const log = getLogger();

// ============================================================================
// IN-MEMORY CACHE (also serves as fallback storage)
// ============================================================================

/**
 * Cache for preferences (also used as primary storage when Firestore unavailable)
 * Key: userId, Value: { preferences, timestamp }
 */
const preferencesCache = new Map<string, { preferences: UserInfoPreferences; timestamp: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

// Firestore instance (lazy loaded)
let db: FirebaseFirestore.Firestore | null = null;
let firestoreInitAttempted = false;

/**
 * Get Firestore instance (lazy initialization)
 */
function getFirestoreDb(): FirebaseFirestore.Firestore | null {
  if (firestoreInitAttempted) return db;

  firestoreInitAttempted = true;
  try {
    // Dynamic import to avoid initialization issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFirestore } = require('firebase-admin/firestore');
    db = getFirestore();
    log.info('📋 Firestore initialized for preferences');
  } catch (error) {
    log.warn({ error: String(error) }, '📋 Firestore not available, using memory only');
    db = null;
  }
  return db;
}

/**
 * Firestore collection path for preferences
 */
function getPreferencesPath(userId: string): string {
  return `bogle_users/${userId}/info_preferences`;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Get user preferences (from cache, then Firestore, then defaults)
 */
export async function getUserPreferences(userId: string): Promise<UserInfoPreferences> {
  // Check cache first
  const cached = preferencesCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    log.debug({ userId }, '📋 Returning cached preferences');
    return cached.preferences;
  }

  // Try Firestore
  const firestore = getFirestoreDb();
  if (firestore) {
    try {
      const doc = await firestore.collection(getPreferencesPath(userId)).doc('current').get();
      if (doc.exists) {
        const data = doc.data() as UserInfoPreferences;
        // Convert Firestore timestamp to Date
        const preferences = {
          ...DEFAULT_PREFERENCES,
          ...data,
          updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
        };

        // Update cache
        preferencesCache.set(userId, { preferences, timestamp: Date.now() });
        log.debug({ userId }, '📋 Loaded preferences from Firestore');
        return preferences;
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, '📋 Error loading preferences');
    }
  }

  // Return defaults (or cached if available but stale)
  if (cached) {
    return cached.preferences;
  }

  log.debug({ userId }, '📋 Using default preferences');
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Save user preferences
 */
export async function saveUserPreferences(
  userId: string,
  preferences: UserInfoPreferences
): Promise<boolean> {
  // Update cache immediately
  const updated = {
    ...preferences,
    updatedAt: new Date(),
  };
  preferencesCache.set(userId, { preferences: updated, timestamp: Date.now() });

  // Persist to Firestore
  const firestore = getFirestoreDb();
  if (firestore) {
    try {
      await firestore.collection(getPreferencesPath(userId)).doc('current').set(updated);
      log.info({ userId }, '📋 Preferences saved to Firestore');
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, '📋 Error saving preferences');
      return false;
    }
  }

  return true; // Memory-only mode
}

/**
 * Update specific preference fields
 */
export async function updateUserPreferences(
  userId: string,
  update: PreferenceUpdate
): Promise<PreferenceOperationResult> {
  try {
    const current = await getUserPreferences(userId);
    const updated: UserInfoPreferences = {
      ...current,
      ...update,
      updatedAt: new Date(),
      version: current.version,
    };

    const success = await saveUserPreferences(userId, updated);
    return {
      success,
      message: success ? 'Preferences updated!' : 'Could not save preferences.',
      preferences: updated,
    };
  } catch (error) {
    log.error({ userId, error: String(error) }, '📋 Error updating preferences');
    return {
      success: false,
      message: 'Something went wrong updating your preferences.',
    };
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Add a favorite team
 */
export async function addFavoriteTeam(
  userId: string,
  team: TeamPreference
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);

  // Check if already exists
  const exists = prefs.favoriteTeams.some((t) => t.name.toLowerCase() === team.name.toLowerCase());

  if (exists) {
    return { success: true, message: `${team.name} is already in your favorites!` };
  }

  return updateUserPreferences(userId, {
    favoriteTeams: [...prefs.favoriteTeams, team],
  });
}

/**
 * Remove a favorite team
 */
export async function removeFavoriteTeam(
  userId: string,
  teamName: string
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);

  const updated = prefs.favoriteTeams.filter(
    (t) => t.name.toLowerCase() !== teamName.toLowerCase()
  );

  if (updated.length === prefs.favoriteTeams.length) {
    return { success: true, message: `${teamName} wasn't in your favorites.` };
  }

  return updateUserPreferences(userId, { favoriteTeams: updated });
}

/**
 * Get user's favorite teams
 */
export async function getFavoriteTeams(userId: string): Promise<TeamPreference[]> {
  const prefs = await getUserPreferences(userId);
  return prefs.favoriteTeams;
}

/**
 * Add a stock to watchlist
 */
export async function addToWatchlist(
  userId: string,
  symbol: string
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);
  const normalized = symbol.toUpperCase();

  if (prefs.stockWatchlist.includes(normalized)) {
    return { success: true, message: `${normalized} is already on your watchlist!` };
  }

  return updateUserPreferences(userId, {
    stockWatchlist: [...prefs.stockWatchlist, normalized],
  });
}

/**
 * Remove a stock from watchlist
 */
export async function removeFromWatchlist(
  userId: string,
  symbol: string
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);
  const normalized = symbol.toUpperCase();

  const updated = prefs.stockWatchlist.filter((s) => s !== normalized);

  if (updated.length === prefs.stockWatchlist.length) {
    return { success: true, message: `${normalized} wasn't on your watchlist.` };
  }

  return updateUserPreferences(userId, { stockWatchlist: updated });
}

/**
 * Get user's stock watchlist
 */
export async function getWatchlist(userId: string): Promise<string[]> {
  const prefs = await getUserPreferences(userId);
  return prefs.stockWatchlist;
}

/**
 * Save a location
 */
export async function saveLocation(
  userId: string,
  location: LocationPreference
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);
  const name = location.name.toLowerCase();

  // Special handling for home/work
  if (name === 'home') {
    return updateUserPreferences(userId, { homeLocation: location });
  }
  if (name === 'work') {
    return updateUserPreferences(userId, { workLocation: location });
  }

  // Check if updating existing
  const existingIndex = prefs.savedLocations.findIndex((l) => l.name.toLowerCase() === name);

  let updatedLocations: LocationPreference[];
  if (existingIndex >= 0) {
    updatedLocations = [...prefs.savedLocations];
    updatedLocations[existingIndex] = location;
  } else {
    updatedLocations = [...prefs.savedLocations, location];
  }

  return updateUserPreferences(userId, { savedLocations: updatedLocations });
}

/**
 * Get a saved location by name
 */
export async function getSavedLocation(
  userId: string,
  name: string
): Promise<LocationPreference | null> {
  const prefs = await getUserPreferences(userId);
  const normalized = name.toLowerCase();

  if (normalized === 'home') return prefs.homeLocation || null;
  if (normalized === 'work') return prefs.workLocation || null;

  return prefs.savedLocations.find((l) => l.name.toLowerCase() === normalized) || null;
}

/**
 * Add a news interest
 */
export async function addNewsInterest(
  userId: string,
  topic: string
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);
  const normalized = topic.toLowerCase();

  if (prefs.newsInterests.some((t) => t.toLowerCase() === normalized)) {
    return { success: true, message: `${topic} is already in your interests!` };
  }

  return updateUserPreferences(userId, {
    newsInterests: [...prefs.newsInterests, topic],
  });
}

/**
 * Add a topic to avoid
 */
export async function addAvoidTopic(
  userId: string,
  topic: string
): Promise<PreferenceOperationResult> {
  const prefs = await getUserPreferences(userId);
  const normalized = topic.toLowerCase();

  if (prefs.avoidTopics.some((t) => t.toLowerCase() === normalized)) {
    return { success: true, message: `${topic} is already on your avoid list.` };
  }

  return updateUserPreferences(userId, {
    avoidTopics: [...prefs.avoidTopics, topic],
  });
}

/**
 * Set or add allergy information
 * @param mode - 'replace' (default) replaces all, 'add' appends new allergies
 */
export async function setAllergies(
  userId: string,
  allergies: string[],
  mode: 'replace' | 'add' = 'replace'
): Promise<PreferenceOperationResult> {
  if (mode === 'add') {
    const prefs = await getUserPreferences(userId);
    const normalized = allergies.map((a) => a.toLowerCase().trim());
    const existingNormalized = prefs.allergies.map((a) => a.toLowerCase());

    // Only add new allergies (deduped)
    const newAllergies = normalized.filter((a) => !existingNormalized.includes(a));

    if (newAllergies.length === 0) {
      return { success: true, message: 'Already knew about these allergies.' };
    }

    return updateUserPreferences(userId, {
      allergies: [...prefs.allergies, ...newAllergies],
    });
  }

  return updateUserPreferences(userId, { allergies });
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
