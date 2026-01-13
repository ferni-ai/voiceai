/**
 * Jordan Milestone Insights - Session State
 *
 * Session state management for Jordan's milestone planning context builder.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/session
 */
const sessions = new Map();
export function getSession(sessionId) {
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
export function clearJordanMilestoneSession(sessionId) {
    sessions.delete(sessionId);
}
export function clearAllJordanMilestoneSessions() {
    sessions.clear();
}
//# sourceMappingURL=session.js.map