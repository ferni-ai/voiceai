/**
 * Live Backchanneling Service
 *
 * Provides real-time verbal feedback ("mm-hmm", "yeah", "right") during user
 * speech WITHOUT interrupting the conversation flow.
 *
 * Key insight from Sesame's research:
 * "Conversational dynamics include natural timing, pauses, interruptions and emphasis."
 *
 * The difference between regular backchanneling and LIVE backchanneling:
 * - Regular: Wait for user to pause, then respond
 * - Live: Soft overlay during natural breath pauses without resetting VAD
 *
 * @see https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified emotion data for backchannel decisions.
 * Compatible with UserData.lastEmotionAnalysis.
 */
export interface SimpleEmotion {
  primary: string;
  intensity: number;
  distressLevel?: number;
}

export interface LiveBackchannelContext {
  /** Persona ID for persona-specific backchannels */
  personaId: string;

  /** How long has user been speaking this turn (ms) */
  userSpeakingDurationMs: number;

  /** Is the user in a natural breath pause? */
  isBreathPause: boolean;

  /** Current detected emotion (simplified) */
  emotion?: SimpleEmotion;

  /** Turn count in conversation */
  turnCount: number;

  /** Time since last backchannel (ms) */
  timeSinceLastBackchannel: number;

  /** Is the user sharing something emotional? */
  isEmotionalMoment: boolean;
}

export interface LiveBackchannelResult {
  /** Should we emit a backchannel? */
  shouldBackchannel: boolean;

  /** The phrase to say (with SSML for soft volume) */
  phrase: string | null;

  /** Volume ratio (0-1, where 0.3 = 30% of normal) */
  volumeRatio: number;

  /** Whether this can overlap with user speech */
  allowOverlap: boolean;

  /** Reason for the decision */
  reason: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIG = {
  /** Minimum time into turn before live backchannel (ms) */
  MIN_SPEAKING_DURATION: 4000,

  /** Minimum time between backchannels (ms) */
  MIN_INTERVAL: 8000,

  /** Volume ratio for soft backchannels (30% of normal) */
  SOFT_VOLUME_RATIO: 0.3,

  /** Breath pause detection window (ms) - pauses shorter than this are breath pauses */
  BREATH_PAUSE_MAX: 400,

  /** Minimum turns before live backchannels start */
  MIN_TURNS: 3,

  /** Probability of backchannel when conditions are met */
  BASE_PROBABILITY: 0.25,

  /** Increased probability for emotional moments */
  EMOTIONAL_PROBABILITY: 0.4,
} as const;

// ============================================================================
// SOFT BACKCHANNEL PHRASES
// ============================================================================

/**
 * Ultra-short phrases that work well as soft overlays
 * These are different from regular backchannels - they're shorter and softer
 */
const SOFT_BACKCHANNELS: Record<string, Record<string, string[]>> = {
  ferni: {
    neutral: ['Mm', 'Yeah', 'Mhm', 'Right'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    engaged: ['Oh', 'Mm', 'Yeah'],
  },
  'jordan-taylor': {
    neutral: ['Yeah', 'Mhm', 'Uh-huh'],
    empathetic: ['Mm', 'Yeah', 'Oh'],
    engaged: ['Oh!', 'Yeah!', 'Mhm!'],
  },
  'nayan-patel': {
    neutral: ['Mm', 'Yes', 'Indeed'],
    empathetic: ['Mm', 'Yes', 'I see'],
    engaged: ['Mm', 'Yes', 'Ah'],
  },
  'alex-chen': {
    neutral: ['Mm', 'Yeah', 'Got it'],
    empathetic: ['Mm', 'Yeah', 'I see'],
    engaged: ['Right', 'Yeah', 'Okay'],
  },
  'maya-santos': {
    neutral: ['Mm', 'Yeah', 'Okay'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    engaged: ['Oh', 'Yeah', 'Right'],
  },
  'peter-john': {
    neutral: ['Mm', 'Yeah', 'Okay'],
    empathetic: ['Mm', 'Yeah', 'Right'],
    engaged: ['Oh!', 'Yeah!', 'Interesting'],
  },
};

// ============================================================================
// LIVE BACKCHANNELING SERVICE
// ============================================================================

export class LiveBackchannelingService {
  private lastBackchannelTime = 0;
  private backchannelCount = 0;
  private recentBackchannels: string[] = [];

  /**
   * Determine if we should emit a live backchannel
   */
  shouldEmitLiveBackchannel(ctx: LiveBackchannelContext): LiveBackchannelResult {
    const noBackchannel: LiveBackchannelResult = {
      shouldBackchannel: false,
      phrase: null,
      volumeRatio: CONFIG.SOFT_VOLUME_RATIO,
      allowOverlap: false,
      reason: 'none',
    };

    // ===== PREREQUISITE CHECKS =====

    // Not enough turns to establish rapport
    if (ctx.turnCount < CONFIG.MIN_TURNS) {
      return { ...noBackchannel, reason: 'insufficient_turns' };
    }

    // User hasn't been speaking long enough
    if (ctx.userSpeakingDurationMs < CONFIG.MIN_SPEAKING_DURATION) {
      return { ...noBackchannel, reason: 'speaking_too_short' };
    }

    // Too soon since last backchannel
    if (ctx.timeSinceLastBackchannel < CONFIG.MIN_INTERVAL) {
      return { ...noBackchannel, reason: 'too_soon' };
    }

    // Not in a breath pause - don't interrupt mid-word
    if (!ctx.isBreathPause) {
      return { ...noBackchannel, reason: 'not_breath_pause' };
    }

    // ===== PROBABILITY CHECK =====

    const probability = ctx.isEmotionalMoment
      ? CONFIG.EMOTIONAL_PROBABILITY
      : CONFIG.BASE_PROBABILITY;

    if (Math.random() > probability) {
      return { ...noBackchannel, reason: 'probability_skip' };
    }

    // ===== GENERATE BACKCHANNEL =====

    const phrase = this.selectBackchannel(ctx);
    if (!phrase) {
      return { ...noBackchannel, reason: 'no_phrase_available' };
    }

    // Record this backchannel
    this.lastBackchannelTime = Date.now();
    this.backchannelCount++;
    this.recentBackchannels.push(phrase);
    if (this.recentBackchannels.length > 5) {
      this.recentBackchannels.shift();
    }

    getLogger().debug(
      {
        personaId: ctx.personaId,
        phrase,
        userSpeakingMs: ctx.userSpeakingDurationMs,
        isEmotional: ctx.isEmotionalMoment,
        count: this.backchannelCount,
      },
      '🎤 Live backchannel triggered'
    );

    return {
      shouldBackchannel: true,
      phrase: this.wrapWithSoftVolume(phrase),
      volumeRatio: CONFIG.SOFT_VOLUME_RATIO,
      allowOverlap: true,
      reason: 'triggered',
    };
  }

  /**
   * Select appropriate backchannel phrase
   */
  private selectBackchannel(ctx: LiveBackchannelContext): string | null {
    // Determine emotion type
    const emotionType = ctx.isEmotionalMoment ? 'empathetic' : 'neutral';

    // Get persona-specific phrases
    const personaPhrases = SOFT_BACKCHANNELS[ctx.personaId];
    if (personaPhrases) {
      const phrases = personaPhrases[emotionType] || personaPhrases['neutral'];
      if (phrases && phrases.length > 0) {
        // Avoid repeating recent backchannels
        const availablePhrases = phrases.filter((p) => !this.recentBackchannels.includes(p));
        if (availablePhrases.length > 0) {
          return availablePhrases[Math.floor(Math.random() * availablePhrases.length)];
        }
        // Fall back to any phrase if all were recently used
        return phrases[Math.floor(Math.random() * phrases.length)];
      }
    }

    // Fall back to generic
    const genericPhrases = ['Mm', 'Yeah', 'Mhm'];
    return genericPhrases[Math.floor(Math.random() * genericPhrases.length)];
  }

  /**
   * Wrap phrase with SSML for soft volume
   */
  private wrapWithSoftVolume(phrase: string): string {
    // Use Cartesia-compatible SSML
    return `<volume level="soft"><speed ratio="0.95">${phrase}</speed></volume>`;
  }

  /**
   * Get the last backchannel time
   */
  getLastBackchannelTime(): number {
    return this.lastBackchannelTime;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.lastBackchannelTime = 0;
    this.backchannelCount = 0;
    this.recentBackchannels = [];
  }
}

// ============================================================================
// BREATH PAUSE DETECTION (Audio-Based)
// ============================================================================

/**
 * Configuration for audio-based breath pause detection
 */
const BREATH_PAUSE_CONFIG = {
  /** RMS energy threshold below which we consider silence (0-1 scale) */
  SILENCE_THRESHOLD: 0.02,

  /** Minimum energy to consider "speech" vs ambient noise */
  SPEECH_THRESHOLD: 0.05,

  /** Number of consecutive low-energy frames to confirm pause */
  PAUSE_CONFIRMATION_FRAMES: 3,

  /** Number of consecutive high-energy frames to confirm speech */
  SPEECH_CONFIRMATION_FRAMES: 2,

  /** Smoothing factor for energy (0-1, higher = more smoothing) */
  ENERGY_SMOOTHING: 0.7,

  /** Minimum speaking time before detecting pauses (ms) */
  MIN_SPEAKING_TIME: 1000,

  /** History size for pause duration tracking */
  PAUSE_HISTORY_SIZE: 20,
} as const;

/**
 * Audio Frame interface (subset of LiveKit AudioFrame)
 */
export interface AudioFrameData {
  data: Int16Array | Uint8Array;
  sampleRate: number;
  channels?: number;
}

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

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let liveBackchannelInstance: LiveBackchannelingService | null = null;
let breathPauseDetectorInstance: BreathPauseDetector | null = null;

export function getLiveBackchannelingService(): LiveBackchannelingService {
  if (!liveBackchannelInstance) {
    liveBackchannelInstance = new LiveBackchannelingService();
  }
  return liveBackchannelInstance;
}

export function getBreathPauseDetector(): BreathPauseDetector {
  if (!breathPauseDetectorInstance) {
    breathPauseDetectorInstance = new BreathPauseDetector();
  }
  return breathPauseDetectorInstance;
}

export function resetLiveBackchanneling(): void {
  liveBackchannelInstance?.reset();
  liveBackchannelInstance = null;
  breathPauseDetectorInstance?.reset();
  breathPauseDetectorInstance = null;
}
