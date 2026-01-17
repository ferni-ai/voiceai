/**
 * Speech Configuration - Centralized Constants
 *
 * Single source of truth for all speech module configuration.
 * Externalized from various modules for easier tuning and A/B testing.
 *
 * @module speech/config
 */

// ============================================================================
// BACKCHANNELING TIMING
// ============================================================================

/**
 * Backchanneling configuration - IMPORTANT: Keep in sync with timing-config.ts
 *
 * TIMING FIX (Jan 2026): Significantly reduced to fix "all over the place" feel.
 * Target: ~3-4 backchannels per minute (human parity) instead of ~6-8.
 */
export const BACKCHANNELING_CONFIG = {
  standard: {
    minSpeechDuration: 7000, // 7s before backchannel (was 5s)
    pauseTriggerDuration: 1500, // 1.5s pause required (was 1s)
    cooldownPeriod: 15000, // 15s between backchannels (was 10s)
    maxPerTurn: 1, // Max 1 per turn (was 2)
    baseProbability: 0.15, // 15% chance (was 50%)
    emotionalProbability: 0.25, // 25% for emotional (was 70%)
  },
  enhanced: {
    minSpeechDuration: 5500, // 5.5s before backchannel (was 3s)
    pauseTriggerDuration: 2000, // 2s pause required (was 800ms)
    cooldownPeriod: 15000, // 15s between backchannels (was 6s)
    maxPerTurn: 1, // Max 1 per turn (was 3)
    baseProbability: 0.2, // 20% chance (was 60%)
    emotionalProbability: 0.35, // 35% for emotional (was 80%)
  },
  live: {
    minSpeechDuration: 6000, // 6s before backchannel (was 300ms!)
    pauseTriggerDuration: 200, // 200ms breath pause
    cooldownPeriod: 15000, // 15s between backchannels (was 2s!)
    maxPerTurn: 1, // Max 1 per turn (was 5!)
    baseProbability: 0.15, // 15% chance (was 25%)
    emotionalProbability: 0.25, // 25% for emotional (was 40%)
  },
  /** Timing adjustments for heavy topics */
  heavyTopicMultiplier: {
    cooldown: 1.2, // Less aggressive multiplier (was 1.5)
    pauseTrigger: 1.2, // Less aggressive multiplier (was 1.3)
  },
  /** Timing adjustments for light topics */
  lightTopicMultiplier: {
    cooldown: 0.9, // Less reduction for light topics (was 0.8)
    pauseTrigger: 0.9, // Less reduction for light topics (was 0.8)
  },
} as const;

// ============================================================================
// TURN PREDICTION
// ============================================================================

export const TURN_PREDICTION_CONFIG = {
  /** Probability threshold to declare turn complete */
  completionThreshold: 0.7,
  /** Probability threshold to keep waiting */
  waitThreshold: 0.3,
  /** Minimum utterance duration (ms) */
  minUtteranceMs: 500,
  /** Evidence weights for turn prediction */
  weights: {
    syntactic: 0.25,
    prosodic: 0.3,
    semantic: 0.2,
    pragmatic: 0.25,
  },
  /** Pitch fall detection */
  pitchFall: {
    minRatioForComplete: 0.75,
    sustainedMs: 200,
  },
} as const;

// ============================================================================
// EMOTION DETECTION
// ============================================================================

export const EMOTION_DETECTION_CONFIG = {
  /** Minimum confidence to report emotion */
  minConfidence: 0.5,
  /** High confidence threshold */
  highConfidence: 0.7,
  /** Stress detection threshold */
  stressThreshold: 0.6,
  /** VAD emotion mapping weights */
  vadWeights: {
    pitchVariance: 0.3,
    energyVariance: 0.25,
    speechRate: 0.2,
    pausePatterns: 0.25,
  },
} as const;

// ============================================================================
// VOICE HUMANIZATION
// ============================================================================

export const HUMANIZATION_CONFIG = {
  /** Natural filler injection */
  fillers: {
    /** Base probability of filler at injection point */
    probability: 0.12,
    /** Maximum fillers per response */
    maxPerResponse: 2,
    /** Types with weights */
    types: {
      um: 0.3,
      uh: 0.25,
      well: 0.2,
      like: 0.15,
      youKnow: 0.1,
    },
  },
  /** Breath group pauses (ms) */
  breathPauses: {
    short: 120,
    medium: 220,
    long: 350,
  },
  /** Speed ratios for rhythm variation */
  speedRatios: {
    normal: 1.0,
    important: 0.92,
    questions: 0.95,
    emotional: 0.9,
    listsExamples: 1.05,
    conclusions: 0.93,
  },
} as const;

// ============================================================================
// FFT ANALYSIS
// ============================================================================

export const FFT_CONFIG = {
  /** FFT window size (must be power of 2) */
  bufferSize: 1024,
  /** Default sample rate */
  sampleRate: 16000,
  /** Frames for activity detection */
  fluxHistory: 10,
  /** Frequency bands (Hz) */
  bands: {
    subBass: [20, 60],
    bass: [60, 250],
    lowMid: [250, 500],
    mid: [500, 2000],
    highMid: [2000, 4000],
    presence: [4000, 6000],
    brilliance: [6000, 20000],
  } as Record<string, [number, number]>,
  /** Environment classification thresholds */
  environmentThresholds: {
    speech: 0.5,
    music: 0.4,
    quiet: 0.3,
  },
} as const;

// ============================================================================
// BREATH DETECTION
// ============================================================================

export const BREATH_DETECTION_CONFIG = {
  /** Sigh detection confidence */
  sighConfidence: 0.6,
  /** Gasp minimum spectral centroid (Hz) */
  gaspMinCentroid: 500,
  /** Held breath minimum silence (ms) */
  heldBreathMinSilence: 2000,
  /** Deep breath energy threshold */
  deepBreathEnergyThreshold: 0.4,
} as const;

// ============================================================================
// ANTICIPATION
// ============================================================================

export const ANTICIPATION_CONFIG = {
  /** Minimum transcript length to start anticipating */
  minTranscriptLength: 10,
  /** Throttle interval (ms) */
  updateIntervalMs: 100,
  /** Confidence threshold for caching */
  cacheConfidenceThreshold: 0.7,
  /** Intent confidence threshold */
  intentConfidenceThreshold: 0.5,
} as const;

// ============================================================================
// ADAPTIVE MODE (for BackchannelEngine)
// ============================================================================

export const ADAPTIVE_MODE_CONFIG = {
  /** Switch to live mode for high emotional intensity */
  useLineForEmotional: true,
  /** Emotional threshold for live mode (0-1) */
  emotionalThreshold: 0.6,
  /** Switch to enhanced for heavy topics */
  useEnhancedForHeavy: true,
  /** Use standard for early conversation */
  useStandardForEarly: true,
  /** Turn threshold for "early" conversation */
  earlyTurnThreshold: 3,
} as const;

// ============================================================================
// LATENCY TARGETS
// ============================================================================

export const LATENCY_TARGETS_MS = {
  humanListeningFull: 100,
  humanListeningQuick: 10,
  dynamicSpeedCalc: 1,
  phraseBoundary: 0.5,
  fftAnalysis: 5,
  sessionCleanup: 50,
} as const;

// ============================================================================
// FEEDBACK COORDINATION
// ============================================================================

/**
 * Feedback coordination config
 * TIMING FIX (Jan 2026): Reduced to prevent "all over the place" feel
 */
export const FEEDBACK_COORDINATION_CONFIG = {
  /** Maximum feedback events per turn - reduced from 3 to 2 */
  maxFeedbackPerTurn: 2,
  /** Cooldown between feedback of same type (ms) - increased from 5s to 10s */
  sameFeedbackCooldownMs: 10000,
  /** Probability of any single feedback - reduced from 0.3 to 0.15 */
  baseFeedbackProbability: 0.15,
  /** Feedback types with priority (higher = more important) */
  feedbackPriority: {
    backchannel: 1,
    acknowledgmentPrefix: 2,
    laughter: 3,
    catchphrase: 1,
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type BackchannelMode = 'standard' | 'enhanced' | 'live' | 'adaptive';
export type TopicWeight = 'light' | 'medium' | 'heavy';
export type EmotionType = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'supportive';

// ============================================================================
// CONFIG HELPERS
// ============================================================================

/**
 * Get backchanneling config for a specific mode
 */
export function getBackchannelConfig(mode: BackchannelMode) {
  if (mode === 'adaptive') {
    return BACKCHANNELING_CONFIG.enhanced; // Default base for adaptive
  }
  return BACKCHANNELING_CONFIG[mode];
}

/**
 * Adjust timing for topic weight
 */
export function adjustTimingForTopicWeight(
  baseConfig: typeof BACKCHANNELING_CONFIG.standard,
  topicWeight: TopicWeight
) {
  if (topicWeight === 'heavy') {
    return {
      ...baseConfig,
      cooldownPeriod:
        baseConfig.cooldownPeriod * BACKCHANNELING_CONFIG.heavyTopicMultiplier.cooldown,
      pauseTriggerDuration:
        baseConfig.pauseTriggerDuration * BACKCHANNELING_CONFIG.heavyTopicMultiplier.pauseTrigger,
    };
  }
  if (topicWeight === 'light') {
    return {
      ...baseConfig,
      cooldownPeriod:
        baseConfig.cooldownPeriod * BACKCHANNELING_CONFIG.lightTopicMultiplier.cooldown,
      pauseTriggerDuration:
        baseConfig.pauseTriggerDuration * BACKCHANNELING_CONFIG.lightTopicMultiplier.pauseTrigger,
    };
  }
  return baseConfig;
}
