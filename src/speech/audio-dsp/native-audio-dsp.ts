/**
 * Native Audio DSP - Unified interface for Rust-accelerated audio processing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module provides a unified interface for all audio DSP operations,
 * leveraging the Rust @ferni/audio crate for SIMD-accelerated processing.
 *
 * Key capabilities:
 * - **YIN Pitch Detection** - O(n) algorithm (~40x faster than naive autocorrelation)
 * - **RMS Energy** - SIMD-accelerated sum of squares
 * - **Zero Crossing Rate** - Voice/unvoiced classification
 * - **Voice Activity Detection** - Energy + ZCR combined
 * - **AGC** - Automatic gain control with attack/release
 * - **Noise Suppression** - Spectral subtraction
 * - **Bandwidth Extension** - 8kHz → 16kHz for Twilio
 *
 * Performance characteristics:
 * - Pitch detection: ~0.05ms per frame (vs ~2ms JavaScript)
 * - RMS energy: ~0.005ms per frame (vs ~0.1ms JavaScript)
 * - Zero per-frame allocations
 *
 * @module speech/audio-dsp/native-audio-dsp
 */

import { createRequire } from 'module';
import { getLogger } from '../../utils/safe-logger.js';

// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);

const log = getLogger().child({ module: 'NativeAudioDsp' });

// ============================================================================
// TYPES
// ============================================================================

/** YIN pitch estimation result */
export interface PitchResult {
  /** Estimated pitch in Hz (0 if no voiced speech detected) */
  pitchHz: number;
  /** Confidence of pitch estimate (0-1) */
  confidence: number;
  /** Best period in samples */
  periodSamples: number;
}

/** Voice activity detection result */
export interface VadResult {
  /** Is speech detected? */
  isSpeech: boolean;
  /** Is voiced speech (as opposed to noise/breath)? */
  isVoiced: boolean;
  /** Energy in dB */
  energyDb: number;
  /** Zero crossing rate (0-1) */
  zcr: number;
}

/** Pre-STT processing configuration */
export interface PreSttConfig {
  /** Sample rate (default: 16000) */
  sampleRate?: number;
  /** Enable AGC (default: true) */
  enableAgc?: boolean;
  /** Enable noise suppression (default: true) */
  enableNoiseSuppression?: boolean;
  /** Enable high-pass filter for DC removal (default: true) */
  enableHighpass?: boolean;
  /** High-pass cutoff in Hz (default: 80) */
  highpassCutoffHz?: number;
  /** Enable bandwidth extension for 8kHz input (default: false) */
  enableBandwidthExtension?: boolean;
  /** Input is 8kHz Twilio audio (default: false) */
  inputIs8khz?: boolean;
}

/** Pre-STT processing statistics */
export interface PreSttStats {
  /** Number of frames processed */
  framesProcessed: number;
  /** Current AGC gain (1.0 = no change) */
  agcGain: number;
  /** Whether noise suppression has noise floor estimate */
  noiseSuppressionReady: boolean;
  /** Whether bandwidth extension was applied */
  bandwidthExtended: boolean;
}

/** Frame analysis result (combined pitch + energy + VAD) */
export interface FrameAnalysis {
  pitch: PitchResult;
  energyDb: number;
  energyRms: number;
  zcr: number;
  isSpeech: boolean;
  isVoiced: boolean;
  timestampMs: number;
}

/** VAD configuration */
export interface VadConfig {
  /** Energy threshold in dB (default: -40) */
  energyThresholdDb?: number;
  /** Max ZCR for voiced speech (default: 0.3) */
  zcrMax?: number;
}

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Native module API contract */
interface FerniAudioDspModule {
  // YIN Pitch Detection
  estimatePitchYin: (
    samples: Float32Array,
    sampleRate: number,
    minPitch?: number,
    maxPitch?: number
  ) => { pitchHz: number; confidence: number; periodSamples: number };

  batchEstimatePitchYin: (
    samples: Float32Array,
    sampleRate: number,
    frameSize: number,
    hopSize: number,
    minPitch?: number,
    maxPitch?: number
  ) => Array<{ pitchHz: number; confidence: number; periodSamples: number }>;

  // Legacy pitch (autocorrelation)
  estimatePitch: (
    samples: Float32Array,
    sampleRate: number,
    minPitch?: number,
    maxPitch?: number
  ) => { pitchHz: number; confidence: number };

  // Energy
  computeRms: (samples: Float32Array) => number;
  computeEnergyDb: (samples: Float32Array) => number;
  computeVariance: (values: Float32Array) => number;
  computeMean: (values: Float32Array) => number;
  computeStdDev: (values: Float32Array) => number;

  // Zero Crossing Rate
  computeZcr: (samples: Float32Array) => number;

  // VAD
  isSpeech: (samples: Float32Array, thresholdDb?: number) => boolean;

  // Frame features (combined)
  extractFrameFeatures: (
    samples: Float32Array,
    sampleRate: number,
    timestampMs: number
  ) => {
    pitchHz: number;
    pitchConfidence: number;
    energyDb: number;
    energyRms: number;
    zcr: number;
    isSpeech: boolean;
    isVoiced: boolean;
    timestampMs: number;
  };

  // Pre-STT Processing (note: NAPI-RS converts STT → Stt in JavaScript)
  NativePreSttProcessor: {
    new (config?: {
      sampleRate?: number;
      enableAgc?: boolean;
      enableNoiseSuppression?: boolean;
      enableHighpass?: boolean;
      highpassCutoffHz?: number;
      enableBandwidthExtension?: boolean;
      inputIs8khz?: boolean;
    }): NativePreSttProcessorInstance;
    withDefaults: () => NativePreSttProcessorInstance;
    forTwilio: () => NativePreSttProcessorInstance;
  };

  // Standalone AGC
  applyAgc: (sessionId: string, samples: Float32Array) => number;
  resetAgc: (sessionId: string) => boolean;
  removeAgc: (sessionId: string) => boolean;

  // Conversion
  convertI16ToF32: (samples: Int16Array) => Float32Array;
}

/** Pre-STT processor instance */
interface NativePreSttProcessorInstance {
  processFrame: (samples: Float32Array, isSpeech: boolean) => Float32Array;
  processFrameI16: (samples: Int16Array, isSpeech: boolean) => Float32Array;
  getStats: () => PreSttStats;
  resetNoiseEstimate: () => void;
  reset: () => void;
}

// ============================================================================
// MODULE LOADING
// ============================================================================

let nativeModule: FerniAudioDspModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Try to load the native module without throwing.
 */
function tryLoadNativeModule(): FerniAudioDspModule | null {
  if (loadAttempted) {
    return nativeModule;
  }

  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('@ferni/audio') as FerniAudioDspModule;
    log.debug('🦀 Native audio DSP module loaded');
    return nativeModule;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    log.debug({ error: loadError }, 'Native audio DSP module unavailable - using JS fallback');
    return null;
  }
}

/**
 * Get native module, throws if unavailable.
 */
function getNativeModule(): FerniAudioDspModule {
  const mod = tryLoadNativeModule();
  if (!mod) {
    throw new Error(`Native audio DSP module unavailable: ${loadError}`);
  }
  return mod;
}

// ============================================================================
// JAVASCRIPT FALLBACKS
// ============================================================================

/**
 * JavaScript fallback for RMS energy
 */
function computeRmsFallback(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * JavaScript fallback for energy in dB
 */
function computeEnergyDbFallback(samples: Float32Array): number {
  const rms = computeRmsFallback(samples);
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

/**
 * JavaScript fallback for ZCR
 */
function computeZcrFallback(samples: Float32Array): number {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (samples.length - 1);
}

/**
 * JavaScript fallback for mean
 */
function computeMeanFallback(values: Float32Array): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

/**
 * JavaScript fallback for variance
 */
function computeVarianceFallback(values: Float32Array): number {
  if (values.length < 2) return 0;
  const mean = computeMeanFallback(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    sum += diff * diff;
  }
  return sum / values.length;
}

/**
 * JavaScript fallback for standard deviation
 */
function computeStdDevFallback(values: Float32Array): number {
  return Math.sqrt(computeVarianceFallback(values));
}

/**
 * JavaScript fallback for pitch detection (autocorrelation - O(n²))
 *
 * NOTE: This is much slower than the native YIN implementation.
 * Use native when available for real-time processing.
 */
function estimatePitchFallback(
  samples: Float32Array,
  sampleRate: number,
  minPitch = 50,
  maxPitch = 500
): PitchResult {
  const n = samples.length;
  const minLag = Math.ceil(sampleRate / maxPitch);
  const maxLag = Math.ceil(sampleRate / minPitch);

  if (n < maxLag * 2) {
    return { pitchHz: 0, confidence: 0, periodSamples: 0 };
  }

  // Compute r(0) for normalization
  let r0 = 0;
  for (let i = 0; i < n; i++) {
    r0 += samples[i] * samples[i];
  }

  if (r0 < 1e-10) {
    return { pitchHz: 0, confidence: 0, periodSamples: 0 };
  }

  let maxCorrelation = 0;
  let bestLag = 0;

  // Search for peak in valid pitch range
  const searchMax = Math.min(maxLag, Math.floor(n / 2));
  for (let lag = minLag; lag < searchMax; lag++) {
    let correlation = 0;
    for (let j = 0; j < n - lag; j++) {
      correlation += samples[j] * samples[j + lag];
    }

    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestLag = lag;
    }
  }

  const confidence = Math.min(maxCorrelation / r0, 1);

  if (confidence < 0.3 || bestLag === 0) {
    return { pitchHz: 0, confidence: 0, periodSamples: 0 };
  }

  const pitchHz = sampleRate / bestLag;

  if (pitchHz < minPitch || pitchHz > maxPitch) {
    return { pitchHz: 0, confidence: 0, periodSamples: 0 };
  }

  return { pitchHz, confidence, periodSamples: bestLag };
}

// ============================================================================
// PUBLIC API - AudioDspProcessor Interface
// ============================================================================

/**
 * Check if native audio DSP is available.
 */
export function isNativeAudioDspAvailable(): boolean {
  return tryLoadNativeModule() !== null;
}

/**
 * Get the native module load error (for debugging).
 */
export function getNativeLoadError(): string | null {
  tryLoadNativeModule();
  return loadError;
}

// ============================================================================
// PITCH DETECTION
// ============================================================================

/**
 * Detect pitch using YIN algorithm (SIMD-accelerated).
 *
 * Uses native YIN implementation when available (~40x faster).
 * Falls back to JavaScript autocorrelation if native unavailable.
 *
 * @param samples - Audio samples (normalized -1 to 1)
 * @param sampleRate - Sample rate in Hz
 * @param minPitch - Minimum pitch to detect (default: 50 Hz)
 * @param maxPitch - Maximum pitch to detect (default: 500 Hz)
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minPitch = 50,
  maxPitch = 500
): PitchResult {
  const mod = tryLoadNativeModule();

  if (mod?.estimatePitchYin) {
    const result = mod.estimatePitchYin(samples, sampleRate, minPitch, maxPitch);
    return {
      pitchHz: result.pitchHz,
      confidence: result.confidence,
      periodSamples: result.periodSamples,
    };
  }

  // Fallback to JS autocorrelation
  return estimatePitchFallback(samples, sampleRate, minPitch, maxPitch);
}

/**
 * Batch pitch detection for utterance-level analysis.
 *
 * @param samples - Full audio buffer
 * @param sampleRate - Sample rate in Hz
 * @param frameSize - Frame size in samples (default: 512)
 * @param hopSize - Hop size in samples (default: 256)
 * @param minPitch - Minimum pitch (default: 50 Hz)
 * @param maxPitch - Maximum pitch (default: 500 Hz)
 */
export function detectPitchBatch(
  samples: Float32Array,
  sampleRate: number,
  frameSize = 512,
  hopSize = 256,
  minPitch = 50,
  maxPitch = 500
): PitchResult[] {
  const mod = tryLoadNativeModule();

  if (mod?.batchEstimatePitchYin) {
    return mod
      .batchEstimatePitchYin(samples, sampleRate, frameSize, hopSize, minPitch, maxPitch)
      .map((r) => ({
        pitchHz: r.pitchHz,
        confidence: r.confidence,
        periodSamples: r.periodSamples,
      }));
  }

  // Fallback: process frames in JavaScript
  const results: PitchResult[] = [];
  let pos = 0;
  while (pos + frameSize <= samples.length) {
    const frame = samples.subarray(pos, pos + frameSize);
    results.push(estimatePitchFallback(frame, sampleRate, minPitch, maxPitch));
    pos += hopSize;
  }
  return results;
}

// ============================================================================
// ENERGY & RMS
// ============================================================================

/**
 * Calculate RMS (Root Mean Square) energy.
 *
 * @param samples - Audio samples
 * @returns Linear RMS value
 */
export function calculateRms(samples: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeRms ? mod.computeRms(samples) : computeRmsFallback(samples);
}

/**
 * Calculate energy in decibels.
 *
 * @param samples - Audio samples
 * @returns Energy in dB
 */
export function calculateEnergyDb(samples: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeEnergyDb ? mod.computeEnergyDb(samples) : computeEnergyDbFallback(samples);
}

// ============================================================================
// ZERO CROSSING RATE
// ============================================================================

/**
 * Calculate Zero Crossing Rate.
 *
 * @param samples - Audio samples
 * @returns ZCR value (0-1)
 */
export function calculateZcr(samples: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeZcr ? mod.computeZcr(samples) : computeZcrFallback(samples);
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Calculate mean of values.
 */
export function calculateMean(values: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeMean ? mod.computeMean(values) : computeMeanFallback(values);
}

/**
 * Calculate variance of values.
 */
export function calculateVariance(values: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeVariance ? mod.computeVariance(values) : computeVarianceFallback(values);
}

/**
 * Calculate standard deviation of values.
 */
export function calculateStdDev(values: Float32Array): number {
  const mod = tryLoadNativeModule();
  return mod?.computeStdDev ? mod.computeStdDev(values) : computeStdDevFallback(values);
}

// ============================================================================
// VOICE ACTIVITY DETECTION
// ============================================================================

/**
 * Detect voice activity combining energy and ZCR.
 *
 * @param samples - Audio samples
 * @param config - VAD configuration
 */
export function detectVoiceActivity(samples: Float32Array, config?: VadConfig): VadResult {
  const energyThresholdDb = config?.energyThresholdDb ?? -40;
  const zcrMax = config?.zcrMax ?? 0.3;

  const energyDb = calculateEnergyDb(samples);
  const zcr = calculateZcr(samples);

  const isSpeech = energyDb > energyThresholdDb;
  const isVoiced = isSpeech && zcr < zcrMax;

  return {
    isSpeech,
    isVoiced,
    energyDb,
    zcr,
  };
}

// ============================================================================
// FRAME ANALYSIS (COMBINED)
// ============================================================================

/**
 * Analyze a single audio frame (combined pitch + energy + VAD).
 *
 * More efficient than calling individual functions separately.
 *
 * @param samples - Audio samples
 * @param sampleRate - Sample rate in Hz
 * @param timestampMs - Current timestamp
 */
export function analyzeFrame(
  samples: Float32Array,
  sampleRate: number,
  timestampMs: number
): FrameAnalysis {
  const mod = tryLoadNativeModule();

  if (mod?.extractFrameFeatures) {
    const features = mod.extractFrameFeatures(samples, sampleRate, timestampMs);
    return {
      pitch: {
        pitchHz: features.pitchHz,
        confidence: features.pitchConfidence,
        periodSamples: 0, // Not provided by extractFrameFeatures
      },
      energyDb: features.energyDb,
      energyRms: features.energyRms,
      zcr: features.zcr,
      isSpeech: features.isSpeech,
      isVoiced: features.isVoiced,
      timestampMs: features.timestampMs,
    };
  }

  // Fallback: combine individual analyses
  const pitch = detectPitch(samples, sampleRate);
  const vad = detectVoiceActivity(samples);
  const rms = calculateRms(samples);

  return {
    pitch,
    energyDb: vad.energyDb,
    energyRms: rms,
    zcr: vad.zcr,
    isSpeech: vad.isSpeech,
    isVoiced: vad.isVoiced,
    timestampMs,
  };
}

// ============================================================================
// PRE-STT PROCESSING
// ============================================================================

/**
 * Pre-STT audio processor with AGC, noise suppression, and bandwidth extension.
 */
export interface PreSttProcessor {
  /** Process Float32 audio frame */
  processFrame: (samples: Float32Array, isSpeech: boolean) => Float32Array;
  /** Process Int16 audio frame (LiveKit format) */
  processFrameI16: (samples: Int16Array, isSpeech: boolean) => Float32Array;
  /** Get processing statistics */
  getStats: () => PreSttStats;
  /** Reset noise estimation (for new environment) */
  resetNoiseEstimate: () => void;
  /** Full reset */
  reset: () => void;
  /** Is using native implementation */
  readonly isNative: boolean;
}

/**
 * Create a Pre-STT processor.
 *
 * Uses native implementation if available, otherwise returns a passthrough processor.
 *
 * @param config - Processing configuration
 */
export function createPreSttProcessor(config?: PreSttConfig): PreSttProcessor {
  const mod = tryLoadNativeModule();

  if (mod?.NativePreSttProcessor) {
    try {
      const native = config
        ? new mod.NativePreSttProcessor({
            sampleRate: config.sampleRate,
            enableAgc: config.enableAgc,
            enableNoiseSuppression: config.enableNoiseSuppression,
            enableHighpass: config.enableHighpass,
            highpassCutoffHz: config.highpassCutoffHz,
            enableBandwidthExtension: config.enableBandwidthExtension,
            inputIs8khz: config.inputIs8khz,
          })
        : mod.NativePreSttProcessor.withDefaults();

      return {
        processFrame: (samples, isSpeech) => native.processFrame(samples, isSpeech),
        processFrameI16: (samples, isSpeech) => native.processFrameI16(samples, isSpeech),
        getStats: () => native.getStats(),
        resetNoiseEstimate: () => native.resetNoiseEstimate(),
        reset: () => native.reset(),
        isNative: true,
      };
    } catch (err) {
      log.warn({ error: err }, 'Failed to create native Pre-STT processor');
    }
  }

  // Fallback: passthrough processor (no enhancement)
  log.debug('Using passthrough Pre-STT processor (native unavailable)');

  let framesProcessed = 0;

  return {
    processFrame: (samples, _isSpeech) => {
      framesProcessed++;
      return samples; // Passthrough
    },
    processFrameI16: (samples, _isSpeech) => {
      framesProcessed++;
      // Simple conversion
      const result = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        result[i] = samples[i] / 32768.0;
      }
      return result;
    },
    getStats: () => ({
      framesProcessed,
      agcGain: 1.0,
      noiseSuppressionReady: false,
      bandwidthExtended: false,
    }),
    resetNoiseEstimate: () => {},
    reset: () => {
      framesProcessed = 0;
    },
    isNative: false,
  };
}

/**
 * Create a Pre-STT processor optimized for Twilio (8kHz → 16kHz).
 */
export function createTwilioPreSttProcessor(): PreSttProcessor {
  const mod = tryLoadNativeModule();

  if (mod?.NativePreSttProcessor?.forTwilio) {
    const native = mod.NativePreSttProcessor.forTwilio();
    return {
      processFrame: (samples, isSpeech) => native.processFrame(samples, isSpeech),
      processFrameI16: (samples, isSpeech) => native.processFrameI16(samples, isSpeech),
      getStats: () => native.getStats(),
      resetNoiseEstimate: () => native.resetNoiseEstimate(),
      reset: () => native.reset(),
      isNative: true,
    };
  }

  // Fallback
  return createPreSttProcessor({
    inputIs8khz: true,
    enableBandwidthExtension: true,
  });
}

// ============================================================================
// STANDALONE AGC
// ============================================================================

/**
 * Apply AGC to audio samples (session-scoped).
 *
 * @param sessionId - Session identifier for state management
 * @param samples - Audio samples to process (modified in place by native)
 * @returns Current AGC gain
 */
export function applyAgc(sessionId: string, samples: Float32Array): number {
  const mod = tryLoadNativeModule();

  if (mod?.applyAgc) {
    return mod.applyAgc(sessionId, samples);
  }

  // Fallback: simple normalization
  const rms = computeRmsFallback(samples);
  const targetRms = 0.1;
  const gain = rms > 0.001 ? Math.min(targetRms / rms, 10) : 1;

  for (let i = 0; i < samples.length; i++) {
    samples[i] *= gain;
  }

  return gain;
}

/**
 * Reset AGC state for a session.
 */
export function resetAgc(sessionId: string): boolean {
  const mod = tryLoadNativeModule();
  return mod?.resetAgc ? mod.resetAgc(sessionId) : false;
}

/**
 * Remove AGC instance for a session.
 */
export function removeAgc(sessionId: string): boolean {
  const mod = tryLoadNativeModule();
  return mod?.removeAgc ? mod.removeAgc(sessionId) : false;
}

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert Int16 samples to Float32.
 *
 * @param samples - Int16 audio samples
 * @returns Float32 normalized samples
 */
export function convertI16ToF32(samples: Int16Array): Float32Array {
  const mod = tryLoadNativeModule();

  if (mod?.convertI16ToF32) {
    return mod.convertI16ToF32(samples);
  }

  // Fallback
  const result = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    result[i] = samples[i] / 32768.0;
  }
  return result;
}

// ============================================================================
// UNIFIED AUDIO DSP PROCESSOR INTERFACE
// ============================================================================

/**
 * Unified interface for all audio DSP operations.
 *
 * This is the recommended interface for use in voice processing pipelines.
 */
export interface AudioDspProcessor {
  // Real-time analysis
  detectPitch: (samples: Float32Array, sampleRate: number) => PitchResult;
  calculateRms: (samples: Float32Array) => number;
  calculateZcr: (samples: Float32Array) => number;
  detectVoiceActivity: (samples: Float32Array, config?: VadConfig) => VadResult;

  // Pre-STT enhancement
  applyAgc: (samples: Float32Array, sessionId: string) => number;

  // Batch operations
  analyzeFrame: (samples: Float32Array, sampleRate: number, timestampMs: number) => FrameAnalysis;

  // Status
  readonly isNative: boolean;
}

/**
 * Create a unified audio DSP processor.
 */
export function createAudioDspProcessor(): AudioDspProcessor {
  const isNative = isNativeAudioDspAvailable();

  return {
    detectPitch,
    calculateRms,
    calculateZcr,
    detectVoiceActivity,
    applyAgc: (samples, sessionId) => applyAgc(sessionId, samples),
    analyzeFrame,
    isNative,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
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
};
