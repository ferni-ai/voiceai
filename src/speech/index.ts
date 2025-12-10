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
  cleanupAllSpeechSessions,
  cleanupSpeechSession,
  emergencySpeechCleanup,
  getActiveSpeechSessionCount,
  getActiveSpeechSessions,
  registerSpeechSession,
} from './session-cleanup.js';

// ============================================================================
// SPEECH CONTEXT
// ============================================================================

export {
  // Persona speech characteristic defaults
  DEFAULT_SPEECH_CHARACTERISTICS,
  WPMTracker,
  buildSpeechContext,
  deriveSpeechCharacteristicsFromEnergy,
  detectEnergyLevel,
  determineTopicWeight,
  getSessionWPMTracker,
  getWPMTracker,
  removeSessionWPMTracker,
  type EnergyLevel,
  type SpeechContext,
  type TopicWeight,
} from './speech-context.js';

// ============================================================================
// ADAPTIVE SSML
// ============================================================================

export {
  // Phase-specific personality tagging
  applyPhasePersonality,
  clearCognitiveSpeechState,
  getCognitiveSpeechStats,
  tagAdvice,
  tagAdviceWithPersonality,
  tagGreeting,
  tagGreetingWithPersonality,
  tagStory,
  tagSupportResponse,
  tagSupportWithPersonality,
  // Cognitive-aware SSML
  tagTextWithCognitiveSsml,
  tagTextWithSsmlAdaptive,
  tagWrapUp,
  tagWrapUpWithPersonality,
  type CognitiveSsmlOptions,
} from './adaptive-ssml.js';

// Re-export SSML functions
export { tagTextWithSsmlPersonaAware } from '../ssml/index.js';
export { sanitizeSsml, tagTextWithSsml } from './ssml-tagger/index.js';

// ============================================================================
// RESPONSE NATURALNESS
// ============================================================================

export {
  ACKNOWLEDGMENT_PREFIXES,
  CatchphraseTracker,
  PERSONA_CATCHPHRASES,
  THINKING_FILLERS,
  determineAcknowledgmentMood,
  getAcknowledgmentPrefix,
  getCatchphraseWithSsml,
  getResponseEnhancements,
  getThinkingFiller,
  resetCatchphraseTracking,
  shouldAddPrefix,
  shouldInjectCatchphrase,
  type ResponseEnhancement,
  type ResponseEnhancementOptions,
} from './response-naturalness.js';

// ============================================================================
// AUDIO PROSODY (Voice Emotion Detection)
// ============================================================================

export {
  AudioProsodyAnalyzer,
  clearProsodyMetrics,
  getAudioProsodyAnalyzer,
  // Prosody metrics
  getProsodyMetrics,
  getSessionAudioProsodyAnalyzer,
  recordProsodyAnalysis,
  removeSessionAudioProsodyAnalyzer,
  type ProsodyFeatures,
  type ProsodyMetrics,
  type VoiceEmotion,
  type VoiceEmotionResult,
} from './audio-prosody.js';

// ============================================================================
// EMOTION MATCHING
// ============================================================================

export {
  EMOTION_RESPONSES,
  adjustTTSSpeed,
  getEmotionGuidance,
  getEmotionModulation,
  getRegisteredEmotions,
  isEmotionRegistered,
  registerEmotionResponse,
  wrapWithEmotionProsody,
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
  BreathPauseDetector,
  LiveBackchannelingService,
  getBreathPauseDetector,
  getLiveBackchannelingService,
  resetLiveBackchanneling,
  type AudioFrameData,
  type LiveBackchannelContext,
  type LiveBackchannelResult,
  type SimpleEmotion,
} from './live-backchanneling.js';

// ============================================================================
// COGNITIVE SPEECH
// ============================================================================

export {
  applyCognitiveAdjustments,
  buildPauseSSML,
  calculateCognitiveSpeechAdjustments,
  getCognitiveThinkingSound,
  getPauseDuration,
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
  createThinkingContext,
  generateThinkingSSML,
  personaThinkingPhrases,
  wrapWithThinkingPause,
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
  type ProsodyGuidance,
  type TtsContextState,
  type TurnProsodyRecord,
} from './tts-context.js';

// ============================================================================
// PRONUNCIATION MEMORY
// ============================================================================

export {
  PronunciationMemoryService,
  analyzePronunciationNeeds,
  getPronunciationMemory,
  resetAllPronunciationMemory,
  resetPronunciationMemory,
  type PronunciationEntry,
  type PronunciationMemoryState,
  type PronunciationSource,
} from './pronunciation-memory.js';

// ============================================================================
// VOICE MANAGER
// ============================================================================

export {
  DynamicTTS,
  PersonaAwareTTS,
  VOICES,
  createDynamicTTS,
  createPersonaAwareTTS,
  getVoiceManager,
  resetVoiceManager,
  type VoiceAgentId,
  type VoiceConfig,
} from './voice-manager.js';

// ============================================================================
// PROSODY-TURN PREDICTION BRIDGE
// ============================================================================

export {
  createTurnPredictionContext,
  getIntonationFromVoiceEmotion,
  mapPitchContourToIntonation,
  predictTurnWithVoice,
  voiceSuggestsTurnComplete,
  type EnhancedTurnPrediction,
  type Intonation,
} from './prosody-turn-bridge.js';

// ============================================================================
// MUSIC REACTIONS
// ============================================================================

export {
  getAirDJMoment,
  getDancingComment,
  getExcitedMusicReaction,
  // Fun DJ moments
  getFunDJMoment,
  getGenreReaction,
  getMoodMusicReaction,
  getMusicReaction,
  getPlayfulMusicComment,
  getPlayfulMusicIntro,
  shouldReactToMusic,
} from './music-reactions.js';

// ============================================================================
// CARTESIA CONTEXT MANAGEMENT
// ============================================================================

export {
  clearAllContexts,
  clearSessionContextId,
  generateContextId,
  getActiveContextCount,
  // Monitoring
  getAllSessionContexts,
  // Cartesia TTS options helper
  getCartesiaContextOptions,
  getOrCreateContextId,
  getSessionContextId,
  isCartesiaPatched,
  // Legacy (deprecated)
  patchCartesiaForPersistentContext,
  // Context ID management
  setSessionContextId,
  type CartesiaContextOptions,
} from './cartesia-context-patch.js';

// ============================================================================
// HUMAN LISTENING PIPELINE - "Better than Human" listening capabilities
// ============================================================================

export {
  HumanListeningPipeline,
  getHumanListeningPipeline,
  resetAllHumanListeningPipelines,
  resetHumanListeningPipeline,
  type AudioAnalysis,
  type ConversationAnalysis,
  type EmotionalUndercurrent,
  type HumanListeningContext,
  type HumanListeningResult,
  type TextAnalysis,
} from './human-listening-pipeline.js';

// ============================================================================
// BREATH DETECTION
// ============================================================================

export {
  BreathDetector,
  getBreathDetector,
  resetAllBreathDetectors,
  resetBreathDetector,
  type BreathCharacteristics,
  type BreathEvent,
  type BreathPatternResult,
  type BreathType,
} from './breath-detection.js';

// ============================================================================
// VOICE TREMOR / STRAIN DETECTION
// ============================================================================

export {
  VoiceTremorDetector,
  getVoiceTremorDetector,
  resetAllVoiceTremorDetectors,
  resetVoiceTremorDetector,
  type TremorEvent,
  type TremorIntensity,
  type TremorType,
  type VoiceStabilityProfile,
  type VoiceTremorResult,
} from './voice-tremor.js';

// ============================================================================
// VOLUME DYNAMICS
// ============================================================================

export {
  VolumeDynamicsTracker,
  getVolumeDynamicsTracker,
  resetAllVolumeDynamicsTrackers,
  resetVolumeDynamicsTracker,
  type VolumeDynamicsState,
  type VolumeLevel,
  type VolumeObservation,
  type VolumePattern,
  type VolumeTrend,
} from './volume-dynamics.js';

// ============================================================================
// ENERGY DYNAMICS (Voice Fade Detection)
// ============================================================================

export {
  EnergyDynamicsTracker,
  getEnergyDynamicsTracker,
  resetAllEnergyDynamicsTrackers,
  resetEnergyDynamicsTracker,
  type EnergyDynamicsResult,
  type EnergyFadeEvent,
  type EnergyFadeReason,
  type EnergySegment,
  type EnergyTrajectory,
} from './energy-dynamics.js';

// ============================================================================
// FLUENCY ANALYSIS
// ============================================================================

export {
  FluencyAnalyzer,
  getFluencyAnalyzer,
  resetAllFluencyAnalyzers,
  resetFluencyAnalyzer,
  type Disfluency,
  type DisfluencyCounts,
  type DisfluencyType,
  type FluencyAnalysisResult,
  type FluencyPattern,
} from './fluency-analysis.js';

// ============================================================================
// FILLER ANALYSIS (Um, Uh, Like patterns)
// ============================================================================

export {
  FillerAnalyzer,
  getFillerAnalyzer,
  resetAllFillerAnalyzers,
  resetFillerAnalyzer,
  type FillerAnalysisResult,
  type FillerInstance,
  type FillerMeaning,
  type FillerPattern,
  type FillerPosition,
  type FillerType,
} from './filler-analysis.js';
