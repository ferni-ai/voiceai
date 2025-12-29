/**
 * Audio Prosody Module
 *
 * Voice-based emotion detection through audio analysis.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice.
 *
 * @module audio-prosody
 */

// ============================================================================
// TYPES
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
} from './types.js';

// ============================================================================
// MAIN ANALYZER
// ============================================================================

export { AudioProsodyAnalyzer, default } from './analyzer.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export {
  clearProsodyMetrics,
  getProsodyMetrics,
  getSessionAudioProsodyAnalyzer,
  recordProsodyAnalysis,
  resetSessionAudioProsodyAnalyzer,
} from './session-management.js';

// ============================================================================
// FEATURE EXTRACTION (for advanced usage)
// ============================================================================

export {
  analyzePauses,
  analyzeVoiceQuality,
  autocorrelationPitch,
  calculateEnergy,
  convertToFloat32,
  estimatePitch,
  estimateSpeechRate,
  extractProsodyFeatures,
  mergeBuffers,
} from './feature-extraction.js';

// ============================================================================
// EMOTION MAPPING (for advanced usage)
// ============================================================================

export {
  calculateStressLevel,
  classifyEmotion,
  detectAnxietyMarkers,
  mapToEmotionalDimensions,
  smoothFeatures,
} from './emotion-mapping.js';

// ============================================================================
// REAL-TIME ANALYZER (optimized for streaming)
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
} from './real-time-analyzer.js';

// ============================================================================
// NATIVE ANALYZER (Rust-accelerated, zero-allocation)
// ============================================================================

export {
  // Availability checks
  isNativeAudioAvailable,
  getNativeLibraryInfo,
  getNativeLoadError,

  // Direct native processor API
  createNativeProcessor,
  getOrCreateNativeProcessor,
  processNativeFrame,
  getNativeFullFeatures,
  resetNativeProcessor,
  removeNativeProcessor,
  getActiveNativeProcessorCount,
  clearAllNativeProcessors,

  // Standalone utilities (with JS fallback)
  convertI16ToF32,
  computeEnergyDb,
  isSpeechNative,

  // Unified analyzer (auto-fallback to JS)
  createUnifiedAnalyzer,
  getSessionUnifiedAnalyzer,
  resetSessionUnifiedAnalyzer,
  getActiveUnifiedAnalyzerCount,
  clearAllUnifiedAnalyzers,

  // Types
  type NativeProsodyResult,
  type NativeFullProsodyFeatures,
  type NativeProcessorStats,
  type NativeLibraryInfo,
  type UnifiedAudioAnalyzer,
} from './native-analyzer.js';
