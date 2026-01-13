/**
 * Interrupt-Aware Speech Wrapper
 *
 * Wraps agent speech output with graceful interrupt handling:
 * - Recovery softening after being interrupted
 * - Cushioning micro-pauses throughout for softer cuts
 * - Natural trailing when sensing incoming interrupts
 *
 * This module bridges the graceful-interrupt system to actual speech output.
 *
 * @module speech/graceful-interrupt/speech-wrapper
 */
export interface InterruptContext {
    /** Was the agent interrupted on the previous turn? */
    wasInterrupted?: boolean;
    /** Type of interrupt: 'hard' (explicit stop words) or 'soft' (just started talking) */
    interruptType?: 'hard' | 'soft';
    /** User's emotional state */
    userEmotion?: string;
    /** Current persona ID */
    personaId: string;
    /** Session ID for state tracking */
    sessionId: string;
}
export interface WrappedSpeech {
    /** SSML-enhanced text ready for TTS */
    text: string;
    /** Whether recovery was applied */
    recoveryApplied: boolean;
    /** Whether cushioning was applied */
    cushioningApplied: boolean;
}
/**
 * Wrap speech text with interrupt awareness.
 *
 * Call this before sending text to TTS to:
 * 1. Add recovery softening if we were just interrupted
 * 2. Add cushioning micro-pauses for softer potential cuts
 *
 * @param text - The text to speak
 * @param context - Interrupt context (wasInterrupted, interruptType, etc.)
 * @returns Wrapped speech with SSML enhancements
 *
 * @example
 * ```typescript
 * const wrapped = wrapSpeechWithInterruptAwareness(
 *   "Let me think about that...",
 *   {
 *     wasInterrupted: userData.wasInterrupted,
 *     interruptType: userData.interruptType,
 *     personaId: persona.id,
 *     sessionId: sessionId,
 *   }
 * );
 * session.say(wrapped.text, { allowInterruptions: true });
 *
 * // Clear the interrupt flag after using it
 * if (wrapped.recoveryApplied) {
 *   userData.wasInterrupted = false;
 * }
 * ```
 */
export declare function wrapSpeechWithInterruptAwareness(text: string, context: InterruptContext): WrappedSpeech;
/**
 * Mark that recovery has been used (call after the first sentence is spoken)
 */
export declare function markRecoveryComplete(sessionId: string): void;
/**
 * Check if we're currently in recovery phase
 */
export declare function isInRecoveryPhase(sessionId: string): boolean;
/**
 * Create a transform stream that adds interrupt awareness to streaming text.
 *
 * This is designed to be used in the TTS pipeline:
 * LLM output → sanitizer → interruptAwareness → TTS
 *
 * @param context - Interrupt context
 * @returns A TransformStream that adds cushioning to streamed text
 */
export declare function createInterruptAwareTransform(context: InterruptContext): TransformStream<string, string>;
declare const _default: {
    wrapSpeechWithInterruptAwareness: typeof wrapSpeechWithInterruptAwareness;
    createInterruptAwareTransform: typeof createInterruptAwareTransform;
    markRecoveryComplete: typeof markRecoveryComplete;
    isInRecoveryPhase: typeof isInRecoveryPhase;
};
export default _default;
//# sourceMappingURL=speech-wrapper.d.ts.map