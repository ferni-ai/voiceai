/**
 * EQ State - Index
 *
 * Exports emotion state management modules.
 *
 * @module @ferni/eq/state
 */

// Core emotion machine (re-exports from emotion-state.ts)
export {
  emotionState,
  setEmotion,
  transitionEmotion,
  flashEmotion,
  getCurrentEmotion,
  subscribeToEmotion,
  EMOTIONS,
  type EmotionId,
  type EmotionColor,
  type BreathingParams,
  type MovementParams,
  type WaveformParams,
  type QuirkParams,
  type EmotionState,
  type TransitionOptions,
} from './emotion-machine.js';

// Emotion groups
export {
  EMOTION_GROUPS,
  type EmotionGroupId,
  getEmotionGroup,
  areEmotionsInSameGroup,
  getEmotionsInGroup,
  getRandomEmotionFromGroup,
  getNextEmotionInGroup,
} from './emotion-groups.js';

// Interpolation
export {
  interpolateEmotions,
  getTransitionDuration,
  getTransitionEasing,
  createTransitionSequence,
} from './emotion-interpolator.js';
