/**
 * Human-Friendly API Error Messages
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Even API errors should feel warm, not robotic. These messages are shown
 * to users when something goes wrong.
 *
 * @see docs/guides/HUMAN-MICROCOPY.md for our microcopy principles
 */

// ============================================================================
// USER-FACING ERROR MESSAGES
// ============================================================================

/**
 * Human-friendly error messages for user-facing API responses.
 *
 * Principles:
 * - Acknowledge, don't blame
 * - Be helpful, not technical
 * - Offer a path forward
 * - Stay warm
 */
export const API_ERRORS = {
  // Authentication
  USER_ID_REQUIRED: 'We need to know who you are. Please sign in and try again.',
  AUTH_REQUIRED: 'Hmm, looks like you need to sign in first.',

  // Conversations
  CONVERSATIONS_FETCH_FAILED: "Couldn't load your conversations right now. Mind trying again?",

  // Data management
  DATA_EXPORT_FAILED: "Hmm, couldn't export your data. Mind trying again?",
  DATA_DELETE_FAILED: "Couldn't delete your data right now. Try again?",
  DATA_DELETE_CONFIRMATION: 'This is a big step. Please confirm you want to delete your data.',
  INVALID_REQUEST: "Something didn't look right. Could you try again?",

  // Rituals
  RITUALS_FETCH_FAILED: "Couldn't load your rituals right now. Try refreshing?",
  RITUAL_CREATE_FAILED: "Couldn't create that ritual. Mind trying again?",
  RITUAL_DELETE_FAILED: "Couldn't remove that ritual. Try again?",
  RITUAL_COMPLETE_FAILED: "Couldn't mark that as complete. Give it another shot?",
  RITUAL_NOT_FOUND: "Couldn't find that ritual. It may have been removed.",

  // Predictions
  PREDICTIONS_FETCH_FAILED: "Couldn't load your predictions right now. Try again?",
  PREDICTION_NOT_FOUND: "Hmm, couldn't find that prediction. It may have expired.",
  PREDICTION_ALREADY_COMPLETED: 'Looks like this prediction was already resolved.',
  PREDICTION_UPDATE_FAILED: "Couldn't update that prediction. Mind trying again?",

  // Memories
  MEMORY_NOT_FOUND: "Couldn't find that memory. It may have been removed.",

  // Relationship
  RELATIONSHIP_SYNC_FAILED: "Couldn't save your progress right now. Try again?",

  // Profile/Settings
  PROFILE_UPDATE_FAILED: "Couldn't save your changes right now. Try again?",
  SETTINGS_SAVE_FAILED: "Couldn't save your settings. Mind trying again?",

  // Ambient Mode
  AMBIENT_NOT_ENABLED: "Ambient mode isn't turned on yet. You can enable it in settings.",
  AMBIENT_SYNC_FAILED: "Couldn't sync your ambient data. Mind trying again?",
  AMBIENT_STATE_FAILED: "Couldn't load your ambient state right now. Try again?",
  AMBIENT_CONTEXT_FAILED: "Couldn't load ambient context right now. Try again?",
  AMBIENT_PREFERENCES_FAILED: "Couldn't load your ambient preferences. Try refreshing?",
  AMBIENT_UPDATE_PREFERENCES_FAILED: "Couldn't save your ambient preferences. Mind trying again?",
  AMBIENT_ENABLE_FAILED: "Couldn't turn on ambient mode. Give it another shot?",
  AMBIENT_DISABLE_FAILED: "Couldn't turn off ambient mode. Try again?",
  AMBIENT_QUIET_HOURS_TIME_REQUIRED: 'Need both a start and end time (HH:MM format).',
  AMBIENT_QUIET_HOURS_INVALID_FORMAT: "That time format didn't look right. Use HH:MM (24-hour).",
  AMBIENT_QUIET_HOURS_FAILED: "Couldn't set quiet hours. Mind trying again?",
  AMBIENT_NUDGE_EVAL_FAILED: "Couldn't evaluate nudge right now. Try again?",

  // Digital Twin Profile
  TWIN_PROFILE_FETCH_FAILED: "Couldn't load your profile right now. Try refreshing?",
  TWIN_PROFILE_SAVE_FAILED: "Couldn't save your profile. Mind trying again?",
  TWIN_PROFILE_SECTION_FAILED: "Couldn't update that section. Try again?",
  TWIN_PROFILE_DELETE_FAILED: "Couldn't delete your profile right now. Try again?",
  TWIN_PROFILE_ANALYZE_FAILED: "Couldn't analyze your profile right now. Try again?",
  TWIN_INVALID_PROFILE_DATA: "That profile data didn't look right. Could you check it?",
  TWIN_INVALID_SECTION_DATA: "That section data didn't look right. Could you check it?",

  // Apple Health
  HEALTH_SYNC_CREDENTIALS_REQUIRED: 'Need both a sync token and user ID to sync.',
  HEALTH_INVALID_SYNC_TOKEN: "That sync token isn't valid. Try reconnecting your device.",
  HEALTH_SYNC_FAILED: "Couldn't sync your health data. Mind trying again?",
  HEALTH_DEVICE_INFO_REQUIRED: 'Need your device ID and name to set up.',
  HEALTH_TOKEN_GENERATE_FAILED: "Couldn't set up the sync connection. Try again?",
  HEALTH_NO_DATA: 'No health data found for that date.',
  HEALTH_HISTORY_FAILED: "Couldn't load your health history. Try again?",

  // Visual Memory
  VISUAL_NOT_ENABLED: "Visual memory isn't turned on yet. You can enable it in settings.",
  VISUAL_UPLOAD_FIELDS_REQUIRED: 'Need both the image data and its type to upload.',
  VISUAL_UPLOAD_FAILED: "Couldn't upload that image. Mind trying again?",
  VISUAL_SEARCH_QUERY_REQUIRED: 'Need a search query to look through your memories.',
  VISUAL_SEARCH_FAILED: "Couldn't search your visual memories. Try again?",
  VISUAL_RECENT_FAILED: "Couldn't load recent memories. Try refreshing?",
  VISUAL_PREFERENCES_FAILED: "Couldn't load your visual memory preferences. Try refreshing?",
  VISUAL_UPDATE_PREFERENCES_FAILED:
    "Couldn't save your visual memory preferences. Mind trying again?",
  VISUAL_ENABLE_FAILED: "Couldn't turn on visual memory. Give it another shot?",
  VISUAL_DISABLE_FAILED: "Couldn't turn off visual memory. Try again?",
  VISUAL_NOT_FOUND: "Couldn't find that visual memory. It may have been removed.",
  VISUAL_FETCH_FAILED: "Couldn't load that visual memory. Try again?",
  VISUAL_DELETE_FAILED: "Couldn't delete that visual memory. Try again?",

  // Smart Home Integrations (Oura, Eight Sleep, Ecobee)
  INTEGRATION_NOT_CONFIGURED: (name: string) => `${name} integration isn't set up yet.`,
  OAUTH_MISSING_PARAMS: 'Something went wrong with the connection. Mind trying again?',
  OAUTH_INVALID_STATE: 'That link expired. Mind starting over?',
  OAUTH_AUTH_URL_FAILED: "Couldn't start the connection. Try again?",
  INTEGRATION_NO_SLEEP_DATA: 'No sleep data found for that date.',
  INTEGRATION_NO_READINESS_DATA: 'No readiness data found for that date.',
  INTEGRATION_NO_ACTIVITY_DATA: 'No activity data found for that date.',

  // Eight Sleep
  EIGHT_SLEEP_TEMP_FAILED: "Couldn't read the temperature. Try again?",
  EIGHT_SLEEP_SET_TEMP_FAILED: "Couldn't set the temperature. Mind trying again?",
  EIGHT_SLEEP_MISSING_LEVEL: 'Need a temperature level to set.',
  EIGHT_SLEEP_TURN_ON_FAILED: "Couldn't turn on. Try again?",
  EIGHT_SLEEP_TURN_OFF_FAILED: "Couldn't turn off. Try again?",

  // Ecobee
  ECOBEE_LINK_FAILED: "Couldn't start the Ecobee link. Try again?",
  ECOBEE_AUTH_CHECK_FAILED: "Couldn't check authorization status. Try again?",
  ECOBEE_TEMP_PARAMS_REQUIRED: 'Need a heat or cool temperature to set.',
  ECOBEE_SET_TEMP_FAILED: "Couldn't set the temperature. Mind trying again?",
  ECOBEE_INVALID_CLIMATE: 'Climate must be home, away, or sleep.',
  ECOBEE_SET_CLIMATE_FAILED: "Couldn't set the climate mode. Try again?",
  ECOBEE_RESUME_FAILED: "Couldn't resume the schedule. Try again?",
  ECOBEE_INVALID_HVAC_MODE: 'HVAC mode must be heat, cool, auto, or off.',
  ECOBEE_SET_HVAC_FAILED: "Couldn't set the HVAC mode. Try again?",

  // Generic fallbacks
  INTERNAL_ERROR: "Something went wrong on our end. We're looking into it.",
  NOT_FOUND: "Couldn't find what you're looking for.",
  OPERATION_FAILED: "That didn't work. Mind trying again?",
  INVALID_SYNC_PAYLOAD: "That sync data didn't look right. Could you try again?",
  INVALID_JSON_BODY: "Couldn't read that request. Check the format?",
} as const;

// ============================================================================
// ERROR CLASS DEFAULT MESSAGES
// ============================================================================

/**
 * Default user-facing messages for error classes in src/errors/index.ts.
 * These are the messages users see when an error class is thrown without
 * a custom userMessage.
 */
export const ERROR_DEFAULTS = {
  GENERIC: 'Something went wrong. Mind trying again?',
  TOOL_FAILED: "Couldn't complete that action. Let me try something else.",
  VALIDATION: 'Check your input and try again?',
  AUTH_REQUIRED: 'Sign in to continue.',
  UNAUTHORIZED: "You don't have permission to do that.",
  RATE_LIMIT: 'Easy there! Try again in a moment.',
  CONFIGURATION: "Something's misconfigured on our end. Reach out to support?",
  TIMEOUT: 'That took too long. Mind trying again?',
  HANDOFF: 'Having trouble connecting you with a colleague. Let me help instead.',
} as const;

// ============================================================================
// DEVELOPER-FACING ERROR MESSAGES
// ============================================================================

/**
 * Technical error messages for developer/admin APIs.
 * These don't need to be as warm—they're for debugging.
 */
export const DEV_ERRORS = {
  MISSING_DEPLOYMENT_ID: 'Missing deployment ID',
  DEPLOYMENT_NOT_FOUND: 'Deployment not found',
  INCIDENT_NOT_FOUND: 'Incident not found',
  NOT_AVAILABLE_IN_PROD: 'Not available in production',
  FLAG_NOT_FOUND: (flagId: string) => `Flag "${flagId}" not found`,
  ROLLOUT_NOT_FOUND: (featureId: string) => `Rollout "${featureId}" not found`,
  TRACE_NOT_FOUND: (traceId: string) => `Trace ${traceId} not found`,
  INTERNAL_SERVER_ERROR: 'Internal server error',
  UNKNOWN_ENDPOINT: 'Unknown endpoint',
} as const;

// ============================================================================
// HELPER TYPE
// ============================================================================

export type UserErrorKey = keyof typeof API_ERRORS;
export type DevErrorKey = keyof typeof DEV_ERRORS;
