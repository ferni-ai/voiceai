/**
 * Voice Print Learning
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learn each user's unique vocal characteristics to detect subtle changes
 * they might not notice themselves. This enables truly personalized
 * emotional awareness—detecting when someone sounds "off" compared to
 * their personal baseline.
 *
 * **What we learn:**
 * - Baseline pitch, tempo, energy
 * - Emotional signatures (how their voice changes with emotions)
 * - Temporal patterns (morning voice vs evening)
 * - Speaking cadence and rhythm
 *
 * **What we detect:**
 * - Deviations from baseline (tired, stressed, excited)
 * - Session-to-session changes
 * - Gradual trends over time
 *
 * @module @ferni/humanization/voice-print
 */
export interface VoiceBaseline {
    /** Average pitch in Hz */
    avgPitchHz: number;
    /** Pitch range [min, max] in Hz */
    pitchRangeHz: [number, number];
    /** Pitch variability (standard deviation) */
    pitchVariability: number;
    /** Average words per minute */
    avgWordsPerMinute: number;
    /** Pause frequency (pauses per minute) */
    pauseFrequency: number;
    /** Average pause duration in ms */
    avgPauseDuration: number;
    /** Average energy level (0-1) */
    avgEnergy: number;
    /** Energy variability */
    energyVariability: number;
    /** Voice quality metrics */
    breathiness: number;
    roughness: number;
    strain: number;
}
export interface VoiceDeviation {
    /** Hz change from baseline */
    pitchShift: number;
    /** WPM change */
    tempoChange: number;
    /** Energy change */
    energyChange: number;
    /** Quality changes */
    qualityChanges: {
        breathiness?: number;
        roughness?: number;
        strain?: number;
    };
    /** Confidence in this deviation measurement */
    confidence: number;
}
export interface EmotionalSignature {
    emotion: string;
    deviation: VoiceDeviation;
    sampleCount: number;
    confidence: number;
}
export interface VoicePrint {
    userId: string;
    /** Baseline characteristics */
    baseline: VoiceBaseline;
    /** Emotional signatures */
    emotionalSignatures: Map<string, EmotionalSignature>;
    /** Temporal patterns */
    temporalPatterns: {
        morningVoice?: Partial<VoiceBaseline>;
        eveningVoice?: Partial<VoiceBaseline>;
        weekdayVoice?: Partial<VoiceBaseline>;
        weekendVoice?: Partial<VoiceBaseline>;
    };
    /** Learning metadata */
    sampleCount: number;
    confidenceLevel: number;
    lastUpdated: Date;
    createdAt: Date;
}
export interface VoiceSnapshot {
    /** Pitch metrics */
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchVariance: number;
    /** Tempo metrics */
    speechRate: number;
    pauseRate: number;
    avgPauseDuration: number;
    /** Energy metrics */
    energyMean: number;
    energyVariance: number;
    /** Quality metrics */
    breathiness: number;
    roughness: number;
    strain: number;
    /** Derived */
    valence: number;
    arousal: number;
    timestamp: Date;
}
export interface VoiceStateDetection {
    /** Current emotional state assessment */
    currentState: {
        emotion: string;
        confidence: number;
        deviationFromBaseline: number;
    };
    /** Comparisons */
    vsBaseline: {
        pitchDeviation: number;
        tempoDeviation: number;
        energyDeviation: number;
    };
    /** Insights */
    insights: string[];
    /** Suggested acknowledgments */
    suggestedAcknowledgments: string[];
}
export declare class VoicePrintEngine {
    private voicePrint;
    private sessionSnapshots;
    private sessionStartSnapshot;
    constructor(userId: string, existingPrint?: VoicePrint);
    /**
     * Record a voice snapshot and update the print
     */
    recordSnapshot(snapshot: VoiceSnapshot): void;
    /**
     * Detect current voice state compared to baseline
     */
    detectState(currentSnapshot: VoiceSnapshot): VoiceStateDetection;
    /**
     * Compare current voice to session start
     */
    compareToSessionStart(currentSnapshot: VoiceSnapshot): {
        energyChange: number;
        moodChange: number;
        insight: string | null;
    };
    /**
     * Get the voice print for persistence
     */
    getVoicePrint(): VoicePrint;
    /**
     * Check if we have enough data for reliable detection
     */
    isCalibrated(): boolean;
    /**
     * Get calibration progress
     */
    getCalibrationProgress(): number;
    /**
     * Reset session data (keep voice print)
     */
    resetSession(): void;
    /**
     * Get serializable version for storage
     */
    serialize(): string;
    /**
     * Load from serialized data
     */
    static deserialize(data: string): VoicePrint;
    private createInitialPrint;
    private updateBaseline;
    private learnEmotionalSignature;
    private deriveEmotionFromSnapshot;
    private matchEmotionalSignature;
    private calculateSignatureMatch;
    private generateInsights;
    private generateAcknowledgments;
    private updateConfidence;
    private calculateVariance;
}
export declare function getVoicePrintEngine(userId: string, existingPrint?: VoicePrint): VoicePrintEngine;
export declare function resetVoicePrintEngine(userId: string): void;
export declare function resetAllVoicePrintEngines(): void;
export default VoicePrintEngine;
//# sourceMappingURL=voice-print.d.ts.map