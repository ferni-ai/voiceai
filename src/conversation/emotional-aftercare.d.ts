/**
 * Emotional Aftercare Engine
 *
 * > "We don't just hold space—we help you find solid ground again."
 *
 * After heavy emotional moments, actively guides users back to equilibrium:
 *
 * - **Debt Tracking**: Monitor accumulated emotional "debt"
 * - **Grounding Transitions**: Natural shifts to stability
 * - **Closure Signals**: Ensure conversations end on stable ground
 * - **Re-regulation Support**: Help nervous system return to baseline
 * - **Integration Pauses**: Allow processing time after intensity
 *
 * This is about CARE—not just processing emotions but ensuring recovery.
 *
 * @module @ferni/emotional-aftercare
 */
export type EmotionalIntensity = 'low' | 'moderate' | 'high' | 'overwhelming';
export type AftercarePriority = 'none' | 'low' | 'moderate' | 'high' | 'urgent';
export type AftercarePhase = 'none' | 'holding' | 'transitioning' | 'grounding' | 'integrating' | 'closing' | 'recovered';
export interface EmotionalEvent {
    /** Turn number when event occurred */
    turn: number;
    /** Timestamp */
    timestamp: number;
    /** Intensity level */
    intensity: EmotionalIntensity;
    /** Type of emotional content */
    contentType: 'vulnerability' | 'grief' | 'trauma' | 'fear' | 'anger' | 'shame' | 'overwhelm' | 'breakthrough';
    /** Topic if identified */
    topic?: string;
    /** Has this been addressed in aftercare? */
    addressedInAftercare: boolean;
}
export interface AftercareState {
    /** Current accumulated emotional debt (0-1) */
    emotionalDebt: number;
    /** Current aftercare phase */
    phase: AftercarePhase;
    /** Recent emotional events */
    recentEvents: EmotionalEvent[];
    /** Turns since last high-intensity moment */
    turnsSinceIntensity: number;
    /** Priority level for aftercare */
    priority: AftercarePriority;
    /** Has user shown signs of re-regulation? */
    showingRecoverySignals: boolean;
}
export interface AftercareGuidance {
    /** Current phase */
    phase: AftercarePhase;
    /** Priority level */
    priority: AftercarePriority;
    /** Suggested transition phrase (if applicable) */
    transitionPhrase: string | null;
    /** Grounding prompt (if needed) */
    groundingPrompt: string | null;
    /** Check-in question */
    checkInQuestion: string | null;
    /** Should we suggest wrapping up? */
    suggestWrapUp: boolean;
    /** Response tone adjustment */
    toneGuidance: string;
    /** Pacing guidance */
    pacingGuidance: 'slower' | 'normal' | 'gentle_pause';
}
export declare class EmotionalAftercareEngine {
    private state;
    private turnCount;
    private readonly DEBT_DECAY_RATE;
    private readonly HIGH_DEBT_THRESHOLD;
    private readonly URGENT_DEBT_THRESHOLD;
    private readonly MAX_EVENTS;
    private readonly MINIMUM_GROUNDING_TURNS;
    constructor();
    /**
     * Process a turn and update aftercare state
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn number
     * @param detectedEmotion - Emotion detected in message
     * @returns Updated state
     */
    processTurn(userMessage: string, turnCount: number, detectedEmotion?: string): AftercareState;
    /**
     * Get guidance for response based on aftercare needs
     */
    getGuidance(): AftercareGuidance;
    /**
     * Check if conversation should suggest wrapping up
     */
    shouldSuggestClosing(isNearEnd: boolean): boolean;
    /**
     * Mark that aftercare was provided for current events
     */
    acknowledgeAftercare(): void;
    /**
     * Get current state
     */
    getState(): AftercareState;
    /**
     * Reset for new conversation
     */
    reset(): void;
    private detectIntensity;
    private inferContentType;
    private recordEmotionalEvent;
    private detectRecoverySignals;
    private updateEmotionalDebt;
    private updatePhase;
    private updatePriority;
    private pickRandom;
}
export declare function getEmotionalAftercareEngine(sessionId: string): EmotionalAftercareEngine;
export declare function resetEmotionalAftercareEngine(sessionId: string): void;
export declare function clearEmotionalAftercareEngine(sessionId: string): void;
export declare function getActiveEmotionalAftercareCount(): number;
export default EmotionalAftercareEngine;
//# sourceMappingURL=emotional-aftercare.d.ts.map