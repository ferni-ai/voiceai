/**
 * Session state management for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/session
 */
const sessions = new Map();
export function getSession(sessionId) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = { briefingTurn: -1, followUpsRaised: new Set() };
        sessions.set(sessionId, session);
    }
    return session;
}
export function clearAlexCommunicationSession(sessionId) {
    sessions.delete(sessionId);
}
//# sourceMappingURL=session.js.map