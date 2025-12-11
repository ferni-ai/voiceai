/**
 * Breath Pause Detector
 *
 * Audio-based breath pause detection for natural backchannel timing.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { BREATH_PAUSE_CONFIG, CONFIG } from './constants.js';
import type { AudioFrameData } from './types.js';

// ============================================================================
// BREATH PAUSE DETECTOR
// ============================================================================

/**
 * Breath Pause Detector (Audio-Based)
 *
 * Processes actual audio frames to detect natural breath pauses during
 * user speech. Uses RMS energy analysis to distinguish speech from silence.
 *
 * Breath pauses (100-400ms) are ideal moments for soft backchannels
 * because they're natural breaks where overlapping audio won't disrupt.
 */
export class BreathPauseDetector {
  private pauseStartTime: number | null = null;
  private speechStartTime: number | null = null;
  private inPause = false;
  private isSpeaking = false;
  private pauseHistory: number[] = [];
  private smoothedEnergy = 0;
  private lowEnergyFrameCount = 0;
  private highEnergyFrameCount = 0;
  private frameCount = 0;
  private lastProcessTime = 0;

  // Adaptive threshold tracking
  private recentEnergyLevels: number[] = [];
  private adaptiveSilenceThreshold: number = BREATH_PAUSE_CONFIG.SILENCE_THRESHOLD;
  private adaptiveSpeechThreshold: number = BREATH_PAUSE_CONFIG.SPEECH_THRESHOLD;

  private log = getLogger().child({ module: 'BreathPauseDetector' });

  /**
   * Process an audio frame from LiveKit
   *
   * Call this with each audio frame from the user's microphone stream.
   * The detector will analyze energy levels to detect speech/silence transitions.
   */
  processAudioFrame(frame: AudioFrameData): void {
    if (!frame.data || frame.data.length === 0) return;

    this.frameCount++;
    const now = Date.now();

    // Calculate RMS energy of this frame
    const energy = this.calculateRMSEnergy(frame.data);

    // Smooth energy to reduce noise spikes
    this.smoothedEnergy =
      BREATH_PAUSE_CONFIG.ENERGY_SMOOTHING * this.smoothedEnergy +
      (1 - BREATH_PAUSE_CONFIG.ENERGY_SMOOTHING) * energy;

    // Track recent energy for adaptive thresholds
    this.recentEnergyLevels.push(energy);
    if (this.recentEnergyLevels.length > 100) {
      this.recentEnergyLevels.shift();
      this.updateAdaptiveThresholds();
    }

    // Detect speech/silence transitions
    this.updateSpeechState(now);

    this.lastProcessTime = now;
  }

  /**
   * Calculate RMS (Root Mean Square) energy from audio samples
   */
  private calculateRMSEnergy(data: Int16Array | Uint8Array): number {
    let sumSquares = 0;
    const samples = data.length;

    if (data instanceof Int16Array) {
      // 16-bit signed PCM
      for (let i = 0; i < samples; i++) {
        const normalized = data[i] / 32768; // Normalize to -1 to 1
        sumSquares += normalized * normalized;
      }
    } else {
      // 8-bit unsigned PCM (less common)
      for (let i = 0; i < samples; i++) {
        const normalized = (data[i] - 128) / 128; // Normalize to -1 to 1
        sumSquares += normalized * normalized;
      }
    }

    return Math.sqrt(sumSquares / samples);
  }

  /**
   * Update adaptive thresholds based on recent audio
   */
  private updateAdaptiveThresholds(): void {
    if (this.recentEnergyLevels.length < 50) return;

    // Sort to find percentiles
    const sorted = [...this.recentEnergyLevels].sort((a, b) => a - b);

    // Silence threshold: 10th percentile (background noise level)
    const p10 = sorted[Math.floor(sorted.length * 0.1)];

    // Speech threshold: 60th percentile (typical speech level)
    const p60 = sorted[Math.floor(sorted.length * 0.6)];

    // Blend with defaults (don't fully trust adaptive)
    this.adaptiveSilenceThreshold = 0.5 * BREATH_PAUSE_CONFIG.SILENCE_THRESHOLD + 0.5 * (p10 * 1.5);

    this.adaptiveSpeechThreshold = 0.5 * BREATH_PAUSE_CONFIG.SPEECH_THRESHOLD + 0.5 * (p60 * 0.7);

    // Ensure speech threshold is always above silence threshold
    if (this.adaptiveSpeechThreshold <= this.adaptiveSilenceThreshold * 1.5) {
      this.adaptiveSpeechThreshold = this.adaptiveSilenceThreshold * 2;
    }
  }

  /**
   * Update speech/pause state based on energy levels
   */
  private updateSpeechState(now: number): void {
    const isLowEnergy = this.smoothedEnergy < this.adaptiveSilenceThreshold;
    const isHighEnergy = this.smoothedEnergy > this.adaptiveSpeechThreshold;

    if (isLowEnergy) {
      this.lowEnergyFrameCount++;
      this.highEnergyFrameCount = 0;
    } else if (isHighEnergy) {
      this.highEnergyFrameCount++;
      this.lowEnergyFrameCount = 0;
    }

    // Transition to pause
    if (
      this.isSpeaking &&
      this.lowEnergyFrameCount >= BREATH_PAUSE_CONFIG.PAUSE_CONFIRMATION_FRAMES
    ) {
      // Confirm pause - user stopped speaking
      if (!this.inPause) {
        this.pauseStartTime = now;
        this.inPause = true;

        this.log.debug(
          {
            energy: this.smoothedEnergy.toFixed(4),
            threshold: this.adaptiveSilenceThreshold.toFixed(4),
            speakingDuration: this.speechStartTime ? now - this.speechStartTime : 0,
          },
          '⏸️ Pause detected'
        );
      }
    }

    // Transition to speech
    if (this.highEnergyFrameCount >= BREATH_PAUSE_CONFIG.SPEECH_CONFIRMATION_FRAMES) {
      // Confirm speech - user is talking
      if (this.inPause && this.pauseStartTime) {
        // Record pause duration
        const pauseDuration = now - this.pauseStartTime;
        this.pauseHistory.push(pauseDuration);
        if (this.pauseHistory.length > BREATH_PAUSE_CONFIG.PAUSE_HISTORY_SIZE) {
          this.pauseHistory.shift();
        }

        this.log.debug(
          { pauseDuration, wasBreathPause: pauseDuration >= 100 && pauseDuration <= 400 },
          '▶️ Speech resumed'
        );
      }

      if (!this.isSpeaking) {
        this.speechStartTime = now;
      }

      this.inPause = false;
      this.pauseStartTime = null;
      this.isSpeaking = true;
    }

    // If energy drops too long, consider turn ended (not just a pause)
    if (this.inPause && this.pauseStartTime) {
      const pauseDuration = now - this.pauseStartTime;
      if (pauseDuration > 1500) {
        // Long pause = turn likely ended
        this.isSpeaking = false;
        this.speechStartTime = null;
      }
    }
  }

  /**
   * Simple update method for compatibility (uses binary isSpeaking signal)
   * Prefer processAudioFrame() for better accuracy
   */
  update(isSpeaking: boolean): void {
    const now = Date.now();

    if (!isSpeaking && !this.inPause) {
      // User just paused
      this.pauseStartTime = now;
      this.inPause = true;
    } else if (isSpeaking && this.inPause) {
      // User resumed speaking - record pause duration
      if (this.pauseStartTime) {
        const pauseDuration = now - this.pauseStartTime;
        this.pauseHistory.push(pauseDuration);
        if (this.pauseHistory.length > BREATH_PAUSE_CONFIG.PAUSE_HISTORY_SIZE) {
          this.pauseHistory.shift();
        }
      }
      this.inPause = false;
      this.pauseStartTime = null;
    }

    this.isSpeaking = isSpeaking;
    if (isSpeaking && !this.speechStartTime) {
      this.speechStartTime = now;
    }
  }

  /**
   * Check if currently in a breath pause (short pause mid-speech)
   *
   * A breath pause is:
   * - 100-400ms of silence
   * - Occurring after at least MIN_SPEAKING_TIME of speech
   * - Not a turn-ending pause
   */
  isBreathPause(): boolean {
    if (!this.inPause || !this.pauseStartTime) {
      return false;
    }

    // Must have been speaking for a while before this counts
    if (this.speechStartTime) {
      const speakingTime = this.pauseStartTime - this.speechStartTime;
      if (speakingTime < BREATH_PAUSE_CONFIG.MIN_SPEAKING_TIME) {
        return false;
      }
    }

    const pauseDuration = Date.now() - this.pauseStartTime;

    // Breath pauses are typically 100-400ms
    return pauseDuration >= 100 && pauseDuration <= CONFIG.BREATH_PAUSE_MAX;
  }

  /**
   * Check if user is currently speaking
   */
  isUserSpeaking(): boolean {
    return this.isSpeaking && !this.inPause;
  }

  /**
   * Get current pause duration
   */
  getCurrentPauseDuration(): number {
    if (!this.inPause || !this.pauseStartTime) {
      return 0;
    }
    return Date.now() - this.pauseStartTime;
  }

  /**
   * Get current speech duration
   */
  getCurrentSpeechDuration(): number {
    if (!this.speechStartTime) return 0;
    const endTime = this.inPause && this.pauseStartTime ? this.pauseStartTime : Date.now();
    return endTime - this.speechStartTime;
  }

  /**
   * Get current smoothed energy level (0-1)
   */
  getCurrentEnergy(): number {
    return this.smoothedEnergy;
  }

  /**
   * Get average pause length for this user
   */
  getAveragePauseLength(): number | undefined {
    if (this.pauseHistory.length < 3) return undefined;
    return this.pauseHistory.reduce((a, b) => a + b, 0) / this.pauseHistory.length;
  }

  /**
   * Get breath pause statistics
   */
  getBreathPauseStats(): {
    totalPauses: number;
    breathPauseCount: number;
    averagePauseMs: number | undefined;
    adaptiveSilenceThreshold: number;
    adaptiveSpeechThreshold: number;
  } {
    const breathPauses = this.pauseHistory.filter((d) => d >= 100 && d <= CONFIG.BREATH_PAUSE_MAX);
    return {
      totalPauses: this.pauseHistory.length,
      breathPauseCount: breathPauses.length,
      averagePauseMs: this.getAveragePauseLength(),
      adaptiveSilenceThreshold: this.adaptiveSilenceThreshold,
      adaptiveSpeechThreshold: this.adaptiveSpeechThreshold,
    };
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.pauseStartTime = null;
    this.speechStartTime = null;
    this.inPause = false;
    this.isSpeaking = false;
    this.pauseHistory = [];
    this.smoothedEnergy = 0;
    this.lowEnergyFrameCount = 0;
    this.highEnergyFrameCount = 0;
    this.frameCount = 0;
    this.recentEnergyLevels = [];
    this.adaptiveSilenceThreshold = BREATH_PAUSE_CONFIG.SILENCE_THRESHOLD;
    this.adaptiveSpeechThreshold = BREATH_PAUSE_CONFIG.SPEECH_THRESHOLD;
  }
}
