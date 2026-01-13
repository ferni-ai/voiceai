/**
 * Emotion State Machine
 *
 * Central emotion management for Ferni's character-level animation system.
 * All visual feedback (avatar, ring, glow, waveform) reacts to this state.
 *
 * BRAND PHILOSOPHY:
 * - Warm, not saccharine
 * - Present, not flashy
 * - Grounded - calm, stable, reliable presence
 * - Human - natural, organic, approachable
 *
 * @module @ferni/eq/state/emotion-machine
 */

// Re-export everything from the original emotion-state module
// This provides the unified API while keeping the source in place
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
} from '../../emotion/emotion-state.js';
