/**
 * Storage Keys Registry
 *
 * Single source of truth for all localStorage/sessionStorage keys used by Ferni.
 * Used by:
 * - Data export service (to export all user data)
 * - Data delete service (to clear all user data)
 * - Individual services (import from here instead of hardcoding)
 *
 * IMPORTANT: When adding a new localStorage key anywhere in the app,
 * add it here first to ensure proper data export/delete coverage.
 */

// ============================================================================
// IDENTITY & AUTH
// ============================================================================

export const IDENTITY_KEYS = {
  /** Primary user ID (Firebase UID or device:{uuid}) */
  USER_ID: 'ferni_user_id',
  /** Firebase UID when authenticated */
  FIREBASE_UID: 'ferni_firebase_uid',
  /** Legacy device identifier */
  DEVICE_ID: 'voiceai_deviceId',
  /** User's display name */
  USER_NAME: 'voiceai_userName',
  /** Admin ID for admin access */
  ADMIN_ID: 'ferni_admin_id',
  /** Admin API key */
  ADMIN_KEY: 'ferni_admin_key',
  /** Auth token for API calls */
  AUTH_TOKEN: 'ferni_auth_token',
} as const;

// ============================================================================
// PREFERENCES & SETTINGS
// ============================================================================

export const PREFERENCE_KEYS = {
  /** UI theme (light/dark/system) */
  THEME: 'ferni_theme',
  /** Locale/language preference */
  LOCALE: 'ferni_locale',
  /** Notification settings */
  NOTIFICATIONS: 'ferni_notifications',
  /** Selected persona ID */
  SELECTED_PERSONA: 'voiceai_selectedPersona',
  /** Pinned menu items */
  MENU_PINNED: 'ferni_menu_pinned',
  /** Dismissed feature hints */
  DISMISSED_HINTS: 'ferni_dismissed_hints',
} as const;

// ============================================================================
// RELATIONSHIP & PROGRESS
// ============================================================================

export const PROGRESS_KEYS = {
  /** Relationship stage and metrics */
  RELATIONSHIP: 'ferni_relationship',
  /** Legacy relationship data */
  RELATIONSHIP_DATA: 'ferni_relationship_data',
  /** Team member unlock state */
  TEAM_UNLOCK_STATE: 'ferni_team_unlock_state',
  /** Onboarding completion status */
  ONBOARDING_COMPLETE: 'ferni_onboarding_complete',
  /** Onboarding complete flag (alternate) */
  ONBOARDING_COMPLETE_ALT: 'ferni:onboarding:complete',
  /** First connection flag */
  FIRST_CONNECTION: 'voiceai_first_connection',
  /** Has connected flag */
  HAS_CONNECTED: 'voiceai_has_connected',
  /** User history for greeting */
  USER_HISTORY: 'voiceai_user_history',
  /** Conversation count for unlocks */
  CONVERSATION_COUNT: 'ferni:modal:conversationCount',
  /** First session complete */
  FIRST_SESSION_COMPLETE: 'ferni:modal:firstSessionComplete',
} as const;

// ============================================================================
// FEATURES & RITUALS
// ============================================================================

export const FEATURE_KEYS = {
  /** User rituals data */
  USER_RITUALS: 'ferni_user_rituals',
  /** Spotify linked status */
  SPOTIFY_LINKED: 'ferni_spotify_linked',
  /** Earn seeds modal seen */
  EARN_SEEDS_SEEN: 'ferni_earn_seeds_seen',
  /** Custom agent draft */
  CUSTOM_AGENT_DRAFT: 'ferni_custom_agent_draft',
} as const;

// ============================================================================
// MODAL & UI STATE
// ============================================================================

export const UI_STATE_KEYS = {
  /** Last modal shown timestamp */
  LAST_MODAL_TIME: 'ferni:modal:lastModalTime',
  /** Last celebration timestamp */
  LAST_CELEBRATION_TIME: 'ferni:modal:lastCelebrationTime',
  /** Last hint timestamp */
  LAST_HINT_TIME: 'ferni:modal:lastHintTime',
  /** Dev mode enabled */
  DEV_MODE: 'ferni_dev_mode',
} as const;

// ============================================================================
// GOOGLE ONE TAP
// ============================================================================

export const GOOGLE_ONE_TAP_KEYS = {
  /** Dismissed until timestamp */
  DISMISSED_UNTIL: 'ferni_one_tap_dismissed_until',
  /** Prompt count */
  PROMPT_COUNT: 'ferni_one_tap_prompt_count',
} as const;

// ============================================================================
// OFFLINE & SYNC
// ============================================================================

export const OFFLINE_KEYS = {
  /** Sync queue for offline actions */
  SYNC_QUEUE: 'ferni_sync_queue',
  /** Offline data prefix */
  OFFLINE_PREFIX: 'ferni_offline_',
  /** Crash report queue */
  CRASH_QUEUE: 'ferni_crash_queue',
} as const;

// ============================================================================
// SUBSCRIPTION & MONETIZATION
// ============================================================================

export const SUBSCRIPTION_KEYS = {
  /** Subscription bypass for dev */
  BYPASS: 'ferni_subscription_bypass',
  /** Subscription enabled flag */
  ENABLED: 'ferni_subscription_enabled',
  /** Subscription whitelist */
  WHITELIST: 'ferni_subscription_whitelist',
  /** Upgrade tier (session) */
  UPGRADE_TIER: 'ferni_upgrade_tier',
} as const;

// ============================================================================
// DEMO & CLAIM
// ============================================================================

export const DEMO_KEYS = {
  /** Demo claim token */
  CLAIM_TOKEN: 'ferni_demo_claim_token',
  /** Demo room name */
  ROOM_NAME: 'ferni_demo_room_name',
  /** Demo session time */
  SESSION_TIME: 'ferni_demo_session_time',
  /** Claimed conversation */
  CLAIMED_CONVERSATION: 'ferni_claimed_conversation',
  /** Claimed at timestamp */
  CLAIMED_AT: 'ferni_claimed_at',
} as const;

// ============================================================================
// REFERRAL
// ============================================================================

export const REFERRAL_KEYS = {
  /** Referral state */
  STATE: 'ferni_referral_state',
} as const;

// ============================================================================
// JOURNAL & CAPTURE
// ============================================================================

export const JOURNAL_KEYS = {
  /** Journal capture settings */
  CAPTURE_SETTINGS: 'ferni_journal_capture_settings',
} as const;

// ============================================================================
// EXPERIMENTS
// ============================================================================

export const EXPERIMENT_KEYS = {
  /** Experiment user ID */
  USER_ID: 'ferni_experiment_user_id',
  /** Experiment assignments */
  ASSIGNMENTS: 'ferni_experiment_assignments',
} as const;

// ============================================================================
// ALL KEYS (For export/delete operations)
// ============================================================================

/**
 * All user data keys that should be exported/deleted.
 * Does NOT include admin keys or dev mode flags.
 */
export const USER_DATA_KEYS = [
  // Identity (except admin)
  IDENTITY_KEYS.USER_ID,
  IDENTITY_KEYS.FIREBASE_UID,
  IDENTITY_KEYS.DEVICE_ID,
  IDENTITY_KEYS.USER_NAME,
  IDENTITY_KEYS.AUTH_TOKEN,

  // Preferences
  ...Object.values(PREFERENCE_KEYS),

  // Progress
  ...Object.values(PROGRESS_KEYS),

  // Features
  ...Object.values(FEATURE_KEYS),

  // Google One Tap
  ...Object.values(GOOGLE_ONE_TAP_KEYS),

  // Offline (except prefix - handled separately)
  OFFLINE_KEYS.SYNC_QUEUE,
  OFFLINE_KEYS.CRASH_QUEUE,

  // Demo
  ...Object.values(DEMO_KEYS),

  // Referral
  REFERRAL_KEYS.STATE,

  // Journal
  JOURNAL_KEYS.CAPTURE_SETTINGS,

  // Experiments
  EXPERIMENT_KEYS.USER_ID,
  EXPERIMENT_KEYS.ASSIGNMENTS,
] as const;

/**
 * Keys that should be cleared on logout but NOT on full data delete.
 * (Session-specific, not user data)
 */
export const SESSION_ONLY_KEYS = [
  UI_STATE_KEYS.LAST_MODAL_TIME,
  UI_STATE_KEYS.LAST_CELEBRATION_TIME,
  UI_STATE_KEYS.LAST_HINT_TIME,
  SUBSCRIPTION_KEYS.UPGRADE_TIER, // sessionStorage
] as const;

/**
 * Prefixes for keys that need pattern matching (for offline data, etc.)
 */
export const KEY_PREFIXES = {
  OFFLINE: 'ferni_offline_',
  MARKETPLACE: 'ferni_marketplace_',
  CACHE: 'ferni_cache_',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all localStorage keys that match our prefixes.
 * Used for complete data export/delete.
 */
export function getAllFerniKeys(): string[] {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('ferni_') || key.startsWith('voiceai_'))) {
      keys.push(key);
    }
  }

  return keys;
}

/**
 * Export all localStorage data as a record.
 */
export function exportLocalStorage(): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  const keys = getAllFerniKeys();

  for (const key of keys) {
    data[key] = localStorage.getItem(key);
  }

  return data;
}

/**
 * Clear all Ferni-related localStorage data.
 * Preserves admin keys and dev mode for debugging.
 */
export function clearAllUserData(preserveDevSettings = true): void {
  const keys = getAllFerniKeys();

  for (const key of keys) {
    // Optionally preserve dev/admin settings
    if (preserveDevSettings) {
      if (
        key === IDENTITY_KEYS.ADMIN_ID ||
        key === IDENTITY_KEYS.ADMIN_KEY ||
        key === UI_STATE_KEYS.DEV_MODE
      ) {
        continue;
      }
    }
    localStorage.removeItem(key);
  }

  // Also clear sessionStorage
  sessionStorage.removeItem(SUBSCRIPTION_KEYS.UPGRADE_TIER);
}

// ============================================================================
// RE-EXPORT FOR CONVENIENCE
// ============================================================================

export const STORAGE_KEYS = {
  ...IDENTITY_KEYS,
  ...PREFERENCE_KEYS,
  ...PROGRESS_KEYS,
  ...FEATURE_KEYS,
  ...UI_STATE_KEYS,
  ...GOOGLE_ONE_TAP_KEYS,
  ...OFFLINE_KEYS,
  ...SUBSCRIPTION_KEYS,
  ...DEMO_KEYS,
  ...REFERRAL_KEYS,
  ...JOURNAL_KEYS,
  ...EXPERIMENT_KEYS,
} as const;

export default STORAGE_KEYS;

