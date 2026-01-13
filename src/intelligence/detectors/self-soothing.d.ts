/**
 * Verbal Self-Soothing Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects phrases people say to themselves, not to the listener:
 * - "It's okay" / "It's fine" / "I'm fine"
 * - "It doesn't matter" / "Whatever"
 * - "It'll be fine" / "I'll be okay"
 *
 * When detected, the user may be:
 * - Minimizing their real feelings
 * - Self-soothing through anxiety
 * - Convincing themselves of something
 * - Protecting themselves from vulnerability
 *
 * The agent should notice without directly challenging, creating
 * space for the user to share more if they want.
 *
 * @module SelfSoothingDetection
 */
export type SelfSoothingCategory = 'reassurance' | 'minimizing' | 'dismissive' | 'normalizing' | 'deflecting' | 'convincing';
export interface SelfSoothingInstance {
    /** The phrase detected */
    phrase: string;
    /** Category of self-soothing */
    category: SelfSoothingCategory;
    /** Position in text */
    position: number;
    /** Context around the phrase */
    context: string;
    /** Likely emotional state being managed */
    underlyingState: string;
}
export interface SelfSoothingResult {
    /** Was self-soothing detected? */
    detected: boolean;
    /** Instances found */
    instances: SelfSoothingInstance[];
    /** Dominant category */
    dominantCategory: SelfSoothingCategory | null;
    /** Likely underlying emotional state */
    underlyingEmotionalState: string;
    /** Is user possibly in distress? */
    possibleDistress: boolean;
    /** Interpretation */
    interpretation: string;
    /** Suggested approach (don't challenge directly) */
    suggestedApproach: string;
    /** Optional gentle probe question */
    probeQuestion?: string;
    /** Confidence (0-1) */
    confidence: number;
}
export declare class SelfSoothingDetector {
    private history;
    private readonly maxHistory;
    constructor();
    /**
     * Detect self-soothing language in text
     */
    analyze(text: string): SelfSoothingResult;
    /**
     * Get patterns across recent interactions
     */
    getPatterns(): {
        frequency: 'rare' | 'occasional' | 'frequent';
        dominantCategory: SelfSoothingCategory | null;
        concernLevel: 'low' | 'moderate' | 'high';
    };
    /**
     * Build context for LLM prompt
     */
    buildContextForPrompt(): string | null;
    /**
     * Reset detector
     */
    reset(): void;
    private detectInstances;
    private getContext;
    private findDominantCategory;
    private determineUnderlyingState;
    private checkDistress;
    private generateInterpretation;
    private generateApproach;
    private getProbeQuestion;
}
export declare function getSelfSoothingDetector(sessionId: string): SelfSoothingDetector;
export declare function resetSelfSoothingDetector(sessionId: string): void;
export declare function resetAllSelfSoothingDetectors(): void;
export declare function getActiveSelfSoothingCount(): number;
export default SelfSoothingDetector;
//# sourceMappingURL=self-soothing.d.ts.map