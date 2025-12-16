/**
 * FFT Analyzer Types
 *
 * Type definitions for spectral analysis.
 *
 * @module fft-analyzer/types
 */

// ============================================================================
// COMPLEX NUMBERS
// ============================================================================

/**
 * Complex number for FFT calculations
 */
export interface Complex {
  re: number;
  im: number;
}

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

/**
 * Spectral analysis result
 */
export interface SpectralAnalysis {
  /** Magnitude spectrum (0-1 normalized) */
  magnitudes: Float32Array;
  /** Frequency bins (Hz) */
  frequencies: Float32Array;
  /** Dominant frequency (Hz) */
  dominantFrequency: number;
  /** Spectral centroid (brightness indicator) */
  spectralCentroid: number;
  /** Spectral rolloff (frequency below which 85% of energy lies) */
  spectralRolloff: number;
  /** Spectral flux (rate of spectral change) */
  spectralFlux: number;
  /** Band energies for classification */
  bandEnergies: BandEnergies;
}

/**
 * Energy distribution across frequency bands
 */
export interface BandEnergies {
  /** 20-60 Hz - sub-bass rumble */
  subBass: number;
  /** 60-250 Hz - bass */
  bass: number;
  /** 250-500 Hz - low mid */
  lowMid: number;
  /** 500-2000 Hz - mid (speech fundamental) */
  mid: number;
  /** 2000-4000 Hz - high mid (speech harmonics) */
  highMid: number;
  /** 4000-6000 Hz - presence (clarity) */
  presence: number;
  /** 6000-20000 Hz - brilliance */
  brilliance: number;
}

// ============================================================================
// ENVIRONMENT CLASSIFICATION
// ============================================================================

/**
 * Environment type detected from spectral analysis
 */
export type EnvironmentType =
  | 'quiet'
  | 'speech'
  | 'music'
  | 'traffic'
  | 'crowd'
  | 'wind'
  | 'unknown';

/**
 * Environment classification from spectral features
 */
export interface SpectralEnvironment {
  /** Detected environment type */
  environment: EnvironmentType;
  /** Confidence (0-1) */
  confidence: number;
  /** Is there likely human speech? */
  hasSpeech: boolean;
  /** Is there likely music? */
  hasMusic: boolean;
  /** Background noise level (0-1) */
  noiseFloor: number;
  /** Signal-to-noise ratio estimate (dB) */
  snrEstimate: number;
}

// ============================================================================
// LAUGHTER DETECTION
// ============================================================================

/**
 * Laughter spectral signature
 */
export interface LaughterSpectralFeatures {
  /** Is laughter-like spectral pattern present? */
  isLaughterLike: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** Harmonic-to-noise ratio (laughter is less harmonic than speech) */
  hnr: number;
  /** Spectral irregularity (laughter has irregular patterns) */
  irregularity: number;
  /** Burst pattern detected */
  hasBurstPattern: boolean;
}
