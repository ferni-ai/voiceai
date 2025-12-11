/**
 * Backchanneling Timing Configurations
 *
 * All timing constants consolidated in one place.
 *
 * @module backchanneling/timing-config
 */

import type { BackchannelMode, BackchannelTiming, BreathPauseConfig } from './types.js';

// ============================================================================
// MODE-SPECIFIC TIMING
// ============================================================================

/**
 * Standard mode - Original implementation (5-8 second triggers)
 * More conservative, waits for clear pauses
 */
export const STANDARD_TIMING: BackchannelTiming = {
  minSpeechDuration: 5000, // 5 seconds of speaking
  pauseTriggerDuration: 1000, // 1 second pause
  cooldownPeriod: 5000, // 5 seconds between backchannels
  maxPerTurn: 2,
  baseProbability: 1.0, // Always backchannel when conditions met
  emotionalProbability: 1.0,
};

/**
 * Enhanced mode - Research-backed (3-5 second triggers)
 * More responsive, context-aware
 */
export const ENHANCED_TIMING: BackchannelTiming = {
  minSpeechDuration: 3000, // 3 seconds of speaking
  pauseTriggerDuration: 800, // 800ms pause triggers
  cooldownPeriod: 4000, // 4 seconds between backchannels
  maxPerTurn: 3,
  baseProbability: 1.0,
  emotionalProbability: 1.0,
};

/**
 * Live mode - Real-time during speech (breath-pause detection)
 * Soft overlays during natural breath pauses
 */
export const LIVE_TIMING: BackchannelTiming = {
  minSpeechDuration: 4000, // 4 seconds into turn
  pauseTriggerDuration: 100, // Breath pauses are short (100-400ms)
  cooldownPeriod: 8000, // 8 seconds between backchannels
  maxPerTurn: 2,
  baseProbability: 0.25, // Only 25% chance when conditions met
  emotionalProbability: 0.4, // 40% for emotional moments
};

// ============================================================================
// TOPIC-ADJUSTED TIMING
// ============================================================================

/**
 * Heavy topic timing - More space for emotional content
 */
export const HEAVY_TOPIC_ADJUSTMENT: Partial<BackchannelTiming> = {
  minSpeechDuration: 1000, // Add 1s to min
  pauseTriggerDuration: 400, // Add 400ms to trigger
  cooldownPeriod: 1000, // Add 1s to cooldown
  maxPerTurn: -1, // Reduce max by 1
};

/**
 * Light topic timing - More responsive
 */
export const LIGHT_TOPIC_ADJUSTMENT: Partial<BackchannelTiming> = {
  minSpeechDuration: -500, // Reduce by 500ms
  pauseTriggerDuration: -200, // Reduce trigger by 200ms
  cooldownPeriod: -500, // Reduce cooldown by 500ms
  maxPerTurn: 1, // Increase max by 1
};

// ============================================================================
// BREATH PAUSE CONFIGURATION
// ============================================================================

/**
 * Default breath pause detection configuration
 */
export const DEFAULT_BREATH_PAUSE_CONFIG: BreathPauseConfig = {
  silenceThreshold: 0.02,
  speechThreshold: 0.05,
  pauseConfirmationFrames: 3,
  speechConfirmationFrames: 2,
  energySmoothing: 0.7,
  minSpeakingTime: 1000,
  breathPauseMaxDuration: 400,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get timing configuration for a mode
 */
export function getTimingForMode(mode: BackchannelMode): BackchannelTiming {
  switch (mode) {
    case 'standard':
      return { ...STANDARD_TIMING };
    case 'enhanced':
      return { ...ENHANCED_TIMING };
    case 'live':
      return { ...LIVE_TIMING };
    default:
      return { ...ENHANCED_TIMING };
  }
}

/**
 * Adjust timing based on topic weight
 */
export function adjustTimingForTopic(
  baseTiming: BackchannelTiming,
  topicWeight: 'light' | 'medium' | 'heavy'
): BackchannelTiming {
  const timing = { ...baseTiming };

  if (topicWeight === 'heavy') {
    timing.minSpeechDuration += HEAVY_TOPIC_ADJUSTMENT.minSpeechDuration ?? 0;
    timing.pauseTriggerDuration += HEAVY_TOPIC_ADJUSTMENT.pauseTriggerDuration ?? 0;
    timing.cooldownPeriod += HEAVY_TOPIC_ADJUSTMENT.cooldownPeriod ?? 0;
    timing.maxPerTurn = Math.max(1, timing.maxPerTurn + (HEAVY_TOPIC_ADJUSTMENT.maxPerTurn ?? 0));
  } else if (topicWeight === 'light') {
    timing.minSpeechDuration = Math.max(
      1000,
      timing.minSpeechDuration + (LIGHT_TOPIC_ADJUSTMENT.minSpeechDuration ?? 0)
    );
    timing.pauseTriggerDuration = Math.max(
      200,
      timing.pauseTriggerDuration + (LIGHT_TOPIC_ADJUSTMENT.pauseTriggerDuration ?? 0)
    );
    timing.cooldownPeriod = Math.max(
      2000,
      timing.cooldownPeriod + (LIGHT_TOPIC_ADJUSTMENT.cooldownPeriod ?? 0)
    );
    timing.maxPerTurn += LIGHT_TOPIC_ADJUSTMENT.maxPerTurn ?? 0;
  }

  return timing;
}

/**
 * Merge custom timing with base timing
 */
export function mergeTimingConfig(
  base: BackchannelTiming,
  custom: Partial<BackchannelTiming>
): BackchannelTiming {
  return {
    minSpeechDuration: custom.minSpeechDuration ?? base.minSpeechDuration,
    pauseTriggerDuration: custom.pauseTriggerDuration ?? base.pauseTriggerDuration,
    cooldownPeriod: custom.cooldownPeriod ?? base.cooldownPeriod,
    maxPerTurn: custom.maxPerTurn ?? base.maxPerTurn,
    baseProbability: custom.baseProbability ?? base.baseProbability,
    emotionalProbability: custom.emotionalProbability ?? base.emotionalProbability,
  };
}
