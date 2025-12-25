/**
 * Audio Prosody Extractor - Real Audio Analysis for Routing
 *
 * Extracts prosodic features from audio streams to inform tool routing:
 * - Pitch (F0) contour → emotional arousal
 * - Energy/loudness → stress level
 * - Speech rate → urgency
 * - Pause patterns → hesitation/thinking
 * - Voice quality → tremor, breathiness
 *
 * Based on approaches from:
 * - openSMILE (computational paralinguistics)
 * - Praat (acoustic analysis)
 * - SpeechBrain (neural speech analysis)
 *
 * @module tools/semantic-router/advanced/audio-prosody-extractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { VoiceProsodySignals } from './better-than-human.js';

const log = createLogger({ module: 'semantic-router:audio-prosody' });

// ============================================================================
// TYPES
// ============================================================================

/** Raw acoustic features extracted from audio */
export interface AcousticFeatures {
  // Pitch (F0) in Hz
  pitchMean: number;
  pitchStd: number;
  pitchMin: number;
  pitchMax: number;
  pitchRange: number;

  // Energy/loudness in dB
  energyMean: number;
  energyStd: number;
  energyMax: number;

  // Speech rate
  speechRate: number; // syllables per second (estimated from voiced segments)
  articulationRate: number; // speech rate excluding pauses
  phonationRatio: number; // ratio of voiced to total duration

  // Pause patterns
  pauseCount: number;
  pauseMeanDuration: number;
  pauseMaxDuration: number;
  totalPauseDuration: number;

  // Voice quality
  jitter: number; // pitch perturbation (0-1, higher = more tremor)
  shimmer: number; // amplitude perturbation (0-1, higher = more rough)
  hnr: number; // harmonics-to-noise ratio (higher = clearer voice)

  // Duration
  totalDuration: number;
  voicedDuration: number;

  // Spectral features
  spectralCentroid: number; // brightness
  spectralFlux: number; // rate of spectral change

  // Timestamp
  timestamp: number;
}

/** Configuration for prosody extraction */
export interface ProsodyExtractorConfig {
  // Sample rate (default: 16000 Hz for speech)
  sampleRate: number;
  // Frame size in samples (default: 512)
  frameSize: number;
  // Hop size in samples (default: 160)
  hopSize: number;
  // Minimum pitch (Hz) for F0 detection
  minPitch: number;
  // Maximum pitch (Hz) for F0 detection
  maxPitch: number;
  // Voiced/unvoiced threshold
  voicingThreshold: number;
  // Pause detection threshold (seconds)
  pauseThreshold: number;
  // User's baseline (for personalized detection)
  baseline?: AcousticFeatures;
}

/** Sliding window for real-time prosody analysis */
export interface ProsodyWindow {
  features: AcousticFeatures[];
  maxSize: number;
  currentSize: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ProsodyExtractorConfig = {
  sampleRate: 16000,
  frameSize: 512,
  hopSize: 160,
  minPitch: 50, // Hz
  maxPitch: 500, // Hz
  voicingThreshold: 0.45,
  pauseThreshold: 0.25, // seconds
};

// ============================================================================
// PROSODY EXTRACTOR CLASS
// ============================================================================

export class AudioProsodyExtractor {
  private config: ProsodyExtractorConfig;
  private window: ProsodyWindow;
  private baselineFeatures: AcousticFeatures | null = null;

  // Circular buffer for audio samples
  private audioBuffer: Float32Array;
  private bufferWritePos = 0;
  private bufferReadPos = 0;

  // Statistics tracking
  private totalFramesProcessed = 0;
  private voicedFrameCount = 0;
  private pauseStartTime: number | null = null;
  private currentPauseCount = 0;
  private pauseDurations: number[] = [];

  constructor(config?: Partial<ProsodyExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize sliding window
    this.window = {
      features: [],
      maxSize: 30, // ~3 seconds at 100ms intervals
      currentSize: 0,
    };

    // Initialize audio buffer (5 seconds worth)
    const bufferSize = this.config.sampleRate * 5;
    this.audioBuffer = new Float32Array(bufferSize);

    if (config?.baseline) {
      this.baselineFeatures = config.baseline;
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Process an audio chunk and extract features
   */
  processAudioChunk(samples: Float32Array): AcousticFeatures | null {
    // Add samples to buffer
    this.addSamplesToBuffer(samples);

    // Check if we have enough samples for analysis
    const minSamples = this.config.frameSize * 3; // At least 3 frames
    const availableSamples = this.getAvailableSamples();

    if (availableSamples < minSamples) {
      return null;
    }

    try {
      const features = this.extractFeatures(availableSamples);
      this.addToWindow(features);
      return features;
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to extract prosody features');
      return null;
    }
  }

  /**
   * Convert acoustic features to prosody signals for routing
   */
  featuresToProsodySignals(features: AcousticFeatures): VoiceProsodySignals {
    // Use baseline for personalized detection if available
    const baseline = this.baselineFeatures;

    // Calculate stress level from pitch and energy variations
    let stressLevel = this.calculateStressLevel(features, baseline);

    // Calculate arousal from pitch range and speech rate
    const arousal = this.calculateArousal(features, baseline);

    // Calculate valence from pitch contour slope (simplistic approximation)
    const valence = this.calculateValence(features, baseline);

    // Detect anxiety markers
    const anxietyMarkers = this.detectAnxietyMarkers(features, baseline);

    // Detect voice tremor from jitter
    const voiceTremor = features.jitter > 0.02;

    // Detect breathing pattern from pause patterns
    const breathingPattern = this.detectBreathingPattern(features);

    // Calculate words per minute (estimated)
    const wordsPerMinute = this.estimateWordsPerMinute(features);

    return {
      stressLevel: Math.min(1, Math.max(0, stressLevel)),
      arousal: Math.min(1, Math.max(0, arousal)),
      valence: Math.min(1, Math.max(-1, valence)),
      wordsPerMinute,
      averagePauseDuration: features.pauseMeanDuration,
      hesitationCount: features.pauseCount,
      anxietyMarkers,
      voiceTremor,
      breathingPattern,
    };
  }

  /**
   * Get aggregated prosody signals from the sliding window
   */
  getWindowedProsodySignals(): VoiceProsodySignals | null {
    if (this.window.features.length === 0) {
      return null;
    }

    // Aggregate features from window
    const aggregated = this.aggregateWindowFeatures();
    return this.featuresToProsodySignals(aggregated);
  }

  /**
   * Set user's baseline prosody (for personalized detection)
   */
  setBaseline(baseline: AcousticFeatures): void {
    this.baselineFeatures = baseline;
    log.info('Baseline prosody features set');
  }

  /**
   * Learn baseline from accumulated data
   */
  learnBaseline(): AcousticFeatures | null {
    if (this.window.features.length < 10) {
      return null;
    }

    const baseline = this.aggregateWindowFeatures();
    this.baselineFeatures = baseline;
    log.info('Baseline prosody features learned from data');
    return baseline;
  }

  /**
   * Reset the extractor state
   */
  reset(): void {
    this.audioBuffer.fill(0);
    this.bufferWritePos = 0;
    this.bufferReadPos = 0;
    this.window.features = [];
    this.window.currentSize = 0;
    this.totalFramesProcessed = 0;
    this.voicedFrameCount = 0;
    this.pauseStartTime = null;
    this.currentPauseCount = 0;
    this.pauseDurations = [];
  }

  /**
   * Get current stats
   */
  getStats(): {
    framesProcessed: number;
    windowSize: number;
    hasBaseline: boolean;
    voicingRatio: number;
  } {
    return {
      framesProcessed: this.totalFramesProcessed,
      windowSize: this.window.features.length,
      hasBaseline: this.baselineFeatures !== null,
      voicingRatio:
        this.totalFramesProcessed > 0
          ? this.voicedFrameCount / this.totalFramesProcessed
          : 0,
    };
  }

  // ==========================================================================
  // PRIVATE METHODS - Audio Buffer
  // ==========================================================================

  private addSamplesToBuffer(samples: Float32Array): void {
    const bufferLen = this.audioBuffer.length;
    for (let i = 0; i < samples.length; i++) {
      this.audioBuffer[this.bufferWritePos] = samples[i];
      this.bufferWritePos = (this.bufferWritePos + 1) % bufferLen;
    }
  }

  private getAvailableSamples(): number {
    const bufferLen = this.audioBuffer.length;
    if (this.bufferWritePos >= this.bufferReadPos) {
      return this.bufferWritePos - this.bufferReadPos;
    }
    return bufferLen - this.bufferReadPos + this.bufferWritePos;
  }

  private readFromBuffer(count: number): Float32Array {
    const bufferLen = this.audioBuffer.length;
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      samples[i] = this.audioBuffer[(this.bufferReadPos + i) % bufferLen];
    }
    // Advance read position by hop size (not full count) for overlapping frames
    this.bufferReadPos =
      (this.bufferReadPos + this.config.hopSize) % bufferLen;
    return samples;
  }

  // ==========================================================================
  // PRIVATE METHODS - Feature Extraction
  // ==========================================================================

  private extractFeatures(sampleCount: number): AcousticFeatures {
    const samples = this.readFromBuffer(sampleCount);
    const sampleRate = this.config.sampleRate;
    const duration = samples.length / sampleRate;

    // Extract pitch (F0) using autocorrelation
    const pitchResults = this.extractPitch(samples);

    // Extract energy
    const energyResults = this.extractEnergy(samples);

    // Extract pause patterns
    const pauseResults = this.analyzePauses(samples);

    // Extract voice quality
    const qualityResults = this.extractVoiceQuality(samples, pitchResults.pitchMean);

    // Extract spectral features
    const spectralResults = this.extractSpectralFeatures(samples);

    // Calculate speech rate
    const speechRate = this.calculateSpeechRate(pitchResults.voicedRatio, duration);

    this.totalFramesProcessed++;
    if (pitchResults.voicedRatio > this.config.voicingThreshold) {
      this.voicedFrameCount++;
    }

    return {
      pitchMean: pitchResults.pitchMean,
      pitchStd: pitchResults.pitchStd,
      pitchMin: pitchResults.pitchMin,
      pitchMax: pitchResults.pitchMax,
      pitchRange: pitchResults.pitchMax - pitchResults.pitchMin,
      energyMean: energyResults.mean,
      energyStd: energyResults.std,
      energyMax: energyResults.max,
      speechRate,
      articulationRate: speechRate / Math.max(0.1, pitchResults.voicedRatio),
      phonationRatio: pitchResults.voicedRatio,
      pauseCount: pauseResults.count,
      pauseMeanDuration: pauseResults.meanDuration,
      pauseMaxDuration: pauseResults.maxDuration,
      totalPauseDuration: pauseResults.totalDuration,
      jitter: qualityResults.jitter,
      shimmer: qualityResults.shimmer,
      hnr: qualityResults.hnr,
      totalDuration: duration,
      voicedDuration: duration * pitchResults.voicedRatio,
      spectralCentroid: spectralResults.centroid,
      spectralFlux: spectralResults.flux,
      timestamp: Date.now(),
    };
  }

  private extractPitch(
    samples: Float32Array
  ): {
    pitchMean: number;
    pitchStd: number;
    pitchMin: number;
    pitchMax: number;
    voicedRatio: number;
  } {
    const frameSize = this.config.frameSize;
    const hopSize = this.config.hopSize;
    const sampleRate = this.config.sampleRate;
    const minPitch = this.config.minPitch;
    const maxPitch = this.config.maxPitch;

    const minLag = Math.floor(sampleRate / maxPitch);
    const maxLag = Math.floor(sampleRate / minPitch);

    const pitchValues: number[] = [];
    let voicedFrames = 0;
    let totalFrames = 0;

    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
      const frame = samples.slice(start, start + frameSize);
      const { pitch, isVoiced } = this.autocorrelationPitch(
        frame,
        minLag,
        maxLag,
        sampleRate
      );

      totalFrames++;
      if (isVoiced && pitch > 0) {
        pitchValues.push(pitch);
        voicedFrames++;
      }
    }

    if (pitchValues.length === 0) {
      return {
        pitchMean: 0,
        pitchStd: 0,
        pitchMin: 0,
        pitchMax: 0,
        voicedRatio: 0,
      };
    }

    const mean = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;
    const variance =
      pitchValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      pitchValues.length;

    return {
      pitchMean: mean,
      pitchStd: Math.sqrt(variance),
      pitchMin: Math.min(...pitchValues),
      pitchMax: Math.max(...pitchValues),
      voicedRatio: totalFrames > 0 ? voicedFrames / totalFrames : 0,
    };
  }

  private autocorrelationPitch(
    frame: Float32Array,
    minLag: number,
    maxLag: number,
    sampleRate: number
  ): { pitch: number; isVoiced: boolean } {
    const n = frame.length;

    // Calculate autocorrelation
    let maxCorr = 0;
    let bestLag = 0;
    let zeroCorr = 0;

    // r(0) for normalization
    for (let i = 0; i < n; i++) {
      zeroCorr += frame[i] * frame[i];
    }

    if (zeroCorr === 0) {
      return { pitch: 0, isVoiced: false };
    }

    for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) {
        corr += frame[i] * frame[i + lag];
      }
      corr /= zeroCorr;

      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    const isVoiced = maxCorr > this.config.voicingThreshold;
    const pitch = isVoiced && bestLag > 0 ? sampleRate / bestLag : 0;

    return { pitch, isVoiced };
  }

  private extractEnergy(
    samples: Float32Array
  ): { mean: number; std: number; max: number } {
    const frameSize = this.config.frameSize;
    const hopSize = this.config.hopSize;
    const energyValues: number[] = [];

    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
      const frame = samples.slice(start, start + frameSize);
      let rms = 0;
      for (let i = 0; i < frame.length; i++) {
        rms += frame[i] * frame[i];
      }
      rms = Math.sqrt(rms / frame.length);

      // Convert to dB
      const db = rms > 1e-10 ? 20 * Math.log10(rms) : -100;
      energyValues.push(db);
    }

    if (energyValues.length === 0) {
      return { mean: -100, std: 0, max: -100 };
    }

    const mean = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
    const variance =
      energyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      energyValues.length;

    return {
      mean,
      std: Math.sqrt(variance),
      max: Math.max(...energyValues),
    };
  }

  private analyzePauses(
    samples: Float32Array
  ): {
    count: number;
    meanDuration: number;
    maxDuration: number;
    totalDuration: number;
  } {
    const frameSize = this.config.frameSize;
    const hopSize = this.config.hopSize;
    const sampleRate = this.config.sampleRate;
    const pauseThreshold = this.config.pauseThreshold;

    const silenceThreshold = -50; // dB
    const frameDuration = hopSize / sampleRate;
    const minPauseFrames = Math.ceil(pauseThreshold / frameDuration);

    const pauses: number[] = [];
    let currentSilenceFrames = 0;

    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
      const frame = samples.slice(start, start + frameSize);
      let rms = 0;
      for (let i = 0; i < frame.length; i++) {
        rms += frame[i] * frame[i];
      }
      rms = Math.sqrt(rms / frame.length);
      const db = rms > 1e-10 ? 20 * Math.log10(rms) : -100;

      if (db < silenceThreshold) {
        currentSilenceFrames++;
      } else {
        if (currentSilenceFrames >= minPauseFrames) {
          pauses.push(currentSilenceFrames * frameDuration);
        }
        currentSilenceFrames = 0;
      }
    }

    // Handle trailing silence
    if (currentSilenceFrames >= minPauseFrames) {
      pauses.push(currentSilenceFrames * frameDuration);
    }

    if (pauses.length === 0) {
      return { count: 0, meanDuration: 0, maxDuration: 0, totalDuration: 0 };
    }

    return {
      count: pauses.length,
      meanDuration: pauses.reduce((a, b) => a + b, 0) / pauses.length,
      maxDuration: Math.max(...pauses),
      totalDuration: pauses.reduce((a, b) => a + b, 0),
    };
  }

  private extractVoiceQuality(
    samples: Float32Array,
    pitchMean: number
  ): { jitter: number; shimmer: number; hnr: number } {
    if (pitchMean <= 0) {
      return { jitter: 0, shimmer: 0, hnr: 0 };
    }

    // Simplified jitter calculation (period perturbation)
    const periodSamples = Math.round(this.config.sampleRate / pitchMean);
    const periods: number[] = [];
    const amplitudes: number[] = [];

    // Extract periods and amplitudes
    for (let i = 0; i + periodSamples < samples.length; i += periodSamples) {
      // Find actual period by peak detection
      let maxVal = -Infinity;
      let maxIdx = i;
      for (let j = i; j < i + periodSamples && j < samples.length; j++) {
        if (samples[j] > maxVal) {
          maxVal = samples[j];
          maxIdx = j;
        }
      }
      periods.push(maxIdx - i);
      amplitudes.push(maxVal);
    }

    // Calculate jitter (relative average perturbation)
    let jitter = 0;
    if (periods.length > 1) {
      const avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
      let perturbation = 0;
      for (let i = 1; i < periods.length; i++) {
        perturbation += Math.abs(periods[i] - periods[i - 1]);
      }
      jitter = perturbation / (periods.length - 1) / avgPeriod;
    }

    // Calculate shimmer (amplitude perturbation)
    let shimmer = 0;
    if (amplitudes.length > 1) {
      const avgAmp = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
      let perturbation = 0;
      for (let i = 1; i < amplitudes.length; i++) {
        perturbation += Math.abs(amplitudes[i] - amplitudes[i - 1]);
      }
      shimmer =
        avgAmp > 0 ? perturbation / (amplitudes.length - 1) / avgAmp : 0;
    }

    // Simplified HNR calculation
    let signalPower = 0;
    let noisePower = 0;
    for (let i = 0; i < samples.length; i++) {
      signalPower += samples[i] * samples[i];
    }

    // Estimate noise as residual after removing periodic component
    for (let i = periodSamples; i < samples.length; i++) {
      const predicted = samples[i - periodSamples];
      const residual = samples[i] - predicted;
      noisePower += residual * residual;
    }

    const hnr =
      noisePower > 1e-10 ? 10 * Math.log10(signalPower / noisePower) : 30;

    return {
      jitter: Math.min(1, Math.max(0, jitter)),
      shimmer: Math.min(1, Math.max(0, shimmer)),
      hnr: Math.max(0, hnr),
    };
  }

  private extractSpectralFeatures(
    samples: Float32Array
  ): { centroid: number; flux: number } {
    // Simplified spectral centroid using energy distribution
    const frameSize = this.config.frameSize;
    const sampleRate = this.config.sampleRate;

    // Use first frame for centroid
    const frame = samples.slice(0, Math.min(frameSize, samples.length));

    // Simple DFT for low frequencies
    const numBins = 64;
    const magnitudes = new Float32Array(numBins);

    for (let k = 0; k < numBins; k++) {
      let real = 0;
      let imag = 0;
      const freq = (k * sampleRate) / (2 * numBins);
      for (let n = 0; n < frame.length; n++) {
        const angle = (2 * Math.PI * k * n) / frame.length;
        real += frame[n] * Math.cos(angle);
        imag -= frame[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(real * real + imag * imag);
    }

    // Calculate centroid
    let weightedSum = 0;
    let totalMag = 0;
    for (let k = 0; k < numBins; k++) {
      const freq = (k * sampleRate) / (2 * numBins);
      weightedSum += freq * magnitudes[k];
      totalMag += magnitudes[k];
    }

    const centroid = totalMag > 0 ? weightedSum / totalMag : 0;

    // Simplified flux (spectral change rate)
    const flux =
      magnitudes.reduce((sum, m, i) => (i > 0 ? sum + Math.abs(m - magnitudes[i - 1]) : sum), 0) /
      numBins;

    return { centroid, flux };
  }

  private calculateSpeechRate(voicedRatio: number, duration: number): number {
    // Estimate syllables from voicing pattern
    // Average syllable rate is ~4-6 syllables/second for normal speech
    // Voicing ratio approximates phonation time
    const estimatedSyllableRate = voicedRatio * 5;
    return estimatedSyllableRate;
  }

  // ==========================================================================
  // PRIVATE METHODS - Signal Interpretation
  // ==========================================================================

  private calculateStressLevel(
    features: AcousticFeatures,
    baseline: AcousticFeatures | null
  ): number {
    let stress = 0;

    // High pitch variability → stress
    const pitchStdThreshold = baseline ? baseline.pitchStd * 1.5 : 30;
    if (features.pitchStd > pitchStdThreshold) {
      stress += 0.3 * Math.min(1, features.pitchStd / 50);
    }

    // High energy variability → stress
    const energyStdThreshold = baseline ? baseline.energyStd * 1.5 : 10;
    if (features.energyStd > energyStdThreshold) {
      stress += 0.2 * Math.min(1, features.energyStd / 20);
    }

    // High speech rate → stress
    const speechRateThreshold = baseline
      ? baseline.speechRate * 1.3
      : 6;
    if (features.speechRate > speechRateThreshold) {
      stress += 0.2 * Math.min(1, features.speechRate / 8);
    }

    // High jitter → stress/anxiety
    if (features.jitter > 0.02) {
      stress += 0.15 * Math.min(1, features.jitter / 0.05);
    }

    // Low HNR (breathy voice) → stress
    if (features.hnr < 10) {
      stress += 0.15 * (1 - features.hnr / 10);
    }

    return Math.min(1, stress);
  }

  private calculateArousal(
    features: AcousticFeatures,
    baseline: AcousticFeatures | null
  ): number {
    let arousal = 0.5; // Start neutral

    // Higher pitch → higher arousal
    const baselinePitch = baseline?.pitchMean || 150;
    const pitchDeviation = (features.pitchMean - baselinePitch) / baselinePitch;
    arousal += pitchDeviation * 0.3;

    // Higher energy → higher arousal
    const baselineEnergy = baseline?.energyMean || -30;
    const energyDeviation = (features.energyMean - baselineEnergy) / 30;
    arousal += energyDeviation * 0.2;

    // Faster speech → higher arousal
    const baselineSpeechRate = baseline?.speechRate || 4;
    const rateDeviation =
      (features.speechRate - baselineSpeechRate) / baselineSpeechRate;
    arousal += rateDeviation * 0.2;

    // Wider pitch range → higher arousal
    arousal += Math.min(0.1, features.pitchRange / 200);

    return Math.min(1, Math.max(0, arousal));
  }

  private calculateValence(
    features: AcousticFeatures,
    baseline: AcousticFeatures | null
  ): number {
    let valence = 0; // Neutral

    // Higher pitch mean → more positive (simplistic but common)
    const baselinePitch = baseline?.pitchMean || 150;
    if (features.pitchMean > baselinePitch * 1.1) {
      valence += 0.2;
    } else if (features.pitchMean < baselinePitch * 0.9) {
      valence -= 0.2;
    }

    // Higher spectral centroid (brighter voice) → more positive
    const baselineCentroid = baseline?.spectralCentroid || 2000;
    if (features.spectralCentroid > baselineCentroid * 1.1) {
      valence += 0.15;
    } else if (features.spectralCentroid < baselineCentroid * 0.9) {
      valence -= 0.15;
    }

    // Faster speech can indicate excitement (positive) or anxiety (context-dependent)
    // Using moderate speed as positive indicator
    if (features.speechRate > 4 && features.speechRate < 6) {
      valence += 0.1;
    }

    // Higher HNR (clearer voice) → more positive
    if (features.hnr > 15) {
      valence += 0.1;
    } else if (features.hnr < 8) {
      valence -= 0.1;
    }

    return Math.min(1, Math.max(-1, valence));
  }

  private detectAnxietyMarkers(
    features: AcousticFeatures,
    baseline: AcousticFeatures | null
  ): string[] {
    const markers: string[] = [];

    // Tremor (high jitter)
    if (features.jitter > 0.03) {
      markers.push('voice_tremor');
    }

    // Rapid speech
    const baselineRate = baseline?.speechRate || 5;
    if (features.speechRate > baselineRate * 1.4) {
      markers.push('rapid_speech');
    }

    // High pitch variability
    const baselinePitchStd = baseline?.pitchStd || 25;
    if (features.pitchStd > baselinePitchStd * 1.6) {
      markers.push('pitch_instability');
    }

    // Frequent pauses (hesitation)
    if (features.pauseCount > 3 && features.pauseMeanDuration < 0.5) {
      markers.push('frequent_hesitation');
    }

    // Breathy voice (low HNR)
    if (features.hnr < 8) {
      markers.push('breathy_voice');
    }

    // High amplitude shimmer
    if (features.shimmer > 0.1) {
      markers.push('amplitude_instability');
    }

    return markers;
  }

  private detectBreathingPattern(
    features: AcousticFeatures
  ): 'normal' | 'rapid' | 'shallow' {
    // Rapid: short pauses between speech bursts
    if (features.pauseMeanDuration < 0.3 && features.pauseCount > 2) {
      return 'rapid';
    }

    // Shallow: low phonation ratio with frequent pauses
    if (features.phonationRatio < 0.5 && features.pauseCount > 4) {
      return 'shallow';
    }

    return 'normal';
  }

  private estimateWordsPerMinute(features: AcousticFeatures): number {
    // Average English: ~4-5 syllables per word, ~4-6 syllables per second
    // speechRate is syllables per second
    const syllablesPerWord = 1.5;
    const syllablesPerSecond = features.speechRate;
    const wordsPerSecond = syllablesPerSecond / syllablesPerWord;
    return Math.round(wordsPerSecond * 60);
  }

  // ==========================================================================
  // PRIVATE METHODS - Window Management
  // ==========================================================================

  private addToWindow(features: AcousticFeatures): void {
    this.window.features.push(features);
    this.window.currentSize++;

    if (this.window.features.length > this.window.maxSize) {
      this.window.features.shift();
      this.window.currentSize--;
    }
  }

  private aggregateWindowFeatures(): AcousticFeatures {
    const features = this.window.features;
    const n = features.length;

    if (n === 0) {
      throw new Error('No features to aggregate');
    }

    // Calculate means
    const aggregate: AcousticFeatures = {
      pitchMean: features.reduce((s, f) => s + f.pitchMean, 0) / n,
      pitchStd: features.reduce((s, f) => s + f.pitchStd, 0) / n,
      pitchMin: Math.min(...features.map((f) => f.pitchMin)),
      pitchMax: Math.max(...features.map((f) => f.pitchMax)),
      pitchRange: 0,
      energyMean: features.reduce((s, f) => s + f.energyMean, 0) / n,
      energyStd: features.reduce((s, f) => s + f.energyStd, 0) / n,
      energyMax: Math.max(...features.map((f) => f.energyMax)),
      speechRate: features.reduce((s, f) => s + f.speechRate, 0) / n,
      articulationRate: features.reduce((s, f) => s + f.articulationRate, 0) / n,
      phonationRatio: features.reduce((s, f) => s + f.phonationRatio, 0) / n,
      pauseCount: features.reduce((s, f) => s + f.pauseCount, 0),
      pauseMeanDuration: features.reduce((s, f) => s + f.pauseMeanDuration, 0) / n,
      pauseMaxDuration: Math.max(...features.map((f) => f.pauseMaxDuration)),
      totalPauseDuration: features.reduce((s, f) => s + f.totalPauseDuration, 0),
      jitter: features.reduce((s, f) => s + f.jitter, 0) / n,
      shimmer: features.reduce((s, f) => s + f.shimmer, 0) / n,
      hnr: features.reduce((s, f) => s + f.hnr, 0) / n,
      totalDuration: features.reduce((s, f) => s + f.totalDuration, 0),
      voicedDuration: features.reduce((s, f) => s + f.voicedDuration, 0),
      spectralCentroid: features.reduce((s, f) => s + f.spectralCentroid, 0) / n,
      spectralFlux: features.reduce((s, f) => s + f.spectralFlux, 0) / n,
      timestamp: Date.now(),
    };

    aggregate.pitchRange = aggregate.pitchMax - aggregate.pitchMin;

    return aggregate;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let extractorInstance: AudioProsodyExtractor | null = null;

export function getAudioProsodyExtractor(
  config?: Partial<ProsodyExtractorConfig>
): AudioProsodyExtractor {
  if (!extractorInstance) {
    extractorInstance = new AudioProsodyExtractor(config);
  }
  return extractorInstance;
}

export function resetAudioProsodyExtractor(): void {
  if (extractorInstance) {
    extractorInstance.reset();
    extractorInstance = null;
  }
}
