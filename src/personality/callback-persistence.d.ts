/**
 * Callback Persistence Service
 *
 * Saves detected callback-worthy moments (the "smile factor") to persistent storage.
 * This is what makes users feel remembered - we detect important moments they share
 * and follow up on them in future conversations.
 *
 * Uses the existing memory store infrastructure (Firestore in production).
 *
 * @module personality/callback-persistence
 */
import type { KeyMoment } from '../types/user-profile.js';
export interface CallbackSaveResult {
    saved: number;
    skipped: number;
    errors: number;
    momentIds: string[];
}
/**
 * Extract and save callback-worthy moments from a user message
 *
 * Call this after processing user input to persist callbacks for future follow-up.
 *
 * @param userId - The user's ID
 * @param userMessage - The user's message to analyze
 * @returns Summary of what was saved
 */
export declare function extractAndSaveCallbacks(userId: string, userMessage: string): Promise<CallbackSaveResult>;
/**
 * Save a single KeyMoment directly
 *
 * Use this when you already have a KeyMoment object constructed.
 */
export declare function saveKeyMoment(userId: string, moment: KeyMoment): Promise<boolean>;
/**
 * Mark a callback as completed (no longer needs follow-up)
 */
export declare function markCallbackComplete(userId: string, momentId: string): Promise<boolean>;
declare const _default: {
    extractAndSaveCallbacks: typeof extractAndSaveCallbacks;
    saveKeyMoment: typeof saveKeyMoment;
    markCallbackComplete: typeof markCallbackComplete;
};
export default _default;
//# sourceMappingURL=callback-persistence.d.ts.map