/**
 * Joel Dickson Insights - Session State Management
 *
 * Manages per-session state for Joel's life-mentorship conversations.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/session
 */

import type { JoelSession } from './types.js';

// ============================================================================
// SESSION STATE
// ============================================================================

const sessions = new Map<string, JoelSession>();

export function getSession(sessionId: string): JoelSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, lastTopics: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearJoelSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function clearAllJoelSessions(): void {
  sessions.clear();
}
