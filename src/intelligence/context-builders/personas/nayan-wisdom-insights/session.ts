/**
 * Nayan's Wisdom Insights - Session State Management
 *
 * Manages per-session state for Nayan's wisdom conversations.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/session
 */

import type { NayanSession } from './types.js';

// ============================================================================
// SESSION STATE
// ============================================================================

const sessions = new Map<string, NayanSession>();

export function getSession(sessionId: string): NayanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, questionsExplored: new Set(), wisdomShared: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearNayanWisdomSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function clearAllNayanWisdomSessions(): void {
  sessions.clear();
}
