/**
 * Safe Generate Reply Wrapper
 *
 * MIGRATION NOTE (Dec 2024): This module is being migrated to use the new
 * centralized gateway in `generate-reply-gateway.ts`. New code should use
 * the gateway directly:
 *
 *   import { generateReply } from './generate-reply-gateway.js';
 *   await generateReply(session, sessionId, { instructions, context, fallbackMessage });
 *
 * This module still provides valuable utilities:
 * - behavioralInstruction() - Format behavioral instructions
 * - formatToolResult() - Format tool results for natural presentation
 * - stageDirection() - Legacy compatibility (deprecated)
 *
 * And additional safeguards not in the gateway:
 * - Circuit breaker (3 failures -> open)
 * - Rate limiting (500ms min interval)
 * - Mutex/concurrency protection
 * - Context size monitoring
 * - Connection health checks
 *
 * @module safe-generate-reply
 */
import type { voice } from '@livekit/agents';
export interface SafeGenerateReplyOptions {
    instructions: string;
    allowInterruptions?: boolean;
    fallbackMessage?: string;
    waitForPlayout?: boolean;
    timeoutMs?: number;
    context?: string;
    /** Optional: session for WebSocket health check */
    session?: voice.AgentSession;
    /** Optional: session ID for coordinated speech */
    sessionId?: string;
    /** Optional: Bypass circuit breaker (use for critical operations like handoff greetings) */
    bypassCircuitBreaker?: boolean;
    /** Optional: Bypass session closing check (use when we KNOW the session is valid for handoff) */
    bypassSessionClosingCheck?: boolean;
    /** Optional: Priority level - 'low' requests won't affect circuit breaker on failure */
    priority?: 'high' | 'normal' | 'low';
}
export interface SafeGenerateReplyResult {
    success: boolean;
    usedFallback: boolean;
    error?: string;
    circuitOpen?: boolean;
    /** True if skipped due to another generateReply in progress */
    skippedConcurrent?: boolean;
    /** True if context size exceeded safe limits */
    contextWarning?: boolean;
    /** True if WebSocket appears unhealthy */
    connectionWarning?: boolean;
}
/**
 * Safely call session.generateReply() with pre-emptive timeout protection.
 *
 * SAFEGUARDS:
 * 1. Circuit breaker - stops after 3 failures
 * 2. Rate limiting - 500ms minimum between calls
 * 3. Mutual exclusion - prevents concurrent generateReply calls
 * 4. Context size monitoring - warns on large prompts
 * 5. Connection health check - validates session state
 * 6. Pre-emptive timeout - fires before SDK's internal timeout
 *
 * @example
 * ```ts
 * const result = await safeGenerateReply(session, {
 *   instructions: 'Respond naturally to the user',
 *   fallbackMessage: "I'm here with you.",
 *   context: 'silence-response',
 * });
 * ```
 */
export declare function safeGenerateReply(session: voice.AgentSession, options: SafeGenerateReplyOptions): Promise<SafeGenerateReplyResult>;
/**
 * Safely call session.say() with timeout protection.
 * @param sessionId - If provided, uses coordinated speech; otherwise falls back to direct session.say
 */
export declare function safeSay(session: voice.AgentSession, text: string, options?: {
    allowInterruptions?: boolean;
    timeoutMs?: number;
    context?: string;
    sessionId?: string;
}): Promise<boolean>;
export declare function isCircuitOpen(): boolean;
export declare function getFailureStats(): {
    count: number;
    threshold: number;
    isOpen: boolean;
};
export declare function resetCircuitBreaker(): void;
export interface SafeGenerateReplyStatus {
    circuitBreaker: {
        isOpen: boolean;
        failureCount: number;
        threshold: number;
    };
    mutex: {
        isLocked: boolean;
        currentContext: string | null;
    };
    rateLimit: {
        lastCallTime: number;
        msSinceLastCall: number;
        minIntervalMs: number;
    };
    contextLimits: {
        maxChars: number;
        criticalChars: number;
    };
}
/**
 * Get full status report for diagnostics.
 * Useful for debugging why generateReply calls might be failing.
 */
export declare function getFullStatus(): SafeGenerateReplyStatus;
/**
 * Check if it's safe to call generateReply right now.
 * Returns null if safe, or an error message if not.
 */
export declare function canGenerateReply(): string | null;
/**
 * Force unlock the mutex (use only in emergency/cleanup scenarios).
 * WARNING: This could cause race conditions if called while a generateReply is actually in progress.
 */
export declare function forceUnlockMutex(): void;
/**
 * Format behavioral instructions for the LLM.
 *
 * This creates clear, direct instructions that tell the LLM HOW to respond.
 * Unlike the old "stage direction" approach (which wrapped content in
 * <context> tags and hoped the LLM wouldn't read them), this gives explicit
 * behavioral guidance that can't leak because it's already instructional.
 *
 * @example
 * ```ts
 * // Direct behavioral instruction:
 * behavioralInstruction('User has been quiet', 'Gently check in without being pushy');
 *
 * // For tool results:
 * behavioralInstruction(
 *   'Tool executed: playMusic',
 *   'Acknowledge naturally that music is playing'
 * );
 * ```
 */
export declare function behavioralInstruction(situation: string, instruction: string): string;
/**
 * Format a tool result for natural presentation.
 *
 * Instead of wrapping in "invisible" context tags, we give the LLM clear
 * instructions on how to present the result naturally.
 */
export declare function formatToolResult(toolName: string, result: string): string;
/**
 * @deprecated Use behavioralInstruction() instead.
 * Kept for backward compatibility - now outputs structured commands only.
 *
 * CRITICAL: Do NOT use conversational text like "Speak naturally" - Gemini echoes it!
 * Use only structured [BRACKET] format.
 */
export declare function stageDirection(context: string | string[]): string;
/**
 * Generate a reply with behavioral context.
 * Convenience wrapper that formats context as behavioral instructions.
 *
 * @example
 * ```ts
 * await generateReplyWithContext(session, {
 *   context: ['User has been quiet for 8 seconds', 'They seemed stressed earlier'],
 *   fallbackMessage: "I'm here whenever you're ready.",
 *   logContext: 'dead-air-checkin',
 * });
 * ```
 */
export declare function generateReplyWithContext(session: voice.AgentSession, options: {
    context: string | string[];
    fallbackMessage?: string;
    allowInterruptions?: boolean;
    waitForPlayout?: boolean;
    timeoutMs?: number;
    logContext?: string;
    /** Session ID for session-closing check - prevents errors during disconnect */
    sessionId?: string;
}): Promise<SafeGenerateReplyResult>;
//# sourceMappingURL=safe-generate-reply.d.ts.map