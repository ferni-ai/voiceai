/**
 * Native FFT Analyzer - Rust-accelerated FFT operations
 *
 * Uses the Rust ferni-audio crate for SIMD-accelerated FFT.
 * NO JavaScript fallback - native module is REQUIRED.
 *
 * Performance characteristics:
 * - Rust SIMD: 10-50x faster for FFT operations
 * - Pre-computed twiddle factors and bit reversal (cached)
 * - Zero-copy where possible
 *
 * @module speech/fft-analyzer/native-fft
 */
import type { Complex } from './types.js';
/** FFT result from native analyzer */
export interface NativeFftResult {
    /** Real parts of complex result */
    real: Array<number>;
    /** Imaginary parts of complex result */
    imaginary: Array<number>;
    /** FFT size */
    size: number;
}
/** Spectral features from native analyzer */
export interface NativeSpectralFeatures {
    /** Spectral centroid in Hz */
    centroid: number;
    /** Spectral rolloff frequency in Hz */
    rolloff: number;
    /** Dominant frequency in Hz */
    dominantFrequency: number;
    /** Dominant frequency magnitude */
    dominantMagnitude: number;
    /** Band energies (sub-bass, bass, low-mid, mid, high-mid, presence, brilliance) */
    bandEnergies: Float32Array | number[];
}
/** Library info from native module */
export interface NativeFftLibraryInfo {
    version: string;
    bufferPoolSize: number;
    maxFrameSize: number;
    defaultSampleRate: number;
}
/**
 * Custom error for when native FFT module is not available.
 */
export declare class NativeFftUnavailableError extends Error {
    constructor(reason: string);
}
interface FftMetrics {
    calls: number;
    totalSamples: number;
    totalTimeMs: number;
    lastResetTime: number;
}
/**
 * Get current FFT metrics.
 */
export declare function getFftMetrics(): FftMetrics & {
    avgTimeMs: number;
};
/**
 * Reset FFT metrics.
 */
export declare function resetFftMetrics(): void;
/**
 * Check if native FFT is available.
 */
export declare function isNativeFftAvailable(): boolean;
/**
 * Get native library info if available.
 */
export declare function getNativeFftInfo(): NativeFftLibraryInfo | null;
/**
 * Get the reason native module failed to load (for debugging).
 */
export declare function getNativeFftLoadError(): string | null;
/**
 * Ensure native FFT is available, throwing if not.
 * Call this at startup to fail fast.
 */
export declare function requireNativeFft(): void;
/**
 * Fast Fourier Transform using native Rust implementation.
 *
 * @param samples - Input signal (Float32Array)
 * @returns Complex frequency domain representation
 * @throws NativeFftUnavailableError if native module not available
 */
export declare function fftNative(samples: Float32Array): Complex[];
/**
 * Apply Hanning window using native Rust implementation.
 *
 * @param samples - Input signal
 * @returns Windowed signal
 * @throws NativeFftUnavailableError if native module not available
 */
export declare function applyHanningWindowNative(samples: Float32Array): Float32Array;
/**
 * Get magnitude spectrum using native Rust implementation.
 *
 * @param fftResult - Complex FFT output
 * @returns Magnitude spectrum (only first half - Nyquist)
 * @throws NativeFftUnavailableError if native module not available
 */
export declare function getMagnitudeSpectrumNative(fftResult: Complex[]): Float32Array;
/**
 * Full spectral analysis using native Rust implementation.
 * Computes centroid, rolloff, dominant frequency, and band energies.
 *
 * @param samples - Audio samples
 * @param sampleRate - Sample rate in Hz
 * @param minFreq - Minimum frequency to analyze (default: 20 Hz)
 * @param maxFreq - Maximum frequency to analyze (default: Nyquist)
 * @returns Spectral features
 * @throws NativeFftUnavailableError if native module not available
 */
export declare function analyzeSpectrumNative(samples: Float32Array, sampleRate: number, minFreq?: number, maxFreq?: number): NativeSpectralFeatures;
/**
 * Log FFT accelerator status for debugging.
 */
export declare function logFftStatus(): void;
export {};
//# sourceMappingURL=native-fft.d.ts.map