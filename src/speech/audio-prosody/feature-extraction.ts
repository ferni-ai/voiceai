/**
 * Audio Feature Extraction
 *
 * Signal processing functions for extracting prosodic features from audio.
 * Includes pitch detection, energy analysis, and voice quality metrics.
 */

import type {
  AudioBuffer,
  EnergyAnalysis,
  PauseAnalysis,
  PitchAnalysis,
  ProsodyFeatures,
  VoiceQualityMetrics,
} from './types.js';

// ============================================================================
// AUDIO CONVERSION
// ============================================================================

/**
 * Convert audio data to Float32Array
 */
export function convertToFloat32(data: Int16Array | Uint8Array | Float32Array): Float32Array {
  if (data instanceof Float32Array) return data;

  const float32 = new Float32Array(data.length);

  if (data instanceof Int16Array) {
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768;
    }
  } else {
    // Uint8Array
    for (let i = 0; i < data.length; i++) {
      float32[i] = (data[i] - 128) / 128;
    }
  }

  return float32;
}

/**
 * Merge multiple audio buffers into one
 */
export function mergeBuffers(buffers: AudioBuffer[]): AudioBuffer | null {
  if (buffers.length === 0) return null;

  // Use the sample rate of the first buffer
  const { sampleRate } = buffers[0];
  const totalLength = buffers.reduce((sum, b) => sum + b.samples.length, 0);

  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(buffer.samples, offset);
    offset += buffer.samples.length;
  }

  return {
    samples: merged,
    sampleRate,
    channels: 1,
    timestamp: Date.now(),
  };
}

// ============================================================================
// PITCH ANALYSIS
// ============================================================================

/**
 * Autocorrelation-based pitch detection for a single frame
 */
export function autocorrelationPitch(
  frame: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
): number {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);

  // Apply Hamming window
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
    windowed[i] = frame[i] * w;
  }

  // Autocorrelation
  let maxCorr = 0;
  let bestLag = 0;

  for (let lag = minLag; lag <= maxLag && lag < windowed.length; lag++) {
    let corr = 0;
    for (let i = 0; i < windowed.length - lag; i++) {
      corr += windowed[i] * windowed[i + lag];
    }

    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  // Require minimum correlation threshold
  if (bestLag === 0 || maxCorr < 0.01) return 0;

  return sampleRate / bestLag;
}

/**
 * Estimate pitch characteristics from audio samples
 */
export function estimatePitch(samples: Float32Array, sampleRate: number): PitchAnalysis {
  const frameSize = 2048;
  const hopSize = 512;
  const minPitch = 50; // Hz
  const maxPitch = 500; // Hz

  const pitches: number[] = [];

  for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    const pitch = autocorrelationPitch(frame, sampleRate, minPitch, maxPitch);
    if (pitch > 0) {
      pitches.push(pitch);
    }
  }

  if (pitches.length === 0) {
    return { mean: 0, variance: 0, range: 0, contour: 'flat' };
  }

  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const variance = pitches.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pitches.length;
  const range = Math.max(...pitches) - Math.min(...pitches);

  // Determine pitch contour
  let contour: 'rising' | 'falling' | 'flat' | 'dynamic' = 'flat';
  if (pitches.length >= 4) {
    const firstHalf = pitches.slice(0, Math.floor(pitches.length / 2));
    const secondHalf = pitches.slice(Math.floor(pitches.length / 2));
    const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const diff = secondMean - firstMean;

    if (variance > 400) {
      contour = 'dynamic';
    } else if (diff > 20) {
      contour = 'rising';
    } else if (diff < -20) {
      contour = 'falling';
    }
  }

  return { mean, variance, range, contour };
}

// ============================================================================
// ENERGY ANALYSIS
// ============================================================================

/**
 * Calculate energy characteristics from audio samples
 */
export function calculateEnergy(samples: Float32Array): EnergyAnalysis {
  if (samples.length === 0) {
    return { mean: -60, variance: 0, peaks: 0 };
  }

  // Calculate RMS energy in short frames
  const frameSize = 256;
  const hopSize = 128;
  const energies: number[] = [];

  for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      sum += samples[i + j] * samples[i + j];
    }
    const rms = Math.sqrt(sum / frameSize);
    const db = 20 * Math.log10(Math.max(rms, 0.0001));
    energies.push(db);
  }

  if (energies.length === 0) {
    return { mean: -60, variance: 0, peaks: 0 };
  }

  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const variance = energies.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / energies.length;

  // Count significant peaks (emphasis points)
  let peaks = 0;
  const threshold = mean + Math.sqrt(variance);
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      peaks++;
    }
  }

  return { mean, variance, peaks };
}

// ============================================================================
// SPEECH RATE ANALYSIS
// ============================================================================

/**
 * Estimate speech rate (syllables per second) from audio
 */
export function estimateSpeechRate(samples: Float32Array, sampleRate: number): number {
  // Estimate syllable rate from energy envelope
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
  const envelope: number[] = [];

  for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      sum += Math.abs(samples[i + j]);
    }
    envelope.push(sum / frameSize);
  }

  // Smooth envelope
  const smoothed: number[] = [];
  const windowSize = 5;
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - windowSize);
      j <= Math.min(envelope.length - 1, i + windowSize);
      j++
    ) {
      sum += envelope[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  // Count peaks (syllables)
  let syllables = 0;
  const threshold = (smoothed.reduce((a, b) => a + b, 0) / smoothed.length) * 1.5;

  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
      syllables++;
    }
  }

  const durationSec = samples.length / sampleRate;
  return durationSec > 0 ? syllables / durationSec : 0;
}

// ============================================================================
// VOICE QUALITY ANALYSIS
// ============================================================================

/**
 * Analyze voice quality metrics (jitter, shimmer, breathiness)
 */
export function analyzeVoiceQuality(
  samples: Float32Array,
  sampleRate: number
): VoiceQualityMetrics {
  const frameSize = 2048;
  const pitches: number[] = [];
  const amplitudes: number[] = [];

  for (let i = 0; i + frameSize <= samples.length; i += frameSize / 2) {
    const frame = samples.slice(i, i + frameSize);
    const pitch = autocorrelationPitch(frame, sampleRate, 50, 500);
    if (pitch > 0) {
      pitches.push(pitch);

      // Calculate amplitude
      let maxAmp = 0;
      for (const sample of frame) {
        maxAmp = Math.max(maxAmp, Math.abs(sample));
      }
      amplitudes.push(maxAmp);
    }
  }

  // Jitter: pitch perturbation
  let jitter = 0;
  if (pitches.length > 1) {
    let sum = 0;
    for (let i = 1; i < pitches.length; i++) {
      sum += Math.abs(pitches[i] - pitches[i - 1]);
    }
    const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    jitter = sum / (pitches.length - 1) / avgPitch;
  }

  // Shimmer: amplitude perturbation
  let shimmer = 0;
  if (amplitudes.length > 1) {
    let sum = 0;
    for (let i = 1; i < amplitudes.length; i++) {
      sum += Math.abs(amplitudes[i] - amplitudes[i - 1]);
    }
    const avgAmp = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
    shimmer = avgAmp > 0 ? sum / (amplitudes.length - 1) / avgAmp : 0;
  }

  // Breathiness: simplified HNR approximation
  // Higher value = more breathy (less harmonic)
  const breathiness = Math.min(1, jitter * 5 + shimmer * 3);

  return { jitter, shimmer, breathiness };
}

// ============================================================================
// PAUSE ANALYSIS
// ============================================================================

/**
 * Analyze pause characteristics in audio
 */
export function analyzePauses(samples: Float32Array, sampleRate: number): PauseAnalysis {
  const frameSize = Math.floor(sampleRate * 0.01); // 10ms frames
  const silenceThreshold = 0.01;

  let inPause = false;
  let pauseStart = 0;
  const pauses: number[] = [];
  let speechFrames = 0;

  for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += Math.abs(samples[i + j]);
    }
    energy /= frameSize;

    const isSilent = energy < silenceThreshold;

    if (isSilent && !inPause) {
      inPause = true;
      pauseStart = i;
    } else if (!isSilent && inPause) {
      inPause = false;
      const pauseDuration = ((i - pauseStart) / sampleRate) * 1000; // ms
      if (pauseDuration > 100) {
        // Only count pauses > 100ms
        pauses.push(pauseDuration);
      }
    }

    if (!isSilent) {
      speechFrames++;
    }
  }

  const totalFrames = Math.floor(samples.length / frameSize);
  const durationMin = samples.length / sampleRate / 60;

  return {
    avgDuration: pauses.length > 0 ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0,
    frequency: durationMin > 0 ? pauses.length / durationMin : 0,
    speakingRatio: totalFrames > 0 ? speechFrames / totalFrames : 1,
  };
}

// ============================================================================
// FULL PROSODY EXTRACTION
// ============================================================================

/**
 * Extract all prosody features from audio samples
 */
export function extractProsodyFeatures(samples: Float32Array, sampleRate: number): ProsodyFeatures {
  const energy = calculateEnergy(samples);
  const pitch = estimatePitch(samples, sampleRate);
  const rate = estimateSpeechRate(samples, sampleRate);
  const quality = analyzeVoiceQuality(samples, sampleRate);
  const pauses = analyzePauses(samples, sampleRate);

  const duration = samples.length / sampleRate;

  return {
    pitchMean: pitch.mean,
    pitchVariance: pitch.variance,
    pitchRange: pitch.range,
    pitchContour: pitch.contour,
    energyMean: energy.mean,
    energyVariance: energy.variance,
    energyPeaks: energy.peaks,
    speechRate: rate,
    pauseDuration: pauses.avgDuration,
    pauseFrequency: pauses.frequency,
    jitter: quality.jitter,
    shimmer: quality.shimmer,
    breathiness: quality.breathiness,
    utteranceDuration: duration * 1000,
    speakingRatio: pauses.speakingRatio,
  };
}
