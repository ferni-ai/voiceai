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
// Native Rust audio utilities (zero-allocation when available)
import {
  isNativeAudioAvailable,
  convertI16ToF32,
  getOrCreateNativeProcessor,
  processNativeFrame,
  getNativeFullFeatures,
  resetNativeProcessor,
  type NativeFullProsodyFeatures,
} from './native-analyzer.js';
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

  // Native Rust processor state
  private useNativeProcessor = false;
  private lastFrameTimestamp = 0;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? null;

    // Initialize native Rust processor if available
    if (sessionId && isNativeAudioAvailable()) {
      this.useNativeProcessor = getOrCreateNativeProcessor(sessionId, 16000);
      if (this.useNativeProcessor) {
        log.debug({ sessionId }, '🦀 AudioProsodyAnalyzer using Rust acceleration');
      }
    }

    log.debug({ sessionId, native: this.useNativeProcessor }, 'AudioProsodyAnalyzer initialized');
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
      const now = Date.now();

      // If using native Rust processor, feed it directly with Int16 (zero-copy)
      if (this.useNativeProcessor && this.sessionId) {
        processNativeFrame(this.sessionId, frame.data as unknown as Int16Array, now);
        this.lastFrameTimestamp = now;
      }

      // Also maintain JS buffers for fallback and additional analysis
      // Convert to Float32Array - use native Rust when available (zero-allocation)
      const samples = isNativeAudioAvailable()
        ? convertI16ToF32(frame.data as unknown as Int16Array)
        : convertToFloat32(frame.data);

      this.buffers.push({
        samples,
        sampleRate: frame.sampleRate,
        channels: frame.channels,
        timestamp: now,
      });

      // Trim old buffers
      const cutoff = now - this.maxBufferMs;
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

    // Try to get prosody features from native Rust processor first (10-50x faster)
    let prosody: ProsodyFeatures;

    if (this.useNativeProcessor && this.sessionId) {
      const nativeFeatures = getNativeFullFeatures(this.sessionId);
      if (nativeFeatures) {
        prosody = this.mapNativeToJsFeatures(nativeFeatures);
        log.debug({ sessionId: this.sessionId }, '🦀 Using Rust prosody analysis');
      } else {
        // Fall back to JS extraction
        const merged = mergeBuffers(this.buffers);
        if (!merged) return null;
        prosody = extractProsodyFeatures(merged.samples, merged.sampleRate);
      }
    } else {
      // JS-only path
      const merged = mergeBuffers(this.buffers);
      if (!merged) return null;
      prosody = extractProsodyFeatures(merged.samples, merged.sampleRate);
    }

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
    this.lastFrameTimestamp = 0;

    // Also reset native Rust processor
    if (this.useNativeProcessor && this.sessionId) {
      resetNativeProcessor(this.sessionId);
    }
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

  /**
   * Map native Rust prosody features to JS ProsodyFeatures interface.
   * Rust provides core features; we compute defaults for voice quality metrics.
   */
  private mapNativeToJsFeatures(native: NativeFullProsodyFeatures): ProsodyFeatures {
    // Determine pitch contour from variance/range ratio
    const varianceToRangeRatio = native.pitchRange > 0 ? native.pitchVariance / native.pitchRange : 0;
    let pitchContour: 'rising' | 'falling' | 'flat' | 'dynamic' = 'flat';
    if (varianceToRangeRatio > 0.3) {
      pitchContour = 'dynamic';
    } else if (native.pitchVariance < 5) {
      pitchContour = 'flat';
    }

    // Calculate pause frequency from pause count and duration
    const durationMinutes = native.durationMs / 60000;
    const pauseFrequency = durationMinutes > 0 ? native.pauseCount / durationMinutes : 0;

    // Estimate average pause duration (rough heuristic from speaking ratio)
    // If speaking 80% of time with 10 pauses over 60s, avg pause = (60s * 0.2) / 10 = 1.2s
    const nonSpeakingMs = native.durationMs * (1 - native.speakingRatio);
    const pauseDuration = native.pauseCount > 0 ? nonSpeakingMs / native.pauseCount : 0;

    return {
      // Core pitch features (directly from Rust)
      pitchMean: native.pitchMean,
      pitchVariance: native.pitchVariance,
      pitchRange: native.pitchRange,
      pitchContour,

      // Energy features (directly from Rust)
      energyMean: native.energyMean,
      energyVariance: native.energyVariance,
      energyPeaks: Math.round(native.pauseCount / 2), // Approximate energy peaks from pauses

      // Rhythm features
      speechRate: native.speechRate,
      pauseDuration,
      pauseFrequency,

      // Voice quality (defaults - Rust doesn't compute these yet)
      // These require more sophisticated DSP that could be added to Rust later
      jitter: 0.02, // Default low jitter
      shimmer: 0.03, // Default low shimmer
      breathiness: 0.1, // Default low breathiness

      // Timing
      utteranceDuration: native.durationMs,
      speakingRatio: native.speakingRatio,
    };
  }
}

export default AudioProsodyAnalyzer;
