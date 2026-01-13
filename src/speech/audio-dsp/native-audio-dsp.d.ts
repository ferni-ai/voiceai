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
/**
 * Check if native audio DSP is available.
 */
export declare function isNativeAudioDspAvailable(): boolean;
/**
 * Get the native module load error (for debugging).
 */
export declare function getNativeLoadError(): string | null;
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
export declare function detectPitch(samples: Float32Array, sampleRate: number, minPitch?: number, maxPitch?: number): PitchResult;
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
export declare function detectPitchBatch(samples: Float32Array, sampleRate: number, frameSize?: number, hopSize?: number, minPitch?: number, maxPitch?: number): PitchResult[];
/**
 * Calculate RMS (Root Mean Square) energy.
 *
 * @param samples - Audio samples
 * @returns Linear RMS value
 */
export declare function calculateRms(samples: Float32Array): number;
/**
 * Calculate energy in decibels.
 *
 * @param samples - Audio samples
 * @returns Energy in dB
 */
export declare function calculateEnergyDb(samples: Float32Array): number;
/**
 * Calculate Zero Crossing Rate.
 *
 * @param samples - Audio samples
 * @returns ZCR value (0-1)
 */
export declare function calculateZcr(samples: Float32Array): number;
/**
 * Calculate mean of values.
 */
export declare function calculateMean(values: Float32Array): number;
/**
 * Calculate variance of values.
 */
export declare function calculateVariance(values: Float32Array): number;
/**
 * Calculate standard deviation of values.
 */
export declare function calculateStdDev(values: Float32Array): number;
/**
 * Detect voice activity combining energy and ZCR.
 *
 * @param samples - Audio samples
 * @param config - VAD configuration
 */
export declare function detectVoiceActivity(samples: Float32Array, config?: VadConfig): VadResult;
/**
 * Analyze a single audio frame (combined pitch + energy + VAD).
 *
 * More efficient than calling individual functions separately.
 *
 * @param samples - Audio samples
 * @param sampleRate - Sample rate in Hz
 * @param timestampMs - Current timestamp
 */
export declare function analyzeFrame(samples: Float32Array, sampleRate: number, timestampMs: number): FrameAnalysis;
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
export declare function createPreSttProcessor(config?: PreSttConfig): PreSttProcessor;
/**
 * Create a Pre-STT processor optimized for Twilio (8kHz → 16kHz).
 */
export declare function createTwilioPreSttProcessor(): PreSttProcessor;
/**
 * Apply AGC to audio samples (session-scoped).
 *
 * @param sessionId - Session identifier for state management
 * @param samples - Audio samples to process (modified in place by native)
 * @returns Current AGC gain
 */
export declare function applyAgc(sessionId: string, samples: Float32Array): number;
/**
 * Reset AGC state for a session.
 */
export declare function resetAgc(sessionId: string): boolean;
/**
 * Remove AGC instance for a session.
 */
export declare function removeAgc(sessionId: string): boolean;
/**
 * Convert Int16 samples to Float32.
 *
 * @param samples - Int16 audio samples
 * @returns Float32 normalized samples
 */
export declare function convertI16ToF32(samples: Int16Array): Float32Array;
/**
 * Unified interface for all audio DSP operations.
 *
 * This is the recommended interface for use in voice processing pipelines.
 */
export interface AudioDspProcessor {
    detectPitch: (samples: Float32Array, sampleRate: number) => PitchResult;
    calculateRms: (samples: Float32Array) => number;
    calculateZcr: (samples: Float32Array) => number;
    detectVoiceActivity: (samples: Float32Array, config?: VadConfig) => VadResult;
    applyAgc: (samples: Float32Array, sessionId: string) => number;
    analyzeFrame: (samples: Float32Array, sampleRate: number, timestampMs: number) => FrameAnalysis;
    readonly isNative: boolean;
}
/**
 * Create a unified audio DSP processor.
 */
export declare function createAudioDspProcessor(): AudioDspProcessor;
declare const _default: {
    isNativeAudioDspAvailable: typeof isNativeAudioDspAvailable;
    getNativeLoadError: typeof getNativeLoadError;
    detectPitch: typeof detectPitch;
    detectPitchBatch: typeof detectPitchBatch;
    calculateRms: typeof calculateRms;
    calculateEnergyDb: typeof calculateEnergyDb;
    calculateZcr: typeof calculateZcr;
    calculateMean: typeof calculateMean;
    calculateVariance: typeof calculateVariance;
    calculateStdDev: typeof calculateStdDev;
    detectVoiceActivity: typeof detectVoiceActivity;
    analyzeFrame: typeof analyzeFrame;
    createPreSttProcessor: typeof createPreSttProcessor;
    createTwilioPreSttProcessor: typeof createTwilioPreSttProcessor;
    applyAgc: typeof applyAgc;
    resetAgc: typeof resetAgc;
    removeAgc: typeof removeAgc;
    convertI16ToF32: typeof convertI16ToF32;
    createAudioDspProcessor: typeof createAudioDspProcessor;
};
export default _default;
//# sourceMappingURL=native-audio-dsp.d.ts.map