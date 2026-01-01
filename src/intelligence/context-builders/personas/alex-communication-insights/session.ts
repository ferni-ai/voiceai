/**
 * Session state management for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/session
 */

// ============================================================================
// SESSION STATE
// ============================================================================

interface AlexSession {
  briefingTurn: number;
  followUpsRaised: Set<string>;
}

const sessions = new Map<string, AlexSession>();

export function getSession(sessionId: string): AlexSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, followUpsRaised: new Set() };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearAlexCommunicationSession(sessionId: string): void {
  sessions.delete(sessionId);
}
