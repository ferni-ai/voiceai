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
import { createRequire } from 'module';
import { getLogger } from '../../utils/safe-logger.js';
// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);
const log = getLogger().child({ module: 'FeatureExtraction' });
// ============================================================================
// CUSTOM ERROR
// ============================================================================
/**
 * Error thrown when native feature extraction module is unavailable.
 * Provides actionable instructions for building the module.
 */
export class NativeFeatureExtractionUnavailableError extends Error {
    code = 'NATIVE_FEATURE_EXTRACTION_UNAVAILABLE';
    buildInstructions;
    constructor(reason) {
        super(`Native feature extraction module unavailable: ${reason}`);
        this.name = 'NativeFeatureExtractionUnavailableError';
        this.buildInstructions = `
To fix this error, build the native audio module:

  cd apps/rust-audio
  pnpm build

Or install pre-built binaries:

  pnpm install @ferni/audio

The native module is REQUIRED for production - no JavaScript fallback exists.
This ensures consistent performance and prevents silent degradation.
`;
        Object.setPrototypeOf(this, NativeFeatureExtractionUnavailableError.prototype);
    }
}
let nativeModule = null;
let loadAttempted = false;
let loadError = null;
/**
 * Load the native Rust audio module.
 * THROWS if the module is unavailable - no silent fallback.
 */
function loadNativeModule() {
    if (loadAttempted && nativeModule) {
        return nativeModule;
    }
    if (loadAttempted && loadError) {
        throw new NativeFeatureExtractionUnavailableError(loadError);
    }
    loadAttempted = true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        nativeModule = require('@ferni/audio');
        log.debug('🦀 Native feature extraction loaded');
        return nativeModule;
    }
    catch (err) {
        loadError = err instanceof Error ? err.message : String(err);
        log.error({ error: loadError }, '❌ Native feature extraction failed to load - NO FALLBACK');
        throw new NativeFeatureExtractionUnavailableError(loadError);
    }
}
/**
 * Try to load the native module without throwing.
 * Used for isNativeFeatureExtractionAvailable() check.
 */
function tryLoadNativeModule() {
    if (loadAttempted) {
        return nativeModule;
    }
    try {
        return loadNativeModule();
    }
    catch {
        return null;
    }
}
/** Check if native feature extraction is available */
export function isNativeFeatureExtractionAvailable() {
    return tryLoadNativeModule() !== null;
}
/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeFeatureExtractionLoadError() {
    tryLoadNativeModule(); // Ensure we've tried
    return loadError;
}
// ============================================================================
// NATIVE PITCH DETECTION (RUST-ACCELERATED)
// ============================================================================
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
export function estimatePitchNative(samples, sampleRate, minPitch = 50, maxPitch = 500) {
    const mod = loadNativeModule();
    return mod.estimatePitch(samples, sampleRate, minPitch, maxPitch);
}
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
export function extractFrameFeaturesNative(samples, sampleRate, timestampMs) {
    const mod = loadNativeModule();
    return mod.extractFrameFeatures(samples, sampleRate, timestampMs);
}
// ============================================================================
// AUDIO CONVERSION
// ============================================================================
/**
 * Convert audio data to Float32Array
 *
 * Uses Rust SIMD-accelerated conversion for Int16Array (most common format).
 * Uint8Array is converted in JavaScript (legacy format, rarely used).
 *
 * @throws {NativeFeatureExtractionUnavailableError} for Int16Array if native unavailable
 */
export function convertToFloat32(data) {
    if (data instanceof Float32Array)
        return data;
    // Int16Array: Use Rust SIMD-accelerated conversion (REQUIRED)
    if (data instanceof Int16Array) {
        const mod = loadNativeModule();
        return mod.convertI16ToF32(data);
    }
    // Uint8Array: JavaScript only (legacy format, no native implementation)
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        float32[i] = (data[i] - 128) / 128;
    }
    return float32;
}
/**
 * Merge multiple audio buffers into one
 */
export function mergeBuffers(buffers) {
    if (buffers.length === 0)
        return null;
    // Use the sample rate of the first buffer
    const { sampleRate } = buffers[0];
    const totalLength = buffers.reduce((sum, b) => sum + b.samples.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
        merged.set(buffer.samples, offset);
        offset += buffer.samples.length;
    }
    return {
        samples: merged,
        sampleRate,
        channels: 1,
        timestamp: Date.now(),
    };
}
// ============================================================================
// PITCH ANALYSIS
// ============================================================================
/**
 * Apply a Hanning windowing function to audio frame
 *
 * Uses Rust SIMD-accelerated implementation.
 * @throws {NativeFeatureExtractionUnavailableError} if native unavailable
 */
function applyWindow(frame) {
    const mod = loadNativeModule();
    return mod.applyHanningWindow(frame);
}
/**
 * Autocorrelation-based pitch detection for a single frame
 *
 * Uses Rust SIMD-accelerated Hanning window (required).
 * Note: The O(n²) autocorrelation is still in JS.
 * For full native pitch detection, use NativeAudioProcessor from native-analyzer.ts.
 *
 * @throws {NativeFeatureExtractionUnavailableError} if native unavailable
 */
export function autocorrelationPitch(frame, sampleRate, minHz, maxHz) {
    const minLag = Math.floor(sampleRate / maxHz);
    const maxLag = Math.floor(sampleRate / minHz);
    // Apply window (Rust accelerated when available)
    const windowed = applyWindow(frame);
    // Autocorrelation (O(n²) - consider using NativeAudioProcessor for full sessions)
    let maxCorr = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag && lag < windowed.length; lag++) {
        let corr = 0;
        for (let i = 0; i < windowed.length - lag; i++) {
            corr += windowed[i] * windowed[i + lag];
        }
        if (corr > maxCorr) {
            maxCorr = corr;
            bestLag = lag;
        }
    }
    // Require minimum correlation threshold
    if (bestLag === 0 || maxCorr < 0.01)
        return 0;
    return sampleRate / bestLag;
}
/**
 * Estimate pitch characteristics from audio samples
 *
 * Uses Rust-accelerated autocorrelation when native module is available,
 * falling back to JS implementation only in edge cases.
 */
export function estimatePitch(samples, sampleRate) {
    const frameSize = 2048;
    const hopSize = 512;
    const minPitch = 50; // Hz
    const maxPitch = 500; // Hz
    const pitches = [];
    const useNative = isNativeFeatureExtractionAvailable();
    for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
        const frame = samples.slice(i, i + frameSize);
        let pitch = 0;
        if (useNative) {
            // Use Rust-accelerated autocorrelation (SIMD-optimized)
            const result = estimatePitchNative(frame, sampleRate, minPitch, maxPitch);
            if (result.confidence > 0.3) {
                pitch = result.pitchHz;
            }
        }
        else {
            // Fallback to JS O(n²) autocorrelation (slower)
            pitch = autocorrelationPitch(frame, sampleRate, minPitch, maxPitch);
        }
        if (pitch > 0) {
            pitches.push(pitch);
        }
    }
    if (pitches.length === 0) {
        return { mean: 0, variance: 0, range: 0, contour: 'flat' };
    }
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const variance = pitches.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pitches.length;
    const range = Math.max(...pitches) - Math.min(...pitches);
    // Determine pitch contour
    let contour = 'flat';
    if (pitches.length >= 4) {
        const firstHalf = pitches.slice(0, Math.floor(pitches.length / 2));
        const secondHalf = pitches.slice(Math.floor(pitches.length / 2));
        const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const diff = secondMean - firstMean;
        if (variance > 400) {
            contour = 'dynamic';
        }
        else if (diff > 20) {
            contour = 'rising';
        }
        else if (diff < -20) {
            contour = 'falling';
        }
    }
    return { mean, variance, range, contour };
}
// ============================================================================
// ENERGY ANALYSIS
// ============================================================================
/**
 * Calculate energy characteristics from audio samples
 */
export function calculateEnergy(samples) {
    if (samples.length === 0) {
        return { mean: -60, variance: 0, peaks: 0 };
    }
    // Calculate RMS energy in short frames
    const frameSize = 256;
    const hopSize = 128;
    const energies = [];
    for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
        let sum = 0;
        for (let j = 0; j < frameSize; j++) {
            sum += samples[i + j] * samples[i + j];
        }
        const rms = Math.sqrt(sum / frameSize);
        const db = 20 * Math.log10(Math.max(rms, 0.0001));
        energies.push(db);
    }
    if (energies.length === 0) {
        return { mean: -60, variance: 0, peaks: 0 };
    }
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / energies.length;
    // Count significant peaks (emphasis points)
    let peaks = 0;
    const threshold = mean + Math.sqrt(variance);
    for (let i = 1; i < energies.length - 1; i++) {
        if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
            peaks++;
        }
    }
    return { mean, variance, peaks };
}
// ============================================================================
// SPEECH RATE ANALYSIS
// ============================================================================
/**
 * Estimate speech rate (syllables per second) from audio
 */
export function estimateSpeechRate(samples, sampleRate) {
    // Estimate syllable rate from energy envelope
    const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
    const envelope = [];
    for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
        let sum = 0;
        for (let j = 0; j < frameSize; j++) {
            sum += Math.abs(samples[i + j]);
        }
        envelope.push(sum / frameSize);
    }
    // Smooth envelope
    const smoothed = [];
    const windowSize = 5;
    for (let i = 0; i < envelope.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - windowSize); j <= Math.min(envelope.length - 1, i + windowSize); j++) {
            sum += envelope[j];
            count++;
        }
        smoothed.push(sum / count);
    }
    // Count peaks (syllables)
    let syllables = 0;
    const threshold = (smoothed.reduce((a, b) => a + b, 0) / smoothed.length) * 1.5;
    for (let i = 1; i < smoothed.length - 1; i++) {
        if (smoothed[i] > threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
            syllables++;
        }
    }
    const durationSec = samples.length / sampleRate;
    return durationSec > 0 ? syllables / durationSec : 0;
}
// ============================================================================
// VOICE QUALITY ANALYSIS
// ============================================================================
/**
 * Analyze voice quality metrics (jitter, shimmer, breathiness)
 *
 * Uses Rust-accelerated pitch detection when native module is available.
 */
export function analyzeVoiceQuality(samples, sampleRate) {
    const frameSize = 2048;
    const pitches = [];
    const amplitudes = [];
    const useNative = isNativeFeatureExtractionAvailable();
    for (let i = 0; i + frameSize <= samples.length; i += frameSize / 2) {
        const frame = samples.slice(i, i + frameSize);
        let pitch = 0;
        if (useNative) {
            // Use Rust-accelerated autocorrelation
            const result = estimatePitchNative(frame, sampleRate, 50, 500);
            if (result.confidence > 0.3) {
                pitch = result.pitchHz;
            }
        }
        else {
            pitch = autocorrelationPitch(frame, sampleRate, 50, 500);
        }
        if (pitch > 0) {
            pitches.push(pitch);
            // Calculate amplitude
            let maxAmp = 0;
            for (const sample of frame) {
                maxAmp = Math.max(maxAmp, Math.abs(sample));
            }
            amplitudes.push(maxAmp);
        }
    }
    // Jitter: pitch perturbation
    let jitter = 0;
    if (pitches.length > 1) {
        let sum = 0;
        for (let i = 1; i < pitches.length; i++) {
            sum += Math.abs(pitches[i] - pitches[i - 1]);
        }
        const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
        jitter = sum / (pitches.length - 1) / avgPitch;
    }
    // Shimmer: amplitude perturbation
    let shimmer = 0;
    if (amplitudes.length > 1) {
        let sum = 0;
        for (let i = 1; i < amplitudes.length; i++) {
            sum += Math.abs(amplitudes[i] - amplitudes[i - 1]);
        }
        const avgAmp = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
        shimmer = avgAmp > 0 ? sum / (amplitudes.length - 1) / avgAmp : 0;
    }
    // Breathiness: simplified HNR approximation
    // Higher value = more breathy (less harmonic)
    const breathiness = Math.min(1, jitter * 5 + shimmer * 3);
    return { jitter, shimmer, breathiness };
}
// ============================================================================
// PAUSE ANALYSIS
// ============================================================================
/**
 * Analyze pause characteristics in audio
 */
export function analyzePauses(samples, sampleRate) {
    const frameSize = Math.floor(sampleRate * 0.01); // 10ms frames
    const silenceThreshold = 0.01;
    let inPause = false;
    let pauseStart = 0;
    const pauses = [];
    let speechFrames = 0;
    for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
        let energy = 0;
        for (let j = 0; j < frameSize; j++) {
            energy += Math.abs(samples[i + j]);
        }
        energy /= frameSize;
        const isSilent = energy < silenceThreshold;
        if (isSilent && !inPause) {
            inPause = true;
            pauseStart = i;
        }
        else if (!isSilent && inPause) {
            inPause = false;
            const pauseDuration = ((i - pauseStart) / sampleRate) * 1000; // ms
            if (pauseDuration > 100) {
                // Only count pauses > 100ms
                pauses.push(pauseDuration);
            }
        }
        if (!isSilent) {
            speechFrames++;
        }
    }
    const totalFrames = Math.floor(samples.length / frameSize);
    const durationMin = samples.length / sampleRate / 60;
    return {
        avgDuration: pauses.length > 0 ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0,
        frequency: durationMin > 0 ? pauses.length / durationMin : 0,
        speakingRatio: totalFrames > 0 ? speechFrames / totalFrames : 1,
    };
}
// ============================================================================
// FULL PROSODY EXTRACTION
// ============================================================================
/**
 * Extract all prosody features from audio samples
 */
export function extractProsodyFeatures(samples, sampleRate) {
    const energy = calculateEnergy(samples);
    const pitch = estimatePitch(samples, sampleRate);
    const rate = estimateSpeechRate(samples, sampleRate);
    const quality = analyzeVoiceQuality(samples, sampleRate);
    const pauses = analyzePauses(samples, sampleRate);
    const duration = samples.length / sampleRate;
    return {
        pitchMean: pitch.mean,
        pitchVariance: pitch.variance,
        pitchRange: pitch.range,
        pitchContour: pitch.contour,
        energyMean: energy.mean,
        energyVariance: energy.variance,
        energyPeaks: energy.peaks,
        speechRate: rate,
        pauseDuration: pauses.avgDuration,
        pauseFrequency: pauses.frequency,
        jitter: quality.jitter,
        shimmer: quality.shimmer,
        breathiness: quality.breathiness,
        utteranceDuration: duration * 1000,
        speakingRatio: pauses.speakingRatio,
    };
}
//# sourceMappingURL=feature-extraction.js.map