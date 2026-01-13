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
import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody/types.js';
import type { BackchannelContext, BackchannelResult } from '../backchanneling.js';
import type { HumanListeningResult } from '../human-listening-pipeline/types.js';
import type { EmotionalMomentum } from '../emotional-contagion.js';
import type { TurnPredictionResult } from '../enhanced-turn-prediction.js';
/**
 * Type guard for ProsodyFeatures
 * Validates that an object has the required prosody feature properties
 */
export declare function isProsodyFeatures(value: unknown): value is ProsodyFeatures;
/**
 * Type guard for VoiceEmotionResult
 * Validates that an object is a valid voice emotion analysis result
 */
export declare function isVoiceEmotionResult(value: unknown): value is VoiceEmotionResult;
/**
 * Type guard for BackchannelContext
 * Validates that an object has required backchannel context properties
 */
export declare function isBackchannelContext(value: unknown): value is BackchannelContext;
/**
 * Type guard for BackchannelResult
 * Validates that an object is a valid backchannel decision result
 */
export declare function isBackchannelResult(value: unknown): value is BackchannelResult;
/**
 * Type guard for HumanListeningResult
 * Validates that an object is a valid human listening analysis result
 */
export declare function isHumanListeningResult(value: unknown): value is HumanListeningResult;
/**
 * Type guard for EmotionalMomentum
 * Validates emotional momentum state
 */
export declare function isEmotionalMomentum(value: unknown): value is EmotionalMomentum;
/**
 * Type guard for TurnPredictionResult
 * Validates turn prediction result
 */
export declare function isTurnPredictionResult(value: unknown): value is TurnPredictionResult;
/**
 * Validate and narrow an unknown value to ProsodyFeatures or return null
 */
export declare function validateProsodyFeatures(value: unknown): ProsodyFeatures | null;
/**
 * Validate and narrow an unknown value to VoiceEmotionResult or return null
 */
export declare function validateVoiceEmotionResult(value: unknown): VoiceEmotionResult | null;
/**
 * Validate and narrow an unknown value to BackchannelContext or return null
 */
export declare function validateBackchannelContext(value: unknown): BackchannelContext | null;
/**
 * Validate and narrow an unknown value to BackchannelResult or return null
 */
export declare function validateBackchannelResult(value: unknown): BackchannelResult | null;
/**
 * Validate and narrow an unknown value to HumanListeningResult or return null
 */
export declare function validateHumanListeningResult(value: unknown): HumanListeningResult | null;
/**
 * Validate and narrow an unknown value to TurnPredictionResult or return null
 */
export declare function validateTurnPredictionResult(value: unknown): TurnPredictionResult | null;
/**
 * Type guard for SpectralAnalysis
 * Validates that an object has the required spectral analysis properties
 */
export declare function isSpectralAnalysis(value: unknown): value is SpectralAnalysis;
/**
 * Type guard for AnticipatedResponse
 * Validates response anticipation result
 */
export declare function isAnticipatedResponse(value: unknown): value is AnticipatedResponse;
/**
 * Type guard for SpeechContext
 * Validates speech context
 */
export declare function isSpeechContext(value: unknown): value is SpeechContext;
import type { SpectralAnalysis } from '../fft-analyzer/types.js';
import type { AnticipatedResponse } from '../response-anticipation/types.js';
import type { SpeechContext } from '../speech-context.js';
export type { AudioBuffer, EmotionClassification, EmotionalDimensions, EnergyAnalysis, MetricsState, PauseAnalysis, PitchAnalysis, ProsodyFeatures, ProsodyMetrics, VoiceEmotion, VoiceEmotionResult, VoiceQualityMetrics, } from '../audio-prosody/types.js';
export type { BackchannelContext, BackchannelResult } from '../backchanneling.js';
export type { BackchannelDecision, BackchannelTiming, BackchannelType, EnhancedBackchannelContext, } from '../enhanced-backchanneling.js';
export type { AudioFrameData, LiveBackchannelContext, LiveBackchannelResult, SimpleEmotion, } from '../live-backchanneling/types.js';
export type { AcknowledgmentMood, BackchannelCategory, BackchannelEmotionType, CatchphraseConfig, PersonaBackchannelStyle, PersonaId, } from '../persona-phrases.js';
export type { AudioAnalysis, ConversationAnalysis, EmotionalUndercurrent, HumanListeningContext, HumanListeningResult, ProsodyFeaturesInput, QuickAnalysisResult, SsmlSuggestions, TextAnalysis, } from '../human-listening-pipeline/types.js';
export type { EmotionalTtsAdjustments, LaughterDetectionResult, MicroInterruptionResult, RhythmMirroringAdjustments, SpeechRhythmProfile, VoiceHumanizationState, } from '../voice-humanization/types.js';
export type { VoiceAgentId, VoiceConfig } from '../voice-manager/types.js';
export type { ClusterPattern } from '../consonant-smoothing.js';
export type { ServiceFactory, SessionService, SessionServiceManager } from '../session-service.js';
export type { CognitiveSsmlOptions } from '../adaptive-ssml/types.js';
export type { ProsodyGuidance, TtsContextState, TurnProsodyRecord } from '../tts-context.js';
export type { CognitiveSpeechContext, SpeechAdjustments } from '../cognitive-speech.js';
export type { CognitiveSpeechInput, CognitiveSpeechResult, } from '../cognitive-speech-integration.js';
export type { ThinkingContext, ThinkingPause } from '../authentic-thinking.js';
export type { EnhancedTurnPrediction, Intonation } from '../prosody-turn-bridge.js';
export type { BreathCharacteristics, BreathEvent, BreathPatternResult, BreathType, } from '../breath-detection.js';
export type { TremorEvent, TremorIntensity, TremorType, VoiceStabilityProfile, VoiceTremorResult, } from '../voice-tremor.js';
export type { VolumeDynamicsState, VolumeLevel, VolumeObservation, VolumePattern, VolumeTrend, } from '../volume-dynamics.js';
export type { EnergyDynamicsResult, EnergyFadeEvent, EnergyFadeReason, EnergySegment, EnergyTrajectory, } from '../energy-dynamics.js';
export type { Disfluency, DisfluencyCounts, DisfluencyType, FluencyAnalysisResult, FluencyPattern, } from '../fluency-analysis.js';
export type { FillerAnalysisResult, FillerInstance, FillerMeaning, FillerPattern, FillerPosition, FillerType, } from '../filler-analysis.js';
export type { LaughterSpectralFeatures, SpectralAnalysis, SpectralEnvironment, } from '../fft-analyzer.js';
export type { BreathGroupConfig, CartesiaEmotion, EmotionContext, FillerConfig, HumanizationOptions, RhythmVariation, } from '../advanced-humanization.js';
export type { EnergyLevel, SpeechContext, TopicWeight } from '../speech-context.js';
export type { PronunciationEntry, PronunciationMemoryState, PronunciationSource, } from '../pronunciation-memory.js';
export type { VoiceEmotionModulation } from '../emotion-matching.js';
export type { ResponseEnhancement, ResponseEnhancementOptions } from '../response-naturalness.js';
export type { CartesiaContextOptions } from '../cartesia-context-patch.js';
export type { EmotionalMomentum, ProsodyContinuityHints, UtteranceEmotionalState, } from '../emotional-contagion.js';
export type { PhraseBoundaryResult, TurnPredictionResult } from '../enhanced-turn-prediction.js';
export type { BackchannelContext as UnifiedBackchannelContext, BackchannelDecision as UnifiedBackchannelDecision, BackchannelEngineOptions, BackchannelMode, BackchannelTiming as UnifiedBackchannelTiming, BreathPauseConfig, BreathPauseStats, } from '../backchanneling/types.js';
//# sourceMappingURL=index.d.ts.map