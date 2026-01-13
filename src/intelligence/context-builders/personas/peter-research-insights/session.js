/**
 * Session state management for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/session
 */
const sessions = new Map();
export function getSession(sessionId) {
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
export function clearPeterResearchSession(sessionId) {
    sessions.delete(sessionId);
}
//# sourceMappingURL=session.js.map