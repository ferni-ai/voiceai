/**
 * Graceful Interrupt System
 *
 * Makes conversation interrupts feel natural rather than sharp/abrupt.
 *
 * PROBLEM: When users interrupt, the agent's speech just... stops.
 * Like a robot powering down mid-sentence. Jarring.
 *
 * SOLUTION: Multiple layers of smoothing:
 *
 * 1. CUSHIONING - Add micro-pauses throughout speech so any cut lands softly
 * 2. PRE-EMPTIVE TRAILING - When we sense interrupt coming, start fading BEFORE cut
 * 3. INTERRUPT RECOVERY - Start the next response softer, more human
 * 4. NATURAL PAUSE POINTS - Chunk responses so cuts land on pauses
 *
 * Human interruption example:
 * ```
 * Agent: "So what I think is— " [user starts "actually"]
 * Agent: "...you know... " ← trailing off (subliminal)
 * [hard cut from LiveKit]
 * Agent: "[soft breath] ...yeah?" ← recovery
 * ```
 *
 * @module speech/graceful-interrupt
 */
export type InterruptPhase = 'normal' | 'sensing' | 'trailing' | 'recovering';
export interface InterruptState {
    /** Current phase in interrupt handling */
    phase: InterruptPhase;
    /** When we started sensing an interrupt */
    sensingStartedAt?: number;
    /** What triggered the sensing */
    sensingTrigger?: string;
    /** Whether we've injected trailing already */
    hasTrailed: boolean;
    /** The last sentence fragment before interrupt */
    lastFragment?: string;
    /** User's emotional state during interrupt */
    userEmotion?: string;
}
export interface CushionedResponse {
    /** SSML with cushioning micro-pauses */
    ssml: string;
    /** Natural break points (character positions) */
    breakPoints: number[];
    /** Recommended chunk boundaries */
    chunks: string[];
}
export interface RecoveryOptions {
    /** Was this a hard interrupt (wait/stop) or soft (just started talking)? */
    interruptType: 'hard' | 'soft';
    /** User's emotional state */
    userEmotion?: string;
    /** What we were saying when interrupted */
    wasAboutToSay?: string;
    /** The persona speaking */
    personaId: string;
}
export interface RecoverySsml {
    /** SSML prefix for recovery (soft breath, softer start) */
    prefix: string;
    /** Speed ratio to start at */
    initialSpeed: number;
    /** Volume ratio to start at */
    initialVolume: number;
    /** Optional verbal acknowledgment of interrupt */
    acknowledgment?: string;
}
/**
 * Micro-pause durations for cushioning
 *
 * These are subtle but make cuts land softer. When speech is interrupted,
 * having a micro-pause nearby means the cut happens in a natural gap
 * rather than mid-syllable.
 *
 * Slightly longer than typical reading pauses - optimized for
 * voice AI where cuts can happen at any moment.
 */
export declare const CUSHION_TIMING: {
    /** Pause after commas (subtle breath) */
    comma: number;
    /** Pause after periods (natural break) */
    period: number;
    /** Pause after emotional words (processing moment) */
    emotional: number;
    /** Pause at clause boundaries (thinking beat) */
    clause: number;
};
/**
 * Patterns that trigger immediate trailing (user wants to speak)
 */
export declare const TRAILING_TRIGGERS: RegExp[];
/**
 * Get or create interrupt state for a session
 */
export declare function getInterruptState(sessionId: string): InterruptState;
/**
 * Reset interrupt state (call when session ends)
 */
export declare function resetInterruptState(sessionId: string): void;
/**
 * Add cushioning micro-pauses to response text.
 *
 * This makes ANY cut point softer because there's always
 * a tiny pause nearby. The pauses are imperceptible in normal
 * playback but prevent harsh mid-word cuts.
 *
 * @param text - The response text (may have SSML)
 * @returns Cushioned response with break points
 */
export declare function addCushioning(text: string): CushionedResponse;
/**
 * Check if user speech indicates an incoming interrupt.
 *
 * Called on EVERY partial transcript. If we detect interrupt signals,
 * we can inject trailing SSML into the current TTS stream.
 *
 * @param sessionId - Session ID
 * @param partialText - User's partial transcript
 * @param isAgentSpeaking - Whether agent is currently speaking
 * @returns Whether to start trailing off
 */
export declare function senseInterrupt(sessionId: string, partialText: string, isAgentSpeaking: boolean): {
    shouldTrail: boolean;
    trigger?: string;
};
/**
 * Get trailing SSML to inject before the hard cut.
 *
 * This creates the natural "trailing off" effect that humans do
 * when someone starts talking over them.
 *
 * @returns SSML to append to current speech stream
 */
export declare function getTrailingSsml(sessionId: string): string;
/**
 * Get recovery SSML for starting speech after an interrupt.
 *
 * Makes the agent's return feel natural - like a human pausing,
 * taking a breath, and starting again softer.
 *
 * @param sessionId - Session ID
 * @param options - Recovery configuration
 * @returns Recovery SSML and configuration
 */
export declare function getRecoverySsml(sessionId: string, options: RecoveryOptions): RecoverySsml;
/**
 * Mark the end of recovery phase (call after first response sentence)
 */
export declare function endRecovery(sessionId: string): void;
/**
 * Wrap a response with full interrupt awareness.
 *
 * This is the main integration point. Call this before sending
 * text to TTS to get:
 * - Cushioning micro-pauses
 * - Recovery softening (if coming back from interrupt)
 * - Natural chunk boundaries
 *
 * @param sessionId - Session ID
 * @param text - Response text
 * @param wasInterrupted - Whether we were just interrupted
 * @param interruptType - Type of interrupt if applicable
 * @returns Fully wrapped response ready for TTS
 */
export declare function wrapWithInterruptAwareness(sessionId: string, text: string, options: {
    wasInterrupted?: boolean;
    interruptType?: 'hard' | 'soft';
    userEmotion?: string;
    personaId: string;
}): {
    ssml: string;
    chunks: string[];
};
export { wrapSpeechWithInterruptAwareness, createInterruptAwareTransform, markRecoveryComplete, isInRecoveryPhase, type InterruptContext, type WrappedSpeech, } from './speech-wrapper.js';
declare const _default: {
    getInterruptState: typeof getInterruptState;
    resetInterruptState: typeof resetInterruptState;
    addCushioning: typeof addCushioning;
    senseInterrupt: typeof senseInterrupt;
    getTrailingSsml: typeof getTrailingSsml;
    getRecoverySsml: typeof getRecoverySsml;
    endRecovery: typeof endRecovery;
    wrapWithInterruptAwareness: typeof wrapWithInterruptAwareness;
    CUSHION_TIMING: {
        /** Pause after commas (subtle breath) */
        comma: number;
        /** Pause after periods (natural break) */
        period: number;
        /** Pause after emotional words (processing moment) */
        emotional: number;
        /** Pause at clause boundaries (thinking beat) */
        clause: number;
    };
    TRAILING_TRIGGERS: RegExp[];
};
export default _default;
//# sourceMappingURL=index.d.ts.map