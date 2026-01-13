/**
 * Session Closing Tracker
 *
 * Tracks which sessions are in the process of closing/draining.
 * This prevents race conditions where handoffs or other operations
 * are attempted on sessions that are shutting down.
 *
 * @module session-closing-tracker
 */
/**
 * Mark a session as closing.
 * Operations that shouldn't happen during shutdown (like handoffs)
 * should check this before proceeding.
 */
export declare function markSessionClosing(sessionId: string): void;
/**
 * Check if a session is in the process of closing.
 */
export declare function isSessionClosing(sessionId: string): boolean;
/**
 * Clear a session from the closing tracker.
 * Called after cleanup is complete to prevent memory leaks.
 */
export declare function clearSessionClosing(sessionId: string): void;
/**
 * Get the count of sessions currently closing.
 * Useful for monitoring/debugging.
 */
export declare function getClosingSessionCount(): number;
//# sourceMappingURL=session-closing-tracker.d.ts.map