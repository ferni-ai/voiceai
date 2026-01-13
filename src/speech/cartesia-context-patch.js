/**
 * Cartesia Context Manager
 *
 * Manages context IDs for Cartesia TTS to enable prosody continuity
 * across TTS streams within a session. This enables Cartesia to maintain
 * intonation, rhythm, and energy across multiple synthesis calls.
 *
 * Usage:
 *   import { setSessionContextId, getSessionContextId } from './cartesia-context-patch.js';
 *
 *   // Set context ID at session start
 *   setSessionContextId('session-123');
 *
 *   // Get context ID for Cartesia TTS options
 *   const contextId = getSessionContextId();
 *
 * Note: This module provides context ID management. The actual application
 * to Cartesia TTS should be done at the TTS creation/configuration level,
 * not via monkeypatching.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/contexts
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger().child({ module: 'CartesiaContext' });
// ============================================================================
// SESSION CONTEXT STORAGE
// ============================================================================
/**
 * Session-to-context ID mapping
 * Allows multiple sessions to have their own context IDs
 */
const sessionContextIds = new Map();
/**
 * Current active session ID (for single-session usage patterns)
 */
let activeSessionId = null;
// ============================================================================
// CONTEXT ID MANAGEMENT
// ============================================================================
/**
 * Generate a unique context ID for Cartesia.
 * Format: ctx_{timestamp}_{random}
 */
export function generateContextId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `ctx_${timestamp}_${random}`;
}
/**
 * Set the context ID for a specific session.
 * Call this at the start of each voice session.
 *
 * @param sessionId - Unique session identifier
 * @param contextId - Optional custom context ID (auto-generated if not provided)
 * @returns The context ID that was set
 */
export function setSessionContextId(sessionId, contextId) {
    const id = contextId ?? generateContextId();
    sessionContextIds.set(sessionId, id);
    activeSessionId = sessionId;
    log.debug({ sessionId, contextId: id }, 'Session context ID set for Cartesia prosody continuity');
    return id;
}
/**
 * Get the context ID for a specific session.
 *
 * @param sessionId - Session to get context ID for (uses active session if not provided)
 * @returns The context ID, or null if no context set
 */
export function getSessionContextId(sessionId) {
    const sid = sessionId ?? activeSessionId;
    if (!sid)
        return null;
    return sessionContextIds.get(sid) ?? null;
}
/**
 * Clear the context ID for a session (call at session end).
 *
 * @param sessionId - Session to clear (uses active session if not provided)
 */
export function clearSessionContextId(sessionId) {
    const sid = sessionId ?? activeSessionId;
    if (sid) {
        sessionContextIds.delete(sid);
        if (activeSessionId === sid) {
            activeSessionId = null;
        }
        log.debug({ sessionId: sid }, 'Session context ID cleared');
    }
}
/**
 * Get or create a context ID for a session.
 * Useful when you want to ensure a context ID exists.
 *
 * @param sessionId - Session identifier
 * @returns The existing or newly created context ID
 */
export function getOrCreateContextId(sessionId) {
    const existing = sessionContextIds.get(sessionId);
    if (existing)
        return existing;
    return setSessionContextId(sessionId);
}
/**
 * Get Cartesia TTS options with context ID for a session.
 *
 * @param sessionId - Session to get options for
 * @returns Options object to spread into Cartesia TTS config, or undefined if no session
 *
 * @example
 * ```typescript
 * const contextOptions = getCartesiaContextOptions(sessionId);
 * const tts = new cartesia.TTS({
 *   model: 'sonic-3',
 *   voice: voiceId,
 *   ...contextOptions, // Adds context_id if available
 * });
 * ```
 */
export function getCartesiaContextOptions(sessionId) {
    const contextId = getSessionContextId(sessionId);
    if (!contextId)
        return undefined;
    return {
        contextId,
        continueContext: true,
    };
}
// ============================================================================
// MONITORING & DEBUGGING
// ============================================================================
/**
 * Get all active session context IDs (for debugging).
 */
export function getAllSessionContexts() {
    return new Map(sessionContextIds);
}
/**
 * Get count of active session contexts.
 */
export function getActiveContextCount() {
    return sessionContextIds.size;
}
/**
 * Clear all session contexts.
 * Use with caution - typically only for testing or shutdown.
 */
export function clearAllContexts() {
    const count = sessionContextIds.size;
    sessionContextIds.clear();
    activeSessionId = null;
    log.info({ clearedCount: count }, 'All Cartesia session contexts cleared');
}
//# sourceMappingURL=cartesia-context-patch.js.map