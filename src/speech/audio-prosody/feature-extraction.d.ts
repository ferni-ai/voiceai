/**
 * Audio Feature Extraction
 *
 * Signal processing functions for extracting prosodic features from audio.
 * Includes pitch detection, energy analysis, and voice quality metrics.
 *
 * REQUIRED: Native module must be available for Int16 audio processing.
 * Uses Rust-accelerated functions via @ferni/audio module for 10-50x speedup.
 *
 * If the native module fails to load, functions throw NativeFeatureExtractionUnavailableError
 * with clear instructions for building the native module.
 *
 * @module speech/audio-prosody/feature-extraction
 */
import type { AudioBuffer, EnergyAnalysis, PauseAnalysis, PitchAnalysis, ProsodyFeatures, VoiceQualityMetrics } from './types.js';
/**
 * Error thrown when native feature extraction module is unavailable.
 * Provides actionable instructions for building the module.
 */
export declare class NativeFeatureExtractionUnavailableError extends Error {
    readonly code = "NATIVE_FEATURE_EXTRACTION_UNAVAILABLE";
    readonly buildInstructions: string;
    constructor(reason: string);
}
/** Pitch estimation result from native module */
export interface NativePitchEstimateResult {
    pitchHz: number;
    confidence: number;
}
/** Frame features result from native module */
export interface NativeFrameFeaturesResult {
    pitchHz: number;
    pitchConfidence: number;
    energyDb: number;
    energyRms: number;
    zcr: number;
    isSpeech: boolean;
    isVoiced: boolean;
    timestampMs: number;
}
/** Check if native feature extraction is available */
export declare function isNativeFeatureExtractionAvailable(): boolean;
/**
 * Get the reason native module failed to load (for debugging).
 */
export declare function getNativeFeatureExtractionLoadError(): string | null;
/**
 * Estimate pitch using native Rust autocorrelation.
 *
 * This is significantly faster than the JS autocorrelationPitch() function,
 * especially for longer audio frames.
 *
 * @param samples Audio samples (Float32Array)
 * @param sampleRate Sample rate in Hz (e.g., 16000)
 * @param minPitch Minimum pitch to detect in Hz (default: 50)
 * @param maxPitch Maximum pitch to detect in Hz (default: 500)
 * @returns Pitch in Hz and confidence (0-1)
 * @throws {NativeFeatureExtractionUnavailableError} if native unavailable
 */
export declare function estimatePitchNative(samples: Float32Array, sampleRate: number, minPitch?: number, maxPitch?: number): NativePitchEstimateResult;
/**
 * Extract full frame features using native Rust implementation.
 *
 * Returns pitch, energy, zero-crossing rate, and speech/voiced detection
 * in a single call - more efficient than calling separate functions.
 *
 * @param samples Audio samples (Float32Array)
 * @param sampleRate Sample rate in Hz (e.g., 16000)
 * @param timestampMs Timestamp for the frame
 * @returns Complete frame features
 * @throws {NativeFeatureExtractionUnavailableError} if native unavailable
 */
export declare function extractFrameFeaturesNative(samples: Float32Array, sampleRate: number, timestampMs: number): NativeFrameFeaturesResult;
/**
 * Convert audio data to Float32Array
 *
 * Uses Rust SIMD-accelerated conversion for Int16Array (most common format).
 * Uint8Array is converted in JavaScript (legacy format, rarely used).
 *
 * @throws {NativeFeatureExtractionUnavailableError} for Int16Array if native unavailable
 */
export declare function convertToFloat32(data: Int16Array | Uint8Array | Float32Array): Float32Array;
/**
 * Merge multiple audio buffers into one
 */
export declare function mergeBuffers(buffers: AudioBuffer[]): AudioBuffer | null;
/**
 * Autocorrelation-based pitch detection for a single frame
 *
 * Uses Rust SIMD-accelerated Hanning window (required).
 * Note: The O(n²) autocorrelation is still in JS.
 * For full native pitch detection, use NativeAudioProcessor from native-analyzer.ts.
 *
 * @throws {NativeFeatureExtractionUnavailableError} if native unavailable
 */
export declare function autocorrelationPitch(frame: Float32Array, sampleRate: number, minHz: number, maxHz: number): number;
/**
 * Estimate pitch characteristics from audio samples
 *
 * Uses Rust-accelerated autocorrelation when native module is available,
 * falling back to JS implementation only in edge cases.
 */
export declare function estimatePitch(samples: Float32Array, sampleRate: number): PitchAnalysis;
/**
 * Calculate energy characteristics from audio samples
 */
export declare function calculateEnergy(samples: Float32Array): EnergyAnalysis;
/**
 * Estimate speech rate (syllables per second) from audio
 */
export declare function estimateSpeechRate(samples: Float32Array, sampleRate: number): number;
/**
 * Analyze voice quality metrics (jitter, shimmer, breathiness)
 *
 * Uses Rust-accelerated pitch detection when native module is available.
 */
export declare function analyzeVoiceQuality(samples: Float32Array, sampleRate: number): VoiceQualityMetrics;
/**
 * Analyze pause characteristics in audio
 */
export declare function analyzePauses(samples: Float32Array, sampleRate: number): PauseAnalysis;
/**
 * Extract all prosody features from audio samples
 */
export declare function extractProsodyFeatures(samples: Float32Array, sampleRate: number): ProsodyFeatures;
//# sourceMappingURL=feature-extraction.d.ts.map