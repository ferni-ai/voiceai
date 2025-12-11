/**
 * Speech Module Types - Barrel Export
 *
 * Central export for all speech-related types.
 * Import from here for cleaner imports:
 *
 * @example
 * ```typescript
 * import type {
 *   ProsodyFeatures,
 *   VoiceEmotionResult,
 *   BackchannelContext,
 *   HumanListeningResult
 * } from '../speech/types/index.js';
 * ```
 *
 * @module speech/types
 */

// ============================================================================
// PROSODY & AUDIO ANALYSIS TYPES
// ============================================================================

export type {
  AudioBuffer,
  EmotionClassification,
  EmotionalDimensions,
  EnergyAnalysis,
  MetricsState,
  PauseAnalysis,
  PitchAnalysis,
  ProsodyFeatures,
  ProsodyMetrics,
  VoiceEmotion,
  VoiceEmotionResult,
  VoiceQualityMetrics,
} from '../audio-prosody/types.js';

// ============================================================================
// BACKCHANNELING TYPES
// ============================================================================

export type { BackchannelContext, BackchannelResult } from '../backchanneling.js';

export type {
  BackchannelDecision,
  BackchannelTiming,
  BackchannelType,
  EnhancedBackchannelContext,
} from '../enhanced-backchanneling.js';

export type {
  AudioFrameData,
  LiveBackchannelContext,
  LiveBackchannelResult,
  SimpleEmotion,
} from '../live-backchanneling/types.js';

// ============================================================================
// PERSONA PHRASES TYPES
// ============================================================================

export type {
  AcknowledgmentMood,
  BackchannelCategory,
  BackchannelEmotionType,
  CatchphraseConfig,
  PersonaBackchannelStyle,
  PersonaId,
} from '../persona-phrases.js';

// ============================================================================
// HUMAN LISTENING PIPELINE TYPES
// ============================================================================

export type {
  AudioAnalysis,
  ConversationAnalysis,
  EmotionalUndercurrent,
  HumanListeningContext,
  HumanListeningResult,
  ProsodyFeaturesInput,
  QuickAnalysisResult,
  SsmlSuggestions,
  TextAnalysis,
} from '../human-listening-pipeline/types.js';

// ============================================================================
// VOICE HUMANIZATION TYPES
// ============================================================================

export type {
  EmotionalTtsAdjustments,
  LaughterDetectionResult,
  MicroInterruptionResult,
  RhythmMirroringAdjustments,
  SpeechRhythmProfile,
  VoiceHumanizationState,
} from '../voice-humanization/types.js';

// ============================================================================
// VOICE MANAGER TYPES
// ============================================================================

export type { VoiceAgentId, VoiceConfig } from '../voice-manager/types.js';

// ============================================================================
// SSML TAGGER TYPES
// ============================================================================

export type { ClusterPattern } from '../consonant-smoothing.js';

// ============================================================================
// SESSION SERVICE TYPES
// ============================================================================

export type { ServiceFactory, SessionService, SessionServiceManager } from '../session-service.js';

// ============================================================================
// ADAPTIVE SSML TYPES
// ============================================================================

export type { CognitiveSsmlOptions } from '../adaptive-ssml/types.js';

// ============================================================================
// TTS CONTEXT TYPES
// ============================================================================

export type { ProsodyGuidance, TtsContextState, TurnProsodyRecord } from '../tts-context.js';

// ============================================================================
// COGNITIVE SPEECH TYPES
// ============================================================================

export type { CognitiveSpeechContext, SpeechAdjustments } from '../cognitive-speech.js';

export type {
  CognitiveSpeechInput,
  CognitiveSpeechResult,
} from '../cognitive-speech-integration.js';

// ============================================================================
// AUTHENTIC THINKING TYPES
// ============================================================================

export type { ThinkingContext, ThinkingPause } from '../authentic-thinking.js';

// ============================================================================
// PROSODY-TURN BRIDGE TYPES
// ============================================================================

export type { EnhancedTurnPrediction, Intonation } from '../prosody-turn-bridge.js';

// ============================================================================
// BREATH DETECTION TYPES
// ============================================================================

export type {
  BreathCharacteristics,
  BreathEvent,
  BreathPatternResult,
  BreathType,
} from '../breath-detection.js';

// ============================================================================
// VOICE TREMOR TYPES
// ============================================================================

export type {
  TremorEvent,
  TremorIntensity,
  TremorType,
  VoiceStabilityProfile,
  VoiceTremorResult,
} from '../voice-tremor.js';

// ============================================================================
// VOLUME DYNAMICS TYPES
// ============================================================================

export type {
  VolumeDynamicsState,
  VolumeLevel,
  VolumeObservation,
  VolumePattern,
  VolumeTrend,
} from '../volume-dynamics.js';

// ============================================================================
// ENERGY DYNAMICS TYPES
// ============================================================================

export type {
  EnergyDynamicsResult,
  EnergyFadeEvent,
  EnergyFadeReason,
  EnergySegment,
  EnergyTrajectory,
} from '../energy-dynamics.js';

// ============================================================================
// FLUENCY & FILLER ANALYSIS TYPES
// ============================================================================

export type {
  Disfluency,
  DisfluencyCounts,
  DisfluencyType,
  FluencyAnalysisResult,
  FluencyPattern,
} from '../fluency-analysis.js';

export type {
  FillerAnalysisResult,
  FillerInstance,
  FillerMeaning,
  FillerPattern,
  FillerPosition,
  FillerType,
} from '../filler-analysis.js';

// ============================================================================
// FFT ANALYZER TYPES
// ============================================================================

export type {
  LaughterSpectralFeatures,
  SpectralAnalysis,
  SpectralEnvironment,
} from '../fft-analyzer.js';

// ============================================================================
// ADVANCED HUMANIZATION TYPES
// ============================================================================

export type {
  BreathGroupConfig,
  CartesiaEmotion,
  EmotionContext,
  FillerConfig,
  HumanizationOptions,
  RhythmVariation,
} from '../advanced-humanization.js';

// ============================================================================
// SPEECH CONTEXT TYPES
// ============================================================================

export type { EnergyLevel, SpeechContext, TopicWeight } from '../speech-context.js';

// ============================================================================
// PRONUNCIATION MEMORY TYPES
// ============================================================================

export type {
  PronunciationEntry,
  PronunciationMemoryState,
  PronunciationSource,
} from '../pronunciation-memory.js';

// ============================================================================
// EMOTION MATCHING TYPES
// ============================================================================

export type { VoiceEmotionModulation } from '../emotion-matching.js';

// ============================================================================
// RESPONSE NATURALNESS TYPES
// ============================================================================

export type { ResponseEnhancement, ResponseEnhancementOptions } from '../response-naturalness.js';

// ============================================================================
// CARTESIA CONTEXT TYPES
// ============================================================================

export type { CartesiaContextOptions } from '../cartesia-context-patch.js';
