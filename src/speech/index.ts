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
  // Persona speech characteristic defaults
  DEFAULT_SPEECH_CHARACTERISTICS,
  deriveSpeechCharacteristicsFromEnergy,
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

// Re-export SSML functions from unified module
export { tagTextWithSsml, tagTextWithSsmlPersonaAware, sanitizeSsml } from '../ssml/index.js';

// Response Naturalness (acknowledgments, thinking fillers, catchphrases)
export {
  getAcknowledgmentPrefix,
  getThinkingFiller,
  getCatchphraseWithSsml,
  getResponseEnhancements,
  resetCatchphraseTracking,
  determineAcknowledgmentMood,
  ACKNOWLEDGMENT_PREFIXES,
  THINKING_FILLERS,
  PERSONA_CATCHPHRASES,
  type ResponseEnhancementOptions,
  type ResponseEnhancement,
} from './response-naturalness.js';

// Audio Prosody (Voice Emotion Detection)
export {
  AudioProsodyAnalyzer,
  getAudioProsodyAnalyzer,
  resetAudioProsodyAnalyzer,
  type ProsodyFeatures,
  type VoiceEmotionResult,
  type VoiceEmotion,
} from './audio-prosody.js';

// Emotion Matching (Adaptive TTS based on user emotion)
export {
  getEmotionModulation,
  wrapWithEmotionProsody,
  getEmotionGuidance,
  adjustTTSSpeed,
  type VoiceEmotionModulation,
} from './emotion-matching.js';
