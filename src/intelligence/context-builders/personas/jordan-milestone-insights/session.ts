/**
 * Jordan Milestone Insights - Session State
 *
 * Session state management for Jordan's milestone planning context builder.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/session
 */

// ============================================================================
// SESSION STATE
// ============================================================================

export interface JordanSession {
  briefingTurn: number;
  celebratedMilestones: Set<string>;
  surfacedInsights: Set<string>;
}

const sessions = new Map<string, JordanSession>();

export function getSession(sessionId: string): JordanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      briefingTurn: -1,
      celebratedMilestones: new Set(),
      surfacedInsights: new Set(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearJordanMilestoneSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function clearAllJordanMilestoneSessions(): void {
  sessions.clear();
}
