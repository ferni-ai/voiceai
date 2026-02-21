/**
 * Centralized emotion, concern, and biomarker thresholds.
 *
 * Single source of truth for all distress/concern/stress/confidence tiers
 * used across emotion-event-dispatcher, concern-detection-pipeline,
 * turn-handler, audio-processor, voice-biomarkers, and context builders.
 *
 * @see docs/plans/BEYOND-NARROW-BTH-PLAN.md
 */

// ============================================================================
// CONCERN / DISTRESS TIERS
// ============================================================================

export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';

/** Distress thresholds for concern level mapping (0-1 scale) */
export const EMOTION_THRESHOLDS = {
  /** Crisis: immediate safety/support focus */
  crisis: { distress: 0.9, concern: 0.85 },
  /** Elevated: user struggling, slow down and validate */
  elevated: { distress: 0.7, concern: 0.6 },
  /** Moderate: user going through something, gentle check-in */
  moderate: { distress: 0.5, concern: 0.4 },
  /** Mild: may be stressed, supportive without overreacting */
  baseline: { distress: 0.3, concern: 0.2 },
} as const;

/** Map distress level (0-1) to concern level */
export function getConcernLevelFromDistress(distressLevel: number): ConcernLevel {
  if (distressLevel >= EMOTION_THRESHOLDS.crisis.distress) return 'crisis';
  if (distressLevel >= EMOTION_THRESHOLDS.elevated.distress) return 'elevated';
  if (distressLevel >= EMOTION_THRESHOLDS.moderate.distress) return 'moderate';
  if (distressLevel >= EMOTION_THRESHOLDS.baseline.distress) return 'mild';
  return 'none';
}

/** Minimum distress to consider concern at all */
export const CONCERN_MIN_DISTRESS = EMOTION_THRESHOLDS.baseline.distress;

// ============================================================================
// BIOMARKER DETECTION
// ============================================================================

/** Minimum confidence (0-1) to report a biomarker (stress, fatigue, anxiety, etc.) */
export const BIOMARKER_MIN_CONFIDENCE = 0.5;

/** Stress level above which to recommend slower pacing */
export const BIOMARKER_STRESS_SLOW_PACING = 0.7;

/** Confidence above which to trigger high-stress intervention (e.g. breathing) */
export const BIOMARKER_INTERVENTION_HIGH_STRESS = 0.7;

/** Confidence above which to trigger fatigue/sadness/excitement interventions */
export const BIOMARKER_INTERVENTION_MODERATE = 0.6;

/** Stress level above which to recommend slow-pace intervention */
export const BIOMARKER_STRESS_MODERATE = 0.5;

// ============================================================================
// EMOTION DISPATCH / MISMATCH
// ============================================================================

/** Minimum mismatch confidence to dispatch voice-state signal */
export const MISMATCH_MIN_CONFIDENCE = 0.5;

/** Intensity above which to treat trajectory "improving" as high engagement */
export const TRAJECTORY_IMPROVING_HIGH = 0.6;

/** Intensity above which to treat trajectory "declining" as concern */
export const TRAJECTORY_DECLINING_CONCERN = 0.5;

/** Intensity above which to treat "excited" as high engagement */
export const EXCITEMENT_HIGH_INTENSITY = 0.7;

/** Default expression intensity when not specified */
export const DEFAULT_EXPRESSION_INTENSITY = 0.7;

/** Micro-expression default intensities */
export const MICRO_EXPRESSION_INTENSITIES = {
  warmthPulse: 0.75,
  insider: 0.75,
  noticing: 0.9,
  steadyPresence: 0.6,
  protective: 0.8,
  default: 0.7,
} as const;

// ============================================================================
// TURN HANDLER / FILLER / TIMING
// ============================================================================

/** Stress above which user "needs space" (longer filler delay) */
export const STRESS_NEEDS_SPACE = 0.6;

/** Distress above which to treat as negative sentiment */
export const DISTRESS_NEGATIVE_SENTIMENT = 0.5;

/** Distress above which to consider vulnerability/philosophical check-in */
export const DISTRESS_VULNERABILITY_CHECK = 0.3;

/** Distress above which to use negative valence in arc */
export const DISTRESS_VALENCE_NEGATIVE = 0.5;

/** Confidence above which to use emotion in filler selection */
export const FILLER_EMOTION_MIN_CONFIDENCE = 0.5;

/** Delight detection confidence above which to dispatch */
export const DELIGHT_MIN_CONFIDENCE = 0.7;

/** Anticipatory distress boost threshold for elevating concern */
export const ANTICIPATORY_DISTRESS_BOOST = 0.3;

/** Boosted score above which to trigger steady presence */
export const SOMATIC_STEADY_PRESENCE_THRESHOLD = 0.6;

/** Intensity above which to consider "high" user energy (injection-builders) */
export const ENERGY_HIGH_INTENSITY = 0.7;

/** Intensity below which to consider "low" user energy */
export const ENERGY_LOW_INTENSITY = 0.3;

/** Intensity threshold for "strong" vs "moderate" emotion description */
export const EMOTION_STRONG_INTENSITY = 0.7;

/** Distress or intensity above which to mark "deep moment" (session dynamics) */
export const DEEP_MOMENT_DISTRESS = 0.6;
export const DEEP_MOMENT_INTENSITY = 0.8;

/** Mismatch confidence above which to treat as emotional_mismatch signal */
export const EMOTIONAL_MISMATCH_CONFIDENCE = 0.7;

// ============================================================================
// EMOTION-TO-CONCERN TYPE MAPPING
// ============================================================================

export const EMOTION_TO_CONCERN_TYPE: Record<string, string> = {
  sad: 'sadness',
  anxious: 'anxiety',
  stressed: 'stress',
  overwhelmed: 'overwhelm',
  frustrated: 'frustration',
  angry: 'anger',
  fearful: 'fear',
  lonely: 'loneliness',
  grieving: 'grief',
  scared: 'fear',
  ashamed: 'shame',
  exhausted: 'fatigue',
};

/** Concern-type intensity defaults for holistic fallback */
export const CONCERN_EMOTION_INTENSITIES: Record<string, number> = {
  stressed: 0.6,
  anxious: 0.7,
  overwhelmed: 0.8,
  sad: 0.6,
  grieving: 0.7,
  scared: 0.7,
  ashamed: 0.5,
  exhausted: 0.6,
};
