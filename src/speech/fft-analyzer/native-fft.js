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
import { createRequire } from 'module';
import { getLogger } from '../../utils/safe-logger.js';
// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);
const log = getLogger().child({ module: 'NativeFFT' });
// ============================================================================
// MODULE LOADING (FAIL FAST - NO FALLBACK)
// ============================================================================
let nativeModule = null;
let loadAttempted = false;
let loadError = null;
/**
 * Custom error for when native FFT module is not available.
 */
export class NativeFftUnavailableError extends Error {
    constructor(reason) {
        super(`Native FFT module not available: ${reason}\n` +
            'Solutions:\n' +
            '  1. Run `pnpm run build` in apps/rust-audio\n' +
            '  2. Ensure USE_NATIVE_AUDIO=true in environment\n' +
            '  3. Check that @ferni/audio is installed');
        this.name = 'NativeFftUnavailableError';
    }
}
/**
 * Load the native Rust audio module.
 * Throws NativeFftUnavailableError if not available.
 */
function loadNativeModule() {
    if (loadAttempted && nativeModule) {
        return nativeModule;
    }
    if (loadAttempted && !nativeModule) {
        throw new NativeFftUnavailableError(loadError ?? 'Unknown error');
    }
    loadAttempted = true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('@ferni/audio');
        // Verify required functions exist
        if (typeof mod.fftF32 !== 'function') {
            loadError = 'fftF32 function not found in native module';
            throw new NativeFftUnavailableError(loadError);
        }
        if (typeof mod.applyHanningWindow !== 'function') {
            loadError = 'applyHanningWindow function not found in native module';
            throw new NativeFftUnavailableError(loadError);
        }
        if (typeof mod.analyzeSpectrum !== 'function') {
            loadError = 'analyzeSpectrum function not found in native module';
            throw new NativeFftUnavailableError(loadError);
        }
        nativeModule = mod;
        const info = nativeModule.getLibraryInfo();
        log.info({
            version: info.version,
            bufferPoolSize: info.bufferPoolSize,
            sampleRate: info.defaultSampleRate,
        }, '🦀 Native FFT module loaded (SIMD-accelerated)');
        return nativeModule;
    }
    catch (err) {
        if (err instanceof NativeFftUnavailableError) {
            throw err;
        }
        loadError = err instanceof Error ? err.message : String(err);
        throw new NativeFftUnavailableError(loadError);
    }
}
/**
 * Try to load the native module, returning null on failure instead of throwing.
 * Use this only for availability checks, not for actual operations.
 */
function tryLoadNativeModule() {
    try {
        return loadNativeModule();
    }
    catch {
        return null;
    }
}
const metrics = {
    calls: 0,
    totalSamples: 0,
    totalTimeMs: 0,
    lastResetTime: Date.now(),
};
/**
 * Get current FFT metrics.
 */
export function getFftMetrics() {
    return {
        ...metrics,
        avgTimeMs: metrics.calls > 0 ? metrics.totalTimeMs / metrics.calls : 0,
    };
}
/**
 * Reset FFT metrics.
 */
export function resetFftMetrics() {
    metrics.calls = 0;
    metrics.totalSamples = 0;
    metrics.totalTimeMs = 0;
    metrics.lastResetTime = Date.now();
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Check if native FFT is available.
 */
export function isNativeFftAvailable() {
    return tryLoadNativeModule() !== null;
}
/**
 * Get native library info if available.
 */
export function getNativeFftInfo() {
    const mod = tryLoadNativeModule();
    return mod?.getLibraryInfo() ?? null;
}
/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeFftLoadError() {
    tryLoadNativeModule(); // Ensure we've tried
    return loadError;
}
/**
 * Ensure native FFT is available, throwing if not.
 * Call this at startup to fail fast.
 */
export function requireNativeFft() {
    loadNativeModule();
}
/**
 * Fast Fourier Transform using native Rust implementation.
 *
 * @param samples - Input signal (Float32Array)
 * @returns Complex frequency domain representation
 * @throws NativeFftUnavailableError if native module not available
 */
export function fftNative(samples) {
    const mod = loadNativeModule();
    const start = performance.now();
    const result = mod.fftF32(samples);
    const elapsed = performance.now() - start;
    metrics.calls++;
    metrics.totalTimeMs += elapsed;
    metrics.totalSamples += samples.length;
    // Convert to Complex[] for compatibility with existing code
    const complex = new Array(result.real.length);
    for (let i = 0; i < result.real.length; i++) {
        complex[i] = { re: result.real[i], im: result.imaginary[i] };
    }
    return complex;
}
/**
 * Apply Hanning window using native Rust implementation.
 *
 * @param samples - Input signal
 * @returns Windowed signal
 * @throws NativeFftUnavailableError if native module not available
 */
export function applyHanningWindowNative(samples) {
    const mod = loadNativeModule();
    return mod.applyHanningWindow(samples);
}
/**
 * Get magnitude spectrum using native Rust implementation.
 *
 * @param fftResult - Complex FFT output
 * @returns Magnitude spectrum (only first half - Nyquist)
 * @throws NativeFftUnavailableError if native module not available
 */
export function getMagnitudeSpectrumNative(fftResult) {
    const mod = loadNativeModule();
    // Convert Complex[] to separate arrays for native function
    const real = fftResult.map((c) => c.re);
    const imag = fftResult.map((c) => c.im);
    return mod.getMagnitudeSpectrum(real, imag);
}
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
export function analyzeSpectrumNative(samples, sampleRate, minFreq = 20, maxFreq) {
    const mod = loadNativeModule();
    const start = performance.now();
    const result = mod.analyzeSpectrum(samples, sampleRate, minFreq, maxFreq);
    const elapsed = performance.now() - start;
    metrics.calls++;
    metrics.totalTimeMs += elapsed;
    metrics.totalSamples += samples.length;
    return result;
}
/**
 * Log FFT accelerator status for debugging.
 */
export function logFftStatus() {
    const info = getNativeFftInfo();
    const m = getFftMetrics();
    if (info) {
        log.info({
            nativeAvailable: true,
            version: info.version,
            totalCalls: m.calls,
            avgTimeMs: m.avgTimeMs.toFixed(3),
            totalSamples: m.totalSamples,
        }, '🦀 Native FFT status');
    }
    else {
        log.error({
            nativeAvailable: false,
            error: loadError,
        }, '❌ Native FFT unavailable');
    }
}
//# sourceMappingURL=native-fft.js.map