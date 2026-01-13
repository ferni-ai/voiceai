/**
 * Native Audio Analyzer - Rust-accelerated prosody analysis
 *
 * Uses the Rust ferni-audio crate for zero-allocation audio processing.
 * REQUIRED: Native module must be available - no JavaScript fallback.
 *
 * Performance characteristics:
 * - Zero per-frame allocations (~192KB/sec GC reduction)
 * - <1ms per 20ms frame processing
 * - SIMD-accelerated where available
 *
 * If the native module fails to load, functions throw NativeAudioUnavailableError
 * with clear instructions for building the native module.
 *
 * @module speech/audio-prosody/native-analyzer
 */
/**
 * Error thrown when native audio module is unavailable.
 * Provides actionable instructions for building the module.
 */
export declare class NativeAudioUnavailableError extends Error {
    readonly code = "NATIVE_AUDIO_UNAVAILABLE";
    readonly buildInstructions: string;
    constructor(reason: string);
}
/** Prosody result from native analyzer */
export interface NativeProsodyResult {
    pitchHz: number;
    pitchConfidence: number;
    energyDb: number;
    energyVariance: number;
    zcr: number;
    isSpeech: boolean;
    isVoiced: boolean;
    silenceMs: number;
    pitchTrend: 'rising' | 'falling' | 'stable';
    timestampMs: number;
}
/** Full prosody features for end-of-utterance analysis */
export interface NativeFullProsodyFeatures {
    pitchMean: number;
    pitchVariance: number;
    pitchRange: number;
    energyMean: number;
    energyVariance: number;
    speechRate: number;
    durationMs: number;
    speakingRatio: number;
    pauseCount: number;
}
/** Processor statistics */
export interface NativeProcessorStats {
    totalSamples: number;
    analysisCount: number;
    bufferFillLevel: number;
    isInSpeech: boolean;
    currentSilenceMs: number;
}
/** Library info from native module */
export interface NativeLibraryInfo {
    version: string;
    bufferPoolSize: number;
    maxFrameSize: number;
    defaultSampleRate: number;
}
/** Instance methods for class-based API */
interface NativeProcessorInstance {
    processFrame: (samples: Int16Array, timestampMs: number) => NativeProsodyResult | null;
    processFrameF32: (samples: Float32Array, timestampMs: number) => NativeProsodyResult | null;
    getFullFeatures: () => NativeFullProsodyFeatures;
    getStats: () => NativeProcessorStats;
    reset: () => void;
    readonly sessionId: string;
}
/**
 * Check if native audio processing is available.
 */
export declare function isNativeAudioAvailable(): boolean;
/**
 * Get native library info.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function getNativeLibraryInfo(): NativeLibraryInfo;
/**
 * Get the reason native module failed to load (for debugging).
 */
export declare function getNativeLoadError(): string | null;
/**
 * Session-scoped audio processor using native Rust implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function createNativeProcessor(sessionId: string, sampleRate?: number): NativeProcessorInstance;
/**
 * Get or create a native processor for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function getOrCreateNativeProcessor(sessionId: string, sampleRate?: number): boolean;
/**
 * Process an audio frame using the session registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function processNativeFrame(sessionId: string, samples: Int16Array, timestampMs: number): NativeProsodyResult | null;
/**
 * Get full prosody features for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function getNativeFullFeatures(sessionId: string): NativeFullProsodyFeatures | null;
/**
 * Reset a native processor (keeps buffers, clears state).
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function resetNativeProcessor(sessionId: string): boolean;
/**
 * Remove a native processor from the registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function removeNativeProcessor(sessionId: string): boolean;
/**
 * Get count of active native processors.
 * Returns 0 if native module unavailable (doesn't throw).
 */
export declare function getActiveNativeProcessorCount(): number;
/**
 * Clear all native processors (emergency cleanup).
 * Returns 0 if native module unavailable (doesn't throw).
 */
export declare function clearAllNativeProcessors(): number;
/**
 * Convert Int16 samples to Float32 using native SIMD implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function convertI16ToF32(samples: Int16Array): Float32Array;
/**
 * Compute energy in dB for audio samples.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function computeEnergyDb(samples: Float32Array): number;
/**
 * Check if audio contains speech.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function isSpeechNative(samples: Float32Array, thresholdDb?: number): boolean;
/** Unified analyzer interface wrapping native implementation */
export interface UnifiedAudioAnalyzer {
    /** Process Int16 audio samples (LiveKit format) */
    processFrame: (samples: Int16Array, timestampMs: number) => NativeProsodyResult | null;
    /** Get full prosody features for end-of-utterance analysis */
    getFullFeatures: () => NativeFullProsodyFeatures;
    /** Get processor statistics */
    getStats: () => NativeProcessorStats;
    /** Reset for reuse (keeps buffers) */
    reset: () => void;
    /** Always true - native is required */
    readonly isNative: true;
    /** Session ID */
    readonly sessionId: string;
}
/**
 * Create a unified analyzer using native Rust implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 *
 * This is the recommended entry point for production use.
 */
export declare function createUnifiedAnalyzer(sessionId: string, sampleRate?: number): UnifiedAudioAnalyzer;
/**
 * Get or create a unified analyzer for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export declare function getSessionUnifiedAnalyzer(sessionId: string, sampleRate?: number): UnifiedAudioAnalyzer;
/**
 * Reset and remove a unified analyzer for a session.
 */
export declare function resetSessionUnifiedAnalyzer(sessionId: string): void;
/**
 * Get count of active unified analyzers.
 */
export declare function getActiveUnifiedAnalyzerCount(): number;
/**
 * Clear all unified analyzers (emergency cleanup).
 */
export declare function clearAllUnifiedAnalyzers(): number;
export {};
//# sourceMappingURL=native-analyzer.d.ts.map