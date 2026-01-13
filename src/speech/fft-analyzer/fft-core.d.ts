/**
 * FFT Core Implementation
 *
 * Cooley-Tukey FFT algorithm - O(n log n) complexity.
 *
 * Optimizations:
 * 1. Iterative approach eliminates function call overhead
 * 2. Pre-computed bit reversal indices (cached)
 * 3. Pre-computed twiddle factors (cached)
 * 4. In-place computation reduces memory allocation
 *
 * @see https://en.wikipedia.org/wiki/Cooley–Tukey_FFT_algorithm
 *
 * @module fft-analyzer/fft-core
 */
import type { Complex } from './types.js';
/**
 * Fast Fourier Transform using iterative Cooley-Tukey algorithm
 *
 * Time Complexity: O(n log n)
 * Space Complexity: O(n) for result + cached indices/twiddle factors
 *
 * @param signal - Input signal (will be padded to power of 2 if needed)
 * @returns Complex frequency domain representation
 */
export declare function fft(signal: Float32Array): Complex[];
/**
 * Clear FFT caches (useful for memory management in long-running processes)
 */
export declare function clearFFTCaches(): void;
/**
 * Apply Hanning window to reduce spectral leakage
 *
 * @param signal - Input signal
 * @returns Windowed signal
 */
export declare function applyHanningWindow(signal: Float32Array): Float32Array;
/**
 * Convert complex FFT result to magnitude spectrum
 *
 * @param fftResult - Complex FFT output
 * @returns Magnitude spectrum (only first half - Nyquist)
 */
export declare function getMagnitudeSpectrum(fftResult: Complex[]): Float32Array;
//# sourceMappingURL=fft-core.d.ts.map