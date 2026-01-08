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
 * Standard mode - Conservative, waits for clear pauses
 *
 * HUMANIZATION FIX (Dec 2025): Reduced probabilities and increased cooldowns
 * to prevent robotic over-backchanneling. Real humans backchannel about
 * once per 10-15 seconds, not after every pause.
 *
 * TIMING FIX (Jan 2026): Further reductions based on production feedback.
 * Target: ~3-4 backchannels per minute (human parity) instead of ~6-8.
 */
export const STANDARD_TIMING: BackchannelTiming = {
  minSpeechDuration: 7000, // 7 seconds of speaking (increased from 6s)
  pauseTriggerDuration: 1500, // 1.5 second pause (increased from 1.2s)
  cooldownPeriod: 15000, // 15 seconds between backchannels (increased from 10s)
  maxPerTurn: 1, // Max 1 per turn
  baseProbability: 0.15, // 15% chance when conditions met (reduced from 35%)
  emotionalProbability: 0.25, // 25% for emotional moments (reduced from 50%)
};

/**
 * Enhanced mode - Research-backed, context-aware
 *
 * HUMANIZATION FIX (Dec 2025): More conservative settings to feel natural.
 * Even "enhanced" listening shouldn't feel like constant verbal feedback.
 *
 * TIMING FIX (Jan 2026): Significantly reduced to fix "all over the place" feel.
 * Root cause: 45% probability + 1s trigger + 8s cooldown = ~7-8 backchannels/min.
 * Target: ~3-4 backchannels/min to match human conversation patterns.
 */
export const ENHANCED_TIMING: BackchannelTiming = {
  minSpeechDuration: 5500, // 5.5 seconds of speaking (increased from 4.5s)
  pauseTriggerDuration: 2000, // 2 second pause (increased from 1s) - require longer pauses
  cooldownPeriod: 15000, // 15 seconds between backchannels (increased from 8s)
  maxPerTurn: 1, // Max 1 per turn (reduced from 2) - one backchannel per turn max
  baseProbability: 0.2, // 20% chance when conditions met (reduced from 45%)
  emotionalProbability: 0.35, // 35% for emotional moments (reduced from 60%)
};

/**
 * Live mode - Real-time during speech (breath-pause detection)
 * Soft overlays during natural breath pauses
 *
 * HUMANIZATION FIX (Dec 2025): Live mode was already more conservative,
 * but increased cooldown and reduced probability slightly for naturalness.
 *
 * TIMING FIX (Jan 2026): Increased cooldown to match other modes.
 */
export const LIVE_TIMING: BackchannelTiming = {
  minSpeechDuration: 6000, // 6 seconds into turn (increased from 5s)
  pauseTriggerDuration: 200, // Breath pauses (slightly increased from 150ms)
  cooldownPeriod: 15000, // 15 seconds between backchannels (increased from 12s)
  maxPerTurn: 1, // Max 1 per turn
  baseProbability: 0.15, // 15% chance when conditions met (reduced from 20%)
  emotionalProbability: 0.25, // 25% for emotional moments (reduced from 35%)
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
