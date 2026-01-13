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
// ============================================================================
// CACHES
// ============================================================================
/**
 * Pre-computed bit reversal table for common FFT sizes
 * Caches bit reversal permutations to avoid recomputation
 */
const bitReversalCache = new Map();
/**
 * Pre-computed twiddle factors for common FFT sizes
 * Stores cos and sin values to avoid recomputation
 */
const twiddleCache = new Map();
// ============================================================================
// CACHE HELPERS
// ============================================================================
/**
 * Get or compute bit reversal indices for a given size
 */
function getBitReversalIndices(n) {
    if (bitReversalCache.has(n)) {
        return bitReversalCache.get(n);
    }
    const bits = Math.log2(n);
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        let reversed = 0;
        for (let j = 0; j < bits; j++) {
            reversed = (reversed << 1) | ((i >> j) & 1);
        }
        indices[i] = reversed;
    }
    bitReversalCache.set(n, indices);
    return indices;
}
/**
 * Get or compute twiddle factors for a given size
 */
function getTwiddleFactors(n) {
    if (twiddleCache.has(n)) {
        return twiddleCache.get(n);
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
        const angle = (-2 * Math.PI * k) / n;
        cos[k] = Math.cos(angle);
        sin[k] = Math.sin(angle);
    }
    twiddleCache.set(n, { cos, sin });
    return { cos, sin };
}
// ============================================================================
// FFT IMPLEMENTATION
// ============================================================================
/**
 * Fast Fourier Transform using iterative Cooley-Tukey algorithm
 *
 * Time Complexity: O(n log n)
 * Space Complexity: O(n) for result + cached indices/twiddle factors
 *
 * @param signal - Input signal (will be padded to power of 2 if needed)
 * @returns Complex frequency domain representation
 */
export function fft(signal) {
    let n = signal.length;
    // Pad to next power of 2 if needed
    if (n & (n - 1)) {
        const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
        const padded = new Float32Array(nextPow2);
        padded.set(signal);
        signal = padded;
        n = nextPow2;
    }
    // Initialize result arrays (real and imaginary parts)
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    // Bit reversal permutation
    const bitReversal = getBitReversalIndices(n);
    for (let i = 0; i < n; i++) {
        re[i] = signal[bitReversal[i]];
        im[i] = 0;
    }
    // Iterative FFT (Cooley-Tukey butterfly operations)
    for (let size = 2; size <= n; size *= 2) {
        const halfSize = size / 2;
        const { cos: twiddleCos, sin: twiddleSin } = getTwiddleFactors(size);
        for (let i = 0; i < n; i += size) {
            for (let j = 0; j < halfSize; j++) {
                const idx1 = i + j;
                const idx2 = i + j + halfSize;
                // Twiddle factor multiplication
                const tRe = twiddleCos[j] * re[idx2] - twiddleSin[j] * im[idx2];
                const tIm = twiddleCos[j] * im[idx2] + twiddleSin[j] * re[idx2];
                // Butterfly operation
                const evenRe = re[idx1];
                const evenIm = im[idx1];
                re[idx1] = evenRe + tRe;
                im[idx1] = evenIm + tIm;
                re[idx2] = evenRe - tRe;
                im[idx2] = evenIm - tIm;
            }
        }
    }
    // Convert to Complex array for compatibility
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
        result[i] = { re: re[i], im: im[i] };
    }
    return result;
}
/**
 * Clear FFT caches (useful for memory management in long-running processes)
 */
export function clearFFTCaches() {
    bitReversalCache.clear();
    twiddleCache.clear();
}
/**
 * Apply Hanning window to reduce spectral leakage
 *
 * @param signal - Input signal
 * @returns Windowed signal
 */
export function applyHanningWindow(signal) {
    const n = signal.length;
    const windowed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        windowed[i] = signal[i] * window;
    }
    return windowed;
}
/**
 * Convert complex FFT result to magnitude spectrum
 *
 * @param fftResult - Complex FFT output
 * @returns Magnitude spectrum (only first half - Nyquist)
 */
export function getMagnitudeSpectrum(fftResult) {
    const n = fftResult.length / 2; // Only first half (Nyquist)
    const magnitudes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        magnitudes[i] = Math.sqrt(fftResult[i].re * fftResult[i].re + fftResult[i].im * fftResult[i].im);
    }
    return magnitudes;
}
//# sourceMappingURL=fft-core.js.map