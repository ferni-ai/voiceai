/**
 * 🎭 Ferni Emotion System
 * 
 * Central emotion management for Ferni's character animation system.
 * 
 * @example
 * ```typescript
 * import { setEmotion, flashEmotion, subscribeToEmotion, emotionTriggers } from './emotion';
 * 
 * // Set emotion
 * setEmotion('happy');
 * 
 * // Flash emotion temporarily
 * flashEmotion('excited', 2000);
 * 
 * // Subscribe to changes
 * const unsubscribe = subscribeToEmotion((current, previous) => {
 *   console.log(`Emotion changed: ${previous.id} → ${current.id}`);
 * });
 * 
 * // Process text for emotion cues
 * emotionTriggers.processText("That's amazing! I love it!");
 * ```
 */

export {
  // State manager
  emotionState,
  default as EmotionStateManager,
  
  // Convenience functions
  setEmotion,
  flashEmotion,
  getCurrentEmotion,
  subscribeToEmotion,
  
  // Types
  type EmotionId,
  type EmotionState,
  type EmotionColor,
  type BreathingParams,
  type MovementParams,
  type WaveformParams,
  type QuirkParams,
  type TransitionOptions,
  
  // Presets
  EMOTIONS,
} from './emotion-state.js';

// Emotion triggers
export {
  emotionTriggers,
  analyzeVoice,
  analyzeText,
  determineEmotion,
  processTTSHint,
  type VoiceMetrics,
  type TextAnalysisResult,
} from './emotion-triggers.js';

