/**
 * Cognitive Load Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when a user is mentally overloaded based on speech patterns.
 * Slower speech + longer pauses + more fillers = heavy mental processing.
 *
 * When cognitive load is high, the agent should:
 * - Use shorter sentences
 * - Give more processing time
 * - Simplify language
 * - Avoid rapid-fire questions
 *
 * Research basis:
 * - Cognitive load theory (Sweller, 1988)
 * - Speech rate decreases under cognitive load (Lively et al., 1993)
 * - Disfluency increases with processing difficulty (Clark & Fox Tree, 2002)
 *
 * @module CognitiveLoadDetection
 */
export type CognitiveLoadLevel = 'low' | 'medium' | 'high' | 'overloaded';
export interface CognitiveLoadIndicators {
    /** Speech rate decline from user's baseline (0-1, higher = slower) */
    speechRateDecline: number;
    /** Filler frequency per 100 words */
    fillerFrequency: number;
    /** Average pause duration (ms) */
    averagePauseDuration: number;
    /** Number of self-corrections ("no, wait, I mean...") */
    selfCorrections: number;
    /** Incomplete sentences or trailing off */
    incompleteUtterances: number;
    /** Response latency to agent's questions (ms) */
    responseLatency: number;
    /** Repetition of words/phrases */
    repetitionCount: number;
}
export interface CognitiveLoadState {
    /** Current cognitive load level */
    level: CognitiveLoadLevel;
    /** Raw indicators that contributed to this assessment */
    indicators: CognitiveLoadIndicators;
    /** Confidence in the assessment (0-1) */
    confidence: number;
    /** Should agent simplify their language? */
    shouldSimplify: boolean;
    /** Should agent give more processing time? */
    shouldPauseMore: boolean;
    /** Should agent break down complex topics? */
    shouldBreakDown: boolean;
    /** Guidance for the agent */
    guidance: string;
    /** SSML adjustments */
    ssmlAdjustments: {
        speedMultiplier: number;
        pauseMultiplier: number;
    };
}
export interface CognitiveLoadObservation {
    timestamp: number;
    wordCount: number;
    durationMs: number;
    fillerCount: number;
    pauseCount: number;
    totalPauseDurationMs: number;
    selfCorrectionCount: number;
    incompleteCount: number;
    repetitionCount: number;
}
export declare class CognitiveLoadDetector {
    private observations;
    private readonly maxObservations;
    private baselineWPM;
    private baselineFillerRate;
    constructor();
    /**
     * Analyze a user utterance for cognitive load indicators
     */
    analyzeUtterance(text: string, durationMs: number, pauseInfo?: {
        count: number;
        totalDurationMs: number;
    }): CognitiveLoadState;
    /**
     * Get current cognitive load state without new observation
     */
    getCurrentState(): CognitiveLoadState;
    /**
     * Record response latency (time between agent question and user response)
     */
    recordResponseLatency(latencyMs: number): void;
    private extractObservation;
    private updateBaseline;
    private computeState;
    private calculateIndicators;
    private determineLoadLevel;
    private generateGuidance;
    private getDefaultState;
    /**
     * Reset the detector (new conversation)
     */
    reset(): void;
}
export declare function getCognitiveLoadDetector(sessionId: string): CognitiveLoadDetector;
export declare function resetCognitiveLoadDetector(sessionId: string): void;
export declare function resetAllCognitiveLoadDetectors(): void;
export declare function getActiveCognitiveLoadCount(): number;
export default CognitiveLoadDetector;
//# sourceMappingURL=cognitive-load.d.ts.map