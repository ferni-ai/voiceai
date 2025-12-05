/**
 * Audio Prosody Analyzer
 *
 * Voice-based emotion detection through audio analysis.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice, not just text.
 *
 * This complements text-based emotion detection for more accurate
 * emotional awareness.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { AudioFrame } from '@livekit/rtc-node';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prosodic features extracted from audio
 */
export interface ProsodyFeatures {
  // Pitch features
  pitchMean: number; // Average fundamental frequency (Hz)
  pitchVariance: number; // Pitch variation (indicates emotion intensity)
  pitchRange: number; // Difference between max and min pitch
  pitchContour: 'rising' | 'falling' | 'flat' | 'dynamic';

  // Energy/Volume features
  energyMean: number; // Average volume level (dB)
  energyVariance: number; // Volume variation
  energyPeaks: number; // Number of emphasis points

  // Rhythm/Rate features
  speechRate: number; // Syllables per second
  pauseDuration: number; // Average pause length (ms)
  pauseFrequency: number; // Pauses per minute

  // Voice quality
  jitter: number; // Pitch perturbation (trembling)
  shimmer: number; // Amplitude perturbation
  breathiness: number; // Harmonic-to-noise ratio

  // Timing
  utteranceDuration: number;
  speakingRatio: number; // Ratio of speaking to total time
}

/**
 * Emotion detected from voice prosody
 */
export interface VoiceEmotionResult {
  // Primary emotion from voice
  primary: VoiceEmotion;
  confidence: number;

  // Emotional dimensions (Russell's circumplex model)
  valence: number; // -1 (negative) to 1 (positive)
  arousal: number; // -1 (calm) to 1 (excited)
  dominance: number; // -1 (submissive) to 1 (dominant)

  // Stress indicators
  stressLevel: number; // 0-1 scale
  anxietyMarkers: boolean; // Trembling, rapid speech, etc.

  // Raw prosody features
  prosody: ProsodyFeatures;

  // Meta
  sampleCount: number;
  processingTimeMs: number;
}

export type VoiceEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'anxious'
  | 'excited'
  | 'bored'
  | 'confused'
  | 'contempt'
  | 'disgusted'
  | 'surprised';

/**
 * Audio buffer for analysis
 */
interface AudioBuffer {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

// ============================================================================
// AUDIO PROSODY ANALYZER
// ============================================================================

/**
 * Analyzes voice prosody for emotion detection
 *
 * Uses signal processing to extract emotional cues from:
 * - Pitch (F0) patterns - fast/varied for excitement, slow/flat for sadness
 * - Energy levels - loud for anger, soft for sadness
 * - Speech rate - fast for anxiety, slow for depression
 * - Voice quality - trembling for fear, harsh for anger
 */
export class AudioProsodyAnalyzer {
  private buffers: AudioBuffer[] = [];
  private readonly maxBufferMs = 5000; // Keep last 5 seconds
  private readonly minSamplesForAnalysis = 4410; // ~100ms at 44.1kHz

  // Baseline calibration (personalized over time)
  private baselinePitch = 150; // Hz (average human)
  private baselineEnergy = -20; // dB
  private baselineRate = 4; // syllables/sec
  private calibrated = false;

  // Feature history for smoothing
  private featureHistory: ProsodyFeatures[] = [];
  private readonly historySize = 5;

  constructor() {
    getLogger().debug('AudioProsodyAnalyzer initialized');
  }

  /**
   * Process an audio frame from LiveKit
   */
  processAudioFrame(frame: AudioFrame): void {
    if (!frame.data || frame.data.length === 0) return;

    // Convert to Float32Array
    const samples = this.convertToFloat32(frame.data);

    this.buffers.push({
      samples,
      sampleRate: frame.sampleRate,
      channels: frame.channels,
      timestamp: Date.now(),
    });

    // Trim old buffers
    const cutoff = Date.now() - this.maxBufferMs;
    this.buffers = this.buffers.filter((b) => b.timestamp >= cutoff);
  }

  /**
   * Process raw audio samples
   */
  processSamples(samples: Float32Array, sampleRate: number): void {
    this.buffers.push({
      samples,
      sampleRate,
      channels: 1,
      timestamp: Date.now(),
    });

    // Trim old buffers
    const cutoff = Date.now() - this.maxBufferMs;
    this.buffers = this.buffers.filter((b) => b.timestamp >= cutoff);
  }

  /**
   * Analyze accumulated audio and detect emotion
   */
  analyze(): VoiceEmotionResult | null {
    const startTime = Date.now();

    // Need enough audio to analyze
    const totalSamples = this.buffers.reduce((sum, b) => sum + b.samples.length, 0);
    if (totalSamples < this.minSamplesForAnalysis) {
      return null;
    }

    // Merge buffers
    const merged = this.mergeBuffers();
    if (!merged) return null;

    // Extract prosody features
    const prosody = this.extractProsodyFeatures(merged.samples, merged.sampleRate);

    // Auto-calibrate baseline on first good sample
    if (!this.calibrated && prosody.pitchMean > 50) {
      this.calibrateBaseline(prosody);
    }

    // Smooth features with history
    this.featureHistory.push(prosody);
    if (this.featureHistory.length > this.historySize) {
      this.featureHistory.shift();
    }
    const smoothed = this.smoothFeatures(this.featureHistory);

    // Map to emotional dimensions
    const dimensions = this.mapToEmotionalDimensions(smoothed);

    // Classify emotion
    const emotion = this.classifyEmotion(dimensions, smoothed);

    // Detect stress indicators
    const stressLevel = this.calculateStressLevel(smoothed, dimensions);
    const anxietyMarkers = this.detectAnxietyMarkers(smoothed);

    return {
      primary: emotion.emotion,
      confidence: emotion.confidence,
      valence: dimensions.valence,
      arousal: dimensions.arousal,
      dominance: dimensions.dominance,
      stressLevel,
      anxietyMarkers,
      prosody: smoothed,
      sampleCount: totalSamples,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Clear buffers (call after analysis or on new utterance)
   */
  clearBuffers(): void {
    this.buffers = [];
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.buffers = [];
    this.featureHistory = [];
    this.calibrated = false;
  }

  // ============================================================================
  // PRIVATE: AUDIO PROCESSING
  // ============================================================================

  private convertToFloat32(data: Int16Array | Uint8Array | Float32Array): Float32Array {
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

  private mergeBuffers(): AudioBuffer | null {
    if (this.buffers.length === 0) return null;

    // Use the sample rate of the first buffer
    const { sampleRate } = this.buffers[0];
    const totalLength = this.buffers.reduce((sum, b) => sum + b.samples.length, 0);

    const merged = new Float32Array(totalLength);
    let offset = 0;

    for (const buffer of this.buffers) {
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
  // PRIVATE: FEATURE EXTRACTION
  // ============================================================================

  private extractProsodyFeatures(samples: Float32Array, sampleRate: number): ProsodyFeatures {
    // Calculate basic statistics
    const energy = this.calculateEnergy(samples);
    const pitch = this.estimatePitch(samples, sampleRate);
    const rate = this.estimateSpeechRate(samples, sampleRate);
    const quality = this.analyzeVoiceQuality(samples, sampleRate);
    const pauses = this.analyzePauses(samples, sampleRate);

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

  private calculateEnergy(samples: Float32Array): {
    mean: number;
    variance: number;
    peaks: number;
  } {
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
      if (
        energies[i] > threshold &&
        energies[i] > energies[i - 1] &&
        energies[i] > energies[i + 1]
      ) {
        peaks++;
      }
    }

    return { mean, variance, peaks };
  }

  private estimatePitch(
    samples: Float32Array,
    sampleRate: number
  ): {
    mean: number;
    variance: number;
    range: number;
    contour: 'rising' | 'falling' | 'flat' | 'dynamic';
  } {
    // Simple autocorrelation-based pitch detection
    const frameSize = 2048;
    const hopSize = 512;
    const minPitch = 50; // Hz
    const maxPitch = 500; // Hz

    const pitches: number[] = [];

    for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
      const frame = samples.slice(i, i + frameSize);
      const pitch = this.autocorrelationPitch(frame, sampleRate, minPitch, maxPitch);
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

  private autocorrelationPitch(
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

  private estimateSpeechRate(samples: Float32Array, sampleRate: number): number {
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
      if (
        smoothed[i] > threshold &&
        smoothed[i] > smoothed[i - 1] &&
        smoothed[i] > smoothed[i + 1]
      ) {
        syllables++;
      }
    }

    const durationSec = samples.length / sampleRate;
    return durationSec > 0 ? syllables / durationSec : 0;
  }

  private analyzeVoiceQuality(
    samples: Float32Array,
    sampleRate: number
  ): {
    jitter: number;
    shimmer: number;
    breathiness: number;
  } {
    // Simplified voice quality metrics
    // Real implementation would use more sophisticated analysis

    const frameSize = 2048;
    const pitches: number[] = [];
    const amplitudes: number[] = [];

    for (let i = 0; i + frameSize <= samples.length; i += frameSize / 2) {
      const frame = samples.slice(i, i + frameSize);
      const pitch = this.autocorrelationPitch(frame, sampleRate, 50, 500);
      if (pitch > 0) {
        pitches.push(pitch);

        // Calculate amplitude
        let maxAmp = 0;
        for (let j = 0; j < frame.length; j++) {
          maxAmp = Math.max(maxAmp, Math.abs(frame[j]));
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

  private analyzePauses(
    samples: Float32Array,
    sampleRate: number
  ): {
    avgDuration: number;
    frequency: number;
    speakingRatio: number;
  } {
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
  // PRIVATE: CALIBRATION & SMOOTHING
  // ============================================================================

  private calibrateBaseline(prosody: ProsodyFeatures): void {
    this.baselinePitch = prosody.pitchMean;
    this.baselineEnergy = prosody.energyMean;
    this.baselineRate = prosody.speechRate;
    this.calibrated = true;
    getLogger().debug(
      `Baseline calibrated: pitch=${this.baselinePitch.toFixed(1)}Hz, energy=${this.baselineEnergy.toFixed(1)}dB, rate=${this.baselineRate.toFixed(1)}syl/s`
    );
  }

  private smoothFeatures(history: ProsodyFeatures[]): ProsodyFeatures {
    if (history.length === 1) return history[0];

    // Weighted average favoring recent samples
    const weights = history.map((_, i) => Math.pow(2, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const smoothed = { ...history[history.length - 1] };

    const numericKeys: Array<keyof ProsodyFeatures> = [
      'pitchMean',
      'pitchVariance',
      'pitchRange',
      'energyMean',
      'energyVariance',
      'energyPeaks',
      'speechRate',
      'pauseDuration',
      'pauseFrequency',
      'jitter',
      'shimmer',
      'breathiness',
      'utteranceDuration',
      'speakingRatio',
    ];

    for (const key of numericKeys) {
      let weightedSum = 0;
      for (let i = 0; i < history.length; i++) {
        weightedSum += (history[i][key] as number) * weights[i];
      }
      (smoothed as Record<string, unknown>)[key] = weightedSum / totalWeight;
    }

    return smoothed;
  }

  // ============================================================================
  // PRIVATE: EMOTION MAPPING
  // ============================================================================

  private mapToEmotionalDimensions(prosody: ProsodyFeatures): {
    valence: number;
    arousal: number;
    dominance: number;
  } {
    // Map prosodic features to Russell's circumplex model dimensions

    // Arousal: high pitch variance, high energy, fast rate = high arousal
    const pitchDeviation = this.calibrated
      ? (prosody.pitchMean - this.baselinePitch) / this.baselinePitch
      : 0;
    const energyDeviation = this.calibrated ? (prosody.energyMean - this.baselineEnergy) / 20 : 0;
    const rateDeviation = this.calibrated
      ? (prosody.speechRate - this.baselineRate) / this.baselineRate
      : 0;

    const arousal = this.clamp(
      pitchDeviation * 0.3 +
        energyDeviation * 0.3 +
        rateDeviation * 0.2 +
        (prosody.pitchVariance / 200) * 0.2,
      -1,
      1
    );

    // Valence: rising pitch, varied energy = positive; flat/falling = negative
    const contourScore = {
      rising: 0.3,
      dynamic: 0.1,
      flat: -0.1,
      falling: -0.3,
    }[prosody.pitchContour];

    const valence = this.clamp(
      contourScore +
        (prosody.speakingRatio - 0.5) * 0.3 +
        (prosody.pitchRange / 100) * 0.2 -
        prosody.breathiness * 0.3,
      -1,
      1
    );

    // Dominance: loud, fast, low pitch = dominant
    const dominance = this.clamp(
      energyDeviation * 0.4 +
        rateDeviation * 0.2 -
        pitchDeviation * 0.2 +
        prosody.energyPeaks * 0.05,
      -1,
      1
    );

    return { valence, arousal, dominance };
  }

  private classifyEmotion(
    dimensions: { valence: number; arousal: number; dominance: number },
    prosody: ProsodyFeatures
  ): { emotion: VoiceEmotion; confidence: number } {
    // Map dimensional emotions to discrete categories
    const { valence, arousal, dominance } = dimensions;

    // Define emotion prototypes in VAD space
    const emotionPrototypes: Record<VoiceEmotion, { v: number; a: number; d: number }> = {
      neutral: { v: 0, a: 0, d: 0 },
      happy: { v: 0.8, a: 0.5, d: 0.3 },
      sad: { v: -0.7, a: -0.5, d: -0.3 },
      angry: { v: -0.5, a: 0.7, d: 0.7 },
      fearful: { v: -0.6, a: 0.7, d: -0.5 },
      anxious: { v: -0.4, a: 0.5, d: -0.3 },
      excited: { v: 0.6, a: 0.8, d: 0.4 },
      bored: { v: -0.2, a: -0.6, d: -0.2 },
      confused: { v: -0.2, a: 0.2, d: -0.4 },
      contempt: { v: -0.4, a: 0.2, d: 0.5 },
      disgusted: { v: -0.6, a: 0.3, d: 0.2 },
      surprised: { v: 0.2, a: 0.7, d: 0 },
    };

    // Find closest emotion
    let bestEmotion: VoiceEmotion = 'neutral';
    let minDistance = Infinity;

    for (const [emotion, proto] of Object.entries(emotionPrototypes)) {
      const distance = Math.sqrt(
        Math.pow(valence - proto.v, 2) +
          Math.pow(arousal - proto.a, 2) +
          Math.pow(dominance - proto.d, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestEmotion = emotion as VoiceEmotion;
      }
    }

    // Calculate confidence based on distance (closer = more confident)
    const maxDistance = Math.sqrt(12); // Max possible distance in VAD space
    const confidence = 1 - minDistance / maxDistance;

    // Boost confidence if prosodic features strongly support the emotion
    let boostedConfidence = confidence;

    // High jitter/shimmer + negative valence = fearful/anxious
    if ((bestEmotion === 'fearful' || bestEmotion === 'anxious') && prosody.jitter > 0.05) {
      boostedConfidence = Math.min(1, boostedConfidence + 0.1);
    }

    // Fast rate + high energy = angry/excited
    if ((bestEmotion === 'angry' || bestEmotion === 'excited') && prosody.speechRate > 5) {
      boostedConfidence = Math.min(1, boostedConfidence + 0.1);
    }

    return { emotion: bestEmotion, confidence: boostedConfidence };
  }

  private calculateStressLevel(prosody: ProsodyFeatures, dimensions: { arousal: number }): number {
    // Stress indicators: high pitch variance, fast rate, high jitter
    return this.clamp(
      Math.abs(dimensions.arousal) * 0.3 +
        prosody.jitter * 5 +
        prosody.shimmer * 3 +
        (prosody.speechRate > 5 ? (prosody.speechRate - 5) * 0.1 : 0) +
        (prosody.pitchVariance / 300) * 0.2,
      0,
      1
    );
  }

  private detectAnxietyMarkers(prosody: ProsodyFeatures): boolean {
    // Anxiety markers: trembling voice, rapid speech, frequent pauses
    return (
      prosody.jitter > 0.05 ||
      prosody.shimmer > 0.1 ||
      prosody.speechRate > 6 ||
      prosody.pauseFrequency > 15 ||
      prosody.breathiness > 0.3
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ============================================================================
// SESSION-SCOPED ANALYZERS
// ============================================================================

/**
 * FIX BUG #voice-12: Session-scoped prosody analyzers
 */
const sessionAnalyzers = new Map<string, AudioProsodyAnalyzer>();

/**
 * Get or create a prosody analyzer for a specific session
 */
export function getSessionAudioProsodyAnalyzer(sessionId: string): AudioProsodyAnalyzer {
  let analyzer = sessionAnalyzers.get(sessionId);
  if (!analyzer) {
    analyzer = new AudioProsodyAnalyzer();
    sessionAnalyzers.set(sessionId, analyzer);
  }
  return analyzer;
}

/**
 * Remove a session's prosody analyzer (on session end)
 */
export function removeSessionAudioProsodyAnalyzer(sessionId: string): void {
  const analyzer = sessionAnalyzers.get(sessionId);
  if (analyzer) {
    analyzer.reset();
    sessionAnalyzers.delete(sessionId);
  }
}

// ============================================================================
// GLOBAL SINGLETON (BACKWARD COMPATIBILITY)
// ============================================================================

/** @deprecated Use getSessionAudioProsodyAnalyzer for session isolation */
let analyzerInstance: AudioProsodyAnalyzer | null = null;

/**
 * Get the singleton audio prosody analyzer
 * @deprecated Use getSessionAudioProsodyAnalyzer for session isolation
 */
export function getAudioProsodyAnalyzer(): AudioProsodyAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new AudioProsodyAnalyzer();
  }
  return analyzerInstance;
}

/**
 * Reset the analyzer (for testing)
 * @deprecated Use removeSessionAudioProsodyAnalyzer for session isolation
 */
export function resetAudioProsodyAnalyzer(): void {
  if (analyzerInstance) {
    analyzerInstance.reset();
  }
  analyzerInstance = null;
}

export default AudioProsodyAnalyzer;
