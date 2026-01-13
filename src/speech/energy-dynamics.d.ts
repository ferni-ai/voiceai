/**
 * Energy Fade Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when voice energy trails off at the end of sentences.
 * This often signals:
 * - Losing confidence in what they're saying
 * - Realizing something painful mid-thought
 * - Wanting to stop but feeling obligated to continue
 * - Uncertainty about how the listener will react
 *
 * Real humans notice when someone's voice "deflates" at the end of a thought.
 * This module gives Ferni that awareness.
 *
 * Uses Rust-accelerated functions when available via @ferni/audio module
 * for 10-20x speedup on CPU-intensive operations (RMS, ZCR).
 *
 * @module EnergyDynamics
 */
/** Check if Rust acceleration is available for energy dynamics detection */
export declare function isNativeEnergyDynamicsAvailable(): boolean;
export type EnergyTrajectory = 'steady' | 'fading' | 'building' | 'fluctuating';
export type EnergyFadeReason = 'fatigue' | 'discouragement' | 'realization' | 'discomfort' | 'uncertainty' | 'sadness' | 'unknown';
export interface EnergySegment {
    /** Relative position in utterance (0-1) */
    position: number;
    /** Energy level (normalized 0-1) */
    energy: number;
    /** Speech rate in this segment */
    speechRate: number;
}
export interface EnergyFadeEvent {
    timestamp: number;
    /** How much energy dropped (0-1) */
    dropMagnitude: number;
    /** Position where fade began (0-1 through utterance) */
    fadeStartPosition: number;
    /** Text at fade point (if available) */
    textAtFade?: string;
    /** Likely reason for fade */
    likelyReason: EnergyFadeReason;
}
export interface EnergyDynamicsResult {
    /** Energy trajectory within this utterance */
    withinUtterance: EnergyTrajectory;
    /** Energy trajectory across session */
    acrossSession: 'increasing' | 'decreasing' | 'stable';
    /** Segments within the utterance */
    segments: EnergySegment[];
    /** Energy at start vs end */
    startEnergy: number;
    endEnergy: number;
    /** Did a fade occur? */
    fadeDetected: boolean;
    /** Fade details if detected */
    fadeEvent?: EnergyFadeEvent;
    /** What the fade might indicate */
    fadeIndicates: EnergyFadeReason;
    /** Interpretation */
    interpretation: string;
    /** Agent guidance */
    guidance: string;
    /** Confidence (0-1) */
    confidence: number;
}
export declare class EnergyDynamicsTracker {
    private sessionHistory;
    private fadeHistory;
    private readonly maxHistory;
    constructor();
    /**
     * Analyze energy dynamics from audio segments
     */
    analyzeFromSegments(segments: EnergySegment[], text?: string): EnergyDynamicsResult;
    /**
     * Analyze from raw audio samples
     */
    analyzeFromAudio(samples: Float32Array, sampleRate: number, text?: string): EnergyDynamicsResult;
    /**
     * Get recent fade patterns
     */
    getFadePatterns(): {
        frequency: 'rare' | 'occasional' | 'frequent';
        avgMagnitude: number;
        commonReasons: EnergyFadeReason[];
    };
    /**
     * Reset tracker
     */
    reset(): void;
    private extractSegments;
    private determineTrajectory;
    private detectFade;
    private inferFadeReason;
    private computeSessionTrend;
    private generateInterpretation;
    private generateGuidance;
    private getDefaultResult;
}
export declare function getEnergyDynamicsTracker(sessionId: string): EnergyDynamicsTracker;
export declare function resetEnergyDynamicsTracker(sessionId: string): void;
export declare function resetAllEnergyDynamicsTrackers(): void;
export declare function getActiveEnergyDynamicsCount(): number;
export default EnergyDynamicsTracker;
//# sourceMappingURL=energy-dynamics.d.ts.map