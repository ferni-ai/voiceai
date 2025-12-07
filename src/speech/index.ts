/**
 * Speech Module
 *
 * Provides adaptive speech synthesis capabilities.
 * Tracks user speaking patterns and adapts SSML accordingly.
 *
 * This module includes:
 * - Voice management for persona switching
 * - Adaptive SSML generation
 * - Audio prosody analysis for emotion detection
 * - Backchanneling (standard and live)
 * - Response naturalness (acknowledgments, fillers)
 * - Emotion matching for TTS
 * - Cognitive speech integration
 * - Pronunciation memory
 * - TTS context for prosody continuity
 * - Session cleanup utilities
 */

// ============================================================================
// SESSION CLEANUP (Call this when sessions end!)
// ============================================================================

export {
  cleanupSpeechSession,
  cleanupAllSpeechSessions,
  emergencySpeechCleanup,
  registerSpeechSession,
  getActiveSpeechSessionCount,
  getActiveSpeechSessions,
} from './session-cleanup.js';

// ============================================================================
// SPEECH CONTEXT
// ============================================================================

export {
  buildSpeechContext,
  detectEnergyLevel,
  determineTopicWeight,
  WPMTracker,
  getWPMTracker,
  getSessionWPMTracker,
  removeSessionWPMTracker,
  // Persona speech characteristic defaults
  DEFAULT_SPEECH_CHARACTERISTICS,
  deriveSpeechCharacteristicsFromEnergy,
  type EnergyLevel,
  type TopicWeight,
  type SpeechContext,
} from './speech-context.js';

// ============================================================================
// ADAPTIVE SSML
// ============================================================================

export {
  tagTextWithSsmlAdaptive,
  tagGreeting,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
  // Phase-specific personality tagging
  applyPhasePersonality,
  tagGreetingWithPersonality,
  tagSupportWithPersonality,
  tagAdviceWithPersonality,
  tagWrapUpWithPersonality,
  // Cognitive-aware SSML
  tagTextWithCognitiveSsml,
  getCognitiveSpeechStats,
  clearCognitiveSpeechState,
  type CognitiveSsmlOptions,
} from './adaptive-ssml.js';

// Re-export SSML functions from unified module
export { tagTextWithSsml, tagTextWithSsmlPersonaAware, sanitizeSsml } from '../ssml/index.js';

// ============================================================================
// RESPONSE NATURALNESS
// ============================================================================

export {
  getAcknowledgmentPrefix,
  getThinkingFiller,
  getCatchphraseWithSsml,
  getResponseEnhancements,
  resetCatchphraseTracking,
  determineAcknowledgmentMood,
  shouldAddPrefix,
  shouldInjectCatchphrase,
  CatchphraseTracker,
  ACKNOWLEDGMENT_PREFIXES,
  THINKING_FILLERS,
  PERSONA_CATCHPHRASES,
  type ResponseEnhancementOptions,
  type ResponseEnhancement,
} from './response-naturalness.js';

// ============================================================================
// AUDIO PROSODY (Voice Emotion Detection)
// ============================================================================

export {
  AudioProsodyAnalyzer,
  getAudioProsodyAnalyzer,
  getSessionAudioProsodyAnalyzer,
  removeSessionAudioProsodyAnalyzer,
  // Prosody metrics
  getProsodyMetrics,
  recordProsodyAnalysis,
  clearProsodyMetrics,
  type ProsodyFeatures,
  type VoiceEmotionResult,
  type VoiceEmotion,
  type ProsodyMetrics,
} from './audio-prosody.js';

// ============================================================================
// EMOTION MATCHING
// ============================================================================

export {
  getEmotionModulation,
  wrapWithEmotionProsody,
  getEmotionGuidance,
  adjustTTSSpeed,
  registerEmotionResponse,
  getRegisteredEmotions,
  isEmotionRegistered,
  EMOTION_RESPONSES,
  type VoiceEmotionModulation,
} from './emotion-matching.js';

// ============================================================================
// BACKCHANNELING (Standard)
// ============================================================================

export {
  BackchannelingSystem,
  getBackchannelingSystem,
  getSessionBackchannelingSystem,
  removeSessionBackchannelingSystem,
  type BackchannelContext,
  type BackchannelResult,
} from './backchanneling.js';

// ============================================================================
// LIVE BACKCHANNELING (Real-time, breath-pause aware)
// ============================================================================

export {
  LiveBackchannelingService,
  BreathPauseDetector,
  getLiveBackchannelingService,
  getBreathPauseDetector,
  resetLiveBackchanneling,
  type LiveBackchannelContext,
  type LiveBackchannelResult,
  type SimpleEmotion,
  type AudioFrameData,
} from './live-backchanneling.js';

// ============================================================================
// COGNITIVE SPEECH
// ============================================================================

export {
  calculateCognitiveSpeechAdjustments,
  applyCognitiveAdjustments,
  getPauseDuration,
  buildPauseSSML,
  getCognitiveThinkingSound,
  type CognitiveSpeechContext,
  type SpeechAdjustments,
} from './cognitive-speech.js';

export {
  applyCognitiveSpeechAdjustments,
  buildCognitiveSSML,
  getReasoningStyleSpeechPreset,
  type CognitiveSpeechInput,
  type CognitiveSpeechResult,
} from './cognitive-speech-integration.js';

// ============================================================================
// AUTHENTIC THINKING (Cognitive load → natural pauses)
// ============================================================================

export {
  analyzeQuestionComplexity,
  calculateThinkingPause,
  generateThinkingSSML,
  wrapWithThinkingPause,
  createThinkingContext,
  personaThinkingPhrases,
  type ThinkingContext,
  type ThinkingPause,
} from './authentic-thinking.js';

// ============================================================================
// TTS CONTEXT (Prosody continuity)
// ============================================================================

export {
  TtsContextService,
  getTtsContextService,
  resetTtsContextService,
  type TtsContextState,
  type TurnProsodyRecord,
  type ProsodyGuidance,
} from './tts-context.js';

// ============================================================================
// PRONUNCIATION MEMORY
// ============================================================================

export {
  PronunciationMemoryService,
  getPronunciationMemory,
  resetPronunciationMemory,
  resetAllPronunciationMemory,
  analyzePronunciationNeeds,
  type PronunciationSource,
  type PronunciationEntry,
  type PronunciationMemoryState,
} from './pronunciation-memory.js';

// ============================================================================
// VOICE MANAGER
// ============================================================================

export {
  getVoiceManager,
  resetVoiceManager,
  DynamicTTS,
  createDynamicTTS,
  PersonaAwareTTS,
  createPersonaAwareTTS,
  VOICES,
  type VoiceAgentId,
  type VoiceConfig,
} from './voice-manager.js';

// ============================================================================
// MUSIC REACTIONS
// ============================================================================

export {
  getMusicReaction,
  shouldReactToMusic,
  getPlayfulMusicIntro,
  getGenreReaction,
  getMoodMusicReaction,
  getPlayfulMusicComment,
} from './music-reactions.js';

// ============================================================================
// CARTESIA CONTEXT MANAGEMENT
// ============================================================================

export {
  // Context ID management
  setSessionContextId,
  getSessionContextId,
  clearSessionContextId,
  getOrCreateContextId,
  generateContextId,
  // Cartesia TTS options helper
  getCartesiaContextOptions,
  // Monitoring
  getAllSessionContexts,
  getActiveContextCount,
  clearAllContexts,
  // Legacy (deprecated)
  patchCartesiaForPersistentContext,
  isCartesiaPatched,
  type CartesiaContextOptions,
} from './cartesia-context-patch.js';
