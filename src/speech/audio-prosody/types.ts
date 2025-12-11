/**
 * Audio Prosody Types
 *
 * Type definitions for voice-based emotion detection through audio analysis.
 */

// ============================================================================
// PROSODY FEATURES
// ============================================================================

/**
 * Prosodic features extracted from audio
 */
export interface ProsodyFeatures {
  // Pitch features
  pitchMean: number; // Average fundamental frequency (Hz)
  pitchVariance: number; // Pitch variation (indicates emotion intensity)
  pitchRange: number; // Difference between max and min pitch
  pitchContour: 'rising' | 'falling' | 'flat' | 'dynamic';

  // Energy/Volume features
  energyMean: number; // Average volume level (dB)
  energyVariance: number; // Volume variation
  energyPeaks: number; // Number of emphasis points

  // Rhythm/Rate features
  speechRate: number; // Syllables per second
  pauseDuration: number; // Average pause length (ms)
  pauseFrequency: number; // Pauses per minute

  // Voice quality
  jitter: number; // Pitch perturbation (trembling)
  shimmer: number; // Amplitude perturbation
  breathiness: number; // Harmonic-to-noise ratio
  voiceQuality?: 'clear' | 'breathy' | 'strained' | 'trembling'; // Overall voice quality indicator

  // Timing
  utteranceDuration: number;
  speakingRatio: number; // Ratio of speaking to total time
}

// ============================================================================
// EMOTION TYPES
// ============================================================================

/**
 * Emotion detected from voice prosody
 */
export interface VoiceEmotionResult {
  // Primary emotion from voice
  primary: VoiceEmotion;
  confidence: number;

  // Emotional dimensions (Russell's circumplex model)
  valence: number; // -1 (negative) to 1 (positive)
  arousal: number; // -1 (calm) to 1 (excited)
  dominance: number; // -1 (submissive) to 1 (dominant)

  // Stress indicators
  stressLevel: number; // 0-1 scale
  anxietyMarkers: boolean; // Trembling, rapid speech, etc.

  // Raw prosody features
  prosody: ProsodyFeatures;

  // Meta
  sampleCount: number;
  processingTimeMs: number;
}

export type VoiceEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'anxious'
  | 'excited'
  | 'bored'
  | 'confused'
  | 'contempt'
  | 'disgusted'
  | 'surprised';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

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

// ============================================================================
// METRICS TYPES
// ============================================================================

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
