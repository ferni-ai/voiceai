/**
 * Conversation Feedback Store
 *
 * Unified storage for contextual feedback collected during conversations.
 * Stores in Firestore under profiles/{userId}/conversationFeedback/{feedbackId}
 *
 * Features:
 * - Create pending feedback prompts
 * - Record user reactions
 * - Query feedback history
 * - Generate aggregated stats
 *
 * @module services/feedback/conversation-feedback-store
 */
import type { ConversationFeedback, FeedbackPromptInput, FeedbackReactionInput, UserFeedbackStats } from './types.js';
/**
 * Create a pending feedback prompt.
 * Called when the trigger engine decides to show a feedback prompt.
 *
 * @returns The created feedback ID, or null if storage unavailable
 */
export declare function createFeedbackPrompt(input: FeedbackPromptInput): Promise<{
    ok: true;
    feedbackId: string;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Record user's reaction to a feedback prompt.
 *
 * @returns Success status
 */
export declare function recordFeedbackReaction(input: FeedbackReactionInput): Promise<{
    ok: true;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Mark a feedback prompt as skipped (auto-hidden without response).
 */
export declare function markFeedbackSkipped(feedbackId: string, userId: string): Promise<{
    ok: true;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Get recent feedback for a user.
 */
export declare function getRecentFeedback(userId: string, limit?: number): Promise<ConversationFeedback[]>;
/**
 * Get feedback for a specific session.
 */
export declare function getSessionFeedback(userId: string, sessionId: string): Promise<ConversationFeedback[]>;
/**
 * Get feedback by persona.
 */
export declare function getPersonaFeedback(userId: string, personaId: string, limit?: number): Promise<ConversationFeedback[]>;
/**
 * Calculate aggregated feedback statistics for a user.
 */
export declare function calculateUserFeedbackStats(userId: string): Promise<UserFeedbackStats | null>;
export declare const conversationFeedbackStore: {
    createPrompt: typeof createFeedbackPrompt;
    recordReaction: typeof recordFeedbackReaction;
    markSkipped: typeof markFeedbackSkipped;
    getRecent: typeof getRecentFeedback;
    getSession: typeof getSessionFeedback;
    getPersona: typeof getPersonaFeedback;
    calculateStats: typeof calculateUserFeedbackStats;
};
//# sourceMappingURL=conversation-feedback-store.d.ts.map