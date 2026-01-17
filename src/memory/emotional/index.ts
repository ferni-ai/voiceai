/**
 * Emotional Memory Intelligence Module
 *
 * Phase 14: Emotional Memory Intelligence
 *
 * Provides emotional weighting, tagging, and joy amplification
 * for "Better Than Human" memory intelligence.
 *
 * @module memory/emotional
 */

// Emotional Weighting
export {
  calculateEmotionalWeight,
  calculateBatchEmotionalWeight,
  getAverageEmotionalWeight,
  findHighestEmotionalWeight,
  setEmotionalWeightConfig,
  getEmotionalWeightConfig,
  type EmotionalWeightInput,
  type EmotionalWeightResult,
  type EmotionalWeightConfig,
} from './emotional-weighting.js';

// Emotional Tagging
export {
  tagEmotionally,
  tagBatchEmotionally,
  findSimilarEmotions,
  getEmotionalTrajectory,
  type EmotionalTag,
  type EmotionalTagInput,
  type EmotionalValence,
  type PrimaryEmotion,
  type ArousalLevel,
} from './emotional-tagging.js';

// Joy Amplification
export {
  shouldAmplifyJoy,
  recordJoyMemorySurfaced,
  clearSessionSurfaceCounts,
  buildJoyMemoryPool,
  addToJoyPoolIfQualifies,
  getJoyAmplificationStats,
  setJoyAmplificationConfig,
  getJoyAmplificationConfig,
  type JoyMemory,
  type JoyMemoryPool,
  type CurrentStateInput,
  type JoyAmplificationResult,
  type JoyAmplificationConfig,
} from './joy-amplification.js';
