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
 * @module FFTAnalyzer
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'FFTAnalyzer' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complex number for FFT calculations
 */
interface Complex {
  re: number;
  im: number;
}

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
  bandEnergies: {
    subBass: number; // 20-60 Hz
    bass: number; // 60-250 Hz
    lowMid: number; // 250-500 Hz
    mid: number; // 500-2000 Hz (speech fundamental)
    highMid: number; // 2000-4000 Hz (speech harmonics)
    presence: number; // 4000-6000 Hz (clarity)
    brilliance: number; // 6000-20000 Hz
  };
}

/**
 * Environment classification from spectral features
 */
export interface SpectralEnvironment {
  /** Detected environment type */
  environment: 'quiet' | 'speech' | 'music' | 'traffic' | 'crowd' | 'wind' | 'unknown';
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

// ============================================================================
// FFT IMPLEMENTATION (Iterative Cooley-Tukey - Optimized)
// ============================================================================

/**
 * Pre-computed bit reversal table for common FFT sizes
 * Caches bit reversal permutations to avoid recomputation
 */
const bitReversalCache = new Map<number, Uint32Array>();

/**
 * Get or compute bit reversal indices for a given size
 */
function getBitReversalIndices(n: number): Uint32Array {
  if (bitReversalCache.has(n)) {
    return bitReversalCache.get(n)!;
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
 * Pre-computed twiddle factors for common FFT sizes
 * Stores cos and sin values to avoid recomputation
 */
const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();

/**
 * Get or compute twiddle factors for a given size
 */
function getTwiddleFactors(n: number): { cos: Float64Array; sin: Float64Array } {
  if (twiddleCache.has(n)) {
    return twiddleCache.get(n)!;
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

/**
 * Fast Fourier Transform using iterative Cooley-Tukey algorithm
 *
 * Optimizations over recursive version:
 * 1. Iterative approach eliminates function call overhead
 * 2. Pre-computed bit reversal indices (cached)
 * 3. Pre-computed twiddle factors (cached)
 * 4. In-place computation reduces memory allocation
 *
 * @param signal - Input signal (will be padded to power of 2 if needed)
 * @returns Complex frequency domain representation
 */
function fft(signal: Float32Array): Complex[] {
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

  // Iterative FFT
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
  const result: Complex[] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = { re: re[i], im: im[i] };
  }

  return result;
}

/**
 * Clear FFT caches (useful for memory management in long-running processes)
 */
export function clearFFTCaches(): void {
  bitReversalCache.clear();
  twiddleCache.clear();
}

/**
 * Apply Hanning window to reduce spectral leakage
 */
function applyHanningWindow(signal: Float32Array): Float32Array {
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
 */
function getMagnitudeSpectrum(fftResult: Complex[]): Float32Array {
  const n = fftResult.length / 2; // Only first half (Nyquist)
  const magnitudes = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    magnitudes[i] = Math.sqrt(
      fftResult[i].re * fftResult[i].re + fftResult[i].im * fftResult[i].im
    );
  }

  return magnitudes;
}

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

/**
 * Perform full spectral analysis on audio buffer
 * @param samples - Audio samples (Int16Array from LiveKit)
 * @param sampleRate - Sample rate (typically 16000 or 48000)
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
    spectralFlux: 0, // Calculated across frames
    bandEnergies,
  };
}

/**
 * Calculate energy in standard frequency bands
 */
function calculateBandEnergies(
  magnitudes: Float32Array,
  frequencies: Float32Array,
  sampleRate: number
): SpectralAnalysis['bandEnergies'] {
  const bands = {
    subBass: { low: 20, high: 60, energy: 0 },
    bass: { low: 60, high: 250, energy: 0 },
    lowMid: { low: 250, high: 500, energy: 0 },
    mid: { low: 500, high: 2000, energy: 0 },
    highMid: { low: 2000, high: 4000, energy: 0 },
    presence: { low: 4000, high: 6000, energy: 0 },
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
// ENVIRONMENT CLASSIFICATION
// ============================================================================

/**
 * Classify environment from spectral features
 */
export function classifyEnvironment(spectrum: SpectralAnalysis): SpectralEnvironment {
  const { bandEnergies, spectralCentroid, spectralRolloff, dominantFrequency } = spectrum;

  // Feature extraction for classification
  const features = {
    // Speech indicators: energy concentrated in 300-3400 Hz (telephone band)
    speechLikelihood: (bandEnergies.lowMid + bandEnergies.mid + bandEnergies.highMid) / 3,

    // Music indicators: broad spectrum with strong bass and brilliance
    musicLikelihood: (bandEnergies.bass + bandEnergies.brilliance) / 2,

    // Traffic indicators: low frequency rumble
    trafficLikelihood: bandEnergies.subBass + bandEnergies.bass * 0.5,

    // Wind indicators: broadband noise with high spectral centroid
    windLikelihood: spectralCentroid > 2000 && bandEnergies.presence > 0.3 ? 0.7 : 0.2,

    // Crowd indicators: diffuse mid-frequency energy
    crowdLikelihood: bandEnergies.mid > 0.4 && bandEnergies.highMid > 0.3 ? 0.6 : 0.2,
  };

  // Determine primary environment
  const scores: Array<{ env: SpectralEnvironment['environment']; score: number }> = [
    { env: 'quiet', score: 1 - Math.max(...Object.values(features)) },
    { env: 'speech', score: features.speechLikelihood },
    { env: 'music', score: features.musicLikelihood },
    { env: 'traffic', score: features.trafficLikelihood },
    { env: 'wind', score: features.windLikelihood },
    { env: 'crowd', score: features.crowdLikelihood },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // Calculate overall noise floor (inverse of quiet score)
  const noiseFloor = 1 - scores.find((s) => s.env === 'quiet')!.score;

  // Estimate SNR based on speech band vs rest
  const speechEnergy = bandEnergies.mid + bandEnergies.highMid;
  const noiseEnergy = bandEnergies.subBass + bandEnergies.bass + bandEnergies.brilliance;
  const snrLinear = speechEnergy / Math.max(noiseEnergy, 0.001);
  const snrEstimate = 10 * Math.log10(snrLinear);

  return {
    environment: best.env,
    confidence: best.score,
    hasSpeech: features.speechLikelihood > 0.5,
    hasMusic: features.musicLikelihood > 0.4,
    noiseFloor,
    snrEstimate: Math.max(-20, Math.min(60, snrEstimate)), // Clamp to reasonable range
  };
}

// ============================================================================
// LAUGHTER SPECTRAL DETECTION
// ============================================================================

/**
 * Analyze spectral features for laughter detection
 * Laughter has distinctive spectral characteristics:
 * 1. Lower harmonic-to-noise ratio than speech
 * 2. Irregular spectral patterns
 * 3. Burst-like energy patterns
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

  // Laughter indicators:
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

/**
 * Find spectral peaks (potential harmonics)
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
 */
function detectEnergyBurst(current: SpectralAnalysis, previous: SpectralAnalysis): boolean {
  const currentEnergy = current.bandEnergies.mid + current.bandEnergies.highMid;
  const previousEnergy = previous.bandEnergies.mid + previous.bandEnergies.highMid;

  // Energy increase > 50% indicates burst
  return currentEnergy > previousEnergy * 1.5;
}

// ============================================================================
// FFT ANALYZER SERVICE (Singleton per session)
// ============================================================================

export class FFTAnalyzerService {
  private previousSpectrum: SpectralAnalysis | null = null;
  private spectralFluxHistory: number[] = [];
  private readonly maxFluxHistory = 10;

  constructor(private sessionId: string) {
    log.debug({ sessionId }, '📊 FFT analyzer service initialized');
  }

  /**
   * Analyze audio frame with full spectral analysis
   */
  analyze(
    samples: Int16Array,
    sampleRate = 16000
  ): {
    spectrum: SpectralAnalysis;
    environment: SpectralEnvironment;
    laughter: LaughterSpectralFeatures;
  } {
    // Perform FFT analysis
    const spectrum = analyzeSpectrum(samples, sampleRate);

    // Calculate spectral flux if we have previous frame
    if (this.previousSpectrum) {
      spectrum.spectralFlux = this.calculateSpectralFlux(
        spectrum.magnitudes,
        this.previousSpectrum.magnitudes
      );

      // Track flux history for burst detection
      this.spectralFluxHistory.push(spectrum.spectralFlux);
      if (this.spectralFluxHistory.length > this.maxFluxHistory) {
        this.spectralFluxHistory.shift();
      }
    }

    // Classify environment
    const environment = classifyEnvironment(spectrum);

    // Analyze for laughter
    const laughter = analyzeLaughterSpectral(spectrum, this.previousSpectrum || undefined);

    // Store for next frame
    this.previousSpectrum = spectrum;

    return { spectrum, environment, laughter };
  }

  /**
   * Calculate spectral flux (measure of spectral change)
   */
  private calculateSpectralFlux(current: Float32Array, previous: Float32Array): number {
    let flux = 0;
    const len = Math.min(current.length, previous.length);

    for (let i = 0; i < len; i++) {
      const diff = current[i] - previous[i];
      flux += diff > 0 ? diff : 0; // Only count increases (onset detection)
    }

    return flux / len;
  }

  /**
   * Get average spectral flux (for activity detection)
   */
  getAverageFlux(): number {
    if (this.spectralFluxHistory.length === 0) return 0;
    return this.spectralFluxHistory.reduce((a, b) => a + b, 0) / this.spectralFluxHistory.length;
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.previousSpectrum = null;
    this.spectralFluxHistory = [];
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../utils/session-registry.js';

const fftAnalyzerRegistry = createSessionRegistry(
  (sessionId: string) => new FFTAnalyzerService(sessionId),
  { name: 'FFTAnalyzer', cleanup: (analyzer) => analyzer.reset(), verbose: false }
);

registerGlobalRegistry(fftAnalyzerRegistry);

export function getFFTAnalyzer(sessionId: string): FFTAnalyzerService {
  return fftAnalyzerRegistry.get(sessionId);
}

export function resetFFTAnalyzer(sessionId: string): void {
  fftAnalyzerRegistry.reset(sessionId);
  log.debug({ sessionId }, '📊 FFT analyzer service reset');
}

export function getActiveFFTAnalyzerCount(): number {
  return fftAnalyzerRegistry.getActiveCount();
}
