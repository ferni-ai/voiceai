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

// ============================================================================
// SPECTRAL PEAK DETECTION
// ============================================================================

/**
 * Find spectral peaks (potential harmonics)
 *
 * @param magnitudes - Magnitude spectrum
 * @returns Array of peak indices
 */
function findSpectralPeaks(magnitudes: Float32Array): number[] {
  const peaks: number[] = [];
  const threshold = 0.2; // Minimum magnitude to consider

  for (let i = 2; i < magnitudes.length - 2; i++) {
    if (
      magnitudes[i] > threshold &&
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i - 2] &&
      magnitudes[i] > magnitudes[i + 1] &&
      magnitudes[i] > magnitudes[i + 2]
    ) {
      peaks.push(i);
    }
  }

  return peaks;
}

/**
 * Detect sudden energy bursts between frames
 *
 * @param current - Current spectral analysis
 * @param previous - Previous spectral analysis
 * @returns True if energy burst detected
 */
function detectEnergyBurst(current: SpectralAnalysis, previous: SpectralAnalysis): boolean {
  const currentEnergy = current.bandEnergies.mid + current.bandEnergies.highMid;
  const previousEnergy = previous.bandEnergies.mid + previous.bandEnergies.highMid;

  // Energy increase > 50% indicates burst
  return currentEnergy > previousEnergy * 1.5;
}

// ============================================================================
// LAUGHTER ANALYSIS
// ============================================================================

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
export function analyzeLaughterSpectral(
  spectrum: SpectralAnalysis,
  previousSpectrum?: SpectralAnalysis
): LaughterSpectralFeatures {
  const { magnitudes, bandEnergies, spectralCentroid } = spectrum;

  // Calculate harmonic-to-noise ratio approximation
  // Higher harmonicity = more speech-like, lower = more laughter-like
  const peaks = findSpectralPeaks(magnitudes);
  const harmonicEnergy = peaks.reduce((sum, p) => sum + magnitudes[p], 0);
  const totalEnergy = magnitudes.reduce((sum, m) => sum + m, 0);
  const hnr = totalEnergy > 0 ? harmonicEnergy / totalEnergy : 0;

  // Calculate spectral irregularity
  // Laughter has more irregular spectral envelope than speech
  let irregularity = 0;
  for (let i = 1; i < magnitudes.length - 1; i++) {
    const expected = (magnitudes[i - 1] + magnitudes[i + 1]) / 2;
    irregularity += Math.abs(magnitudes[i] - expected);
  }
  irregularity /= magnitudes.length;

  // Detect burst pattern (energy spikes)
  const hasBurstPattern = previousSpectrum ? detectEnergyBurst(spectrum, previousSpectrum) : false;

  // Laughter scoring:
  // - Lower HNR (more noisy)
  // - Higher irregularity
  // - Burst patterns
  // - Spectral centroid typically higher than speech
  const laughterScore =
    (1 - hnr) * 0.3 + // Less harmonic
    Math.min(irregularity * 2, 1) * 0.3 + // More irregular
    (hasBurstPattern ? 0.2 : 0) + // Has bursts
    (spectralCentroid > 1500 ? 0.2 : 0); // Higher centroid

  const isLaughterLike = laughterScore > 0.5;

  return {
    isLaughterLike,
    confidence: laughterScore,
    hnr,
    irregularity,
    hasBurstPattern,
  };
}
