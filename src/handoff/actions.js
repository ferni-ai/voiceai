/**
 * Handoff Actions
 *
 * High-level action functions for executing handoffs.
 * These provide a clean API on top of the unified state.
 *
 * @module handoff/actions
 */
import { getLogger } from '../utils/safe-logger.js';
import { getHandoffState, isHandoffAllowed, isHandoffInProgress, markHandoffStarted, markHandoffCompleted, queueHandoff, dequeueHandoff, setHandoffTimeout, setProgressInterval, clearSession, } from './unified-state.js';
import { HANDOFF_TIMEOUT_MS, PROGRESS_HEARTBEAT_INTERVAL_MS } from './constants.js';
const log = getLogger();
// ============================================================================
// HANDOFF EXECUTION
// ============================================================================
/**
 * Start a handoff to another agent.
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent to hand off to
 * @param context - Optional handoff context
 * @returns Whether handoff was started (false if rate-limited or already in progress)
 */
export function startHandoff(sessionId, targetAgentId, context) {
    if (!isHandoffAllowed(sessionId)) {
        log.warn({ sessionId, targetAgentId }, '⏸️ [HANDOFF] Not allowed (rate limited or in progress)');
        return false;
    }
    markHandoffStarted(sessionId, targetAgentId, context);
    return true;
}
/**
 * Complete the current handoff.
 *
 * @param sessionId - Session ID
 * @param success - Whether handoff succeeded (default: true for backward compat)
 * @param error - Optional error message if failed
 * @returns Object with duration info for backward compatibility
 */
export function completeHandoff(sessionId, success = true, error) {
    const state = getHandoffState(sessionId);
    const durationMs = state.handoffStartTime ? Date.now() - state.handoffStartTime : 0;
    markHandoffCompleted(sessionId, success, error ? { reason: error } : undefined);
    return { durationMs };
}
/**
 * Abort the current handoff.
 */
export function abortHandoff(sessionId, reason) {
    markHandoffCompleted(sessionId, false, { reason, success: false });
}
// ============================================================================
// QUEUED HANDOFFS
// ============================================================================
/**
 * Request a handoff (queues if one is already in progress).
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent
 * @param reason - Reason for handoff
 * @param context - Optional context
 * @returns Whether the request was accepted (either started or queued)
 */
export function requestHandoff(sessionId, targetAgentId, reason, context) {
    // If no handoff in progress, start immediately
    if (!isHandoffInProgress(sessionId)) {
        return startHandoff(sessionId, targetAgentId, { ...context, reason });
    }
    // Otherwise queue it
    const pending = {
        targetPersonaId: targetAgentId,
        reason,
        queuedAt: Date.now(),
        context,
    };
    return queueHandoff(sessionId, pending);
}
/**
 * Process the next queued handoff (if any).
 */
export function processNextQueuedHandoff(sessionId) {
    const pending = dequeueHandoff(sessionId);
    if (!pending)
        return false;
    return startHandoff(sessionId, pending.targetPersonaId, pending.context);
}
// ============================================================================
// TIMEOUT MANAGEMENT
// ============================================================================
/**
 * Setup handoff timeout.
 * Automatically fails the handoff if it takes too long.
 *
 * @param sessionId - Session ID
 * @param onTimeout - Callback when timeout occurs
 * @param timeoutMs - Timeout in milliseconds (default: HANDOFF_TIMEOUT_MS)
 */
export function setupHandoffTimeout(sessionId, onTimeout, timeoutMs = HANDOFF_TIMEOUT_MS) {
    const timer = setTimeout(() => {
        log.error({ sessionId, timeoutMs }, '⏰ [HANDOFF] Timeout!');
        abortHandoff(sessionId, 'timeout');
        onTimeout();
    }, timeoutMs);
    setHandoffTimeout(sessionId, timer);
}
/**
 * Setup progress heartbeat.
 *
 * @param sessionId - Session ID
 * @param onHeartbeat - Callback on each heartbeat
 * @param intervalMs - Interval in milliseconds
 */
export function setupProgressHeartbeat(sessionId, onHeartbeat, intervalMs = PROGRESS_HEARTBEAT_INTERVAL_MS) {
    const interval = setInterval(onHeartbeat, intervalMs);
    setProgressInterval(sessionId, interval);
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Execute a full handoff with timeout handling.
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent
 * @param execute - Async function to execute the handoff
 * @param context - Optional context
 * @returns Promise that resolves to success/failure
 */
export async function executeHandoff(sessionId, targetAgentId, execute, context) {
    if (!startHandoff(sessionId, targetAgentId, context)) {
        return { success: false, error: 'Handoff not allowed' };
    }
    return new Promise((resolve) => {
        // Setup timeout
        setupHandoffTimeout(sessionId, () => {
            resolve({ success: false, error: 'Handoff timed out' });
        });
        // Execute the handoff
        execute()
            .then(() => {
            completeHandoff(sessionId, true);
            resolve({ success: true });
        })
            .catch((err) => {
            const errorMsg = String(err);
            completeHandoff(sessionId, false, errorMsg);
            resolve({ success: false, error: errorMsg });
        });
    });
}
/**
 * Cleanup session state on disconnect.
 */
export function cleanupHandoffSession(sessionId) {
    clearSession(sessionId);
}
//# sourceMappingURL=actions.js.map