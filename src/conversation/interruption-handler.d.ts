/**
 * Interruption Handler
 *
 * Detects when users interrupt Jack and provides recovery phrases
 * to make Jack feel responsive and natural.
 */
import type { AudioFrame } from '@livekit/rtc-node';
export interface InterruptionEvent {
    type: 'user_started_speaking' | 'user_stopped_speaking';
    timestamp: number;
    userEnergy: number;
    agentWasSpeaking: boolean;
    interruptedUtterance?: string;
}
export declare class InterruptionHandler {
    private agentCurrentlySpeaking;
    private currentAgentUtterance;
    private interruptionCount;
    private lastInterruptionTime;
    private interruptionHistory;
    /**
     * Detect if user is interrupting the agent
     */
    detectInterruption(audioEvent: AudioFrame, agentSpeaking: boolean): InterruptionEvent | null;
    /**
     * Get a natural recovery phrase after being interrupted
     * Now with SSML tags for natural delivery
     *
     * Design: Soft, unhurried transitions - never jarring
     * - Longer initial pauses (300-500ms) for breathing room
     * - Lower volume (0.6-0.7) feels gentler
     * - Slower speech rate (0.85-0.9) is more calming
     * - Avoid exclamations - use gentle openers
     */
    getRecoveryPhrase(): string;
    /**
     * Get persona-specific recovery phrase with SSML
     * Uses canonical ID resolution for consistent persona matching
     *
     * Design: Each persona's voice, but all soft and unhurried
     * - 350-450ms initial pause for breathing room
     * - Volume 0.6-0.7 for gentle presence
     * - Slower speech rate for calm energy
     * - Avoid exclamations - gentle acknowledgments
     */
    getPersonaRecoveryPhrase(personaId: string): string;
    /**
     * Determine if Jack should give shorter responses
     * (user wants to talk more)
     */
    shouldShortenNextResponse(): boolean;
    /**
     * Get guidance for response length
     */
    getResponseLengthGuidance(): string;
    /**
     * Set agent speaking state
     */
    setAgentSpeaking(speaking: boolean, utterance?: string): void;
    /**
     * Get interruption statistics
     */
    getStats(): {
        totalInterruptions: number;
        recentInterruptions: number;
        shouldYield: boolean;
        guidance: string;
    };
    /**
     * Reset interruption tracking (new session)
     */
    reset(): void;
    /**
     * Estimate audio energy from frame using RMS (Root Mean Square)
     * Returns normalized energy level from 0.0 (silence) to 1.0 (max)
     */
    private estimateEnergy;
    /**
     * Check if audio level indicates speech (above silence threshold)
     */
    isSpeechDetected(frame: AudioFrame, silenceThreshold?: number): boolean;
    /**
     * Get detailed energy analysis for debugging/logging
     */
    analyzeAudio(frame: AudioFrame): {
        energy: number;
        isSpeech: boolean;
        isLoud: boolean;
        isSilence: boolean;
    };
}
/**
 * Get global interruption handler
 */
export declare function getInterruptionHandler(): InterruptionHandler;
/**
 * Reset global interruption handler
 */
export declare function resetInterruptionHandler(): void;
//# sourceMappingURL=interruption-handler.d.ts.map