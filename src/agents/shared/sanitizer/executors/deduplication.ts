/**
 * Tool Deduplication
 *
 * Prevents duplicate tool execution when semantic router has already
 * handled a tool call. Session-scoped state with automatic cleanup.
 *
 * @module agents/shared/sanitizer/executors/deduplication
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { DedupEntry } from '../types.js';

const log = createLogger({ module: 'tool-dedup' });

// ============================================================================
// SESSION-SCOPED DEDUPLICATION CACHE
// ============================================================================

/**
 * Per-session cache of tools already executed by semantic router.
 * Map: sessionId -> Set of toolIds
 */
const sessionToolCache = new Map<string, Set<string>>();

/**
 * TTL for dedup entries (5 minutes)
 */
const DEDUP_TTL_MS = 5 * 60 * 1000;

/**
 * Cleanup interval (1 minute)
 */
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Auto-cleanup old entries
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    // For now, just log cache size - full cleanup would track timestamps
    const totalEntries = Array.from(sessionToolCache.values()).reduce(
      (sum, set) => sum + set.size,
      0
    );

    if (totalEntries > 0) {
      log.debug('Dedup cache stats:', {
        sessions: sessionToolCache.size,
        totalEntries,
      });
    }

    // Clean up empty sessions
    for (const [sessionId, tools] of sessionToolCache.entries()) {
      if (tools.size === 0) {
        sessionToolCache.delete(sessionId);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process exit
  cleanupInterval.unref?.();
}

// Start cleanup on module load
startCleanup();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Mark a tool as executed by semantic router.
 * This prevents duplicate execution when Gemini outputs the same tool call.
 *
 * @param sessionId - Session identifier
 * @param toolId - Unique tool identifier (usually `fn:${args}`)
 */
export function markToolExecutedBySemanticRouter(sessionId: string, toolId: string): void {
  if (!sessionId || !toolId) {
    log.warn('Invalid dedup mark request:', { sessionId, toolId });
    return;
  }

  let sessionCache = sessionToolCache.get(sessionId);
  if (!sessionCache) {
    sessionCache = new Set();
    sessionToolCache.set(sessionId, sessionCache);
  }

  sessionCache.add(toolId);
  log.debug('Marked tool as executed:', { sessionId: sessionId.slice(0, 8), toolId });

  // Schedule removal after TTL
  setTimeout(() => {
    const cache = sessionToolCache.get(sessionId);
    if (cache) {
      cache.delete(toolId);
      log.debug('Expired dedup entry:', { sessionId: sessionId.slice(0, 8), toolId });
    }
  }, DEDUP_TTL_MS);
}

/**
 * Check if a tool was already executed by semantic router.
 *
 * @param sessionId - Session identifier
 * @param toolId - Tool identifier to check
 * @returns True if tool was already executed
 */
export function wasToolExecutedBySemanticRouter(sessionId: string, toolId: string): boolean {
  if (!sessionId || !toolId) return false;

  const sessionCache = sessionToolCache.get(sessionId);
  if (!sessionCache) return false;

  const wasExecuted = sessionCache.has(toolId);
  if (wasExecuted) {
    log.debug('Tool already executed by semantic router:', {
      sessionId: sessionId.slice(0, 8),
      toolId,
    });
  }
  return wasExecuted;
}

/**
 * Clear all deduplication state for a session.
 * Call this on session cleanup.
 *
 * @param sessionId - Session identifier
 */
export function clearToolDeduplicationForSession(sessionId: string): void {
  if (!sessionId) return;

  const deleted = sessionToolCache.delete(sessionId);
  if (deleted) {
    log.debug('Cleared dedup cache for session:', sessionId.slice(0, 8));
  }
}

/**
 * Get current cache stats (for debugging/monitoring)
 */
export function getDedupStats(): { sessions: number; totalEntries: number } {
  const totalEntries = Array.from(sessionToolCache.values()).reduce(
    (sum, set) => sum + set.size,
    0
  );

  return {
    sessions: sessionToolCache.size,
    totalEntries,
  };
}

/**
 * Clear entire cache (for testing)
 */
export function clearAllDedupCache(): void {
  sessionToolCache.clear();
  log.debug('Cleared all dedup cache');
}
