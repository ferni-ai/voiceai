/**
 * Emotional Arc Tracker Engine
 *
 * Tracks emotional trajectory across turns, not just per-message.
 *
 * @module @ferni/conversation/emotional-arc/engine
 */

import { seededPick } from '../utils/rng.js';
import type { EmotionResult } from '../../intelligence/detectors/emotion.js';
import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { createLogger } from '../../utils/safe-logger.js';

import type {
  CrossSessionArcSummary,
  EmotionalArc,
  EmotionalResponse,
  EmotionalSnapshot,
  NarrativePhase,
} from './types.js';
import { EMOTION_VALENCE_MAP } from './types.js';

const log = createLogger({ module: 'EmotionalArcTracker' });

export class EmotionalArcTracker {
  private history: EmotionalSnapshot[] = [];
  private readonly maxHistory = 20;
  private lastSignificantEvent = 0;
  private peakArousal = 0;
  private distressCount = 0;

  // Smoothing parameters
  private readonly smoothingFactor = 0.3;
  private readonly trajectoryWindow = 5;

  // Narrative arc tracking
  private currentPhase: NarrativePhase = 'opening';
  private phaseStartTurn = 0;
  private peakTurn = -1;
  private peakIntensity = 0;
  private hasReachedPeak = false;
  private signalEmittedThisPhase = false;

  constructor() {
    log.debug('EmotionalArcTracker initialized');
  }

  /**
   * Record a new emotional snapshot
   */
  recordEmotion(
    textEmotion: EmotionResult | null,
    voiceEmotion: VoiceEmotionResult | null
  ): EmotionalArc {
    const snapshot = this.createSnapshot(textEmotion, voiceEmotion);
    this.history.push(snapshot);

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (snapshot.combinedArousal > this.peakArousal) {
      this.peakArousal = snapshot.combinedArousal;
      this.lastSignificantEvent = Date.now();
    }

    if (snapshot.combinedValence < -0.5) {
      this.distressCount++;
    }

    this.updateNarrativePhase(snapshot);
    const arc = this.computeArc();

    if (this.history.length > 0 && this.history.length % 3 === 0) {
      void humanizationSignalEmitter.emitArc({
        phase: this.currentPhase,
        intensity: snapshot.combinedArousal,
        dominantEmotion: snapshot.textEmotion,
        turnsSincePeak: this.hasReachedPeak ? this.history.length - this.peakTurn : undefined,
      });
    }

    return arc;
  }

  /**
   * Get current emotional arc
   */
  getArc(): EmotionalArc {
    return this.computeArc();
  }

  /**
   * Get response recommendations
   */
  getResponseRecommendation(): EmotionalResponse {
    const arc = this.computeArc();
    return this.computeResponse(arc);
  }

  /**
   * Get SSML adjustments based on emotional state
   */
  getSsmlAdjustments(): {
    speed: number;
    volume: number;
    emotion: string;
    addBreaks: boolean;
  } {
    const arc = this.computeArc();
    const response = this.computeResponse(arc);

    let speed = 0.85;
    let volume = 1.0;

    if (arc.needsEmotionalSupport) {
      speed = 0.75;
      volume = 0.95;
    } else if (arc.trajectory === 'improving' && arc.currentValence > 0.3) {
      speed = 0.9;
      volume = 1.05;
    } else if (arc.conversationTemperature > 0.7) {
      speed = 0.8;
    }

    speed += response.speedAdjust;
    volume *= response.volumeAdjust;

    speed = Math.max(0.6, Math.min(1.1, speed));
    volume = Math.max(0.8, Math.min(1.2, volume));

    return {
      speed,
      volume,
      emotion: response.suggestedEmotion,
      addBreaks: response.suggestedBreaks,
    };
  }

  /**
   * Check if there was a sudden emotional shift
   */
  hasSuddenShift(): boolean {
    if (this.history.length < 2) return false;

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    const valenceDelta = Math.abs(current.combinedValence - previous.combinedValence);
    const arousalDelta = Math.abs(current.combinedArousal - previous.combinedArousal);

    return valenceDelta > 0.5 || arousalDelta > 0.6;
  }

  /**
   * Get transition phrase for emotional shift
   */
  getTransitionPhrase(): string | null {
    if (!this.hasSuddenShift() || this.history.length < 2) return null;

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    if (current.combinedValence - previous.combinedValence > 0.4) {
      const phrases = [
        'I can hear things are looking up.',
        "That's a shift in tone—tell me more.",
        "Sounds like there's good news here.",
      ];
      return seededPick(`${Date.now()}:improving`, phrases) ?? phrases[0];
    }

    if (previous.combinedValence - current.combinedValence > 0.4) {
      const phrases = [
        'I hear that. That sounds difficult.',
        "Oh... that's a lot to carry.",
        "I'm sensing something shifted there.",
      ];
      return seededPick(`${Date.now()}:declining`, phrases) ?? phrases[0];
    }

    if (current.combinedArousal - previous.combinedArousal > 0.5) {
      const phrases = [
        'I can hear this matters to you.',
        "Yes, I'm listening carefully.",
        'Tell me more about that.',
      ];
      return seededPick(`${Date.now()}:arousal`, phrases) ?? phrases[0];
    }

    return null;
  }

  /**
   * Get current narrative phase
   */
  getNarrativePhase(): NarrativePhase {
    return this.currentPhase;
  }

  /**
   * Get turns since emotional peak
   */
  getTurnsSincePeak(): number {
    if (!this.hasReachedPeak) return -1;
    return this.history.length - this.peakTurn;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.history = [];
    this.lastSignificantEvent = 0;
    this.peakArousal = 0;
    this.distressCount = 0;
    this.currentPhase = 'opening';
    this.phaseStartTurn = 0;
    this.peakTurn = -1;
    this.peakIntensity = 0;
    this.hasReachedPeak = false;
    this.signalEmittedThisPhase = false;
    log.debug('EmotionalArcTracker reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private updateNarrativePhase(snapshot: EmotionalSnapshot): void {
    const turnCount = this.history.length;
    const emotionalIntensity = Math.abs(snapshot.combinedValence) + snapshot.combinedArousal;

    if (emotionalIntensity > this.peakIntensity && turnCount > 3) {
      this.peakIntensity = emotionalIntensity;
      this.peakTurn = turnCount;
      this.hasReachedPeak = true;
    }

    const previousPhase = this.currentPhase;

    if (turnCount <= 3) {
      this.currentPhase = 'opening';
    } else if (!this.hasReachedPeak) {
      if (emotionalIntensity > 0.8) {
        this.currentPhase = 'peak';
        this.hasReachedPeak = true;
      } else if (turnCount <= 8 || this.isEmotionRising()) {
        this.currentPhase = 'building';
      } else {
        this.currentPhase = 'peak';
        this.hasReachedPeak = true;
      }
    } else if (this.hasReachedPeak) {
      const turnsSincePeak = turnCount - this.peakTurn;

      if (turnsSincePeak <= 2) {
        this.currentPhase = 'peak';
      } else if (turnsSincePeak <= 5 || this.isEmotionFalling()) {
        this.currentPhase = 'release';
      } else {
        this.currentPhase = 'closing';
      }
    }

    if (previousPhase !== this.currentPhase) {
      this.signalEmittedThisPhase = false;

      log.debug(
        { from: previousPhase, to: this.currentPhase, turn: turnCount },
        'Narrative phase transition'
      );

      if (this.currentPhase === 'peak' && !this.signalEmittedThisPhase) {
        void humanizationSignalEmitter.emotionalArcPeak(emotionalIntensity);
        this.signalEmittedThisPhase = true;
      } else if (this.currentPhase === 'release' && !this.signalEmittedThisPhase) {
        void humanizationSignalEmitter.emotionalArcRelease();
        this.signalEmittedThisPhase = true;
      }
    }
  }

  private isEmotionRising(): boolean {
    if (this.history.length < 3) return true;

    const recent = this.history.slice(-3);
    let rising = 0;

    for (let i = 1; i < recent.length; i++) {
      const prevIntensity = Math.abs(recent[i - 1].combinedValence) + recent[i - 1].combinedArousal;
      const currIntensity = Math.abs(recent[i].combinedValence) + recent[i].combinedArousal;
      if (currIntensity > prevIntensity) rising++;
    }

    return rising >= 1;
  }

  private isEmotionFalling(): boolean {
    if (this.history.length < 3) return false;

    const recent = this.history.slice(-3);
    let falling = 0;

    for (let i = 1; i < recent.length; i++) {
      const prevIntensity = Math.abs(recent[i - 1].combinedValence) + recent[i - 1].combinedArousal;
      const currIntensity = Math.abs(recent[i].combinedValence) + recent[i].combinedArousal;
      if (currIntensity < prevIntensity) falling++;
    }

    return falling >= 1;
  }

  private createSnapshot(
    textEmotion: EmotionResult | null,
    voiceEmotion: VoiceEmotionResult | null
  ): EmotionalSnapshot {
    const textValence = textEmotion ? this.emotionToValence(textEmotion.primary) : 0;
    const textArousal = textEmotion ? textEmotion.intensity : 0.5;

    const voiceValence = voiceEmotion?.valence ?? 0;
    const voiceArousal = voiceEmotion?.arousal ?? 0.5;

    const hasVoice = voiceEmotion !== null;
    const combinedValence = hasVoice ? textValence * 0.6 + voiceValence * 0.4 : textValence;
    const combinedArousal = hasVoice ? textArousal * 0.4 + voiceArousal * 0.6 : textArousal;

    return {
      timestamp: Date.now(),
      textEmotion: textEmotion?.primary ?? 'neutral',
      textIntensity: textEmotion?.intensity ?? 0.5,
      voiceEmotion: voiceEmotion?.primary,
      voiceValence,
      voiceArousal,
      combinedValence,
      combinedArousal,
    };
  }

  private emotionToValence(emotion: string): number {
    return EMOTION_VALENCE_MAP[emotion.toLowerCase()] ?? 0;
  }

  private computeArc(): EmotionalArc {
    if (this.history.length === 0) {
      return this.getDefaultArc();
    }

    const current = this.history[this.history.length - 1];
    const smoothedValence = this.computeSmoothedValue('combinedValence');
    const smoothedArousal = this.computeSmoothedValue('combinedArousal');
    const trajectory = this.computeTrajectory();
    const valenceMomentum = this.computeMomentum('combinedValence');
    const arousalMomentum = this.computeMomentum('combinedArousal');
    const temperature = this.computeTemperature();

    const needsSupport =
      current.combinedValence < -0.4 ||
      this.distressCount > 2 ||
      (current.combinedArousal > 0.7 && current.combinedValence < 0);

    const stabilizing =
      trajectory.type === 'improving' ||
      (Math.abs(valenceMomentum) < 0.1 && Math.abs(arousalMomentum) < 0.1);

    const suddenShift = this.hasSuddenShift();

    const turnsSincePeak =
      this.history.length - this.history.findIndex((s) => s.combinedArousal === this.peakArousal);
    const lastDistressIdx = [...this.history].reverse().findIndex((s) => s.combinedValence < -0.5);
    const turnsSinceDistress = lastDistressIdx === -1 ? this.history.length : lastDistressIdx;

    return {
      currentEmotion: current.textEmotion,
      currentValence: current.combinedValence,
      currentArousal: current.combinedArousal,
      trajectory: trajectory.type,
      trajectoryConfidence: trajectory.confidence,
      valenceMomentum,
      arousalMomentum,
      conversationTemperature: temperature,
      smoothedValence,
      smoothedArousal,
      turnsSinceEmotionalPeak: turnsSincePeak,
      turnsSinceDistress,
      needsEmotionalSupport: needsSupport,
      emotionStabilizing: stabilizing,
      suddenShiftDetected: suddenShift,
    };
  }

  private computeSmoothedValue(field: 'combinedValence' | 'combinedArousal'): number {
    if (this.history.length === 0) return 0;
    if (this.history.length === 1) return this.history[0][field];

    let smoothed = this.history[0][field];
    for (let i = 1; i < this.history.length; i++) {
      smoothed =
        this.smoothingFactor * this.history[i][field] + (1 - this.smoothingFactor) * smoothed;
    }
    return smoothed;
  }

  private computeTrajectory(): { type: EmotionalArc['trajectory']; confidence: number } {
    if (this.history.length < 3) {
      return { type: 'unknown', confidence: 0 };
    }

    const window = this.history.slice(-this.trajectoryWindow);
    let valenceTrend = 0;
    let arousalVariance = 0;

    for (let i = 1; i < window.length; i++) {
      valenceTrend += window[i].combinedValence - window[i - 1].combinedValence;
      arousalVariance += Math.abs(window[i].combinedArousal - window[i - 1].combinedArousal);
    }

    valenceTrend /= window.length - 1;
    arousalVariance /= window.length - 1;

    if (arousalVariance > 0.3) {
      return { type: 'volatile', confidence: arousalVariance };
    }
    if (valenceTrend > 0.1) {
      return { type: 'improving', confidence: Math.min(1, valenceTrend * 3) };
    }
    if (valenceTrend < -0.1) {
      return { type: 'declining', confidence: Math.min(1, Math.abs(valenceTrend) * 3) };
    }
    return { type: 'stable', confidence: 1 - Math.abs(valenceTrend) * 5 };
  }

  private computeMomentum(field: 'combinedValence' | 'combinedArousal'): number {
    if (this.history.length < 2) return 0;

    const recent = this.history.slice(-3);
    let momentum = 0;

    for (let i = 1; i < recent.length; i++) {
      momentum += recent[i][field] - recent[i - 1][field];
    }

    return momentum / (recent.length - 1);
  }

  private computeTemperature(): number {
    if (this.history.length === 0) return 0.5;

    let sum = 0;
    let weight = 0;

    for (let i = 0; i < this.history.length; i++) {
      const w = Math.pow(1.5, i);
      sum += this.history[i].combinedArousal * w;
      weight += w;
    }

    return Math.max(0, Math.min(1, sum / weight));
  }

  private computeResponse(arc: EmotionalArc): EmotionalResponse {
    let tone: EmotionalResponse['suggestedTone'] = 'match';
    let speedAdjust = 0;
    let volumeAdjust = 1;
    let warmth: EmotionalResponse['warmthLevel'] = 'medium';
    let pauseFreq: EmotionalResponse['pauseFrequency'] = 'normal';
    let guidance = '';
    let emotion = 'neutral';
    let addBreaks = false;

    if (arc.needsEmotionalSupport) {
      tone = 'support';
      speedAdjust = -0.15;
      volumeAdjust = 0.95;
      warmth = 'high';
      pauseFreq = 'more';
      guidance = 'User needs emotional support. Be warm, slow down, validate feelings.';
      emotion = 'affectionate';
      addBreaks = true;
    } else if (arc.trajectory === 'improving' && arc.currentValence > 0.2) {
      tone = 'celebrate';
      speedAdjust = 0.1;
      volumeAdjust = 1.05;
      warmth = 'high';
      guidance = 'Mood is improving! Share in their positive energy.';
      emotion = 'happy';
    } else if (arc.currentArousal > 0.6 && arc.currentValence < -0.2) {
      tone = 'calm';
      speedAdjust = -0.1;
      volumeAdjust = 0.95;
      warmth = 'high';
      pauseFreq = 'more';
      guidance = 'User is agitated. Stay calm, speak slowly, validate without escalating.';
      emotion = 'affectionate';
      addBreaks = true;
    } else if (arc.currentArousal > 0.5 && arc.currentValence > 0.3) {
      tone = 'match';
      speedAdjust = 0.1;
      volumeAdjust = 1.1;
      warmth = 'medium';
      pauseFreq = 'less';
      guidance = 'User is energized and positive. Match their energy!';
      emotion = 'curious';
    } else if (arc.currentArousal < 0.3) {
      tone = 'uplift';
      speedAdjust = 0;
      volumeAdjust = 1.0;
      warmth = 'high';
      guidance = 'User seems low energy. Be warm but not overwhelming.';
      emotion = 'affectionate';
    } else if (arc.trajectory === 'volatile') {
      tone = 'calm';
      speedAdjust = -0.05;
      warmth = 'high';
      guidance = 'Emotional state is shifting. Stay grounded and attentive.';
      emotion = 'neutral';
    }

    return {
      suggestedTone: tone,
      speedAdjust,
      volumeAdjust,
      warmthLevel: warmth,
      pauseFrequency: pauseFreq,
      guidance,
      suggestedEmotion: emotion,
      suggestedBreaks: addBreaks,
    };
  }

  private getDefaultArc(): EmotionalArc {
    return {
      currentEmotion: 'neutral',
      currentValence: 0,
      currentArousal: 0.5,
      trajectory: 'unknown',
      trajectoryConfidence: 0,
      valenceMomentum: 0,
      arousalMomentum: 0,
      conversationTemperature: 0.5,
      smoothedValence: 0,
      smoothedArousal: 0.5,
      turnsSinceEmotionalPeak: 0,
      turnsSinceDistress: 100,
      needsEmotionalSupport: false,
      emotionStabilizing: true,
      suddenShiftDetected: false,
    };
  }
}

export default EmotionalArcTracker;
