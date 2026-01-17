/**
 * Voice Anti-Spoofing Detection
 *
 * Detects synthesized voices (TTS, deepfakes, voice conversion).
 * Protects against adversarial attacks using synthetic voices.
 *
 * DETECTION METHODS:
 * 1. Spectral Analysis: TTS has different spectral patterns
 * 2. Mel-Cepstral Coefficients: Natural speech has unique patterns
 * 3. Pitch Variation: Synthetic voices often have unnatural pitch
 * 4. Micro-tremor Detection: Human voices have natural micro-tremors
 * 5. Formant Tracking: Natural formant transitions differ from synthetic
 *
 * @module VoiceAntiSpoofing
 */

import pino from 'pino';

const log = pino({ name: 'voice-antispoofing' });

// ============================================================================
// TYPES
// ============================================================================

export interface AntiSpoofResult {
  isAuthentic: boolean;
  confidence: number; // 0-1, higher = more confident it's authentic
  spoofType?: 'tts' | 'voice_conversion' | 'replay' | 'deepfake' | 'unknown';
  indicators: {
    spectralNaturalness: SpoofIndicator;
    pitchVariation: SpoofIndicator;
    microTremor: SpoofIndicator;
    formantTransitions: SpoofIndicator;
    harmonicStructure: SpoofIndicator;
  };
  warnings: string[];
}

interface SpoofIndicator {
  isNatural: boolean;
  score: number; // 0-1, higher = more natural
  details?: string;
}

export interface AntiSpoofConfig {
  minConfidence: number; // 0-1, default 0.7
  enableSpectralAnalysis: boolean;
  enablePitchAnalysis: boolean;
  enableMicroTremorDetection: boolean;
  enableFormantTracking: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: AntiSpoofConfig = {
  minConfidence: 0.7,
  enableSpectralAnalysis: true,
  enablePitchAnalysis: true,
  enableMicroTremorDetection: true,
  enableFormantTracking: true,
};

// Thresholds based on research on TTS detection
const DETECTION_THRESHOLDS = {
  // TTS often has smoother spectral envelope
  spectralVarianceMin: 0.02,
  // Natural pitch has micro-variations (jitter)
  pitchJitterMin: 0.005,
  // Human voices have subtle tremor (shimmer)
  shimmerMin: 0.01,
  // Formant transitions should be smooth but variable
  formantVarianceMin: 20, // Hz
  // Harmonic-to-noise ratio differs between natural and synthetic
  hnrMin: 10, // dB
  hnrMax: 35, // dB (too high suggests synthetic)
};

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

/**
 * Analyze spectral characteristics for naturalness.
 * TTS often has unnaturally smooth spectra.
 */
function analyzeSpectralNaturalness(samples: Float32Array, sampleRate: number): SpoofIndicator {
  // Compute short-time FFT and analyze spectral envelope variance
  const fftSize = 1024;
  const hopSize = 256;
  const spectralEnvelopes: number[][] = [];

  // Simple FFT approximation using autocorrelation
  for (let i = 0; i < samples.length - fftSize; i += hopSize) {
    const frame = samples.slice(i, i + fftSize);
    const envelope = computeSpectralEnvelope(frame, sampleRate);
    spectralEnvelopes.push(envelope);
  }

  if (spectralEnvelopes.length === 0) {
    return { isNatural: false, score: 0, details: 'Insufficient audio' };
  }

  // Calculate frame-to-frame variance
  let totalVariance = 0;
  for (let freq = 0; freq < spectralEnvelopes[0].length; freq++) {
    const freqValues = spectralEnvelopes.map((e) => e[freq]);
    totalVariance += calculateVariance(freqValues);
  }
  const avgVariance = totalVariance / spectralEnvelopes[0].length;

  const isNatural = avgVariance > DETECTION_THRESHOLDS.spectralVarianceMin;
  const score = Math.min(1, avgVariance / (DETECTION_THRESHOLDS.spectralVarianceMin * 2));

  return {
    isNatural,
    score,
    details: `Spectral variance: ${avgVariance.toFixed(4)}`,
  };
}

/**
 * Compute simplified spectral envelope.
 */
function computeSpectralEnvelope(frame: Float32Array, _sampleRate: number): number[] {
  // Simplified: compute energy in frequency bands
  const numBands = 20;
  const bandEnergies: number[] = new Array(numBands).fill(0);

  // Apply simple windowing
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frame.length - 1)));
    windowed[i] = frame[i] * window;
  }

  // Compute autocorrelation-based pseudo-spectrum
  for (let lag = 0; lag < frame.length / 2; lag++) {
    let correlation = 0;
    for (let i = 0; i < frame.length - lag; i++) {
      correlation += windowed[i] * windowed[i + lag];
    }
    const band = Math.floor((lag / (frame.length / 2)) * numBands);
    if (band < numBands) {
      bandEnergies[band] += Math.abs(correlation);
    }
  }

  return bandEnergies;
}

// ============================================================================
// PITCH ANALYSIS
// ============================================================================

/**
 * Analyze pitch variation (jitter).
 * Natural speech has subtle pitch variations; TTS is often too smooth.
 */
function analyzePitchVariation(samples: Float32Array, sampleRate: number): SpoofIndicator {
  // Extract pitch periods using autocorrelation
  const pitchPeriods = extractPitchPeriods(samples, sampleRate);

  if (pitchPeriods.length < 5) {
    return { isNatural: false, score: 0.5, details: 'Insufficient pitch data' };
  }

  // Calculate jitter (pitch perturbation)
  const jitter = calculateJitter(pitchPeriods);

  const isNatural = jitter > DETECTION_THRESHOLDS.pitchJitterMin;
  const score = Math.min(1, jitter / (DETECTION_THRESHOLDS.pitchJitterMin * 3));

  return {
    isNatural,
    score,
    details: `Pitch jitter: ${(jitter * 100).toFixed(2)}%`,
  };
}

/**
 * Extract pitch periods from audio.
 */
function extractPitchPeriods(samples: Float32Array, sampleRate: number): number[] {
  const frameSize = Math.floor(sampleRate * 0.03); // 30ms frames
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
  const periods: number[] = [];

  // Pitch range: 80-400 Hz
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 80);

  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);

    // Find pitch period using autocorrelation
    let maxCorr = 0;
    let bestLag = 0;

    for (let lag = minLag; lag < maxLag && lag < frame.length / 2; lag++) {
      let corr = 0;
      for (let j = 0; j < frame.length - lag; j++) {
        corr += frame[j] * frame[j + lag];
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && maxCorr > 0) {
      periods.push(bestLag / sampleRate);
    }
  }

  return periods;
}

/**
 * Calculate jitter (relative pitch perturbation).
 */
function calculateJitter(periods: number[]): number {
  if (periods.length < 2) return 0;

  let totalDiff = 0;
  for (let i = 1; i < periods.length; i++) {
    totalDiff += Math.abs(periods[i] - periods[i - 1]);
  }

  const avgDiff = totalDiff / (periods.length - 1);
  const avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;

  return avgDiff / avgPeriod;
}

// ============================================================================
// MICRO-TREMOR DETECTION
// ============================================================================

/**
 * Detect natural micro-tremors in voice (shimmer).
 * Human voices have subtle amplitude variations.
 */
function detectMicroTremor(samples: Float32Array, sampleRate: number): SpoofIndicator {
  // Calculate shimmer (amplitude perturbation) between pitch periods
  const frameSize = Math.floor(sampleRate * 0.03);
  const hopSize = Math.floor(sampleRate * 0.01);
  const amplitudes: number[] = [];

  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);

    // RMS amplitude
    let sum = 0;
    for (const sample of frame) {
      sum += sample * sample;
    }
    amplitudes.push(Math.sqrt(sum / frameSize));
  }

  if (amplitudes.length < 5) {
    return { isNatural: false, score: 0.5, details: 'Insufficient amplitude data' };
  }

  // Calculate shimmer
  const shimmer = calculateShimmer(amplitudes);

  const isNatural = shimmer > DETECTION_THRESHOLDS.shimmerMin;
  const score = Math.min(1, shimmer / (DETECTION_THRESHOLDS.shimmerMin * 3));

  return {
    isNatural,
    score,
    details: `Shimmer: ${(shimmer * 100).toFixed(2)}%`,
  };
}

/**
 * Calculate shimmer (relative amplitude perturbation).
 */
function calculateShimmer(amplitudes: number[]): number {
  if (amplitudes.length < 2) return 0;

  let totalDiff = 0;
  for (let i = 1; i < amplitudes.length; i++) {
    totalDiff += Math.abs(amplitudes[i] - amplitudes[i - 1]);
  }

  const avgDiff = totalDiff / (amplitudes.length - 1);
  const avgAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

  return avgAmplitude > 0 ? avgDiff / avgAmplitude : 0;
}

// ============================================================================
// FORMANT TRACKING
// ============================================================================

/**
 * Analyze formant transitions.
 * Natural speech has smooth but variable formant transitions.
 */
function analyzeFormantTransitions(samples: Float32Array, sampleRate: number): SpoofIndicator {
  // Estimate formants using LPC (simplified)
  const frameSize = Math.floor(sampleRate * 0.025); // 25ms
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms
  const formantEstimates: number[][] = [];

  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    const formants = estimateFormants(frame, sampleRate);
    if (formants.length >= 2) {
      formantEstimates.push(formants);
    }
  }

  if (formantEstimates.length < 5) {
    return { isNatural: false, score: 0.5, details: 'Insufficient formant data' };
  }

  // Calculate variance in first two formants
  const f1Values = formantEstimates.map((f) => f[0]);
  const f2Values = formantEstimates.map((f) => f[1]);

  const f1Variance = calculateVariance(f1Values);
  const f2Variance = calculateVariance(f2Values);
  const avgVariance = (f1Variance + f2Variance) / 2;

  const isNatural = avgVariance > DETECTION_THRESHOLDS.formantVarianceMin;
  const score = Math.min(1, avgVariance / (DETECTION_THRESHOLDS.formantVarianceMin * 5));

  return {
    isNatural,
    score,
    details: `Formant variance: F1=${f1Variance.toFixed(0)}Hz, F2=${f2Variance.toFixed(0)}Hz`,
  };
}

/**
 * Estimate formants using simplified LPC analysis.
 */
function estimateFormants(frame: Float32Array, sampleRate: number): number[] {
  // Very simplified formant estimation using zero-crossing rate
  // In production, use proper LPC analysis
  const formants: number[] = [];

  // Estimate F1 (first formant) - typically 300-800 Hz
  // Estimate F2 (second formant) - typically 800-2500 Hz

  // Use zero-crossing rate as a very rough proxy
  let zeroCrossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if (Math.sign(frame[i]) !== Math.sign(frame[i - 1])) {
      zeroCrossings++;
    }
  }

  const zcr = (zeroCrossings / frame.length) * sampleRate;

  // Very rough estimates
  const f1 = zcr * 0.3 + 300; // Rough F1
  const f2 = zcr * 0.8 + 800; // Rough F2

  formants.push(Math.min(800, Math.max(300, f1)));
  formants.push(Math.min(2500, Math.max(800, f2)));

  return formants;
}

// ============================================================================
// HARMONIC STRUCTURE
// ============================================================================

/**
 * Analyze harmonic structure (HNR - Harmonic-to-Noise Ratio).
 * TTS often has unusually high HNR.
 */
function analyzeHarmonicStructure(samples: Float32Array, sampleRate: number): SpoofIndicator {
  // Estimate HNR using autocorrelation
  const frameSize = Math.floor(sampleRate * 0.03);
  const hnrValues: number[] = [];

  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    const frame = samples.slice(i, i + frameSize);
    const hnr = estimateHNR(frame);
    if (hnr > 0) {
      hnrValues.push(hnr);
    }
  }

  if (hnrValues.length === 0) {
    return { isNatural: false, score: 0.5, details: 'Could not estimate HNR' };
  }

  const avgHNR = hnrValues.reduce((a, b) => a + b, 0) / hnrValues.length;

  // Natural speech typically has HNR between 10-25 dB
  // TTS often has HNR > 30 dB (too clean)
  const isNatural = avgHNR >= DETECTION_THRESHOLDS.hnrMin && avgHNR <= DETECTION_THRESHOLDS.hnrMax;

  let score: number;
  if (avgHNR < DETECTION_THRESHOLDS.hnrMin) {
    score = avgHNR / DETECTION_THRESHOLDS.hnrMin;
  } else if (avgHNR > DETECTION_THRESHOLDS.hnrMax) {
    score = DETECTION_THRESHOLDS.hnrMax / avgHNR;
  } else {
    score = 1;
  }

  return {
    isNatural,
    score,
    details: `HNR: ${avgHNR.toFixed(1)} dB`,
  };
}

/**
 * Estimate Harmonic-to-Noise Ratio.
 */
function estimateHNR(frame: Float32Array): number {
  // Find fundamental period using autocorrelation
  let maxCorr = 0;
  let bestLag = 0;

  for (let lag = 20; lag < frame.length / 2; lag++) {
    let corr = 0;
    for (let i = 0; i < frame.length - lag; i++) {
      corr += frame[i] * frame[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  // Total energy
  let totalEnergy = 0;
  for (const sample of frame) {
    totalEnergy += sample * sample;
  }

  if (totalEnergy === 0 || maxCorr === 0) return 0;

  // Harmonic energy estimate (from autocorrelation peak)
  const harmonicEnergy = maxCorr;
  const noiseEnergy = totalEnergy - harmonicEnergy;

  if (noiseEnergy <= 0) return 40; // Very high HNR (suspicious)

  return 10 * Math.log10(harmonicEnergy / noiseEnergy);
}

// ============================================================================
// MAIN DETECTION
// ============================================================================

/**
 * Perform comprehensive anti-spoofing analysis.
 */
export function detectSpoofing(
  audio: Float32Array,
  sampleRate: number,
  config: Partial<AntiSpoofConfig> = {}
): AntiSpoofResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];

  // Run all analyses
  const spectralNaturalness = cfg.enableSpectralAnalysis
    ? analyzeSpectralNaturalness(audio, sampleRate)
    : { isNatural: true, score: 1, details: 'Skipped' };

  const pitchVariation = cfg.enablePitchAnalysis
    ? analyzePitchVariation(audio, sampleRate)
    : { isNatural: true, score: 1, details: 'Skipped' };

  const microTremor = cfg.enableMicroTremorDetection
    ? detectMicroTremor(audio, sampleRate)
    : { isNatural: true, score: 1, details: 'Skipped' };

  const formantTransitions = cfg.enableFormantTracking
    ? analyzeFormantTransitions(audio, sampleRate)
    : { isNatural: true, score: 1, details: 'Skipped' };

  const harmonicStructure = analyzeHarmonicStructure(audio, sampleRate);

  const indicators = {
    spectralNaturalness,
    pitchVariation,
    microTremor,
    formantTransitions,
    harmonicStructure,
  };

  // Collect warnings
  if (!spectralNaturalness.isNatural) {
    warnings.push('Unusual spectral characteristics (possible TTS)');
  }
  if (!pitchVariation.isNatural) {
    warnings.push('Unnaturally smooth pitch (possible TTS)');
  }
  if (!microTremor.isNatural) {
    warnings.push('Missing natural voice tremor (possible TTS)');
  }
  if (!formantTransitions.isNatural) {
    warnings.push('Unusual formant patterns (possible voice conversion)');
  }
  if (!harmonicStructure.isNatural) {
    warnings.push('Unusual harmonic structure (possible synthetic voice)');
  }

  // Calculate overall confidence
  const scores = Object.values(indicators).map((i) => i.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const naturalCount = Object.values(indicators).filter((i) => i.isNatural).length;

  // Determine if authentic
  const isAuthentic = avgScore >= cfg.minConfidence && naturalCount >= 3;

  // Determine spoof type if not authentic
  let spoofType: AntiSpoofResult['spoofType'];
  if (!isAuthentic) {
    if (!harmonicStructure.isNatural && harmonicStructure.score < 0.3) {
      spoofType = 'tts';
    } else if (!formantTransitions.isNatural && formantTransitions.score < 0.3) {
      spoofType = 'voice_conversion';
    } else if (!spectralNaturalness.isNatural) {
      spoofType = 'replay';
    } else {
      spoofType = 'unknown';
    }
  }

  log.info(
    {
      isAuthentic,
      confidence: avgScore,
      naturalCount,
      spoofType,
      warningCount: warnings.length,
    },
    'Anti-spoofing analysis complete'
  );

  return {
    isAuthentic,
    confidence: avgScore,
    spoofType,
    indicators,
    warnings,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate variance of an array of numbers.
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) * (v - mean));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectSpoofing,
};
