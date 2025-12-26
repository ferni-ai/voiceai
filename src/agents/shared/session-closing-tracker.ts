/**
 * Session Closing Tracker
 *
 * Tracks which sessions are in the process of closing/draining.
 * This prevents race conditions where handoffs or other operations
 * are attempted on sessions that are shutting down.
 *
 * @module session-closing-tracker
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// Map of sessionId -> timestamp when marked as closing
const closingSessions = new Map<string, number>();

/**
 * Mark a session as closing.
 * Operations that shouldn't happen during shutdown (like handoffs)
 * should check this before proceeding.
 */
export function markSessionClosing(sessionId: string): void {
  if (!closingSessions.has(sessionId)) {
    closingSessions.set(sessionId, Date.now());
    log.info({ sessionId }, '🚪 Session marked as closing');
  }
}

/**
 * Check if a session is in the process of closing.
 */
export function isSessionClosing(sessionId: string): boolean {
  return closingSessions.has(sessionId);
}

/**
 * Clear a session from the closing tracker.
 * Called after cleanup is complete to prevent memory leaks.
 */
export function clearSessionClosing(sessionId: string): void {
  if (closingSessions.has(sessionId)) {
    const duration = Date.now() - (closingSessions.get(sessionId) || 0);
    closingSessions.delete(sessionId);
    log.debug({ sessionId, closingDurationMs: duration }, '🗑️ Session cleared from closing tracker');
  }
}

/**
 * Get the count of sessions currently closing.
 * Useful for monitoring/debugging.
 */
export function getClosingSessionCount(): number {
  return closingSessions.size;
}

