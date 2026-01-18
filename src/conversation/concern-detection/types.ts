/**
 * Concern Detection Type Definitions
 *
 * Types for the superhuman concern detection system.
 *
 * @module @ferni/conversation/concern-detection/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';

export type ConcernType =
  | 'anxiety'
  | 'sadness'
  | 'overwhelm'
  | 'frustration'
  | 'loneliness'
  | 'fear'
  | 'exhaustion'
  | 'self_doubt'
  | 'hopelessness'
  | 'crisis';

export interface ConcernSignal {
  /** Source of the signal */
  source: 'linguistic' | 'behavioral' | 'prosody' | 'breathing' | 'temporal' | 'combined';

  /** Type of concern detected */
  type: ConcernType;

  /** Confidence (0-1) */
  confidence: number;

  /** Specific indicator that triggered this */
  indicator: string;

  /** When detected */
  timestamp: number;
}

export interface ConcernState {
  /** Current overall concern level */
  level: ConcernLevel;

  /** Numeric score (0-1) */
  score: number;

  /** Primary concern type */
  primaryConcern: ConcernType | null;

  /** All active signals */
  activeSignals: ConcernSignal[];

  /** Is concern escalating? */
  escalating: boolean;

  /** Recommended response approach */
  recommendedApproach: ConcernApproach;

  /** Specific guidance for response */
  responseGuidance: string;
}

export type ConcernApproach =
  | 'normal' // No special handling
  | 'gentle_presence' // Be present, don't probe
  | 'validate_first' // Acknowledge before anything
  | 'slow_down' // Reduce pace and energy
  | 'check_in' // Gently ask how they're doing
  | 'hold_space' // Pure presence, minimal words
  | 'safety_check'; // Crisis protocol

// ============================================================================
// INPUT SIGNAL TYPES
// ============================================================================

export interface ProsodySignals {
  /** Voice strain indicator (0-1) */
  strain: number;

  /** Pitch instability (0-1) */
  pitchInstability: number;

  /** Speech rate deviation from baseline */
  speechRateDeviation: number;

  /** Pause pattern irregularity */
  pauseIrregularity: number;

  /** Tremor detected */
  tremor: boolean;

  /** Energy level (0-1) */
  energy: number;
}

export interface BreathingSignals {
  /** Breaths per minute (normal: 12-20) */
  breathsPerMinute: number;

  /** Is breathing shallow? */
  shallow: boolean;

  /** Held breath detected */
  heldBreath: boolean;

  /** Sighing frequency */
  sighFrequency: number;
}

export interface TemporalContext {
  /** Current hour (0-23) */
  hour: number;

  /** Day of week (0-6, Sunday=0) */
  dayOfWeek: number;

  /** Is this late night (11pm-4am)? */
  isLateNight: boolean;

  /** Historical vulnerability patterns for this time */
  historicalVulnerability?: number;
}

// ============================================================================
// ANALYSIS CONTEXT
// ============================================================================

export interface AnalysisContext {
  turnCount: number;
  userEmotion?: string;
  engagementLevel?: number;
  responseLatencyMs?: number;
  prosody?: ProsodySignals;
  breathing?: BreathingSignals;
  temporal?: TemporalContext;
  previousTopics?: string[];
  currentTopic?: string;
}

// ============================================================================
// USER BASELINE
// ============================================================================

export interface UserBaseline {
  avgResponseLength: number;
  avgEngagement: number;
  avgEnergy: number;
  normalSpeechRate: number;
  /** Natural speech intensity (0-1). High values (>0.7) mean user naturally speaks intensely. */
  speechIntensity?: number;
  /** Whether user tends to mask/understate concerns (learned over time) */
  tendToMaskConcerns?: boolean;
}

export const DEFAULT_USER_BASELINE: UserBaseline = {
  avgResponseLength: 50,
  avgEngagement: 0.6,
  avgEnergy: 0.5,
  normalSpeechRate: 1.0,
  speechIntensity: 0.5,
  tendToMaskConcerns: false,
};
