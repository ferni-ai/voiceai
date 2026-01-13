/**
 * Laughter Spectral Detection
 *
 * Analyzes spectral features for laughter detection.
 *
 * Laughter has distinctive spectral characteristics:
 * 1. Lower harmonic-to-noise ratio than speech
 * 2. Irregular spectral patterns
 * 3. Burst-like energy patterns
 *
 * @module fft-analyzer/laughter
 */
import type { LaughterSpectralFeatures, SpectralAnalysis } from './types.js';
/**
 * Analyze spectral features for laughter detection
 *
 * Combines multiple indicators:
 * - Lower HNR (more noisy than speech)
 * - Higher spectral irregularity
 * - Burst patterns in energy
 * - Higher spectral centroid
 *
 * @param spectrum - Current spectral analysis
 * @param previousSpectrum - Optional previous frame for burst detection
 * @returns Laughter spectral features
 */
export declare function analyzeLaughterSpectral(spectrum: SpectralAnalysis, previousSpectrum?: SpectralAnalysis): LaughterSpectralFeatures;
//# sourceMappingURL=laughter.d.ts.map