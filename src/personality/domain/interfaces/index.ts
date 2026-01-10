/**
 * Domain Interfaces (Ports) Index
 *
 * These interfaces define the contracts between the domain and infrastructure.
 * The domain depends on these abstractions; infrastructure provides implementations.
 *
 * This is the "Ports" part of Ports & Adapters / Hexagonal Architecture.
 *
 * @module personality/domain/interfaces
 */

export type {
  PersonalityRepository,
  PersonalityRepositoryImpl,
  ProfileQueryOptions,
  PatternQueryOptions,
  VulnerabilityQueryOptions,
  MilestoneQueryOptions,
} from './personality-repository.js';

export type {
  VoiceAnalyzer,
  VoiceAnalyzerImpl,
  VoiceFeatures,
  VoiceEmotionResult,
  StressAnalysisResult,
  SilenceAnalysisResult,
  BreathAnalysisResult,
  VoiceTone,
  VoicePace,
  BreathPattern,
  SilenceType,
} from './voice-analyzer.js';

export type {
  EmotionDetector,
  EmotionDetectorImpl,
  EmotionDetectionInput,
  EmotionDetectionResult,
  ContradictionResult,
  TrajectoryResult,
  FirstTimeVulnerabilityResult,
} from './emotion-detector.js';
