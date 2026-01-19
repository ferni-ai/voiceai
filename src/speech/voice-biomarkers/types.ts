/**
 * Voice Biomarker Pipeline Types
 *
 * Detect emotional and physical states from voice characteristics.
 * Trigger appropriate interventions based on detected states.
 *
 * @module @ferni/speech/voice-biomarkers/types
 */

// ============================================================================
// BIOMARKER TYPES
// ============================================================================

/**
 * Types of voice biomarkers we can detect
 */
export type BiomarkerType =
  | 'stress'
  | 'fatigue'
  | 'anxiety'
  | 'sadness'
  | 'excitement'
  | 'calm'
  | 'pain'
  | 'cognitive-load';

/**
 * A detected biomarker
 */
export interface DetectedBiomarker {
  /** Type of biomarker */
  type: BiomarkerType;

  /** Confidence (0-1) */
  confidence: number;

  /** Intensity (0-1) */
  intensity: number;

  /** Voice features that led to detection */
  features: VoiceFeatures;

  /** Timestamp */
  detectedAt: Date;
}

/**
 * Voice features used for biomarker detection
 */
export interface VoiceFeatures {
  /** Speaking rate (words per minute) */
  speakingRate?: number;

  /** Average pitch (Hz) */
  pitchMean?: number;

  /** Pitch variability */
  pitchVariance?: number;

  /** Voice energy/loudness */
  energy?: number;

  /** Jitter (pitch irregularity) */
  jitter?: number;

  /** Shimmer (amplitude irregularity) */
  shimmer?: number;

  /** Pause frequency */
  pauseFrequency?: number;

  /** Breath quality */
  breathQuality?: 'normal' | 'shallow' | 'deep' | 'labored';
}

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Overall voice state assessment
 */
export interface VoiceState {
  /** Primary detected state */
  primary: BiomarkerType | 'neutral';

  /** All detected biomarkers */
  biomarkers: DetectedBiomarker[];

  /** Overall stress level (0-1) */
  stressLevel: number;

  /** Overall energy level (0-1) */
  energyLevel: number;

  /** Recommended pacing */
  recommendedPacing: 'slower' | 'normal' | 'matched';

  /** Assessment timestamp */
  assessedAt: Date;
}

// ============================================================================
// INTERVENTION TYPES
// ============================================================================

/**
 * Intervention based on voice state
 */
export interface VoiceIntervention {
  /** Type of intervention */
  type:
    | 'slow-pace'
    | 'breathing-exercise'
    | 'grounding'
    | 'energy-boost'
    | 'gentle-check-in'
    | 'celebration'
    | 'none';

  /** Why this intervention */
  reason: string;

  /** Suggested script/phrase */
  script?: string;

  /** Urgency level */
  urgency: 'immediate' | 'soon' | 'when-natural';

  /** Confidence in recommendation */
  confidence: number;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Voice Biomarker Pipeline
 */
export interface IVoiceBiomarkerPipeline {
  /**
   * Analyze voice features and detect biomarkers
   */
  analyze(features: VoiceFeatures): Promise<VoiceState>;

  /**
   * Get intervention recommendation based on state
   */
  getIntervention(state: VoiceState): VoiceIntervention;

  /**
   * Record that an intervention was delivered
   */
  recordIntervention(
    userId: string,
    intervention: VoiceIntervention,
    wasEffective: boolean
  ): Promise<void>;

  /**
   * Get voice state history for user
   */
  getStateHistory(userId: string, limit?: number): Promise<VoiceState[]>;

  /**
   * Build context injection for LLM
   */
  buildContextInjection(state: VoiceState): string;

  /**
   * Reset
   */
  reset(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

export const VoiceBiomarkerPipelineToken = Symbol('VoiceBiomarkerPipeline');
