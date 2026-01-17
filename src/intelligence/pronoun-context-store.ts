/**
 * Session Pronoun Context Store
 *
 * Stores pronoun context (who "he", "she", "they" refers to) within a session.
 * This enables the entity detector to resolve pronouns to actual names.
 *
 * Usage:
 * 1. After entity detection, call updateSessionPronounContext() to store entities
 * 2. When detecting entities, call getSessionPronounContext() to enable pronoun resolution
 * 3. On session end, call clearSessionPronounContext()
 *
 * @module intelligence/pronoun-context-store
 */

import { createLogger } from '../utils/safe-logger.js';
import { updatePronounContext, type DetectedEntity } from './entity-detector.js';

const log = createLogger({ module: 'PronounContextStore' });

// ============================================================================
// STORE
// ============================================================================

/**
 * Per-session pronoun context
 * Key: sessionId, Value: Map of gender -> entity name
 */
const sessionContexts = new Map<string, Map<string, string>>();

/**
 * TTL for session entries (30 minutes)
 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Last update timestamp per session
 */
const sessionTimestamps = new Map<string, number>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get pronoun context for a session
 *
 * @param sessionId - Session ID
 * @returns Pronoun context map, or undefined if none
 */
export function getSessionPronounContext(sessionId: string): Map<string, string> | undefined {
  return sessionContexts.get(sessionId);
}

/**
 * Update pronoun context for a session based on detected entities
 *
 * @param sessionId - Session ID
 * @param entities - Detected entities from current turn
 */
export function updateSessionPronounContext(sessionId: string, entities: DetectedEntity[]): void {
  if (entities.length === 0) return;

  // Get or create context for this session
  let context = sessionContexts.get(sessionId);
  if (!context) {
    context = new Map<string, string>();
    sessionContexts.set(sessionId, context);
  }

  // Update pronoun mappings based on detected entities
  updatePronounContext(entities, context);
  sessionTimestamps.set(sessionId, Date.now());

  log.debug(
    { sessionId, entities: entities.length, contextSize: context.size },
    '🗣️ Updated pronoun context'
  );
}

/**
 * Clear pronoun context for a session
 *
 * @param sessionId - Session ID
 */
export function clearSessionPronounContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
  sessionTimestamps.delete(sessionId);
}

/**
 * Get store statistics
 */
export function getPronounContextStats(): {
  activeSessions: number;
  totalMappings: number;
} {
  let totalMappings = 0;
  for (const context of sessionContexts.values()) {
    totalMappings += context.size;
  }

  return {
    activeSessions: sessionContexts.size,
    totalMappings,
  };
}

/**
 * Cleanup expired sessions
 */
export function cleanupExpiredPronounSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, timestamp] of sessionTimestamps.entries()) {
    if (now - timestamp > SESSION_TTL_MS) {
      sessionContexts.delete(sessionId);
      sessionTimestamps.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.debug({ cleaned }, '🧹 Cleaned up expired pronoun contexts');
  }

  return cleaned;
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredPronounSessions, 5 * 60 * 1000);
