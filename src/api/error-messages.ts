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

  // Generic fallbacks
  INTERNAL_ERROR: "Something went wrong on our end. We're looking into it.",
  NOT_FOUND: "Couldn't find what you're looking for.",
  OPERATION_FAILED: "That didn't work. Mind trying again?",
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
