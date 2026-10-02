/**
 * User Preference Profile — "let Ferni remember my preferences too".
 *
 * Store:      bogle_users/{uid}/preferences/{prefId}   (one doc per domain+key)
 * Tombstones: bogle_users/{uid}/memory_tombstones/{prefId}  (kind: 'preference')
 *
 * Integration points:
 *   - Session start:   loadPreferenceBlock(userId)            (agent-setup.ts)
 *   - Proactive gates: getProactiveBoundaries / isTopicAllowedProactively / isContactAllowedAt
 *   - Capture (A):     onConversationSummarized(userId, conversationId, summary, turns)
 *   - Live capture:    recordUserTurnPreferences / recordMusicPreferences
 *   - Control (C):     exportPreferences / deletePreferencesFor / deletePreferencesDerivedFromFact / deleteAllPreferences
 *   - Voice tools:     setPreferenceFromVoice / describePreferencesForVoice
 *
 * See docs/architecture/USER-MEMORY-CONTROL.md#preferences.
 *
 * @module services/user-preferences
 */

export * from './types.js';
export { preferenceIdFor, isActive, decideMerge, rankOf, validateInput } from './rules.js';
export {
  listPreferences,
  getPreference,
  upsertPreference,
  editPreference,
  deletePreference,
  forgetPreferenceByKey,
  deletePreferencesFor,
  deletePreferencesDerivedFromFact,
  deleteAllPreferences,
  exportPreferences,
  clearPreferenceCache,
} from './store.js';
export {
  getProactiveBoundaries,
  isTopicAllowedProactively,
  isContactAllowedAt,
  topicMatchesBoundary,
} from './boundaries.js';
export {
  buildPreferenceBlock,
  loadPreferenceBlock,
  DEFAULT_BLOCK_BUDGET,
} from './context-block.js';
export {
  onConversationSummarized,
  recordUserTurnPreferences,
  recordMusicPreferences,
  preferencesFromFacts,
  PREFERENCE_FACT_CATEGORIES,
} from './inference.js';
export { getInterests, interestsFrom, type Interest } from './interests.js';
export {
  getMediaProfile,
  mediaProfileFrom,
  importListeningHistory,
  resolveMusicQuery,
  resolveMusicQueryForUser,
  type MediaProfile,
  type MediaItem,
} from './media.js';
export {
  getDietaryConstraints,
  getFoodProfile,
  foodProfileFrom,
  constraintsFrom,
  violationOf,
  filterSafe,
  dietaryRequestsFor,
  allergyReminder,
  setHealthConsentCheck,
  isHealthCategoryEnabled,
  recordDietarySettings,
  type DietaryConstraints,
  type FoodProfile,
} from './food.js';
export {
  setPreferenceFromVoice,
  describePreferencesForVoice,
  VOICE_PREFERENCE_TYPES,
} from './voice.js';
export { syncAccountPreferences, applyPreferencesToAccountView } from './account-sync.js';
