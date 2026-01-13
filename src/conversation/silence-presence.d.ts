/**
 * Silence as Presence
 *
 * Implements intentional, meaningful silences that communicate care.
 * Real human conversations have silences that MEAN something:
 *
 * - Processing silence: "Let me sit with that"
 * - Emotional silence: "This deserves space"
 * - Invitation silence: "Take your time"
 * - Presence silence: "I'm here with you"
 *
 * This is NOT about awkward pauses - it's about using silence
 * as a form of communication that shows deep attunement.
 *
 * @module @ferni/silence-presence
 */
export type SilenceReason = 'processing' | 'emotional' | 'invitation' | 'presence' | 'resonance' | 'respect';
export interface SilenceConfig {
    /** Minimum duration in ms */
    minDuration: number;
    /** Maximum duration in ms */
    maxDuration: number;
    /** Breath sound to play during silence (or null) */
    breathSound: 'soft_exhale' | 'settling' | 'contemplative' | null;
    /** Whether avatar should show visible presence */
    showPresence: boolean;
    /** Verbal cue before/after silence (or null for pure silence) */
    verbalCue: string | null;
}
export interface SilenceDecision {
    /** Whether to use silence here */
    useSilence: boolean;
    /** Why we're being silent */
    reason: SilenceReason;
    /** Duration in ms */
    duration: number;
    /** Configuration for this silence */
    config: SilenceConfig;
    /** SSML to inject for the silence */
    ssml: string;
}
export declare class SilencePresenceEngine {
    private lastSilenceTime;
    private silenceCount;
    private readonly MIN_SILENCE_INTERVAL;
    private readonly MAX_SILENCES_PER_CONV;
    constructor();
    /**
     * Decide whether to use silence before responding
     *
     * @param userMessage - What the user just said
     * @param userEmotion - Detected emotion
     * @param turnCount - Current turn in conversation
     * @param wasPersonalSharing - Did user share something personal?
     * @param conversationDepth - How deep is the conversation?
     */
    decideSilence(context: {
        userMessage: string;
        userEmotion?: string;
        turnCount: number;
        wasPersonalSharing?: boolean;
        conversationDepth: 'surface' | 'medium' | 'deep';
        topicWeight?: 'light' | 'medium' | 'heavy';
        /** Optional seed for deterministic behavior */
        randomSeed?: string;
    }): SilenceDecision;
    /**
     * Detect what type of silence might be appropriate
     */
    private detectSilenceReason;
    /**
     * Build SSML for the silence
     */
    private buildSilenceSsml;
    /**
     * Get a verbal cue to use before intentional silence
     * Only used when we want to signal the silence explicitly
     */
    getVerbalCueForSilence(reason: SilenceReason): string | null;
    /**
     * Apply silence to a response if appropriate
     * Modifies the response to include silence at the beginning
     */
    applyToResponse(response: string, decision: SilenceDecision): {
        text: string;
        ssml: string;
    };
    /**
     * Reset for new conversation
     */
    reset(): void;
}
export declare function getSilencePresenceEngine(): SilencePresenceEngine;
export declare function resetSilencePresenceEngine(): void;
export default SilencePresenceEngine;
//# sourceMappingURL=silence-presence.d.ts.map