/**
 * Audio DSP Module
 *
 * Unified interface for Rust-accelerated audio processing.
 *
 * @module speech/audio-dsp
 */

export {
  // Types
  type PitchResult,
  type VadResult,
  type PreSttConfig,
  type PreSttStats,
  type FrameAnalysis,
  type VadConfig,
  type PreSttProcessor,
  type AudioDspProcessor,

  // Status
  isNativeAudioDspAvailable,
  getNativeLoadError,

  // Pitch detection
  detectPitch,
  detectPitchBatch,

  // Energy & RMS
  calculateRms,
  calculateEnergyDb,

  // ZCR
  calculateZcr,

  // Statistics
  calculateMean,
  calculateVariance,
  calculateStdDev,

  // VAD
  detectVoiceActivity,

  // Frame analysis
  analyzeFrame,

  // Pre-STT
  createPreSttProcessor,
  createTwilioPreSttProcessor,

  // AGC
  applyAgc,
  resetAgc,
  removeAgc,

  // Conversion
  convertI16ToF32,

  // Unified processor
  createAudioDspProcessor,
} from './native-audio-dsp.js';
