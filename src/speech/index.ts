/**
 * Speech Module
 *
 * Provides adaptive speech synthesis capabilities.
 * Tracks user speaking patterns and adapts SSML accordingly.
 */

// Speech Context
export {
  buildSpeechContext,
  detectEnergyLevel,
  determineTopicWeight,
  WPMTracker,
  getWPMTracker,
  resetWPMTracker,
  type EnergyLevel,
  type TopicWeight,
  type SpeechContext,
} from './speech-context.js';

// Adaptive SSML
export {
  tagTextWithSsmlAdaptive,
  tagGreeting,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
} from './adaptive-ssml.js';

// Re-export base tagger for direct access
export { tagTextWithSsml } from '../ssml-tagger.js';

// Audio Prosody (Voice Emotion Detection)
export {
  AudioProsodyAnalyzer,
  getAudioProsodyAnalyzer,
  resetAudioProsodyAnalyzer,
  type ProsodyFeatures,
  type VoiceEmotionResult,
  type VoiceEmotion,
} from './audio-prosody.js';
