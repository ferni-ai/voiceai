/**
 * Volume Dynamics Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks volume changes within and across utterances.
 * Getting quieter on vulnerable topics is deeply human.
 * Getting louder often indicates passion, frustration, or emphasis.
 *
 * Humans naturally notice these volume shifts and adjust their own
 * energy accordingly. This module gives Ferni that awareness.
 *
 * @module VolumeDynamics
 */
export type VolumeTrend = 'getting_quieter' | 'getting_louder' | 'stable' | 'fluctuating';
export type VolumeLevel = 'whisper' | 'soft' | 'normal' | 'loud' | 'very_loud';
export interface VolumeObservation {
    timestamp: number;
    /** Average volume level (dB, typically -60 to 0) */
    averageDb: number;
    /** Peak volume level */
    peakDb: number;
    /** Volume at start of utterance */
    startDb: number;
    /** Volume at end of utterance */
    endDb: number;
    /** Variance in volume */
    variance: number;
    /** Associated text (for context) */
    textSnippet?: string;
}
export interface VolumeDynamicsState {
    /** User's baseline volume (learned) */
    baseline: number;
    /** Current volume relative to baseline (ratio) */
    currentRelativeVolume: number;
    /** Current volume level category */
    currentLevel: VolumeLevel;
    /** Trend within current utterance */
    withinUtteranceTrend: VolumeTrend;
    /** Trend across recent utterances */
    acrossUtterancesTrend: VolumeTrend;
    /** Is user on a sensitive topic (based on volume drop)? */
    onSensitiveTopic: boolean;
    /** Is user becoming more passionate/frustrated? */
    intensityIncreasing: boolean;
    /** Interpretation of current dynamics */
    interpretation: string;
    /** Suggested agent volume adjustment */
    suggestedAgentVolume: 'softer' | 'match' | 'normal';
    /** Confidence in assessment (0-1) */
    confidence: number;
}
export interface VolumePattern {
    /** Pattern type */
    type: 'vulnerability_drop' | 'passion_rise' | 'fade_out' | 'attention_seeking' | 'normal';
    /** How strongly this pattern is present */
    strength: number;
    /** What to notice */
    observation: string;
}
export declare class VolumeDynamicsTracker {
    private observations;
    private readonly maxObservations;
    private baseline;
    private calibrationSamples;
    constructor();
    /**
     * Record a volume observation from audio analysis
     */
    recordObservation(observation: Omit<VolumeObservation, 'timestamp'>): VolumeDynamicsState;
    /**
     * Record observation from raw audio samples
     */
    recordFromAudioSamples(samples: Float32Array, sampleRate: number, textSnippet?: string): VolumeDynamicsState;
    /**
     * Get current state without new observation
     */
    getCurrentState(): VolumeDynamicsState;
    /**
     * Detect specific volume patterns
     */
    detectPatterns(): VolumePattern[];
    /**
     * Reset tracker state
     */
    reset(): void;
    private analyzeAudioSamples;
    private updateBaseline;
    private computeState;
    private categorizeVolume;
    private determineWithinUtteranceTrend;
    private determineAcrossUtterancesTrend;
    private generateInterpretation;
    private getDefaultState;
}
export declare function getVolumeDynamicsTracker(sessionId: string): VolumeDynamicsTracker;
export declare function resetVolumeDynamicsTracker(sessionId: string): void;
export declare function resetAllVolumeDynamicsTrackers(): void;
export declare function getActiveVolumeDynamicsCount(): number;
export default VolumeDynamicsTracker;
//# sourceMappingURL=volume-dynamics.d.ts.map