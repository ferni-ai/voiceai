/**
 * Session state management for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/session
 */

// ============================================================================
// SESSION STATE
// ============================================================================

interface MayaSession {
  briefingTurn: number;
  celebratedWins: Set<string>;
  coachingApproaches: string[];
}

const sessions = new Map<string, MayaSession>();

export function getSession(sessionId: string): MayaSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, celebratedWins: new Set(), coachingApproaches: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearMayaCoachingSession(sessionId: string): void {
  sessions.delete(sessionId);
}
