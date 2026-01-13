/**
 * Voice Agent Integration Session Store
 *
 * Manages humanization session state.
 *
 * @module @ferni/humanization/voice-agent-integration/session-store
 */
const sessions = new Map();
export function getSession(sessionId) {
    return sessions.get(sessionId);
}
export function setSession(sessionId, state) {
    sessions.set(sessionId, state);
}
export function deleteSession(sessionId) {
    sessions.delete(sessionId);
}
export function hasSession(sessionId) {
    return sessions.has(sessionId);
}
//# sourceMappingURL=session-store.js.map