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
  getAudioProsodyAnalyzer, // Deprecated
  getProsodyMetrics,
  getSessionAudioProsodyAnalyzer,
  recordProsodyAnalysis,
  removeSessionAudioProsodyAnalyzer,
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
