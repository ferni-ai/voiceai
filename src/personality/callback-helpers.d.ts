/**
 * Callback Helpers
 *
 * Helper functions for the callback system ("the smile factor").
 * Creates and manages KeyMoments that represent things users shared
 * that we should follow up on.
 *
 * @module personality/callback-helpers
 */
import type { KeyMoment, UserProfile } from '../types/user-profile.js';
/**
 * Create a KeyMoment for callback from user's message
 * This integrates with the existing KeyMoment retrieval system
 */
export declare function createCallbackKeyMoment(what: string, options?: {
    type?: KeyMoment['type'];
    emotionalWeight?: KeyMoment['emotionalWeight'];
    topics?: string[];
    followUpDate?: Date;
}): KeyMoment;
/**
 * Extract callback-worthy moments from user message
 * Returns KeyMoments that can be added to the user's profile
 */
export declare function extractCallbackKeyMoments(userMessage: string): KeyMoment[];
/**
 * Get pending callbacks from user's key moments
 */
export declare function getPendingCallbacksFromProfile(profile: UserProfile): Array<{
    moment: KeyMoment;
    question: string;
}>;
/**
 * Format a callback for prompt injection
 */
export declare function formatCallbackForPrompt(callback: {
    moment: KeyMoment;
    question: string;
}): string;
//# sourceMappingURL=callback-helpers.d.ts.map