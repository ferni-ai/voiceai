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
// SESSION DEBUG & MONITORING (For diagnostics)
// ============================================================================

export {
  checkForLeaks,
  cleanupSessionTracking,
  getAllSessionsDebugInfo,
  getSessionDebugInfo,
  getSpeechModuleDebugInfo,
  logModuleState,
  trackBackchannel,
  trackEmotionDetected,
  trackProsodyAnalysis,
  trackSessionStart,
  trackTurnPrediction,
  type SpeechModuleDebugInfo,
  type SpeechSessionDebugInfo,
} from './session-debug.js';

// ============================================================================
// SESSION SERVICE MANAGER (Abstraction for session-scoped services)
// ============================================================================

export {
  cleanupRegisteredServices,
  createSessionManager,
  getRegisteredManagerCount,
  registerSessionManager,
  type ServiceFactory,
  type SessionService,
  type SessionServiceManager,
} from './session-service.js';

// ============================================================================
// PERSONA PHRASES (Single source of truth for all persona-specific phrases)
// ============================================================================

export {
  ACKNOWLEDGMENT_PREFIXES,
  BACKCHANNEL_LIBRARY,
  PERSONA_BACKCHANNEL_STYLE,
  PERSONA_CATCHPHRASES,
  SOFT_BACKCHANNELS,
  THINKING_FILLERS,
  getAcknowledgmentPrefix,
  getBackchannelPhrase,
  getCatchphraseWithSsml,
  getPersonaBackchannelStyle,
  getSoftBackchannel,
  getThinkingFiller,
  normalizePersonaId,
  type AcknowledgmentMood,
  type BackchannelCategory,
  type BackchannelEmotionType,
  type CatchphraseConfig,
  type PersonaBackchannelStyle,
  type PersonaId,
} from './persona-phrases.js';

// ============================================================================
// UNIFIED BACKCHANNELING (Consolidated module for all backchanneling modes)
// ============================================================================

export {
  BackchannelEngine,
  BreathPauseDetector,
  DEFAULT_BREATH_PAUSE_CONFIG,
  ENHANCED_TIMING,
  LIVE_TIMING,
  STANDARD_TIMING,
  SessionBackchannelManager,
  adjustTimingForTopic,
  createBackchannelEngine,
  getActiveBackchannelSessionCount,
  getBackchannelEngine,
  getBackchannelManager,
  getSessionBreathPauseDetector,
  getTimingForMode,
  resetAllBackchanneling,
  resetBackchanneling,
  signalNewTurn,
  type BackchannelEngineOptions,
  type BackchannelMode,
  type BackchannelTiming,
  type BreathPauseConfig,
  type BreathPauseStats,
  type BackchannelContext as UnifiedBackchannelContext,
  type BackchannelDecision as UnifiedBackchannelDecision,
} from './backchanneling/index.js';

// ============================================================================
// TYPES BARREL (Convenient type imports)
// ============================================================================

// Re-export all types from the types barrel for convenience
export type * from './types/index.js';

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
  resetSessionWPMTracker, // Preferred naming alias
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

// Re-export SSML functions from canonical source (src/ssml/)
export { sanitizeSsml, tagTextWithSsmlPersonaAware } from '../ssml/index.js';

// Legacy tagTextWithSsml (Jack Bogle-specific) - deprecated
// Use tagTextWithSsmlPersonaAware from '../ssml/index.js' instead
export { tagTextWithSsml } from './ssml-tagger/index.js';

// ============================================================================
// RESPONSE NATURALNESS
// Note: ACKNOWLEDGMENT_PREFIXES, PERSONA_CATCHPHRASES, THINKING_FILLERS, etc.
// are exported from persona-phrases.js (canonical source)
// ============================================================================

export {
  CatchphraseTracker,
  determineAcknowledgmentMood,
  getResponseEnhancements,
  // Session-scoped catchphrase tracking
  getSessionCatchphraseTracker,
  resetAllCatchphraseTrackers,
  resetCatchphraseTracking,
  resetSessionCatchphraseTracker,
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
  resetSessionAudioProsodyAnalyzer, // Preferred naming alias
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
  resetSessionBackchannelingSystem, // Preferred naming alias
  type BackchannelContext,
  type BackchannelResult,
} from './backchanneling.js';

// ============================================================================
// LIVE BACKCHANNELING (Real-time, breath-pause aware)
// Note: BreathPauseDetector is exported from backchanneling/index.js (canonical source)
// ============================================================================

export {
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
// CONSONANT SMOOTHING
// ============================================================================

export {
  applyConsonantSmoothing,
  detectDifficultClusters,
  getClusterStats,
  type ClusterPattern,
} from './consonant-smoothing.js';

// ============================================================================
// VOICE MANAGER
// ============================================================================

export {
  DynamicTTS,
  PersonaAwareTTS,
  VOICES,
  createDynamicTTS,
  createPersonaAwareTTS,
  // Session-scoped managers (production-ready)
  getSessionVoiceManager,
  getSessionVoiceManagerCount,
  // Legacy global manager (deprecated)
  getVoiceManager,
  resetAllSessionVoiceManagers,
  resetSessionVoiceManager,
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

// ============================================================================
// FFT ANALYZER (Spectral Analysis)
// ============================================================================

export {
  FFTAnalyzerService,
  analyzeLaughterSpectral,
  analyzeSpectrum,
  classifyEnvironment,
  getFFTAnalyzer,
  resetFFTAnalyzer,
  type LaughterSpectralFeatures,
  type SpectralAnalysis,
  type SpectralEnvironment,
} from './fft-analyzer.js';

// ============================================================================
// ADVANCED HUMANIZATION (Research-backed natural speech)
// See docs/VOICE-HUMANIZATION-RESEARCH.md for research basis
// ============================================================================

export {
  // Emotion mapping (50+ Cartesia emotions)
  ALL_CARTESIA_EMOTIONS,
  CARTESIA_EMOTIONS,
  // Breath group pacing
  addBreathGroupPauses,
  // Speech rhythm variation
  analyzeRhythm,
  applyRhythmVariations,
  getEmotionTransition,
  // Main pipeline
  humanizeText,
  // Natural fillers ("um", "well", etc.)
  injectNaturalFillers,
  mapContextToEmotion,
  type BreathGroupConfig,
  type CartesiaEmotion,
  type EmotionContext,
  type FillerConfig,
  type HumanizationOptions,
  type RhythmVariation,
} from './advanced-humanization.js';

// ============================================================================
// ENHANCED BACKCHANNELING (Active Listening)
// Research-backed: faster response, context-aware, persona-specific
// Note: BACKCHANNEL_LIBRARY, PERSONA_BACKCHANNEL_STYLE, BackchannelTiming
// are exported from persona-phrases.js and backchanneling/index.js (canonical sources)
// ============================================================================

export {
  EnhancedBackchannelingEngine,
  getEnhancedBackchannelingEngine,
  getQuickBackchannel,
  removeEnhancedBackchannelingEngine,
  resetEnhancedBackchannelingEngine,
  type BackchannelType,
  type EnhancedBackchannelContext, // Preferred naming alias
  type BackchannelDecision as EnhancedBackchannelDecision,
} from './enhanced-backchanneling.js';

// ============================================================================
// DYNAMIC SPEED CONTROL (NEW)
// Real-time speech speed adjustment based on context
// ============================================================================

export {
  DEFAULT_SPEED_CONFIG,
  applyDynamicSpeedSsml,
  calculateDynamicSpeed,
  getSpeedControlSession,
  getSpeedTrend,
  recordSpeedDecision,
  resetAllSpeedControlSessions,
  resetSpeedControlSession,
  type SpeedControlConfig,
  type SpeedControlContext,
  type SpeedControlResult,
} from './adaptive-ssml/dynamic-speed-control.js';

// ============================================================================
// REAL-TIME AUDIO ANALYZER (NEW)
// Optimized streaming audio analysis for lower latency
// ============================================================================

export {
  DEFAULT_REALTIME_CONFIG,
  RealTimeAudioAnalyzer,
  getActiveRealTimeAnalyzerCount,
  getRealTimeAnalyzer,
  resetAllRealTimeAnalyzers,
  resetRealTimeAnalyzer,
  type AnalyzerState,
  type PartialProsodyFeatures,
  type RealTimeAnalyzerConfig,
} from './audio-prosody/real-time-analyzer.js';

// ============================================================================
// SPEECH METRICS & OBSERVABILITY (NEW)
// Performance and quality metrics collection
// ============================================================================

export {
  getLatencyMetrics,
  getQualityMetrics,
  getSpeechMetrics,
  getSpeechMetricsSnapshot,
  getUsageMetrics,
  recordBackchannelTiming,
  recordEmotionConfidence,
  recordLatency,
  recordOperation,
  recordSessionEnd,
  recordSessionStart,
  recordTurnPredictionAccuracy,
  resetSpeechMetrics,
  withTiming,
  withTimingSync,
  type LatencyMetrics,
  type MetricsSnapshot,
  type OperationMetrics,
  type QualityMetrics,
  type SpeechPipelineMetrics,
  type UsageMetrics,
} from './metrics/index.js';

// ============================================================================
// SESAME-INSPIRED PROSODY (State-of-the-art voice expressiveness)
// Inspired by Sesame AI's Conversational Speech Model
// ============================================================================

export {
  // Anticipatory Prosody - react before user finishes speaking
  anticipateResponse,
  detectTrajectory,
  detectTrajectoryType,
  getActiveAnticipatorySessionCount,
  getAnticipatorySession,
  getImmediateMicroReaction,
  getLastAnticipation,
  resetAnticipatorySession,
  shouldAnticipate,
  updateAnticipation,
  // Micro-Reactions - quick vocal reactions (<150ms)
  COMPOUND_REACTIONS,
  MICRO_REACTIONS,
  detectContext,
  detectContexts,
  getActiveMicroReactionSessionCount,
  getCompoundReaction,
  getMicroReaction,
  getMicroReactionSession,
  getReactionsForContext,
  getSessionMicroReaction,
  recordReaction,
  resetMicroReactionSession,
  selectMicroReaction,
  shouldUseReaction,
  // Conversation Prosody - context-aware across turns
  addContextualPause,
  applyProsodyRecommendation,
  calculateTrajectory,
  getActiveConversationStateCount,
  getConversationState,
  getProsodyRecommendation,
  getSessionProsodyRecommendation,
  isHeavyTopic,
  resetConversationState,
  updateConversationState,
  // Rich Disfluencies - natural speech patterns
  DISFLUENCY_PATTERNS,
  addExcitedInterruption,
  addRealizationMoment,
  addThinkingStart,
  addTrailingOff,
  findInjectionPoints,
  getActiveDisfluencySessionCount,
  getDisfluenciesForEmotion,
  getDisfluencySession,
  getRandomSsmlPattern,
  injectDisfluency,
  resetDisfluencySession,
  selectWeightedDisfluency,
  smartInjectDisfluency,
  // Pipeline Integration - optimized emotion→SSML path
  enhanceResponseWithSesame,
  getActiveSesamePipelineSessionCount,
  getPreparedResponse,
  getSesamePipelineMetrics,
  processPartialTranscript,
  quickEnhance,
  resetSesamePipeline,
  startNewTurn,
  // Types
  type AnticipatedResponse,
  type ConversationEmotionalState,
  type ConversationProsodyRecommendation,
  type DisfluencyInjection,
  type DisfluencyPattern,
  type DisfluencyType as SesameDisfluencyType, // Aliased to avoid conflict with fluency-analysis
  type EmotionalTrajectory,
  type MicroReaction,
  type MicroReactionContext,
  type MicroReactionType,
  type PartialTranscript,
  type PreparedResponse,
  type SesameEnhancedResult,
} from './sesame-inspired/index.js';
