/**
 * Handoff Actions
 *
 * High-level action functions for executing handoffs.
 * These provide a clean API on top of the unified state.
 *
 * @module handoff/actions
 */
import type { HandoffContext } from './types.js';
/**
 * Start a handoff to another agent.
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent to hand off to
 * @param context - Optional handoff context
 * @returns Whether handoff was started (false if rate-limited or already in progress)
 */
export declare function startHandoff(sessionId: string, targetAgentId: string, context?: HandoffContext): boolean;
/**
 * Complete the current handoff.
 *
 * @param sessionId - Session ID
 * @param success - Whether handoff succeeded (default: true for backward compat)
 * @param error - Optional error message if failed
 * @returns Object with duration info for backward compatibility
 */
export declare function completeHandoff(sessionId: string, success?: boolean, error?: string): {
    durationMs: number;
};
/**
 * Abort the current handoff.
 */
export declare function abortHandoff(sessionId: string, reason: string): void;
/**
 * Request a handoff (queues if one is already in progress).
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent
 * @param reason - Reason for handoff
 * @param context - Optional context
 * @returns Whether the request was accepted (either started or queued)
 */
export declare function requestHandoff(sessionId: string, targetAgentId: string, reason: string, context?: HandoffContext): boolean;
/**
 * Process the next queued handoff (if any).
 */
export declare function processNextQueuedHandoff(sessionId: string): boolean;
/**
 * Setup handoff timeout.
 * Automatically fails the handoff if it takes too long.
 *
 * @param sessionId - Session ID
 * @param onTimeout - Callback when timeout occurs
 * @param timeoutMs - Timeout in milliseconds (default: HANDOFF_TIMEOUT_MS)
 */
export declare function setupHandoffTimeout(sessionId: string, onTimeout: () => void, timeoutMs?: number): void;
/**
 * Setup progress heartbeat.
 *
 * @param sessionId - Session ID
 * @param onHeartbeat - Callback on each heartbeat
 * @param intervalMs - Interval in milliseconds
 */
export declare function setupProgressHeartbeat(sessionId: string, onHeartbeat: () => void, intervalMs?: number): void;
/**
 * Execute a full handoff with timeout handling.
 *
 * @param sessionId - Session ID
 * @param targetAgentId - Target agent
 * @param execute - Async function to execute the handoff
 * @param context - Optional context
 * @returns Promise that resolves to success/failure
 */
export declare function executeHandoff(sessionId: string, targetAgentId: string, execute: () => Promise<void>, context?: HandoffContext): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Cleanup session state on disconnect.
 */
export declare function cleanupHandoffSession(sessionId: string): void;
//# sourceMappingURL=actions.d.ts.map