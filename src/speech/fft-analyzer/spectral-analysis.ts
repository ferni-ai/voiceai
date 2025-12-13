/**
 * Spectral Analysis
 *
 * Functions for analyzing spectral content of audio signals.
 *
 * @module fft-analyzer/spectral-analysis
 */

import { applyHanningWindow, fft, getMagnitudeSpectrum } from './fft-core.js';
import type { BandEnergies, SpectralAnalysis } from './types.js';

// ============================================================================
// BAND ENERGY CALCULATION
// ============================================================================

/**
 * Standard frequency band definitions
 */
const BAND_DEFINITIONS = {
  subBass: { low: 20, high: 60 },
  bass: { low: 60, high: 250 },
  lowMid: { low: 250, high: 500 },
  mid: { low: 500, high: 2000 },
  highMid: { low: 2000, high: 4000 },
  presence: { low: 4000, high: 6000 },
  brilliance: { low: 6000, high: 20000 },
} as const;

/**
 * Calculate energy in standard frequency bands
 *
 * @param magnitudes - Magnitude spectrum
 * @param frequencies - Frequency bins
 * @param sampleRate - Sample rate
 * @returns Band energies (normalized 0-1)
 */
export function calculateBandEnergies(
  magnitudes: Float32Array,
  frequencies: Float32Array,
  sampleRate: number
): BandEnergies {
  const bands = {
    subBass: { ...BAND_DEFINITIONS.subBass, energy: 0 },
    bass: { ...BAND_DEFINITIONS.bass, energy: 0 },
    lowMid: { ...BAND_DEFINITIONS.lowMid, energy: 0 },
    mid: { ...BAND_DEFINITIONS.mid, energy: 0 },
    highMid: { ...BAND_DEFINITIONS.highMid, energy: 0 },
    presence: { ...BAND_DEFINITIONS.presence, energy: 0 },
    brilliance: { low: 6000, high: Math.min(20000, sampleRate / 2), energy: 0 },
  };

  for (let i = 0; i < magnitudes.length; i++) {
    const freq = frequencies[i];
    const mag = magnitudes[i] * magnitudes[i]; // Energy is magnitude squared

    for (const band of Object.values(bands)) {
      if (freq >= band.low && freq < band.high) {
        band.energy += mag;
      }
    }
  }

  // Normalize to 0-1 range
  const maxEnergy = Math.max(
    bands.subBass.energy,
    bands.bass.energy,
    bands.lowMid.energy,
    bands.mid.energy,
    bands.highMid.energy,
    bands.presence.energy,
    bands.brilliance.energy
  );

  if (maxEnergy > 0) {
    for (const band of Object.values(bands)) {
      band.energy /= maxEnergy;
    }
  }

  return {
    subBass: bands.subBass.energy,
    bass: bands.bass.energy,
    lowMid: bands.lowMid.energy,
    mid: bands.mid.energy,
    highMid: bands.highMid.energy,
    presence: bands.presence.energy,
    brilliance: bands.brilliance.energy,
  };
}

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

/**
 * Perform full spectral analysis on audio buffer
 *
 * @param samples - Audio samples (Int16Array from LiveKit)
 * @param sampleRate - Sample rate (typically 16000 or 48000)
 * @returns Complete spectral analysis
 */
export function analyzeSpectrum(samples: Int16Array, sampleRate = 16000): SpectralAnalysis {
  // Convert Int16 to Float32 normalized
  const floatSamples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    floatSamples[i] = samples[i] / 32768;
  }

  // Apply window
  const windowed = applyHanningWindow(floatSamples);

  // Perform FFT
  const fftResult = fft(windowed);

  // Get magnitude spectrum
  const magnitudes = getMagnitudeSpectrum(fftResult);

  // Normalize magnitudes
  const maxMag = Math.max(...magnitudes);
  if (maxMag > 0) {
    for (let i = 0; i < magnitudes.length; i++) {
      magnitudes[i] /= maxMag;
    }
  }

  // Calculate frequency bins
  const frequencies = new Float32Array(magnitudes.length);
  const binWidth = sampleRate / fftResult.length;
  for (let i = 0; i < magnitudes.length; i++) {
    frequencies[i] = i * binWidth;
  }

  // Find dominant frequency
  let maxIdx = 0;
  let maxVal = 0;
  for (let i = 1; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxVal) {
      maxVal = magnitudes[i];
      maxIdx = i;
    }
  }
  const dominantFrequency = maxIdx * binWidth;

  // Calculate spectral centroid (weighted average frequency)
  let weightedSum = 0;
  let totalMag = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    weightedSum += frequencies[i] * magnitudes[i];
    totalMag += magnitudes[i];
  }
  const spectralCentroid = totalMag > 0 ? weightedSum / totalMag : 0;

  // Calculate spectral rolloff (85% energy threshold)
  const targetEnergy = totalMag * 0.85;
  let cumEnergy = 0;
  let rolloffIdx = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    cumEnergy += magnitudes[i];
    if (cumEnergy >= targetEnergy) {
      rolloffIdx = i;
      break;
    }
  }
  const spectralRolloff = rolloffIdx * binWidth;

  // Calculate band energies
  const bandEnergies = calculateBandEnergies(magnitudes, frequencies, sampleRate);

  return {
    magnitudes,
    frequencies,
    dominantFrequency,
    spectralCentroid,
    spectralRolloff,
    spectralFlux: 0, // Calculated across frames in service
    bandEnergies,
  };
}

