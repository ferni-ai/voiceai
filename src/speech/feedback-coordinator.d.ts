/**
 * Feedback Coordinator - Global Budget for Verbal Feedback
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Prevents over-feedback by coordinating all verbal feedback systems:
 * - Backchannels (standard, enhanced, live)
 * - Acknowledgment prefixes
 * - Contextual laughter
 * - Spontaneous appreciation
 * - Thinking fillers
 *
 * HUMANIZATION FIX (Dec 2025): Each system was designed in isolation, leading
 * to situations where 5-7 different feedback mechanisms could fire in a single
 * turn. This coordinator ensures we don't overwhelm users with constant verbal
 * feedback, which feels robotic and performative.
 *
 * Key insight: Real humans often respond WITHOUT explicit verbal acknowledgment.
 * The absence of "mm-hmm" is also natural communication.
 *
 * @module speech/feedback-coordinator
 */
export type FeedbackType = 'backchannel' | 'prefix' | 'laugh' | 'appreciation' | 'filler' | 'comfort';
/**
 * Check if we can add a specific type of feedback.
 *
 * Call this BEFORE deciding to emit feedback. If it returns false,
 * skip the feedback to maintain natural conversation flow.
 *
 * @param sessionId - Session ID
 * @param type - Type of feedback being considered
 * @param turnNumber - Current turn number (optional, for turn tracking)
 * @returns Whether this feedback type is allowed right now
 */
export declare function canAddFeedback(sessionId: string, type: FeedbackType, turnNumber?: number): boolean;
/**
 * Record that feedback was given.
 *
 * Call this AFTER emitting feedback to update the budget.
 *
 * @param sessionId - Session ID
 * @param type - Type of feedback that was emitted
 */
export declare function recordFeedback(sessionId: string, type: FeedbackType): void;
/**
 * Advance to next turn (resets turn budget).
 *
 * Call this when a new user turn begins.
 *
 * @param sessionId - Session ID
 * @param turnNumber - New turn number
 */
export declare function advanceTurn(sessionId: string, turnNumber: number): void;
/**
 * Reset all feedback state for a session.
 *
 * Call this on session end for cleanup.
 *
 * @param sessionId - Session ID
 */
export declare function resetFeedbackCoordinator(sessionId: string): void;
/**
 * Reset all sessions (for testing/emergency cleanup).
 */
export declare function resetAllFeedbackCoordinators(): void;
/**
 * Get feedback statistics for a session.
 *
 * Useful for debugging and monitoring.
 */
export declare function getFeedbackStats(sessionId: string): {
    turnFeedbackCount: number;
    totalBackchannels: number;
    totalLaughs: number;
    totalAppreciations: number;
    sessionDurationMs: number;
};
declare const _default: {
    canAddFeedback: typeof canAddFeedback;
    recordFeedback: typeof recordFeedback;
    advanceTurn: typeof advanceTurn;
    resetFeedbackCoordinator: typeof resetFeedbackCoordinator;
    resetAllFeedbackCoordinators: typeof resetAllFeedbackCoordinators;
    getFeedbackStats: typeof getFeedbackStats;
};
export default _default;
//# sourceMappingURL=feedback-coordinator.d.ts.map