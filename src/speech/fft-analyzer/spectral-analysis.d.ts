/**
 * Spectral Analysis
 *
 * Functions for analyzing spectral content of audio signals.
 *
 * @module fft-analyzer/spectral-analysis
 */
import type { BandEnergies, SpectralAnalysis } from './types.js';
/**
 * Calculate energy in standard frequency bands
 *
 * @param magnitudes - Magnitude spectrum
 * @param frequencies - Frequency bins
 * @param sampleRate - Sample rate
 * @returns Band energies (normalized 0-1)
 */
export declare function calculateBandEnergies(magnitudes: Float32Array, frequencies: Float32Array, sampleRate: number): BandEnergies;
/**
 * Perform full spectral analysis on audio buffer
 *
 * @param samples - Audio samples (Int16Array from LiveKit)
 * @param sampleRate - Sample rate (typically 16000 or 48000)
 * @returns Complete spectral analysis
 */
export declare function analyzeSpectrum(samples: Int16Array, sampleRate?: number): SpectralAnalysis;
//# sourceMappingURL=spectral-analysis.d.ts.map