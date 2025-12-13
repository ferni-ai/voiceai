/**
 * FFT Analyzer for Audio Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Implements Fast Fourier Transform for spectral analysis of audio signals.
 * This enables:
 * 1. Better ambient environment detection (music vs speech vs noise)
 * 2. Improved prosody analysis (formant frequencies)
 * 3. More accurate laughter detection (spectral patterns)
 *
 * Uses Cooley-Tukey FFT algorithm - O(n log n) complexity.
 *
 * @module fft-analyzer
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  BandEnergies,
  Complex,
  EnvironmentType,
  LaughterSpectralFeatures,
  SpectralAnalysis,
  SpectralEnvironment,
} from './types.js';

// ============================================================================
// FFT CORE
// ============================================================================

export {
  applyHanningWindow,
  clearFFTCaches,
  fft,
  getMagnitudeSpectrum,
} from './fft-core.js';

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

export { analyzeSpectrum, calculateBandEnergies } from './spectral-analysis.js';

// ============================================================================
// ENVIRONMENT CLASSIFICATION
// ============================================================================

export { classifyEnvironment } from './environment.js';

// ============================================================================
// LAUGHTER DETECTION
// ============================================================================

export { analyzeLaughterSpectral } from './laughter.js';

// ============================================================================
// SERVICE
// ============================================================================

export {
  FFTAnalyzerService,
  getActiveFFTAnalyzerCount,
  getFFTAnalyzer,
  resetFFTAnalyzer,
} from './service.js';

