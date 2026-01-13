/**
 * Generate Reply Gateway
 *
 * SINGLE POINT OF ENTRY for all generateReply calls.
 *
 * This module solves multiple architectural problems:
 * 1. Session readiness - verifies Gemini is ready before accepting calls
 * 2. Consistent error handling - all calls go through same safeguards
 * 3. Queuing - prevents concurrent calls that overwhelm the API
 * 4. Observability - centralized logging for all LLM interactions
 *
 * NEVER call session.generateReply() directly anywhere else!
 * Always use: gateway.generateReply(session, options)
 *
 * @module generate-reply-gateway
 */
import { voice } from '@livekit/agents';
export interface GatewayOptions {
    instructions: string;
    allowInterruptions?: boolean;
    context?: string;
    priority?: 'high' | 'normal' | 'low';
    /** If true, wait for audio playout. If false, returns after LLM response received */
    waitForPlayout?: boolean;
    /** Fallback message if generateReply fails */
    fallbackMessage?: string;
    /** Timeout in ms (default: 4000 - reduced for human-like latency) */
    timeoutMs?: number;
}
export interface GatewayResult {
    success: boolean;
    usedFallback: boolean;
    error?: string;
    sessionNotReady?: boolean;
    queuePosition?: number;
    latencyMs?: number;
    /** True if the call was skipped (session not ready, low priority) */
    skipped?: boolean;
    /** True if the call was debounced (too rapid) */
    debounced?: boolean;
}
/** Type alias for external consumers */
export type GenerateReplyOptions = GatewayOptions;
export type GenerateReplyResult = GatewayResult;
interface SessionState {
    isReady: boolean;
    readyAt?: number;
    lastSuccessAt?: number;
    lastCallAt?: number;
    consecutiveFailures: number;
    circuitBreakerOpenedAt?: number;
    pendingCallCount: number;
    /**
     * Track if there's an active low-priority response (e.g., backchannel).
     * Used to prevent "conversation_already_has_active_response" errors from OpenAI.
     * When a new normal/high priority request comes in, we interrupt the low-priority one first.
     */
    hasActiveLowPriorityResponse: boolean;
    /** Timestamp when low-priority response started (for cleanup) */
    lowPriorityResponseStartedAt?: number;
    /** Session reference for interrupting active responses */
    activeSession?: voice.AgentSession;
    stats: {
        totalCalls: number;
        successfulCalls: number;
        failedCalls: number;
        debouncedCalls: number;
        skippedCalls: number;
    };
}
/**
 * Register a session object for potential reconnection.
 * Call this when creating a new session.
 */
export declare function registerSessionForReconnection(sessionId: string, session: voice.AgentSession): void;
/**
 * Unregister a session (on cleanup).
 */
export declare function unregisterSessionForReconnection(sessionId: string): void;
/**
 * Check if session is ready to accept generateReply calls.
 */
export declare function isSessionReady(sessionId: string): boolean;
/**
 * Reset session state completely (for testing or cleanup).
 */
export declare function resetSessionState(sessionId: string): void;
/**
 * Get gateway statistics for a session.
 */
export declare function getGatewayStats(sessionId: string): SessionState['stats'];
/**
 * Clear any pending low-priority response flag for a session.
 * Call this when user starts speaking to ensure we can immediately respond after.
 * This is a backup mechanism - the main interrupt happens in generateReply().
 */
export declare function clearPendingLowPriorityResponse(sessionId: string): void;
/**
 * Mark a session as ready to accept generateReply calls.
 * Call this after successful prewarm or first successful generateReply.
 */
export declare function markSessionReady(sessionId: string): void;
/**
 * Check if a session is still active (not cancelled).
 * @param sessionId - The session ID to check
 * @returns true if the session is active, false if cancelled
 */
export declare function isSessionActive(sessionId: string): boolean;
/**
 * Mark a session as not ready (e.g., after connection failure).
 */
export declare function markSessionNotReady(sessionId: string, reason: string): void;
/**
 * Wait for session to become ready, with timeout.
 */
export declare function waitForSessionReady(sessionId: string, timeoutMs?: number): Promise<boolean>;
/**
 * Clean up session state when session ends.
 * IMPORTANT: This marks the session as cancelled to prevent orphaned prewarm operations.
 */
export declare function cleanupSessionState(sessionId: string): void;
/**
 * Centralized generateReply with all safeguards.
 *
 * @example
 * ```ts
 * const result = await generateReply(session, sessionId, {
 *   instructions: 'Respond naturally',
 *   context: 'silence-handler',
 *   fallbackMessage: "I'm here.",
 * });
 *
 * if (!result.success && result.sessionNotReady) {
 *   // Session not warmed up yet - expected during startup
 * }
 * ```
 */
export declare function generateReply(session: voice.AgentSession, sessionId: string, options: GatewayOptions): Promise<GatewayResult>;
/**
 * Prewarm the session - marks session as ready on success.
 * SAFETY: Checks for session cancellation to prevent orphaned prewarms.
 *
 * EXPERIMENTAL: Skip actual generateReply call, just mark ready after short delay.
 * The first real user interaction will establish the Gemini connection.
 */
export declare function prewarmSession(session: voice.AgentSession, sessionId: string): Promise<boolean>;
/**
 * Fire-and-forget prewarm (for fast startup).
 * Marks session as ready in background when complete.
 * SAFETY: Won't prewarm cancelled sessions.
 */
export declare function prewarmSessionAsync(session: voice.AgentSession, sessionId: string): void;
export {};
//# sourceMappingURL=generate-reply-gateway.d.ts.map