/**
 * User Preferences Storage
 *
 * Firestore persistence for user information preferences.
 * Enables "Better Than Human" personalization across sessions.
 */
import type { UserInfoPreferences, PreferenceUpdate, PreferenceOperationResult, TeamPreference, LocationPreference } from './types.js';
/**
 * Get user preferences (from cache, then Firestore, then defaults)
 */
export declare function getUserPreferences(userId: string): Promise<UserInfoPreferences>;
/**
 * Save user preferences
 */
export declare function saveUserPreferences(userId: string, preferences: UserInfoPreferences): Promise<boolean>;
/**
 * Update specific preference fields
 */
export declare function updateUserPreferences(userId: string, update: PreferenceUpdate): Promise<PreferenceOperationResult>;
/**
 * Add a favorite team
 */
export declare function addFavoriteTeam(userId: string, team: TeamPreference): Promise<PreferenceOperationResult>;
/**
 * Remove a favorite team
 */
export declare function removeFavoriteTeam(userId: string, teamName: string): Promise<PreferenceOperationResult>;
/**
 * Get user's favorite teams
 */
export declare function getFavoriteTeams(userId: string): Promise<TeamPreference[]>;
/**
 * Add a stock to watchlist
 */
export declare function addToWatchlist(userId: string, symbol: string): Promise<PreferenceOperationResult>;
/**
 * Remove a stock from watchlist
 */
export declare function removeFromWatchlist(userId: string, symbol: string): Promise<PreferenceOperationResult>;
/**
 * Get user's stock watchlist
 */
export declare function getWatchlist(userId: string): Promise<string[]>;
/**
 * Save a location
 */
export declare function saveLocation(userId: string, location: LocationPreference): Promise<PreferenceOperationResult>;
/**
 * Get a saved location by name
 */
export declare function getSavedLocation(userId: string, name: string): Promise<LocationPreference | null>;
/**
 * Add a news interest
 */
export declare function addNewsInterest(userId: string, topic: string): Promise<PreferenceOperationResult>;
/**
 * Add a topic to avoid
 */
export declare function addAvoidTopic(userId: string, topic: string): Promise<PreferenceOperationResult>;
/**
 * Set or add allergy information
 * @param mode - 'replace' (default) replaces all, 'add' appends new allergies
 */
export declare function setAllergies(userId: string, allergies: string[], mode?: 'replace' | 'add'): Promise<PreferenceOperationResult>;
/**
 * Clear preferences cache for a user
 */
export declare function clearPreferencesCache(userId?: string): void;
//# sourceMappingURL=storage.d.ts.map