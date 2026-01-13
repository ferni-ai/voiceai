/**
 * Honesty Guardrail Context Builder
 *
 * Detects when users ask about actions/capabilities and injects honest context.
 * Prevents Ferni from implying she did something she didn't do.
 *
 * CRITICAL FOR TRUST: This is a core brand promise - Ferni is honest.
 *
 * Examples of questions this handles:
 * - "Did you actually call my mom?"
 * - "If you called my mom..."
 * - "Did you send that text?"
 * - "Have you made the reservation?"
 *
 * @module intelligence/context-builders/safety/honesty-guardrail
 */
export interface HonestyContext {
    /** Whether honesty context should be injected */
    shouldInject: boolean;
    /** The honest answer to inject */
    context?: string;
    /** Detected action type being asked about */
    actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
    /** Detected contact being asked about */
    contact?: string;
    /** Confidence in the detection (0-1) */
    confidence: number;
}
/**
 * Build honesty context to inject into LLM prompt.
 *
 * Call this when processing user input to check if honest context
 * should be injected about what actions have/haven't been taken.
 */
export declare function buildHonestyContext(sessionId: string, userTranscript: string): HonestyContext;
/**
 * Get the full context injection string for LLM prompt.
 */
export declare function getHonestyInjection(sessionId: string, userTranscript: string): string | null;
/**
 * Get a brief session summary for context.
 * Useful for general honesty context about what has been done.
 */
export declare function getSessionActionSummary(sessionId: string): string;
declare const _default: {
    buildHonestyContext: typeof buildHonestyContext;
    getHonestyInjection: typeof getHonestyInjection;
    getSessionActionSummary: typeof getSessionActionSummary;
};
export default _default;
//# sourceMappingURL=honesty-guardrail.d.ts.map