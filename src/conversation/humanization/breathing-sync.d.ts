/**
 * Breathing Synchronization
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Subtly synchronize agent's speech breathing patterns with detected user
 * breathing, creating subconscious rapport. Research shows that breathing
 * synchronization builds trust and emotional connection.
 *
 * **How it works:**
 * - Detect user's breathing rate and phase from audio
 * - Time agent pauses to align with user's exhale
 * - Gradually shift agent's pacing to match user's rhythm
 * - Use breath sounds at key emotional moments
 *
 * **Note**: This is an advanced feature that requires good breath detection.
 * When detection is uncertain, we fall back to natural pacing.
 *
 * @module @ferni/humanization/breathing-sync
 */
export type BreathPhase = 'inhale' | 'exhale' | 'pause' | 'unknown';
export type BreathDepth = 'shallow' | 'normal' | 'deep';
export interface BreathPattern {
    /** Breaths per minute */
    breathsPerMinute: number;
    /** Average breath cycle duration in ms */
    cycleDuration: number;
    /** Average inhale duration in ms */
    inhaleDuration: number;
    /** Average exhale duration in ms */
    exhaleDuration: number;
    /** Average pause duration in ms */
    pauseDuration: number;
    /** Current phase */
    currentPhase: BreathPhase;
    /** Estimated next exhale start time (ms since pattern start) */
    nextExhaleMs: number;
    /** Breath depth */
    depth: BreathDepth;
    /** Confidence in detection (0-1) */
    confidence: number;
}
export interface BreathSyncState {
    /** Is sync enabled? */
    enabled: boolean;
    /** User's detected breath pattern */
    userPattern: BreathPattern | null;
    /** How closely to sync (0-1) */
    syncStrength: number;
    /** Agent's adapted breath rate */
    agentBreathRate: number;
    /** Phase alignment accuracy */
    alignmentAccuracy: number;
    /** History of sync quality */
    syncHistory: number[];
}
export interface BreakAdjustment {
    /** Position in text (character index) */
    position: number;
    /** Adjusted duration in ms */
    duration: number;
    /** Should add audible breath sound? */
    addBreathSound: boolean;
    /** Reason for adjustment */
    reason: string;
}
export interface BreathSyncAdjustments {
    /** Adjusted breaks */
    adjustedBreaks: BreakAdjustment[];
    /** Overall pacing adjustment */
    overallPacing: number;
    /** SSML breath markers to insert */
    breathMarkers: Array<{
        position: number;
        ssml: string;
    }>;
    /** Sync quality for this adjustment (0-1) */
    syncQuality: number;
}
export declare class BreathingSyncEngine {
    private state;
    private useAmazonBreathTag;
    constructor(options?: {
        useAmazonBreathTag?: boolean;
    });
    /**
     * Update with detected user breath pattern
     */
    updateUserPattern(pattern: BreathPattern): void;
    /**
     * Calculate sync adjustments for a piece of text
     */
    calculateAdjustments(text: string, emotionalContext?: {
        isEmotional: boolean;
        isHeavy: boolean;
        isExcited: boolean;
    }): BreathSyncAdjustments;
    /**
     * Apply breathing sync to SSML
     */
    applyToSsml(ssml: string, adjustments: BreathSyncAdjustments): string;
    /**
     * Get breath sync state
     */
    getState(): BreathSyncState;
    /**
     * Enable/disable breathing sync
     */
    setEnabled(enabled: boolean): void;
    /**
     * Set sync strength (0-1)
     */
    setSyncStrength(strength: number): void;
    /**
     * Get average sync quality
     */
    getAverageSyncQuality(): number;
    /**
     * Check if we have valid breath data
     */
    hasValidData(): boolean;
    /**
     * Reset for new session
     */
    reset(): void;
    private createInitialState;
    private updateAgentBreathRate;
    private findNaturalBreaks;
    private calculateSyncedPacing;
    private calculateSyncQuality;
    private getBreathSsml;
}
/**
 * Simulate breath detection for testing
 * In production, this would come from actual audio analysis
 */
export declare function simulateBreathPattern(hints: {
    isCalm?: boolean;
    isAnxious?: boolean;
    isTired?: boolean;
    isExcited?: boolean;
}): BreathPattern;
export declare function getBreathingSyncEngine(sessionId: string, options?: {
    useAmazonBreathTag?: boolean;
}): BreathingSyncEngine;
export declare function resetBreathingSyncEngine(sessionId: string): void;
export declare function resetAllBreathingSyncEngines(): void;
export default BreathingSyncEngine;
//# sourceMappingURL=breathing-sync.d.ts.map