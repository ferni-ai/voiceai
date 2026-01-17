/**
 * Session state management for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/session
 */

// ============================================================================
// SESSION STATE - Track what insights we've surfaced
// ============================================================================

interface PeterSession {
  /** Insights already surfaced this session */
  surfacedInsights: Set<string>;
  /** Turn when briefing was delivered */
  briefingTurn: number;
  /** Whether initial briefing was given */
  initialBriefingGiven: boolean;
}

const sessions = new Map<string, PeterSession>();

export function getSession(sessionId: string): PeterSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      surfacedInsights: new Set(),
      briefingTurn: -1,
      initialBriefingGiven: false,
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearPeterResearchSession(sessionId: string): void {
  sessions.delete(sessionId);
}
