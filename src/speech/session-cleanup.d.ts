/**
 * Speech Session Cleanup
 *
 * Unified cleanup function for all speech-related session state.
 * Call this when a voice session ends to prevent memory leaks.
 *
 * This consolidates cleanup across ALL 35+ session-scoped services:
 * - Audio prosody analyzers
 * - WPM trackers
 * - Backchanneling systems
 * - Cognitive speech state
 * - TTS context
 * - Pronunciation memory
 * - Voice humanization
 * - Human listening pipeline
 * - Enhanced turn prediction
 * - Emotional contagion
 * - Voice tremor detection
 * - Volume dynamics
 * - Energy dynamics
 * - Fluency analysis
 * - Filler analysis
 * - FFT analyzer
 * - Multi-signal laughter
 * - Word timing rhythm
 * - Response anticipation
 * - Ambient awareness
 * - Breath detection
 * - Realtime preemptive processor
 * - Cartesia context
 * - Session voice manager
 * - Environment tracker (ambient reactivity)
 * - Conversation momentum tracker
 * - Mid-response tangent state
 * - Self-awareness feedback loop
 * - Sesame-inspired: anticipatory prosody
 * - Sesame-inspired: micro-reactions
 * - Sesame-inspired: conversation prosody
 * - Sesame-inspired: rich disfluencies
 */
/**
 * Register a new speech session
 */
export declare function registerSpeechSession(sessionId: string): void;
/**
 * Get count of active speech sessions
 */
export declare function getActiveSpeechSessionCount(): number;
/**
 * Get all active session IDs (for debugging)
 */
export declare function getActiveSpeechSessions(): string[];
/**
 * Clean up all speech-related state for a session.
 *
 * Call this when:
 * - A voice session ends normally
 * - A session disconnects unexpectedly
 * - A session times out
 *
 * @param sessionId - The session ID to clean up
 * @param options - Cleanup options
 */
export declare function cleanupSpeechSession(sessionId: string, options?: {
    /** Log cleanup details (default: true) */
    verbose?: boolean;
    /** Reason for cleanup (for logging) */
    reason?: 'normal' | 'disconnect' | 'timeout' | 'error';
}): void;
/**
 * Clean up all speech sessions.
 * Use with caution - typically only for shutdown or testing.
 */
export declare function cleanupAllSpeechSessions(reason?: 'shutdown' | 'test'): void;
/**
 * Emergency cleanup - clears ALL state from ALL services.
 * Use only for emergency recovery or testing.
 *
 * This properly clears all internal Maps to prevent memory leaks.
 * Returns a promise that resolves when cleanup is complete.
 */
export declare function emergencySpeechCleanup(): Promise<void>;
declare const _default: {
    cleanupSpeechSession: typeof cleanupSpeechSession;
    cleanupAllSpeechSessions: typeof cleanupAllSpeechSessions;
    emergencySpeechCleanup: typeof emergencySpeechCleanup;
    registerSpeechSession: typeof registerSpeechSession;
    getActiveSpeechSessionCount: typeof getActiveSpeechSessionCount;
    getActiveSpeechSessions: typeof getActiveSpeechSessions;
};
export default _default;
//# sourceMappingURL=session-cleanup.d.ts.map