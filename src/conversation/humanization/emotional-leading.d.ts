/**
 * Emotional Leading
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Rather than only mirroring user emotions, strategically lead them toward
 * better emotional states. This is a core "better than human" capability:
 * humans often get stuck in emotional spirals together, but we can gently
 * guide users toward more resourceful states.
 *
 * **Key principles:**
 * - Mirror FIRST (validation before leading)
 * - Lead GRADUALLY (subtle shifts, not jarring changes)
 * - Respect the feeling (don't dismiss negative emotions)
 * - Know when NOT to lead (crisis = presence, not redirection)
 *
 * @module @ferni/humanization/emotional-leading
 */
export type LeadingStrategy = 'energize' | 'calm' | 'ground' | 'uplift' | 'validate' | 'hold_space';
export type LeadingIntensity = 'subtle' | 'moderate' | 'direct';
export interface UserEmotionalState {
    /** Emotional valence (-1 to 1) */
    valence: number;
    /** Arousal/energy (0 to 1) */
    arousal: number;
    /** Detected emotion label */
    emotion: string;
    /** Distress level (0 to 1) */
    distressLevel: number;
    /** Number of negative spiral indicators */
    negativeSpiralIndicators: number;
    /** Energy level */
    energy: 'high' | 'medium' | 'low';
    /** Is user in crisis? */
    inCrisis: boolean;
}
export interface EmotionalLeadingDecision {
    /** Should we lead? */
    shouldLead: boolean;
    /** Leading strategy */
    strategy: LeadingStrategy;
    /** Intensity of leading */
    intensity: LeadingIntensity;
    /** Number of turns to mirror first */
    mirrorTurnsFirst: number;
    /** Voice adjustments for leading */
    vocalAdjustments: {
        pitchTarget: string;
        tempoTarget: number;
        energyTarget: number;
        transitionDuration: number;
    };
    /** Content adjustments */
    contentAdjustments: {
        questionType: 'reframe' | 'future' | 'strength' | 'gratitude' | 'ground' | 'explore';
        acknowledgmentFirst: boolean;
        bridgePhrase: string;
        toneShift: string;
    };
    /** Reason for decision */
    reason: string;
}
export interface LeadingState {
    /** Are we currently in a leading sequence? */
    isLeading: boolean;
    /** Current strategy */
    currentStrategy: LeadingStrategy | null;
    /** Turns remaining in mirror phase */
    mirrorTurnsRemaining: number;
    /** Turns into leading phase */
    leadingTurnCount: number;
    /** Target emotional state */
    targetState: {
        valence: number;
        arousal: number;
        energy: number;
    } | null;
    /** Progress toward target (0-1) */
    progress: number;
    /** Recent leading attempts */
    recentAttempts: Array<{
        strategy: LeadingStrategy;
        turn: number;
        success: boolean;
    }>;
}
export declare class EmotionalLeadingEngine {
    private state;
    private comfortLevel;
    private turnCount;
    constructor();
    /**
     * Decide whether and how to lead
     */
    decideLeading(userState: UserEmotionalState, userMessage: string, context: {
        turnCount: number;
        comfortLevel: number;
        recentTopics: string[];
    }): EmotionalLeadingDecision;
    /**
     * Report outcome of leading attempt
     */
    reportOutcome(success: boolean): void;
    /**
     * Get current leading state
     */
    getState(): LeadingState;
    /**
     * Check if we're currently in a leading sequence
     */
    isLeading(): boolean;
    /**
     * Get leading progress (0-1)
     */
    getProgress(): number;
    /**
     * Reset for new session
     */
    reset(): void;
    private createInitialState;
    private checkNoLeadConditions;
    private selectStrategy;
    private determineIntensity;
    private calculateMirrorTurns;
    private selectQuestionType;
    private selectBridgePhrase;
    private describeToneShift;
    private createHoldSpaceDecision;
    private createValidateFirstDecision;
    private updateState;
}
export declare function getEmotionalLeadingEngine(sessionId: string): EmotionalLeadingEngine;
export declare function resetEmotionalLeadingEngine(sessionId: string): void;
export declare function resetAllEmotionalLeadingEngines(): void;
export default EmotionalLeadingEngine;
//# sourceMappingURL=emotional-leading.d.ts.map