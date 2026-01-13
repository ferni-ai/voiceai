/**
 * Voice Tremor / Strain Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects voice tremor and strain that indicate:
 * - Held-back tears
 * - Suppressed emotion
 * - Nervousness or anxiety
 * - Physical or emotional strain
 *
 * When someone's voice wavers, cracks, or strains, it reveals
 * emotion that words alone don't convey. Real humans notice this.
 * This module gives Ferni that sensitivity.
 *
 * Uses Rust-accelerated functions when available via @ferni/audio module
 * for 10-50x speedup on CPU-intensive statistical operations.
 *
 * @module VoiceTremor
 */
/** Check if Rust acceleration is available for voice tremor detection */
export declare function isNativeTremorDetectionAvailable(): boolean;
export type TremorType = 'tremor' | 'strain' | 'crack' | 'quiver' | 'wobble' | 'none';
export type TremorIntensity = 'subtle' | 'noticeable' | 'pronounced';
export interface TremorEvent {
    /** Type of tremor */
    type: TremorType;
    /** Intensity */
    intensity: TremorIntensity;
    /** Position in audio (0-1) */
    position: number;
    /** Duration (ms) */
    durationMs: number;
    /** Frequency of tremor (Hz, for tremor/wobble types) */
    tremorFrequency?: number;
    /** Confidence (0-1) */
    confidence: number;
}
export interface VoiceTremorResult {
    /** Was tremor/strain detected? */
    detected: boolean;
    /** Primary type detected */
    primaryType: TremorType;
    /** Intensity level */
    intensity: TremorIntensity;
    /** All tremor events */
    events: TremorEvent[];
    /** What this likely indicates */
    emotionalIndicator: string;
    /** Is user possibly holding back tears? */
    possibleTears: boolean;
    /** Is user possibly anxious? */
    possibleAnxiety: boolean;
    /** Suggested response approach */
    suggestedResponse: string;
    /** Overall confidence (0-1) */
    confidence: number;
}
export interface VoiceStabilityProfile {
    /** Pitch stability (0-1, higher = more stable) */
    pitchStability: number;
    /** Volume stability (0-1) */
    volumeStability: number;
    /** Overall stability */
    overallStability: 'stable' | 'slightly_unstable' | 'unstable' | 'very_unstable';
    /** Trending direction */
    stabilityTrend: 'improving' | 'declining' | 'stable';
}
export declare class VoiceTremorDetector {
    private history;
    private stabilityHistory;
    private readonly maxHistory;
    constructor();
    /**
     * Analyze audio for voice tremor/strain
     */
    analyzeAudio(samples: Float32Array, sampleRate: number): VoiceTremorResult;
    /**
     * Get voice stability profile
     */
    getStabilityProfile(): VoiceStabilityProfile;
    /**
     * Reset detector
     */
    reset(): void;
    private detectTremorEvents;
    private countOscillations;
    private aggregateEvents;
    private detectPossibleTears;
    private detectPossibleAnxiety;
    private interpretEmotionalState;
    private generateResponse;
}
export declare function getVoiceTremorDetector(sessionId: string): VoiceTremorDetector;
export declare function resetVoiceTremorDetector(sessionId: string): void;
export declare function resetAllVoiceTremorDetectors(): void;
export declare function getActiveVoiceTremorCount(): number;
export default VoiceTremorDetector;
//# sourceMappingURL=voice-tremor.d.ts.map