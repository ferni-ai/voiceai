/**
 * Breath Pattern Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects breath patterns that reveal emotional state:
 * - Sighs often precede disclosure or indicate resignation
 * - Held breath = bracing for something difficult
 * - Deep breath = gathering courage
 * - Shaky breath = held-back tears or anxiety
 * - Release breath = letting go, relief
 *
 * Humans unconsciously notice these patterns. This module gives Ferni
 * that same subtle awareness.
 *
 * Uses Rust-accelerated functions when available via @ferni/audio module
 * for 10-20x speedup on CPU-intensive operations (RMS, ZCR).
 *
 * @module BreathDetection
 */
/** Check if Rust acceleration is available for breath detection */
export declare function isNativeBreathDetectionAvailable(): boolean;
export type BreathType = 'sigh' | 'held' | 'deep' | 'shaky' | 'release' | 'gasp' | 'normal';
export interface BreathEvent {
    /** Type of breath detected */
    type: BreathType;
    /** Duration of the breath event (ms) */
    durationMs: number;
    /** Position in audio (0-1) */
    position: number;
    /** Does this precede speech? */
    precedesSpeech: boolean;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** What this might indicate emotionally */
    emotionalIndicator: string;
}
export interface BreathPatternResult {
    /** Breath events detected in this audio */
    events: BreathEvent[];
    /** Dominant breath pattern */
    dominantPattern: BreathType;
    /** Overall breathing quality */
    breathingQuality: 'calm' | 'shallow' | 'labored' | 'irregular' | 'controlled';
    /** Emotional interpretation */
    emotionalState: string;
    /** Should agent slow down/give space? */
    needsSpace: boolean;
    /** Agent guidance */
    guidance: string;
    /** Confidence in overall analysis (0-1) */
    confidence: number;
}
export interface BreathCharacteristics {
    /** Average breath-to-speech ratio */
    breathSpeechRatio: number;
    /** Frequency of breaths per minute */
    breathsPerMinute: number;
    /** Variability in breath timing */
    variability: 'consistent' | 'variable' | 'erratic';
}
/**
 * Breath detection configuration constants.
 * These can be tuned for different audio environments or sensitivity needs.
 */
export declare const BREATH_DETECTION_CONFIG: {
    /** Window size in seconds for audio analysis */
    readonly WINDOW_SIZE_SEC: 0.05;
    /** Minimum features needed for analysis */
    readonly MIN_FEATURES: 5;
    /** Maximum history events to keep */
    readonly MAX_HISTORY: 30;
    /** Energy ratio threshold for sigh detection (current vs previous) */
    readonly SIGH_ENERGY_RATIO_PREV: 0.8;
    /** Energy ratio threshold for sigh detection (current vs next) */
    readonly SIGH_ENERGY_RATIO_NEXT: 1.5;
    /** Maximum spectral centroid for sigh (Hz) */
    readonly SIGH_MAX_CENTROID: 800;
    /** Confidence for sigh detection */
    readonly SIGH_CONFIDENCE: 0.6;
    /** Energy ratio threshold for gasp (current vs previous) */
    readonly GASP_ENERGY_RATIO_PREV: 2;
    /** Energy ratio threshold for gasp (current vs next) */
    readonly GASP_ENERGY_RATIO_NEXT: 1.5;
    /** Minimum spectral centroid for gasp (Hz) */
    readonly GASP_MIN_CENTROID: 500;
    /** Confidence for gasp detection */
    readonly GASP_CONFIDENCE: 0.5;
    /** Maximum energy for held breath detection */
    readonly HELD_MAX_ENERGY: 0.01;
    /** Minimum surrounding energy for held breath */
    readonly HELD_MIN_SURROUNDING: 0.05;
    /** Confidence for held breath detection */
    readonly HELD_CONFIDENCE: 0.55;
    /** Minimum peak energy for deep breath */
    readonly DEEP_MIN_PEAK: 0.1;
    /** Bell curve edge ratio (edge energy < peak * ratio) */
    readonly DEEP_BELL_RATIO: 0.5;
    /** Confidence for deep breath detection */
    readonly DEEP_CONFIDENCE: 0.5;
    /** CV threshold for consistent breathing */
    readonly VARIABILITY_CONSISTENT: 0.3;
    /** CV threshold for variable breathing */
    readonly VARIABILITY_VARIABLE: 0.6;
};
export declare class BreathDetector {
    private history;
    private readonly maxHistory;
    constructor();
    /**
     * Detect breath patterns from audio samples
     */
    analyzeAudio(samples: Float32Array, sampleRate: number): BreathPatternResult;
    /**
     * Get breath characteristics over recent history
     */
    getBreathCharacteristics(): BreathCharacteristics;
    /**
     * Check if a significant breath preceded the current speech
     */
    checkPreSpeechBreath(): BreathEvent | null;
    /**
     * Reset detector
     */
    reset(): void;
    private detectBreathEvents;
    private getDominantPattern;
    private assessBreathingQuality;
    private interpretEmotionalState;
    private determineNeedsSpace;
    private generateGuidance;
}
export declare function getBreathDetector(sessionId: string): BreathDetector;
export declare function resetBreathDetector(sessionId: string): void;
export declare function resetAllBreathDetectors(): void;
export declare function getActiveBreathDetectorCount(): number;
export default BreathDetector;
//# sourceMappingURL=breath-detection.d.ts.map