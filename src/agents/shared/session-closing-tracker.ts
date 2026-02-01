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
    log.debug(
      { sessionId, closingDurationMs: duration },
      '🗑️ Session cleared from closing tracker'
    );
  }
}

/**
 * Get the count of sessions currently closing.
 * Useful for monitoring/debugging.
 */
export function getClosingSessionCount(): number {
  return closingSessions.size;
}

// ============================================================================
// ORPHAN CLEANUP (Prevent unbounded Map growth from crashed sessions)
// ============================================================================

/** Maximum time a session can be in "closing" state before it's considered orphaned */
const MAX_CLOSING_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/** Interval for orphan cleanup */
const ORPHAN_CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let orphanCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Clean up orphaned sessions that have been in "closing" state too long.
 * This handles cases where sessions crash before cleanup completes.
 */
function cleanupOrphanedSessions(): void {
  const now = Date.now();
  let orphanCount = 0;

  for (const [sessionId, timestamp] of closingSessions.entries()) {
    const age = now - timestamp;
    if (age > MAX_CLOSING_DURATION_MS) {
      closingSessions.delete(sessionId);
      orphanCount++;
      log.warn(
        { sessionId, ageMs: age },
        '🧹 Removed orphaned session from closing tracker (likely crashed before cleanup)'
      );
    }
  }

  if (orphanCount > 0) {
    log.info(
      { orphanCount, remainingSessions: closingSessions.size },
      '🧹 Session closing tracker orphan cleanup complete'
    );
  }
}

/**
 * Start periodic orphan cleanup.
 * Call this at worker startup.
 */
export function startClosingTrackerCleanup(): void {
  if (orphanCleanupInterval) {
    return; // Already running
  }

  orphanCleanupInterval = setInterval(cleanupOrphanedSessions, ORPHAN_CLEANUP_INTERVAL_MS);
  log.info(
    { intervalMs: ORPHAN_CLEANUP_INTERVAL_MS, maxAgeMins: MAX_CLOSING_DURATION_MS / 60000 },
    '🚀 Session closing tracker orphan cleanup started'
  );
}

/**
 * Stop periodic orphan cleanup.
 * Call this at worker shutdown.
 */
export function stopClosingTrackerCleanup(): void {
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
    log.info('🛑 Session closing tracker orphan cleanup stopped');
  }
}
