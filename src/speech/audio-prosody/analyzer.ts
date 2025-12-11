/**
 * Audio Prosody Analyzer
 *
 * Main analyzer class for voice-based emotion detection.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { AudioFrame } from '@livekit/rtc-node';
import type { ProsodyFeatures, VoiceEmotionResult, AudioBuffer } from './types.js';
import { convertToFloat32, mergeBuffers, extractProsodyFeatures } from './feature-extraction.js';
import {
  mapToEmotionalDimensions,
  classifyEmotion,
  calculateStressLevel,
  detectAnxietyMarkers,
  smoothFeatures,
} from './emotion-mapping.js';
import { recordProsodyAnalysisInternal } from './session-management.js';

const log = createLogger({ module: 'AudioProsodyAnalyzer' });

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

  // Session ID for metrics tracking
  private sessionId: string | null = null;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? null;
    log.debug({ sessionId }, 'AudioProsodyAnalyzer initialized');
  }

  /**
   * Set session ID for metrics tracking
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Process an audio frame from LiveKit
   */
  processAudioFrame(frame: AudioFrame): void {
    if (!frame.data || frame.data.length === 0) return;

    try {
      // Convert to Float32Array
      const samples = convertToFloat32(frame.data);

      this.buffers.push({
        samples,
        sampleRate: frame.sampleRate,
        channels: frame.channels,
        timestamp: Date.now(),
      });

      // Trim old buffers
      const cutoff = Date.now() - this.maxBufferMs;
      this.buffers = this.buffers.filter((b) => b.timestamp >= cutoff);
    } catch (error) {
      // Gracefully handle malformed audio data
      log.warn({ error: String(error) }, 'Failed to process audio frame');
    }
  }

  /**
   * Process raw audio samples
   */
  processSamples(samples: Float32Array, sampleRate: number): void {
    try {
      if (!samples || samples.length === 0) return;

      this.buffers.push({
        samples,
        sampleRate,
        channels: 1,
        timestamp: Date.now(),
      });

      // Trim old buffers
      const cutoff = Date.now() - this.maxBufferMs;
      this.buffers = this.buffers.filter((b) => b.timestamp >= cutoff);
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to process audio samples');
    }
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
    const merged = mergeBuffers(this.buffers);
    if (!merged) return null;

    // Extract prosody features
    const prosody = extractProsodyFeatures(merged.samples, merged.sampleRate);

    // Auto-calibrate baseline on first good sample
    if (!this.calibrated && prosody.pitchMean > 50) {
      this.calibrateBaseline(prosody);
    }

    // Smooth features with history
    this.featureHistory.push(prosody);
    if (this.featureHistory.length > this.historySize) {
      this.featureHistory.shift();
    }
    const smoothed = smoothFeatures(this.featureHistory);

    // Map to emotional dimensions
    const dimensions = mapToEmotionalDimensions(
      smoothed,
      { pitch: this.baselinePitch, energy: this.baselineEnergy, rate: this.baselineRate },
      this.calibrated
    );

    // Classify emotion
    const emotion = classifyEmotion(dimensions, smoothed);

    // Detect stress indicators
    const stressLevel = calculateStressLevel(smoothed, dimensions);
    const anxietyMarkers = detectAnxietyMarkers(smoothed);

    const result: VoiceEmotionResult = {
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

    // Record metrics if this analyzer has a session ID
    if (this.sessionId) {
      recordProsodyAnalysisInternal(this.sessionId, result);
    }

    return result;
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
  // PRIVATE METHODS
  // ============================================================================

  private calibrateBaseline(prosody: ProsodyFeatures): void {
    this.baselinePitch = prosody.pitchMean;
    this.baselineEnergy = prosody.energyMean;
    this.baselineRate = prosody.speechRate;
    this.calibrated = true;
    log.debug(
      {
        pitch: this.baselinePitch.toFixed(1),
        energy: this.baselineEnergy.toFixed(1),
        rate: this.baselineRate.toFixed(1),
      },
      'Baseline calibrated'
    );
  }
}

export default AudioProsodyAnalyzer;
