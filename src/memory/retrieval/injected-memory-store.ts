/**
 * Injected Memory Store
 *
 * Session-scoped store for tracking which memories were injected into LLM context.
 * Used for attribution tracking to measure memory recall quality.
 *
 * Architecture:
 * 1. Context builders call setInjectedMemories() when injecting memories
 * 2. Agent turn recorder calls getAndClearInjectedMemories() when response arrives
 * 3. Attribution parser compares response against injected memories
 * 4. Metrics are recorded for observability
 *
 * @module memory/retrieval/injected-memory-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { InjectedMemory } from './hybrid-continuity-retrieval.js';

const log = createLogger({ module: 'InjectedMemoryStore' });

// ============================================================================
// STORE
// ============================================================================

/**
 * Per-session injected memories
 * Key: sessionId, Value: Array of injected memories for current turn
 */
const sessionMemories = new Map<string, InjectedMemory[]>();

/**
 * TTL for session entries (5 minutes - should be consumed quickly)
 */
const SESSION_TTL_MS = 5 * 60 * 1000;

/**
 * Last update timestamp per session (for TTL cleanup)
 */
const sessionTimestamps = new Map<string, number>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Store injected memories for a session's current turn
 *
 * @param sessionId - Session ID
 * @param memories - Array of injected memories
 */
export function setInjectedMemories(sessionId: string, memories: InjectedMemory[]): void {
  if (!sessionId || memories.length === 0) return;

  // Merge with any existing memories for this turn (multiple context builders)
  const existing = sessionMemories.get(sessionId) || [];
  const merged = [...existing, ...memories];

  sessionMemories.set(sessionId, merged);
  sessionTimestamps.set(sessionId, Date.now());

  log.debug(
    { sessionId, newCount: memories.length, totalCount: merged.length },
    '💾 Stored injected memories for attribution'
  );
}

/**
 * Get injected memories for a session and clear them
 *
 * This is called when the agent response arrives to compare against injections.
 * Memories are cleared to prevent double-counting across turns.
 *
 * @param sessionId - Session ID
 * @returns Array of injected memories, or empty array if none
 */
export function getAndClearInjectedMemories(sessionId: string): InjectedMemory[] {
  const memories = sessionMemories.get(sessionId) || [];

  // Clear after retrieval
  sessionMemories.delete(sessionId);
  sessionTimestamps.delete(sessionId);

  if (memories.length > 0) {
    log.debug({ sessionId, count: memories.length }, '📤 Retrieved and cleared injected memories');
  }

  return memories;
}

/**
 * Get injected memories without clearing (for inspection)
 *
 * @param sessionId - Session ID
 * @returns Array of injected memories, or empty array if none
 */
export function peekInjectedMemories(sessionId: string): InjectedMemory[] {
  return sessionMemories.get(sessionId) || [];
}

/**
 * Clear all memories for a session
 *
 * @param sessionId - Session ID
 */
export function clearSessionMemories(sessionId: string): void {
  sessionMemories.delete(sessionId);
  sessionTimestamps.delete(sessionId);
}

/**
 * Get store statistics
 */
export function getStoreStats(): {
  activeSessions: number;
  totalMemories: number;
} {
  let totalMemories = 0;
  for (const memories of sessionMemories.values()) {
    totalMemories += memories.length;
  }

  return {
    activeSessions: sessionMemories.size,
    totalMemories,
  };
}

/**
 * Cleanup expired sessions (call periodically)
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, timestamp] of sessionTimestamps.entries()) {
    if (now - timestamp > SESSION_TTL_MS) {
      sessionMemories.delete(sessionId);
      sessionTimestamps.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.debug({ cleaned }, '🧹 Cleaned up expired session memories');
  }

  return cleaned;
}

// Run cleanup every minute
setInterval(cleanupExpiredSessions, 60_000);
