/**
 * Session state management for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/session
 */
const sessions = new Map();
export function getSession(sessionId) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = { briefingTurn: -1, celebratedWins: new Set(), coachingApproaches: [] };
        sessions.set(sessionId, session);
    }
    return session;
}
export function clearMayaCoachingSession(sessionId) {
    sessions.delete(sessionId);
}
//# sourceMappingURL=session.js.map