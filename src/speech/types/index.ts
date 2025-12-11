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
 *
 * import {
 *   isProsodyFeatures,
 *   isVoiceEmotionResult
 * } from '../speech/types/index.js';
 * ```
 *
 * @module speech/types
 */

// ============================================================================
// TYPE GUARDS
// Runtime validation functions for type safety at boundaries
// ============================================================================

import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody/types.js';
import type { BackchannelContext, BackchannelResult } from '../backchanneling.js';
import type { HumanListeningResult } from '../human-listening-pipeline/types.js';
import type {
  EmotionalMomentum,
  ProsodyContinuityHints,
  UtteranceEmotionalState,
} from '../emotional-contagion.js';
import type {
  PhraseBoundaryResult,
  TurnPredictionResult,
} from '../enhanced-turn-prediction.js';

/**
 * Type guard for ProsodyFeatures
 * Validates that an object has the required prosody feature properties
 */
export function isProsodyFeatures(value: unknown): value is ProsodyFeatures {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.pitchMean === 'number' &&
    typeof obj.pitchVariance === 'number' &&
    typeof obj.energyMean === 'number' &&
    typeof obj.speechRate === 'number' &&
    typeof obj.pauseDuration === 'number' &&
    typeof obj.utteranceDuration === 'number' &&
    ['rising', 'falling', 'flat', 'dynamic'].includes(obj.pitchContour as string)
  );
}

/**
 * Type guard for VoiceEmotionResult
 * Validates that an object is a valid voice emotion analysis result
 */
export function isVoiceEmotionResult(value: unknown): value is VoiceEmotionResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.primary === 'string' &&
    typeof obj.valence === 'number' &&
    typeof obj.arousal === 'number' &&
    typeof obj.stressLevel === 'number' &&
    typeof obj.confidence === 'number' &&
    isProsodyFeatures(obj.prosody)
  );
}

/**
 * Type guard for BackchannelContext
 * Validates that an object has required backchannel context properties
 */
export function isBackchannelContext(value: unknown): value is BackchannelContext {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.sessionId === 'string' &&
    typeof obj.personaId === 'string' &&
    typeof obj.silenceDurationMs === 'number' &&
    typeof obj.userSpeaking === 'boolean'
  );
}

/**
 * Type guard for BackchannelResult
 * Validates that an object is a valid backchannel decision result
 */
export function isBackchannelResult(value: unknown): value is BackchannelResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.shouldBackchannel === 'boolean' &&
    (obj.phrase === undefined || typeof obj.phrase === 'string') &&
    (obj.reason === undefined || typeof obj.reason === 'string')
  );
}

/**
 * Type guard for HumanListeningResult
 * Validates that an object is a valid human listening analysis result
 */
export function isHumanListeningResult(value: unknown): value is HumanListeningResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.audio === 'object' &&
    typeof obj.text === 'object' &&
    typeof obj.conversation === 'object' &&
    typeof obj.emotionalUndercurrent === 'object' &&
    typeof obj.shouldSlowDown === 'boolean' &&
    typeof obj.possibleDistress === 'boolean' &&
    typeof obj.confidence === 'number'
  );
}

/**
 * Type guard for EmotionalMomentum
 * Validates emotional momentum state
 */
export function isEmotionalMomentum(value: unknown): value is EmotionalMomentum {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.valence === 'number' &&
    typeof obj.arousal === 'number' &&
    ['high', 'medium', 'low'].includes(obj.warmth as string) &&
    typeof obj.turnsAtState === 'number' &&
    ['building', 'stable', 'dissipating'].includes(obj.trend as string)
  );
}

/**
 * Type guard for TurnPredictionResult
 * Validates turn prediction result
 */
export function isTurnPredictionResult(value: unknown): value is TurnPredictionResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.completionProbability === 'number' &&
    ['wait', 'take_turn', 'backchannel', 'uncertain'].includes(obj.recommendation as string) &&
    typeof obj.evidence === 'object' &&
    typeof obj.reason === 'string'
  );
}

/**
 * Validate and narrow an unknown value to ProsodyFeatures or return null
 */
export function validateProsodyFeatures(value: unknown): ProsodyFeatures | null {
  return isProsodyFeatures(value) ? value : null;
}

/**
 * Validate and narrow an unknown value to VoiceEmotionResult or return null
 */
export function validateVoiceEmotionResult(value: unknown): VoiceEmotionResult | null {
  return isVoiceEmotionResult(value) ? value : null;
}

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

// ============================================================================
// EMOTIONAL CONTAGION TYPES
// ============================================================================

export type {
  EmotionalMomentum,
  ProsodyContinuityHints,
  UtteranceEmotionalState,
} from '../emotional-contagion.js';

// ============================================================================
// ENHANCED TURN PREDICTION TYPES
// ============================================================================

export type {
  PhraseBoundaryResult,
  TurnPredictionResult,
} from '../enhanced-turn-prediction.js';

// ============================================================================
// UNIFIED BACKCHANNELING TYPES
// ============================================================================

export type {
  BackchannelContext as UnifiedBackchannelContext,
  BackchannelDecision as UnifiedBackchannelDecision,
  BackchannelEngineOptions,
  BackchannelMode,
  BackchannelTiming as UnifiedBackchannelTiming,
  BreathPauseConfig,
  BreathPauseStats,
} from '../backchanneling/types.js';
