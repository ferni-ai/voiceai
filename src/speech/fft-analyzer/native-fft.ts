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
import type { Complex } from './types.js';

// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);

const log = getLogger().child({ module: 'NativeFFT' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Native module API contract */
interface FerniAudioFftModule {
  getLibraryInfo: () => NativeFftLibraryInfo;
  fftF32: (samples: Float32Array) => NativeFftResult;
  applyHanningWindow: (samples: Float32Array) => Float32Array;
  getMagnitudeSpectrum: (real: Array<number>, imaginary: Array<number>) => Float32Array;
  analyzeSpectrum: (
    samples: Float32Array,
    sampleRate: number,
    minFreq?: number,
    maxFreq?: number
  ) => NativeSpectralFeatures;
}

// ============================================================================
// MODULE LOADING (FAIL FAST - NO FALLBACK)
// ============================================================================

let nativeModule: FerniAudioFftModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Custom error for when native FFT module is not available.
 */
export class NativeFftUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Native FFT module not available: ${reason}\n` +
        'Solutions:\n' +
        '  1. Run `pnpm run build` in apps/rust-audio\n' +
        '  2. Ensure USE_NATIVE_AUDIO=true in environment\n' +
        '  3. Check that @ferni/audio is installed'
    );
    this.name = 'NativeFftUnavailableError';
  }
}

/**
 * Load the native Rust audio module.
 * Throws NativeFftUnavailableError if not available.
 */
function loadNativeModule(): FerniAudioFftModule {
  if (loadAttempted && nativeModule) {
    return nativeModule;
  }

  if (loadAttempted && !nativeModule) {
    throw new NativeFftUnavailableError(loadError ?? 'Unknown error');
  }

  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@ferni/audio') as Partial<FerniAudioFftModule>;

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

    nativeModule = mod as FerniAudioFftModule;
    const info = nativeModule.getLibraryInfo();
    log.info(
      {
        version: info.version,
        bufferPoolSize: info.bufferPoolSize,
        sampleRate: info.defaultSampleRate,
      },
      '🦀 Native FFT module loaded (SIMD-accelerated)'
    );

    return nativeModule;
  } catch (err) {
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
function tryLoadNativeModule(): FerniAudioFftModule | null {
  try {
    return loadNativeModule();
  } catch {
    return null;
  }
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface FftMetrics {
  calls: number;
  totalSamples: number;
  totalTimeMs: number;
  lastResetTime: number;
}

const metrics: FftMetrics = {
  calls: 0,
  totalSamples: 0,
  totalTimeMs: 0,
  lastResetTime: Date.now(),
};

/**
 * Get current FFT metrics.
 */
export function getFftMetrics(): FftMetrics & { avgTimeMs: number } {
  return {
    ...metrics,
    avgTimeMs: metrics.calls > 0 ? metrics.totalTimeMs / metrics.calls : 0,
  };
}

/**
 * Reset FFT metrics.
 */
export function resetFftMetrics(): void {
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
export function isNativeFftAvailable(): boolean {
  return tryLoadNativeModule() !== null;
}

/**
 * Get native library info if available.
 */
export function getNativeFftInfo(): NativeFftLibraryInfo | null {
  const mod = tryLoadNativeModule();
  return mod?.getLibraryInfo() ?? null;
}

/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeFftLoadError(): string | null {
  tryLoadNativeModule(); // Ensure we've tried
  return loadError;
}

/**
 * Ensure native FFT is available, throwing if not.
 * Call this at startup to fail fast.
 */
export function requireNativeFft(): void {
  loadNativeModule();
}

/**
 * Fast Fourier Transform using native Rust implementation.
 *
 * @param samples - Input signal (Float32Array)
 * @returns Complex frequency domain representation
 * @throws NativeFftUnavailableError if native module not available
 */
export function fftNative(samples: Float32Array): Complex[] {
  const mod = loadNativeModule();
  const start = performance.now();

  const result = mod.fftF32(samples);

  const elapsed = performance.now() - start;
  metrics.calls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalSamples += samples.length;

  // Convert to Complex[] for compatibility with existing code
  const complex: Complex[] = new Array(result.real.length);
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
export function applyHanningWindowNative(samples: Float32Array): Float32Array {
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
export function getMagnitudeSpectrumNative(fftResult: Complex[]): Float32Array {
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
export function analyzeSpectrumNative(
  samples: Float32Array,
  sampleRate: number,
  minFreq: number = 20,
  maxFreq?: number
): NativeSpectralFeatures {
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
export function logFftStatus(): void {
  const info = getNativeFftInfo();
  const m = getFftMetrics();

  if (info) {
    log.info(
      {
        nativeAvailable: true,
        version: info.version,
        totalCalls: m.calls,
        avgTimeMs: m.avgTimeMs.toFixed(3),
        totalSamples: m.totalSamples,
      },
      '🦀 Native FFT status'
    );
  } else {
    log.error(
      {
        nativeAvailable: false,
        error: loadError,
      },
      '❌ Native FFT unavailable'
    );
  }
}
