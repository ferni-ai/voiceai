/**
 * Communication Preferences Module
 *
 * Tracks how users prefer to be approached across dimensions:
 * - Formality level (casual vs formal)
 * - Detail level (brief vs detailed)
 * - Coaching style (direct vs supportive)
 * - And more...
 *
 * Storage: bogle_users/{userId}/communication_preferences/{prefId}
 *
 * @module memory/communication-preferences
 */

// Types
export type {
  CommunicationPreference,
  PreferenceDimension,
  PreferenceInput,
  LegacyCommunicationPreferencesData,
} from './types.js';

export { PREFERENCE_CONFIG } from './types.js';

// Storage operations
export {
  observePreference,
  getPreferences,
  getPreferencesForContext,
  getPreferenceByDimension,
  deleteAllPreferences,
} from './storage.js';

// Migration utilities
export {
  migrateUserPreferences,
  migrateAllUserPreferences,
  cleanupLegacyPreferences,
} from './migration.js';
