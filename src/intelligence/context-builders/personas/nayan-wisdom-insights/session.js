/**
 * Nayan's Wisdom Insights - Session State Management
 *
 * Manages per-session state for Nayan's wisdom conversations.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/session
 */
// ============================================================================
// SESSION STATE
// ============================================================================
const sessions = new Map();
export function getSession(sessionId) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = { briefingTurn: -1, questionsExplored: new Set(), wisdomShared: [] };
        sessions.set(sessionId, session);
    }
    return session;
}
export function clearNayanWisdomSession(sessionId) {
    sessions.delete(sessionId);
}
export function clearAllNayanWisdomSessions() {
    sessions.clear();
}
//# sourceMappingURL=session.js.map