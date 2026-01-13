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
/**
 * Human-friendly error messages for user-facing API responses.
 *
 * Principles:
 * - Acknowledge, don't blame
 * - Be helpful, not technical
 * - Offer a path forward
 * - Stay warm
 */
export declare const API_ERRORS: {
    readonly USER_ID_REQUIRED: "We need to know who you are. Please sign in and try again.";
    readonly AUTH_REQUIRED: "Hmm, looks like you need to sign in first.";
    readonly CONVERSATIONS_FETCH_FAILED: "Couldn't load your conversations right now. Mind trying again?";
    readonly DATA_EXPORT_FAILED: "Hmm, couldn't export your data. Mind trying again?";
    readonly DATA_DELETE_FAILED: "Couldn't delete your data right now. Try again?";
    readonly DATA_DELETE_CONFIRMATION: "This is a big step. Please confirm you want to delete your data.";
    readonly INVALID_REQUEST: "Something didn't look right. Could you try again?";
    readonly RITUALS_FETCH_FAILED: "Couldn't load your rituals right now. Try refreshing?";
    readonly RITUAL_CREATE_FAILED: "Couldn't create that ritual. Mind trying again?";
    readonly RITUAL_DELETE_FAILED: "Couldn't remove that ritual. Try again?";
    readonly RITUAL_COMPLETE_FAILED: "Couldn't mark that as complete. Give it another shot?";
    readonly RITUAL_NOT_FOUND: "Couldn't find that ritual. It may have been removed.";
    readonly PREDICTIONS_FETCH_FAILED: "Couldn't load your predictions right now. Try again?";
    readonly PREDICTION_NOT_FOUND: "Hmm, couldn't find that prediction. It may have expired.";
    readonly PREDICTION_ALREADY_COMPLETED: "Looks like this prediction was already resolved.";
    readonly PREDICTION_UPDATE_FAILED: "Couldn't update that prediction. Mind trying again?";
    readonly MEMORY_NOT_FOUND: "Couldn't find that memory. It may have been removed.";
    readonly RELATIONSHIP_SYNC_FAILED: "Couldn't save your progress right now. Try again?";
    readonly PROFILE_UPDATE_FAILED: "Couldn't save your changes right now. Try again?";
    readonly SETTINGS_SAVE_FAILED: "Couldn't save your settings. Mind trying again?";
    readonly INTERNAL_ERROR: "Something went wrong on our end. We're looking into it.";
    readonly NOT_FOUND: "Couldn't find what you're looking for.";
    readonly OPERATION_FAILED: "That didn't work. Mind trying again?";
};
/**
 * Technical error messages for developer/admin APIs.
 * These don't need to be as warm—they're for debugging.
 */
export declare const DEV_ERRORS: {
    readonly MISSING_DEPLOYMENT_ID: "Missing deployment ID";
    readonly DEPLOYMENT_NOT_FOUND: "Deployment not found";
    readonly INCIDENT_NOT_FOUND: "Incident not found";
    readonly NOT_AVAILABLE_IN_PROD: "Not available in production";
    readonly FLAG_NOT_FOUND: (flagId: string) => string;
    readonly ROLLOUT_NOT_FOUND: (featureId: string) => string;
    readonly TRACE_NOT_FOUND: (traceId: string) => string;
    readonly INTERNAL_SERVER_ERROR: "Internal server error";
    readonly UNKNOWN_ENDPOINT: "Unknown endpoint";
};
export type UserErrorKey = keyof typeof API_ERRORS;
export type DevErrorKey = keyof typeof DEV_ERRORS;
//# sourceMappingURL=error-messages.d.ts.map