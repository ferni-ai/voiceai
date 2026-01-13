/**
 * Audio Prosody Types
 *
 * Type definitions for voice-based emotion detection through audio analysis.
 */
/**
 * Prosodic features extracted from audio
 */
export interface ProsodyFeatures {
    pitchMean: number;
    pitchVariance: number;
    pitchRange: number;
    pitchContour: 'rising' | 'falling' | 'flat' | 'dynamic';
    energyMean: number;
    energyVariance: number;
    energyPeaks: number;
    speechRate: number;
    pauseDuration: number;
    pauseFrequency: number;
    jitter: number;
    shimmer: number;
    breathiness: number;
    voiceQuality?: 'clear' | 'breathy' | 'strained' | 'trembling';
    utteranceDuration: number;
    speakingRatio: number;
}
/**
 * Emotion detected from voice prosody
 */
export interface VoiceEmotionResult {
    primary: VoiceEmotion;
    confidence: number;
    valence: number;
    arousal: number;
    dominance: number;
    stressLevel: number;
    anxietyMarkers: boolean;
    prosody: ProsodyFeatures;
    sampleCount: number;
    processingTimeMs: number;
}
export type VoiceEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'anxious' | 'excited' | 'bored' | 'confused' | 'contempt' | 'disgusted' | 'surprised';
/**
 * Audio buffer for analysis
 */
export interface AudioBuffer {
    samples: Float32Array;
    sampleRate: number;
    channels: number;
    timestamp: number;
}
/**
 * Emotional dimensions from Russell's circumplex model
 */
export interface EmotionalDimensions {
    valence: number;
    arousal: number;
    dominance: number;
}
/**
 * Emotion classification result
 */
export interface EmotionClassification {
    emotion: VoiceEmotion;
    confidence: number;
}
/**
 * Pitch analysis result
 */
export interface PitchAnalysis {
    mean: number;
    variance: number;
    range: number;
    contour: 'rising' | 'falling' | 'flat' | 'dynamic';
}
/**
 * Energy analysis result
 */
export interface EnergyAnalysis {
    mean: number;
    variance: number;
    peaks: number;
}
/**
 * Voice quality metrics
 */
export interface VoiceQualityMetrics {
    jitter: number;
    shimmer: number;
    breathiness: number;
}
/**
 * Pause analysis result
 */
export interface PauseAnalysis {
    avgDuration: number;
    frequency: number;
    speakingRatio: number;
}
/**
 * Metrics for prosody analysis
 */
export interface ProsodyMetrics {
    /** Total number of analyses performed */
    totalAnalyses: number;
    /** Number of analyses that successfully detected emotion */
    successfulDetections: number;
    /** Detection rate (0-1) */
    detectionRate: number;
    /** Average confidence of detections */
    averageConfidence: number;
    /** Most common detected emotion */
    dominantEmotion: VoiceEmotion | null;
}
/**
 * Internal metrics state
 */
export interface MetricsState {
    totalAnalyses: number;
    successfulDetections: number;
    confidenceSum: number;
    emotionCounts: Map<VoiceEmotion, number>;
}
//# sourceMappingURL=types.d.ts.map