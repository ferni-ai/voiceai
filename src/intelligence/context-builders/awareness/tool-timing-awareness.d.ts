/**
 * Tool Timing Context Builder
 *
 * Injects information about tool execution timing into the LLM context.
 * This enables the LLM to frame responses naturally based on wait times.
 *
 * Philosophy:
 * - "Better than Human" means acknowledging the wait naturally, not robotically
 * - Long waits deserve natural acknowledgment, not apology
 * - The LLM should know if the user was patient
 *
 * Example injections:
 * - "The calendar lookup took 4 seconds. Acknowledge briefly, then share results."
 * - "Memory recall was slow (6s). The user waited patiently - weave results naturally."
 *
 * @module tool-timing-context
 */
import type { ContextBuilder } from '../core/types.js';
interface ToolTiming {
    toolName: string;
    durationMs: number;
    completedAt: number;
    userEmotion?: string;
}
/**
 * Record a tool execution timing for context injection.
 * Call this when a tool completes.
 */
export declare function recordToolTiming(sessionId: string, toolName: string, durationMs: number, userEmotion?: string): void;
/**
 * Get recent tool timings for a session.
 * Only returns timings from the last 30 seconds (current turn).
 */
export declare function getRecentToolTimings(sessionId: string): ToolTiming[];
/**
 * Clear tool timings for a session.
 */
export declare function clearToolTimings(sessionId: string): void;
export declare const toolTimingContextBuilder: ContextBuilder;
export default toolTimingContextBuilder;
//# sourceMappingURL=tool-timing-awareness.d.ts.map